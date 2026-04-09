import { z } from "zod";
import {
  MetadataSchema,
  MetadataPatchSchema,
  PermissionPolicySchema,
  PageCursorQuerySchema,
} from "./common.js";

const AgentToolName = z.enum([
  "bash",
  "edit",
  "read",
  "write",
  "glob",
  "grep",
  "web_fetch",
  "web_search",
]);

const AgentToolConfigSchema = z.object({
  enabled: z.boolean(),
  name: AgentToolName,
  permission_policy: PermissionPolicySchema,
});

const AgentToolConfigParamsSchema = z.object({
  name: AgentToolName,
  enabled: z.boolean().nullable().optional(),
  permission_policy: PermissionPolicySchema.nullable().optional(),
});

const AgentToolsetDefaultConfigSchema = z.object({
  enabled: z.boolean(),
  permission_policy: PermissionPolicySchema,
});

const AgentToolsetDefaultConfigParamsSchema = z.object({
  enabled: z.boolean().nullable().optional(),
  permission_policy: PermissionPolicySchema.nullable().optional(),
});

const AgentToolset20260401Schema = z.object({
  type: z.literal("agent_toolset_20260401"),
  configs: z.array(AgentToolConfigSchema),
  default_config: AgentToolsetDefaultConfigSchema,
});

const AgentToolset20260401ParamsSchema = z.object({
  type: z.literal("agent_toolset_20260401"),
  configs: z.array(AgentToolConfigParamsSchema).optional(),
  default_config: AgentToolsetDefaultConfigParamsSchema.nullable().optional(),
});

const MCPServerURLDefinitionSchema = z.object({
  type: z.literal("url"),
  name: z.string(),
  url: z.string(),
});

const URLMCPServerParamsSchema = z.object({
  type: z.literal("url"),
  name: z.string().min(1).max(255),
  url: z.string(),
});

const MCPToolConfigSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  permission_policy: PermissionPolicySchema,
});

const MCPToolConfigParamsSchema = z.object({
  name: z.string().min(1).max(128),
  enabled: z.boolean().nullable().optional(),
  permission_policy: PermissionPolicySchema.nullable().optional(),
});

const MCPToolsetDefaultConfigSchema = z.object({
  enabled: z.boolean(),
  permission_policy: PermissionPolicySchema,
});

const MCPToolsetDefaultConfigParamsSchema = z.object({
  enabled: z.boolean().nullable().optional(),
  permission_policy: PermissionPolicySchema.nullable().optional(),
});

const MCPToolsetSchema = z.object({
  type: z.literal("mcp_toolset"),
  mcp_server_name: z.string(),
  configs: z.array(MCPToolConfigSchema),
  default_config: MCPToolsetDefaultConfigSchema,
});

const MCPToolsetParamsSchema = z.object({
  type: z.literal("mcp_toolset"),
  mcp_server_name: z.string().min(1).max(255),
  configs: z.array(MCPToolConfigParamsSchema).optional(),
  default_config: MCPToolsetDefaultConfigParamsSchema.nullable().optional(),
});

const CustomToolInputSchemaSchema = z.object({
  type: z.literal("object").optional(),
  properties: z.record(z.unknown()).nullable().optional(),
  required: z.array(z.string()).optional(),
});

const CustomToolSchema = z.object({
  type: z.literal("custom"),
  name: z.string(),
  description: z.string(),
  input_schema: CustomToolInputSchemaSchema,
});

const CustomToolParamsSchema = z.object({
  type: z.literal("custom"),
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(1024),
  input_schema: CustomToolInputSchemaSchema,
});

const ToolConfigSchema = z.discriminatedUnion("type", [
  AgentToolset20260401Schema,
  MCPToolsetSchema,
  CustomToolSchema,
]);

const ToolConfigParamsSchema = z.discriminatedUnion("type", [
  AgentToolset20260401ParamsSchema,
  MCPToolsetParamsSchema,
  CustomToolParamsSchema,
]);

const AnthropicSkillSchema = z.object({
  type: z.literal("anthropic"),
  skill_id: z.string(),
  version: z.string(),
});

const AnthropicSkillParamsSchema = z.object({
  type: z.literal("anthropic"),
  skill_id: z.string(),
  version: z.string().nullable().optional(),
});

const CustomSkillSchema = z.object({
  type: z.literal("custom"),
  skill_id: z.string(),
  version: z.string(),
});

const CustomSkillParamsSchema = z.object({
  type: z.literal("custom"),
  skill_id: z.string(),
  version: z.string().nullable().optional(),
});

const SkillParamsSchema = z.discriminatedUnion("type", [
  AnthropicSkillParamsSchema,
  CustomSkillParamsSchema,
]);

const ModelConfigSchema = z.object({
  id: z.string(),
  speed: z.enum(["standard", "fast"]).optional(),
});

const ModelConfigParamsSchema = z.object({
  id: z.string(),
  speed: z.enum(["standard", "fast"]).nullable().optional(),
});

export const AgentSchema = z.object({
  id: z.string(),
  type: z.literal("agent"),
  name: z.string(),
  description: z.string().nullable(),
  system: z.string().nullable(),
  model: ModelConfigSchema,
  tools: z.array(ToolConfigSchema),
  mcp_servers: z.array(MCPServerURLDefinitionSchema),
  skills: z.array(z.discriminatedUnion("type", [AnthropicSkillSchema, CustomSkillSchema])),
  metadata: MetadataSchema,
  version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

export const AgentCreateBodySchema = z.object({
  name: z.string().min(1).max(256),
  model: z.union([z.string(), ModelConfigParamsSchema]),
  description: z.string().max(2048).nullable().optional(),
  system: z.string().max(100000).nullable().optional(),
  tools: z.array(ToolConfigParamsSchema).max(128).optional(),
  mcp_servers: z.array(URLMCPServerParamsSchema).max(20).optional(),
  skills: z.array(SkillParamsSchema).max(20).optional(),
  metadata: MetadataSchema.optional(),
});

export const AgentUpdateBodySchema = z.object({
  version: z.number().int().min(1),
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).nullable().optional(),
  system: z.string().max(100000).nullable().optional(),
  model: z.union([z.string(), ModelConfigParamsSchema]).optional(),
  tools: z.array(ToolConfigParamsSchema).max(128).nullable().optional(),
  mcp_servers: z.array(URLMCPServerParamsSchema).max(20).nullable().optional(),
  skills: z.array(SkillParamsSchema).max(20).nullable().optional(),
  metadata: MetadataPatchSchema.nullable().optional(),
});

export const AgentListQuerySchema = PageCursorQuerySchema.extend({
  "created_at[gte]": z.string().optional(),
  "created_at[lte]": z.string().optional(),
  include_archived: z.coerce.boolean().optional(),
});

export const AgentIdParamSchema = z.object({
  agentId: z.string(),
});
