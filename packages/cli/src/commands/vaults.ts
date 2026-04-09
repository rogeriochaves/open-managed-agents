import { Command } from "commander";
import { getClient } from "../client.js";
import { output, formatDate } from "../output.js";

export function vaultsCommand(): Command {
  const cmd = new Command("vaults").description("Manage credential vaults");

  cmd
    .command("create")
    .description("Create a vault")
    .requiredOption("--name <name>", "Vault display name")
    .action(async (opts) => {
      const client = getClient();
      const result = await client.beta.vaults.create({
        display_name: opts.name,
      });
      output(result, (r) => ({
        headers: ["ID", "Name", "Created"],
        rows: [[r.id, r.display_name, formatDate(r.created_at)]],
      }));
    });

  cmd
    .command("list")
    .description("List vaults")
    .option("--include-archived", "Include archived")
    .action(async (opts) => {
      const client = getClient();
      const params: Record<string, unknown> = {};
      if (opts.includeArchived) params.include_archived = true;
      const page = await client.beta.vaults.list(params as any);
      const items = (page as any).data ?? [];
      output(items, (vaults: any[]) => ({
        headers: ["ID", "Name", "Status", "Created"],
        rows: vaults.map((v) => [
          v.id,
          v.display_name,
          v.archived_at ? "archived" : "active",
          formatDate(v.created_at),
        ]),
      }));
    });

  cmd
    .command("get <vaultId>")
    .description("Retrieve a vault")
    .action(async (vaultId: string) => {
      const client = getClient();
      const result = await client.beta.vaults.retrieve(vaultId);
      output(result, (r) => ({
        headers: ["ID", "Name", "Created"],
        rows: [[r.id, r.display_name, formatDate(r.created_at)]],
      }));
    });

  cmd
    .command("update <vaultId>")
    .description("Update a vault")
    .option("--name <name>", "New display name")
    .action(async (vaultId: string, opts) => {
      const client = getClient();
      const body: Record<string, unknown> = {};
      if (opts.name) body.display_name = opts.name;
      const result = await client.beta.vaults.update(vaultId, body as any);
      console.log(`Updated vault ${result.id}`);
    });

  cmd
    .command("delete <vaultId>")
    .description("Delete a vault")
    .action(async (vaultId: string) => {
      const client = getClient();
      const result = await client.beta.vaults.delete(vaultId);
      console.log(`Deleted vault ${result.id}`);
    });

  cmd
    .command("archive <vaultId>")
    .description("Archive a vault")
    .action(async (vaultId: string) => {
      const client = getClient();
      const result = await client.beta.vaults.archive(vaultId);
      console.log(`Archived vault ${result.id}`);
    });

  // ── Credentials subcommand ───────────────────────────────────────────────

  const creds = new Command("credentials").description("Manage vault credentials");

  creds
    .command("create <vaultId>")
    .description("Create a credential")
    .requiredOption("--type <type>", "Credential type: static_bearer or mcp_oauth")
    .requiredOption("--name <name>", "Display name")
    .requiredOption("--mcp-server <name>", "MCP server name")
    .option("--token <token>", "Bearer token (for static_bearer)")
    .action(async (vaultId: string, opts) => {
      const client = getClient();
      const body: Record<string, unknown> = {
        type: opts.type,
        display_name: opts.name,
        mcp_server_name: opts.mcpServer,
      };
      if (opts.type === "static_bearer" && opts.token) {
        body.token = opts.token;
      }
      const result = await client.beta.vaults.credentials.create(
        vaultId,
        body as any
      );
      output(result, (r) => ({
        headers: ["ID", "Type", "Name", "MCP Server"],
        rows: [[r.id, r.type, r.display_name, r.mcp_server_name]],
      }));
    });

  creds
    .command("list <vaultId>")
    .description("List credentials in a vault")
    .action(async (vaultId: string) => {
      const client = getClient();
      const page = await client.beta.vaults.credentials.list(vaultId);
      const items = (page as any).data ?? [];
      output(items, (creds: any[]) => ({
        headers: ["ID", "Type", "Name", "MCP Server", "Created"],
        rows: creds.map((c) => [
          c.id,
          c.type,
          c.display_name,
          c.mcp_server_name,
          formatDate(c.created_at),
        ]),
      }));
    });

  creds
    .command("delete <vaultId> <credentialId>")
    .description("Delete a credential")
    .action(async (vaultId: string, credentialId: string) => {
      const client = getClient();
      const result = await client.beta.vaults.credentials.delete(
        credentialId,
        { vault_id: vaultId } as any
      );
      console.log(`Deleted credential ${result.id}`);
    });

  cmd.addCommand(creds);

  return cmd;
}
