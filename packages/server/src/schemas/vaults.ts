import { z } from "zod";
import {
  MetadataSchema,
  MetadataPatchSchema,
  PageCursorQuerySchema,
} from "./common.js";

// ── Vault ───────────────────────────────────────────────────────────────────

export const VaultSchema = z.object({
  id: z.string(),
  type: z.literal("vault"),
  display_name: z.string(),
  metadata: MetadataSchema,
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

export const DeletedVaultSchema = z.object({
  id: z.string(),
  type: z.literal("vault_deleted"),
});

export const VaultCreateBodySchema = z.object({
  display_name: z.string(),
  metadata: MetadataSchema.optional(),
});

export const VaultUpdateBodySchema = z.object({
  display_name: z.string().nullable().optional(),
  metadata: MetadataPatchSchema.nullable().optional(),
});

export const VaultListQuerySchema = PageCursorQuerySchema.extend({
  include_archived: z.coerce.boolean().optional(),
});

export const VaultIdParamSchema = z.object({
  vaultId: z.string(),
});
