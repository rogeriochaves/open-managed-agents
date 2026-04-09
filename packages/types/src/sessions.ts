import type {
  Metadata,
  MetadataPatch,
  PageCursorParams,
} from "./common.js";
import type {
  Agent,
  MCPServerURLDefinition,
  ModelConfig,
  Skill,
  ToolConfig,
} from "./agents.js";

// ── Checkout ────────────────────────────────────────────────────────────────

export interface BranchCheckout {
  type: "branch";
  name: string;
}

export interface CommitCheckout {
  type: "commit";
  sha: string;
}

export type Checkout = BranchCheckout | CommitCheckout;

// ── Resources ───────────────────────────────────────────────────────────────

export interface FileResourceParams {
  type: "file";
  file_id: string;
  mount_path?: string | null;
}

export interface GitHubRepositoryResourceParams {
  type: "github_repository";
  url: string;
  authorization_token: string;
  checkout?: Checkout | null;
  mount_path?: string | null;
}

export type ResourceParams =
  | FileResourceParams
  | GitHubRepositoryResourceParams;

export interface FileResource {
  id: string;
  type: "file";
  file_id: string;
  mount_path: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepositoryResource {
  id: string;
  type: "github_repository";
  url: string;
  mount_path: string;
  checkout?: Checkout | null;
  created_at: string;
  updated_at: string;
}

export type SessionResource = FileResource | GitHubRepositoryResource;

export interface DeleteSessionResource {
  id: string;
  type: "session_resource_deleted";
}

// ── Session agent snapshot ──────────────────────────────────────────────────

export interface SessionAgent {
  id: string;
  type: "agent";
  name: string;
  description: string | null;
  system: string | null;
  model: ModelConfig;
  tools: ToolConfig[];
  mcp_servers: MCPServerURLDefinition[];
  skills: Skill[];
  version: number;
}

// ── Session usage ───────────────────────────────────────────────────────────

export interface CacheCreationUsage {
  ephemeral_1h_input_tokens?: number;
  ephemeral_5m_input_tokens?: number;
}

export interface SessionUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: CacheCreationUsage;
}

export interface SessionStats {
  active_seconds?: number;
  duration_seconds?: number;
}

// ── Session status ──────────────────────────────────────────────────────────

export type SessionStatus = "rescheduling" | "running" | "idle" | "terminated";

// ── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  type: "session";
  title: string | null;
  agent: SessionAgent;
  environment_id: string;
  status: SessionStatus;
  resources: SessionResource[];
  usage: SessionUsage;
  stats: SessionStats;
  metadata: Metadata;
  vault_ids: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DeletedSession {
  id: string;
  type: "session_deleted";
}

// ── Session params ──────────────────────────────────────────────────────────

export interface AgentRef {
  id: string;
  type: "agent";
  version?: number;
}

export interface SessionCreateParams {
  agent: string | AgentRef;
  environment_id: string;
  title?: string | null;
  resources?: ResourceParams[];
  vault_ids?: string[];
  metadata?: Metadata;
}

export interface SessionUpdateParams {
  title?: string | null;
  metadata?: MetadataPatch | null;
  vault_ids?: string[];
}

export interface SessionListParams extends PageCursorParams {
  agent_id?: string;
  agent_version?: number;
  "created_at[gt]"?: string;
  "created_at[gte]"?: string;
  "created_at[lt]"?: string;
  "created_at[lte]"?: string;
  include_archived?: boolean;
  order?: "asc" | "desc";
}
