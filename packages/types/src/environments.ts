import type { Metadata, MetadataPatch, PageCursorParams } from "./common.js";

// ── Networking ──────────────────────────────────────────────────────────────

export interface UnrestrictedNetwork {
  type: "unrestricted";
}

export interface LimitedNetwork {
  type: "limited";
  allowed_hosts: string[];
  allow_mcp_servers: boolean;
  allow_package_managers: boolean;
}

export interface LimitedNetworkParams {
  type: "limited";
  allowed_hosts?: string[] | null;
  allow_mcp_servers?: boolean | null;
  allow_package_managers?: boolean | null;
}

export type NetworkConfig = UnrestrictedNetwork | LimitedNetwork;
export type NetworkConfigParams = UnrestrictedNetwork | LimitedNetworkParams;

// ── Packages ────────────────────────────────────────────────────────────────

export interface Packages {
  type?: "packages";
  apt: string[];
  cargo: string[];
  gem: string[];
  go: string[];
  npm: string[];
  pip: string[];
}

export interface PackagesParams {
  type?: "packages";
  apt?: string[] | null;
  cargo?: string[] | null;
  gem?: string[] | null;
  go?: string[] | null;
  npm?: string[] | null;
  pip?: string[] | null;
}

// ── Cloud config ────────────────────────────────────────────────────────────

export interface CloudConfig {
  type: "cloud";
  networking: NetworkConfig;
  packages: Packages;
}

export interface CloudConfigParams {
  type: "cloud";
  networking?: NetworkConfigParams | null;
  packages?: PackagesParams | null;
}

// ── Environment ─────────────────────────────────────────────────────────────

export interface Environment {
  id: string;
  type: "environment";
  name: string;
  description: string;
  config: CloudConfig;
  metadata: Metadata;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface EnvironmentDeleteResponse {
  id: string;
  type: "environment_deleted";
}

export interface EnvironmentCreateParams {
  name: string;
  description?: string | null;
  config?: CloudConfigParams | null;
  metadata?: Metadata;
}

export interface EnvironmentUpdateParams {
  name?: string | null;
  description?: string | null;
  config?: CloudConfigParams | null;
  metadata?: MetadataPatch;
}

export interface EnvironmentListParams extends PageCursorParams {
  include_archived?: boolean;
}
