/**
 * Dialect-aware schema for both SQLite and Postgres.
 *
 * Differences handled:
 *   - datetime default: `datetime('now')` (sqlite) vs `CURRENT_TIMESTAMP` (postgres)
 *   - boolean/integer: SQLite uses INTEGER, Postgres uses BOOLEAN — we store as INTEGER in both
 *     for simplicity (the app normalizes to boolean in route code)
 *   - upsert seed: `INSERT OR IGNORE` (sqlite) vs `INSERT ... ON CONFLICT DO NOTHING` (postgres)
 */

import type { DbAdapter } from "./adapter.js";

export async function initSchema(db: DbAdapter) {
  const NOW = db.dialect === "sqlite" ? "datetime('now')" : "CURRENT_TIMESTAMP";
  const INT = "INTEGER";
  const TEXT = "TEXT";
  const REAL = db.dialect === "sqlite" ? "REAL" : "DOUBLE PRECISION";
  const INSERT_IGNORE_SUFFIX = db.dialect === "sqlite" ? "" : " ON CONFLICT DO NOTHING";

  const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS llm_providers (
      id ${TEXT} PRIMARY KEY,
      name ${TEXT} NOT NULL,
      type ${TEXT} NOT NULL CHECK(type IN ('anthropic', 'openai', 'openai-compatible', 'ollama')),
      api_key_encrypted ${TEXT},
      base_url ${TEXT},
      default_model ${TEXT},
      is_default ${INT} NOT NULL DEFAULT 0,
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS agents (
      id ${TEXT} PRIMARY KEY,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      system ${TEXT},
      model_id ${TEXT} NOT NULL,
      model_speed ${TEXT} DEFAULT 'standard',
      model_provider_id ${TEXT},
      tools ${TEXT} NOT NULL DEFAULT '[]',
      mcp_servers ${TEXT} NOT NULL DEFAULT '[]',
      skills ${TEXT} NOT NULL DEFAULT '[]',
      metadata ${TEXT} NOT NULL DEFAULT '{}',
      version ${INT} NOT NULL DEFAULT 1,
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      archived_at ${TEXT}
    )`,

    `CREATE TABLE IF NOT EXISTS environments (
      id ${TEXT} PRIMARY KEY,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      networking ${TEXT} NOT NULL DEFAULT '{"type":"unrestricted"}',
      packages ${TEXT} NOT NULL DEFAULT '{}',
      cloud_config ${TEXT},
      metadata ${TEXT} NOT NULL DEFAULT '{}',
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      archived_at ${TEXT}
    )`,

    `CREATE TABLE IF NOT EXISTS sessions (
      id ${TEXT} PRIMARY KEY,
      title ${TEXT},
      agent_id ${TEXT} NOT NULL,
      agent_snapshot ${TEXT} NOT NULL,
      environment_id ${TEXT} NOT NULL,
      status ${TEXT} NOT NULL DEFAULT 'idle' CHECK(status IN ('rescheduling','running','idle','terminated')),
      resources ${TEXT} NOT NULL DEFAULT '[]',
      usage ${TEXT} NOT NULL DEFAULT '{}',
      stats ${TEXT} NOT NULL DEFAULT '{}',
      metadata ${TEXT} NOT NULL DEFAULT '{}',
      vault_ids ${TEXT} NOT NULL DEFAULT '[]',
      messages_cache ${TEXT} NOT NULL DEFAULT '[]',
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      archived_at ${TEXT}
    )`,

    `CREATE TABLE IF NOT EXISTS events (
      id ${TEXT} PRIMARY KEY,
      session_id ${TEXT} NOT NULL,
      type ${TEXT} NOT NULL,
      data ${TEXT} NOT NULL DEFAULT '{}',
      processed_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS vaults (
      id ${TEXT} PRIMARY KEY,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      metadata ${TEXT} NOT NULL DEFAULT '{}',
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      archived_at ${TEXT}
    )`,

    `CREATE TABLE IF NOT EXISTS credentials (
      id ${TEXT} PRIMARY KEY,
      vault_id ${TEXT} NOT NULL,
      name ${TEXT} NOT NULL,
      value_encrypted ${TEXT} NOT NULL,
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS organizations (
      id ${TEXT} PRIMARY KEY,
      name ${TEXT} NOT NULL,
      slug ${TEXT} NOT NULL UNIQUE,
      logo_url ${TEXT},
      sso_provider ${TEXT},
      sso_config ${TEXT},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS teams (
      id ${TEXT} PRIMARY KEY,
      organization_id ${TEXT} NOT NULL,
      name ${TEXT} NOT NULL,
      slug ${TEXT} NOT NULL,
      description ${TEXT},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      UNIQUE(organization_id, slug)
    )`,

    `CREATE TABLE IF NOT EXISTS projects (
      id ${TEXT} PRIMARY KEY,
      team_id ${TEXT} NOT NULL,
      name ${TEXT} NOT NULL,
      slug ${TEXT} NOT NULL,
      description ${TEXT},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      UNIQUE(team_id, slug)
    )`,

    `CREATE TABLE IF NOT EXISTS users (
      id ${TEXT} PRIMARY KEY,
      email ${TEXT} NOT NULL UNIQUE,
      name ${TEXT} NOT NULL,
      avatar_url ${TEXT},
      role ${TEXT} NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member','viewer')),
      organization_id ${TEXT},
      password_hash ${TEXT},
      sso_id ${TEXT},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      updated_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS team_members (
      id ${TEXT} PRIMARY KEY,
      team_id ${TEXT} NOT NULL,
      user_id ${TEXT} NOT NULL,
      role ${TEXT} NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member','viewer')),
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      UNIQUE(team_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS team_provider_access (
      id ${TEXT} PRIMARY KEY,
      team_id ${TEXT} NOT NULL,
      provider_id ${TEXT} NOT NULL,
      enabled ${INT} NOT NULL DEFAULT 1,
      rate_limit_rpm ${INT},
      monthly_budget_usd ${REAL},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      UNIQUE(team_id, provider_id)
    )`,

    `CREATE TABLE IF NOT EXISTS team_mcp_policies (
      id ${TEXT} PRIMARY KEY,
      team_id ${TEXT} NOT NULL,
      connector_id ${TEXT} NOT NULL,
      policy ${TEXT} NOT NULL DEFAULT 'allowed' CHECK(policy IN ('allowed','blocked','requires_approval')),
      created_at ${TEXT} NOT NULL DEFAULT (${NOW}),
      UNIQUE(team_id, connector_id)
    )`,

    `CREATE TABLE IF NOT EXISTS api_keys (
      id ${TEXT} PRIMARY KEY,
      name ${TEXT} NOT NULL,
      key_hash ${TEXT} NOT NULL UNIQUE,
      key_prefix ${TEXT} NOT NULL,
      user_id ${TEXT},
      team_id ${TEXT},
      scopes ${TEXT} NOT NULL DEFAULT '["*"]',
      last_used_at ${TEXT},
      expires_at ${TEXT},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS user_sessions (
      id ${TEXT} PRIMARY KEY,
      user_id ${TEXT} NOT NULL,
      token_hash ${TEXT} NOT NULL UNIQUE,
      expires_at ${TEXT} NOT NULL,
      created_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS audit_log (
      id ${TEXT} PRIMARY KEY,
      user_id ${TEXT},
      action ${TEXT} NOT NULL,
      resource_type ${TEXT} NOT NULL,
      resource_id ${TEXT},
      details ${TEXT},
      ip_address ${TEXT},
      created_at ${TEXT} NOT NULL DEFAULT (${NOW})
    )`,
  ];

  const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, processed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`,
  ];

  const seeds: string[] = [
    `INSERT ${db.dialect === "sqlite" ? "OR IGNORE " : ""}INTO organizations (id, name, slug)
     VALUES ('org_default', 'Default Organization', 'default')${INSERT_IGNORE_SUFFIX}`,

    `INSERT ${db.dialect === "sqlite" ? "OR IGNORE " : ""}INTO teams (id, organization_id, name, slug)
     VALUES ('team_default', 'org_default', 'Default Team', 'default')${INSERT_IGNORE_SUFFIX}`,

    `INSERT ${db.dialect === "sqlite" ? "OR IGNORE " : ""}INTO projects (id, team_id, name, slug)
     VALUES ('proj_default', 'team_default', 'Default Project', 'default')${INSERT_IGNORE_SUFFIX}`,

    `INSERT ${db.dialect === "sqlite" ? "OR IGNORE " : ""}INTO users (id, email, name, role, organization_id)
     VALUES ('user_admin', 'admin@localhost', 'Admin', 'admin', 'org_default')${INSERT_IGNORE_SUFFIX}`,

    `INSERT ${db.dialect === "sqlite" ? "OR IGNORE " : ""}INTO team_members (id, team_id, user_id, role)
     VALUES ('tm_default', 'team_default', 'user_admin', 'admin')${INSERT_IGNORE_SUFFIX}`,

    `INSERT ${db.dialect === "sqlite" ? "OR IGNORE " : ""}INTO environments (id, name, description)
     VALUES ('env_default', 'Default', 'Default environment with unrestricted networking')${INSERT_IGNORE_SUFFIX}`,
  ];

  for (const t of tables) await db.exec(t);
  for (const i of indexes) await db.exec(i);
  for (const s of seeds) await db.exec(s);
}
