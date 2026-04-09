import { z } from "zod";
import {
  MetadataSchema,
  MetadataPatchSchema,
  PageCursorQuerySchema,
  ContentBlockSchema,
} from "./common.js";

// ── Checkout ────────────────────────────────────────────────────────────────

const BranchCheckoutSchema = z.object({
  type: z.literal("branch"),
  name: z.string(),
});

const CommitCheckoutSchema = z.object({
  type: z.literal("commit"),
  sha: z.string(),
});

const CheckoutSchema = z.discriminatedUnion("type", [
  BranchCheckoutSchema,
  CommitCheckoutSchema,
]);

// ── Resources ───────────────────────────────────────────────────────────────

const FileResourceParamsSchema = z.object({
  type: z.literal("file"),
  file_id: z.string(),
  mount_path: z.string().nullable().optional(),
});

const GitHubRepositoryResourceParamsSchema = z.object({
  type: z.literal("github_repository"),
  url: z.string(),
  authorization_token: z.string(),
  checkout: CheckoutSchema.nullable().optional(),
  mount_path: z.string().nullable().optional(),
});

const ResourceParamsSchema = z.discriminatedUnion("type", [
  FileResourceParamsSchema,
  GitHubRepositoryResourceParamsSchema,
]);

const FileResourceSchema = z.object({
  id: z.string(),
  type: z.literal("file"),
  file_id: z.string(),
  mount_path: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const GitHubRepositoryResourceSchema = z.object({
  id: z.string(),
  type: z.literal("github_repository"),
  url: z.string(),
  mount_path: z.string(),
  checkout: CheckoutSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const SessionResourceSchema = z.discriminatedUnion("type", [
  FileResourceSchema,
  GitHubRepositoryResourceSchema,
]);

// ── Session agent snapshot ──────────────────────────────────────────────────

const SessionAgentSchema = z.object({
  id: z.string(),
  type: z.literal("agent"),
  name: z.string(),
  description: z.string().nullable(),
  system: z.string().nullable(),
  model: z.object({
    id: z.string(),
    speed: z.enum(["standard", "fast"]).optional(),
  }),
  tools: z.array(z.record(z.unknown())),
  mcp_servers: z.array(z.record(z.unknown())),
  skills: z.array(z.record(z.unknown())),
  version: z.number().int(),
});

// ── Session usage ───────────────────────────────────────────────────────────

const CacheCreationUsageSchema = z.object({
  ephemeral_1h_input_tokens: z.number().optional(),
  ephemeral_5m_input_tokens: z.number().optional(),
});

const SessionUsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation: CacheCreationUsageSchema.optional(),
});

const SessionStatsSchema = z.object({
  active_seconds: z.number().optional(),
  duration_seconds: z.number().optional(),
});

// ── Session status ──────────────────────────────────────────────────────────

const SessionStatusSchema = z.enum([
  "rescheduling",
  "running",
  "idle",
  "terminated",
]);

// ── Session ─────────────────────────────────────────────────────────────────

export const SessionSchema = z.object({
  id: z.string(),
  type: z.literal("session"),
  title: z.string().nullable(),
  agent: SessionAgentSchema,
  environment_id: z.string(),
  status: SessionStatusSchema,
  resources: z.array(SessionResourceSchema),
  usage: SessionUsageSchema,
  stats: SessionStatsSchema,
  metadata: MetadataSchema,
  vault_ids: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

export const DeletedSessionSchema = z.object({
  id: z.string(),
  type: z.literal("session_deleted"),
});

// ── Agent ref ───────────────────────────────────────────────────────────────

const AgentRefSchema = z.object({
  id: z.string(),
  type: z.literal("agent"),
  version: z.number().int().optional(),
});

// ── Session params ──────────────────────────────────────────────────────────

export const SessionCreateBodySchema = z.object({
  agent: z.union([z.string(), AgentRefSchema]),
  environment_id: z.string(),
  title: z.string().nullable().optional(),
  resources: z.array(ResourceParamsSchema).optional(),
  vault_ids: z.array(z.string()).optional(),
  metadata: MetadataSchema.optional(),
});

export const SessionUpdateBodySchema = z.object({
  title: z.string().nullable().optional(),
  metadata: MetadataPatchSchema.nullable().optional(),
  vault_ids: z.array(z.string()).optional(),
});

export const SessionListQuerySchema = PageCursorQuerySchema.extend({
  agent_id: z.string().optional(),
  agent_version: z.coerce.number().int().optional(),
  "created_at[gt]": z.string().optional(),
  "created_at[gte]": z.string().optional(),
  "created_at[lt]": z.string().optional(),
  "created_at[lte]": z.string().optional(),
  include_archived: z.coerce.boolean().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const SessionIdParamSchema = z.object({
  sessionId: z.string(),
});
