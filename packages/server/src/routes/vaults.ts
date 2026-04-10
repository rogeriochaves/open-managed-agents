import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  VaultSchema,
  VaultCreateBodySchema,
  VaultUpdateBodySchema,
  VaultListQuerySchema,
  VaultIdParamSchema,
  DeletedVaultSchema,
} from "../schemas/vaults.js";
import { pageCursorResponse } from "../schemas/common.js";
import { getDB, newId } from "../db/index.js";
import { encrypt, decrypt } from "../lib/encryption.js";

const tags = ["Vaults"];

const createVaultRoute = createRoute({
  method: "post", path: "/v1/vaults", tags, summary: "Create a vault",
  request: { body: { content: { "application/json": { schema: VaultCreateBodySchema } } } },
  responses: { 200: { description: "The created vault", content: { "application/json": { schema: VaultSchema } } } },
});
const retrieveVaultRoute = createRoute({
  method: "get", path: "/v1/vaults/{vaultId}", tags, summary: "Retrieve a vault",
  request: { params: VaultIdParamSchema },
  responses: { 200: { description: "The vault", content: { "application/json": { schema: VaultSchema } } } },
});
const updateVaultRoute = createRoute({
  method: "post", path: "/v1/vaults/{vaultId}", tags, summary: "Update a vault",
  request: { params: VaultIdParamSchema, body: { content: { "application/json": { schema: VaultUpdateBodySchema } } } },
  responses: { 200: { description: "The updated vault", content: { "application/json": { schema: VaultSchema } } } },
});
const listVaultsRoute = createRoute({
  method: "get", path: "/v1/vaults", tags, summary: "List vaults",
  request: { query: VaultListQuerySchema },
  responses: { 200: { description: "A paginated list of vaults", content: { "application/json": { schema: pageCursorResponse(VaultSchema) } } } },
});
const deleteVaultRoute = createRoute({
  method: "delete", path: "/v1/vaults/{vaultId}", tags, summary: "Delete a vault",
  request: { params: VaultIdParamSchema },
  responses: { 200: { description: "Confirmation", content: { "application/json": { schema: DeletedVaultSchema } } } },
});
const archiveVaultRoute = createRoute({
  method: "post", path: "/v1/vaults/{vaultId}/archive", tags, summary: "Archive a vault",
  request: { params: VaultIdParamSchema },
  responses: { 200: { description: "The archived vault", content: { "application/json": { schema: VaultSchema } } } },
});

// Credential routes
const CredentialSchema = z.object({ id: z.string(), vault_id: z.string(), name: z.string(), created_at: z.string(), updated_at: z.string() });
const CredentialCreateSchema = z.object({ name: z.string(), value: z.string() });

const listCredentialsRoute = createRoute({
  method: "get", path: "/v1/vaults/{vaultId}/credentials", tags, summary: "List credentials",
  request: { params: VaultIdParamSchema },
  responses: { 200: { description: "Credentials", content: { "application/json": { schema: z.object({ data: z.array(CredentialSchema) }) } } } },
});
const createCredentialRoute = createRoute({
  method: "post", path: "/v1/vaults/{vaultId}/credentials", tags, summary: "Create credential",
  request: { params: VaultIdParamSchema, body: { content: { "application/json": { schema: CredentialCreateSchema } } } },
  responses: { 200: { description: "Created credential", content: { "application/json": { schema: CredentialSchema } } } },
});
const deleteCredentialRoute = createRoute({
  method: "delete", path: "/v1/vaults/{vaultId}/credentials/{credentialId}", tags, summary: "Delete credential",
  request: { params: z.object({ vaultId: z.string(), credentialId: z.string() }) },
  responses: { 200: { description: "Deleted", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } } },
});

function rowToVault(row: any): any {
  return {
    id: row.id, type: "vault" as const, display_name: row.name,
    metadata: JSON.parse(row.metadata ?? "{}"),
    created_at: row.created_at, updated_at: row.updated_at, archived_at: row.archived_at ?? null,
  };
}

function rowToCredential(row: any) {
  return { id: row.id, vault_id: row.vault_id, name: row.name, created_at: row.created_at, updated_at: row.updated_at };
}

export function registerVaultRoutes(app: OpenAPIHono) {
  app.openapi(createVaultRoute, async (c) => {
    const body = c.req.valid("json") as any;
    const db = getDB();
    const id = newId("vault");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO vaults (id, name, description, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, body.display_name ?? body.name, body.description ?? null, JSON.stringify(body.metadata ?? {}), now, now);
    const row = db.prepare("SELECT * FROM vaults WHERE id = ?").get(id);
    return c.json(rowToVault(row), 200);
  });

  app.openapi(retrieveVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const db = getDB();
    const row = db.prepare("SELECT * FROM vaults WHERE id = ?").get(vaultId);
    if (!row) throw Object.assign(new Error(`Vault ${vaultId} not found`), { status: 404, type: "not_found" });
    return c.json(rowToVault(row), 200);
  });

  app.openapi(updateVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const db = getDB();
    const updates: string[] = [];
    const values: any[] = [];
    if (body.name !== undefined) { updates.push("name = ?"); values.push(body.name); }
    if (body.description !== undefined) { updates.push("description = ?"); values.push(body.description); }
    if (updates.length > 0) { updates.push("updated_at = datetime('now')"); values.push(vaultId); db.prepare(`UPDATE vaults SET ${updates.join(", ")} WHERE id = ?`).run(...values); }
    const row = db.prepare("SELECT * FROM vaults WHERE id = ?").get(vaultId);
    if (!row) throw Object.assign(new Error(`Vault ${vaultId} not found`), { status: 404, type: "not_found" });
    return c.json(rowToVault(row), 200);
  });

  app.openapi(listVaultsRoute, async (c) => {
    const query = c.req.valid("query") as any;
    const db = getDB();
    const conditions: string[] = [];
    if (!query.include_archived) conditions.push("archived_at IS NULL");
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(query.limit ?? 20, 100);
    const rows = db.prepare(`SELECT * FROM vaults ${where} ORDER BY created_at DESC LIMIT ?`).all(limit + 1) as any[];
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(rowToVault);
    return c.json({ data, has_more: hasMore, first_id: data[0]?.id ?? null, last_id: data[data.length - 1]?.id ?? null }, 200);
  });

  app.openapi(deleteVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const db = getDB();
    db.prepare("DELETE FROM credentials WHERE vault_id = ?").run(vaultId);
    db.prepare("DELETE FROM vaults WHERE id = ?").run(vaultId);
    return c.json({ id: vaultId, type: "vault_deleted" }, 200);
  });

  app.openapi(archiveVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const db = getDB();
    db.prepare("UPDATE vaults SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(vaultId);
    const row = db.prepare("SELECT * FROM vaults WHERE id = ?").get(vaultId);
    if (!row) throw Object.assign(new Error(`Vault ${vaultId} not found`), { status: 404, type: "not_found" });
    return c.json(rowToVault(row), 200);
  });

  // Credentials
  app.openapi(listCredentialsRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const db = getDB();
    const rows = db.prepare("SELECT * FROM credentials WHERE vault_id = ? ORDER BY created_at DESC").all(vaultId) as any[];
    return c.json({ data: rows.map(rowToCredential) }, 200);
  });

  app.openapi(createCredentialRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const db = getDB();
    const id = newId("cred");
    const now = new Date().toISOString();
    const encrypted = encrypt(body.value);
    db.prepare("INSERT INTO credentials (id, vault_id, name, value_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, vaultId, body.name, encrypted, now, now);
    const row = db.prepare("SELECT * FROM credentials WHERE id = ?").get(id);
    return c.json(rowToCredential(row), 200);
  });

  app.openapi(deleteCredentialRoute, async (c) => {
    const { credentialId } = c.req.valid("param") as any;
    const db = getDB();
    db.prepare("DELETE FROM credentials WHERE id = ?").run(credentialId);
    return c.json({ deleted: true }, 200);
  });
}
