import { z } from "zod";
import {
  MetadataSchema,
  MetadataPatchSchema,
  PageCursorQuerySchema,
} from "./common.js";

// ── Networking ──────────────────────────────────────────────────────────────

const UnrestrictedNetworkSchema = z.object({
  type: z.literal("unrestricted"),
});

const LimitedNetworkSchema = z.object({
  type: z.literal("limited"),
  allowed_hosts: z.array(z.string()),
  allow_mcp_servers: z.boolean(),
  allow_package_managers: z.boolean(),
});

const LimitedNetworkParamsSchema = z.object({
  type: z.literal("limited"),
  allowed_hosts: z.array(z.string()).nullable().optional(),
  allow_mcp_servers: z.boolean().nullable().optional(),
  allow_package_managers: z.boolean().nullable().optional(),
});

const NetworkConfigSchema = z.discriminatedUnion("type", [
  UnrestrictedNetworkSchema,
  LimitedNetworkSchema,
]);

const NetworkConfigParamsSchema = z.discriminatedUnion("type", [
  UnrestrictedNetworkSchema,
  LimitedNetworkParamsSchema,
]);

// ── Packages ────────────────────────────────────────────────────────────────

const PackagesSchema = z.object({
  type: z.literal("packages").optional(),
  apt: z.array(z.string()),
  cargo: z.array(z.string()),
  gem: z.array(z.string()),
  go: z.array(z.string()),
  npm: z.array(z.string()),
  pip: z.array(z.string()),
});

const PackagesParamsSchema = z.object({
  type: z.literal("packages").optional(),
  apt: z.array(z.string()).nullable().optional(),
  cargo: z.array(z.string()).nullable().optional(),
  gem: z.array(z.string()).nullable().optional(),
  go: z.array(z.string()).nullable().optional(),
  npm: z.array(z.string()).nullable().optional(),
  pip: z.array(z.string()).nullable().optional(),
});

// ── Cloud config ────────────────────────────────────────────────────────────

const CloudConfigSchema = z.object({
  type: z.literal("cloud"),
  networking: NetworkConfigSchema,
  packages: PackagesSchema,
});

const CloudConfigParamsSchema = z.object({
  type: z.literal("cloud"),
  networking: NetworkConfigParamsSchema.nullable().optional(),
  packages: PackagesParamsSchema.nullable().optional(),
});

// ── Environment ─────────────────────────────────────────────────────────────

export const EnvironmentSchema = z.object({
  id: z.string(),
  type: z.literal("environment"),
  name: z.string(),
  description: z.string(),
  config: CloudConfigSchema,
  metadata: MetadataSchema,
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

export const EnvironmentDeleteResponseSchema = z.object({
  id: z.string(),
  type: z.literal("environment_deleted"),
});

export const EnvironmentCreateBodySchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  config: CloudConfigParamsSchema.nullable().optional(),
  metadata: MetadataSchema.optional(),
});

export const EnvironmentUpdateBodySchema = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  config: CloudConfigParamsSchema.nullable().optional(),
  metadata: MetadataPatchSchema.optional(),
});

export const EnvironmentListQuerySchema = PageCursorQuerySchema.extend({
  include_archived: z.coerce.boolean().optional(),
});

export const EnvironmentIdParamSchema = z.object({
  environmentId: z.string(),
});
