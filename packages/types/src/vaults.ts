import type { Metadata, MetadataPatch, PageCursorParams } from "./common.js";

// ── Vault ───────────────────────────────────────────────────────────────────

export interface Vault {
  id: string;
  type: "vault";
  display_name: string;
  metadata: Metadata;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DeletedVault {
  id: string;
  type: "vault_deleted";
}

export interface VaultCreateParams {
  display_name: string;
  metadata?: Metadata;
}

export interface VaultUpdateParams {
  display_name?: string | null;
  metadata?: MetadataPatch | null;
}

export interface VaultListParams extends PageCursorParams {
  include_archived?: boolean;
}

// ── Credentials ─────────────────────────────────────────────────────────────

export interface StaticBearerCredential {
  id: string;
  type: "static_bearer";
  display_name: string;
  mcp_server_name: string;
  metadata: Metadata;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface MCPOAuthCredential {
  id: string;
  type: "mcp_oauth";
  display_name: string;
  mcp_server_name: string;
  metadata: Metadata;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type Credential = StaticBearerCredential | MCPOAuthCredential;

export interface DeletedCredential {
  id: string;
  type: "credential_deleted";
}

export interface CredentialListParams extends PageCursorParams {
  include_archived?: boolean;
}
