import type { Metadata, MetadataPatch, PermissionPolicy, PageCursorParams } from "./common.js";

// ── Models ──────────────────────────────────────────────────────────────────

export type AgentModel =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-haiku-4-5-20251001"
  | "claude-opus-4-5"
  | "claude-opus-4-5-20251101"
  | "claude-sonnet-4-5"
  | "claude-sonnet-4-5-20250929"
  | (string & {});

export interface ModelConfig {
  id: AgentModel;
  speed?: "standard" | "fast";
}

export interface ModelConfigParams {
  id: AgentModel;
  speed?: "standard" | "fast" | null;
}

// ── Tool types ──────────────────────────────────────────────────────────────

export type AgentToolName =
  | "bash"
  | "edit"
  | "read"
  | "write"
  | "glob"
  | "grep"
  | "web_fetch"
  | "web_search";

export interface AgentToolConfig {
  enabled: boolean;
  name: AgentToolName;
  permission_policy: PermissionPolicy;
}

export interface AgentToolConfigParams {
  name: AgentToolName;
  enabled?: boolean | null;
  permission_policy?: PermissionPolicy | null;
}

export interface AgentToolsetDefaultConfig {
  enabled: boolean;
  permission_policy: PermissionPolicy;
}

export interface AgentToolsetDefaultConfigParams {
  enabled?: boolean | null;
  permission_policy?: PermissionPolicy | null;
}

export interface AgentToolset20260401 {
  type: "agent_toolset_20260401";
  configs: AgentToolConfig[];
  default_config: AgentToolsetDefaultConfig;
}

export interface AgentToolset20260401Params {
  type: "agent_toolset_20260401";
  configs?: AgentToolConfigParams[];
  default_config?: AgentToolsetDefaultConfigParams | null;
}

// ── MCP ─────────────────────────────────────────────────────────────────────

export interface MCPServerURLDefinition {
  type: "url";
  name: string;
  url: string;
}

export interface URLMCPServerParams {
  type: "url";
  name: string;
  url: string;
}

export interface MCPToolConfig {
  enabled: boolean;
  name: string;
  permission_policy: PermissionPolicy;
}

export interface MCPToolConfigParams {
  name: string;
  enabled?: boolean | null;
  permission_policy?: PermissionPolicy | null;
}

export interface MCPToolsetDefaultConfig {
  enabled: boolean;
  permission_policy: PermissionPolicy;
}

export interface MCPToolsetDefaultConfigParams {
  enabled?: boolean | null;
  permission_policy?: PermissionPolicy | null;
}

export interface MCPToolset {
  type: "mcp_toolset";
  mcp_server_name: string;
  configs: MCPToolConfig[];
  default_config: MCPToolsetDefaultConfig;
}

export interface MCPToolsetParams {
  type: "mcp_toolset";
  mcp_server_name: string;
  configs?: MCPToolConfigParams[];
  default_config?: MCPToolsetDefaultConfigParams | null;
}

// ── Custom tools ────────────────────────────────────────────────────────────

export interface CustomToolInputSchema {
  type?: "object";
  properties?: Record<string, unknown> | null;
  required?: string[];
}

export interface CustomTool {
  type: "custom";
  name: string;
  description: string;
  input_schema: CustomToolInputSchema;
}

export interface CustomToolParams {
  type: "custom";
  name: string;
  description: string;
  input_schema: CustomToolInputSchema;
}

export type ToolConfig = AgentToolset20260401 | MCPToolset | CustomTool;
export type ToolConfigParams =
  | AgentToolset20260401Params
  | MCPToolsetParams
  | CustomToolParams;

// ── Skills ──────────────────────────────────────────────────────────────────

export interface AnthropicSkill {
  type: "anthropic";
  skill_id: string;
  version: string;
}

export interface AnthropicSkillParams {
  type: "anthropic";
  skill_id: string;
  version?: string | null;
}

export interface CustomSkill {
  type: "custom";
  skill_id: string;
  version: string;
}

export interface CustomSkillParams {
  type: "custom";
  skill_id: string;
  version?: string | null;
}

export type Skill = AnthropicSkill | CustomSkill;
export type SkillParams = AnthropicSkillParams | CustomSkillParams;

// ── Agent ───────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  type: "agent";
  name: string;
  description: string | null;
  system: string | null;
  model: ModelConfig;
  tools: ToolConfig[];
  mcp_servers: MCPServerURLDefinition[];
  skills: Skill[];
  metadata: Metadata;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface AgentCreateParams {
  name: string;
  model: AgentModel | ModelConfigParams;
  description?: string | null;
  system?: string | null;
  tools?: ToolConfigParams[];
  mcp_servers?: URLMCPServerParams[];
  skills?: SkillParams[];
  metadata?: Metadata;
}

export interface AgentUpdateParams {
  version: number;
  name?: string;
  description?: string | null;
  system?: string | null;
  model?: AgentModel | ModelConfigParams;
  tools?: ToolConfigParams[] | null;
  mcp_servers?: URLMCPServerParams[] | null;
  skills?: SkillParams[] | null;
  metadata?: MetadataPatch | null;
}

export interface AgentListParams extends PageCursorParams {
  "created_at[gte]"?: string;
  "created_at[lte]"?: string;
  include_archived?: boolean;
}
