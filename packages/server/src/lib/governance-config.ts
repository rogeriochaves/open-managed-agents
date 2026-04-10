/**
 * Server governance configuration.
 *
 * Loaded from a YAML/JSON config file for infra-as-code deployments.
 * Controls organization structure, team access, provider allocations,
 * and MCP integration policies.
 *
 * Example config file (governance.yaml):
 *
 * organizations:
 *   - name: "Acme Corp"
 *     slug: "acme"
 *     teams:
 *       - name: "Engineering"
 *         slug: "engineering"
 *         providers:
 *           - id: "provider_anthropic"
 *             enabled: true
 *             rate_limit_rpm: 1000
 *             monthly_budget_usd: 500
 *           - id: "provider_openai"
 *             enabled: true
 *             rate_limit_rpm: 500
 *         mcp_policies:
 *           - connector_id: "slack"
 *             policy: "allowed"
 *           - connector_id: "github"
 *             policy: "allowed"
 *           - connector_id: "stripe"
 *             policy: "blocked"
 *         projects:
 *           - name: "Backend Services"
 *             slug: "backend"
 *       - name: "Marketing"
 *         slug: "marketing"
 *         providers:
 *           - id: "provider_anthropic"
 *             enabled: true
 *             rate_limit_rpm: 200
 *         mcp_policies:
 *           - connector_id: "slack"
 *             policy: "allowed"
 *           - connector_id: "github"
 *             policy: "blocked"
 *
 * providers:
 *   - name: "Anthropic"
 *     type: "anthropic"
 *     api_key_env: "ANTHROPIC_API_KEY"
 *     default_model: "claude-sonnet-4-6"
 *     is_default: true
 *   - name: "OpenAI"
 *     type: "openai"
 *     api_key_env: "OPENAI_API_KEY"
 *     default_model: "gpt-4o"
 *   - name: "Local LLM"
 *     type: "ollama"
 *     base_url: "http://ollama:11434/v1"
 *     default_model: "llama3.1"
 */

import { readFileSync, existsSync } from "node:fs";
import { getDB, newId } from "../db/index.js";

export interface GovernanceConfig {
  organizations?: OrgConfig[];
  providers?: ProviderConfig[];
}

interface OrgConfig {
  name: string;
  slug: string;
  logo_url?: string;
  sso_provider?: string;
  sso_config?: Record<string, unknown>;
  teams?: TeamConfig[];
}

interface TeamConfig {
  name: string;
  slug: string;
  description?: string;
  providers?: TeamProviderConfig[];
  mcp_policies?: MCPPolicyConfig[];
  projects?: ProjectConfig[];
}

interface TeamProviderConfig {
  id: string;
  enabled?: boolean;
  rate_limit_rpm?: number;
  monthly_budget_usd?: number;
}

interface MCPPolicyConfig {
  connector_id: string;
  policy: "allowed" | "blocked" | "requires_approval";
}

interface ProjectConfig {
  name: string;
  slug: string;
  description?: string;
}

interface ProviderConfig {
  name: string;
  type: "anthropic" | "openai" | "openai-compatible" | "ollama";
  api_key?: string;
  api_key_env?: string;
  base_url?: string;
  default_model?: string;
  is_default?: boolean;
}

/**
 * Load and apply governance config from a file.
 * Supports JSON (YAML support can be added later).
 */
export async function loadGovernanceConfig(configPath: string) {
  if (!existsSync(configPath)) {
    console.log(`Governance config not found at ${configPath}, skipping.`);
    return;
  }

  const raw = readFileSync(configPath, "utf-8");
  let config: GovernanceConfig;

  try {
    config = JSON.parse(raw);
  } catch {
    console.error("Governance config must be JSON format.");
    return;
  }

  await applyConfig(config);
  console.log(`Governance config loaded from ${configPath}`);
}

async function applyConfig(config: GovernanceConfig) {
  const db = await getDB();
  const now = new Date().toISOString();

  // Apply providers
  if (config.providers) {
    for (const p of config.providers) {
      const apiKey = p.api_key_env ? process.env[p.api_key_env] : p.api_key;
      const id = `provider_${p.type}`;

      const existing = await db.get<any>("SELECT id FROM llm_providers WHERE id = ?", id);
      if (existing) {
        await db.run(
          "UPDATE llm_providers SET name = ?, api_key_encrypted = ?, base_url = ?, default_model = ?, is_default = ?, updated_at = ? WHERE id = ?",
          p.name, apiKey ?? null, p.base_url ?? null, p.default_model ?? null, p.is_default ? 1 : 0, now, id
        );
      } else {
        await db.run(
          "INSERT INTO llm_providers (id, name, type, api_key_encrypted, base_url, default_model, is_default) VALUES (?,?,?,?,?,?,?)",
          id, p.name, p.type, apiKey ?? null, p.base_url ?? null, p.default_model ?? null, p.is_default ? 1 : 0
        );
      }
    }
  }

  // Apply organizations
  if (config.organizations) {
    for (const org of config.organizations) {
      const orgId = `org_${org.slug}`;

      const existing = await db.get<any>("SELECT id FROM organizations WHERE id = ?", orgId);
      if (!existing) {
        await db.run(
          "INSERT INTO organizations (id, name, slug, logo_url, sso_provider, sso_config) VALUES (?,?,?,?,?,?)",
          orgId, org.name, org.slug, org.logo_url ?? null, org.sso_provider ?? null, org.sso_config ? JSON.stringify(org.sso_config) : null
        );
      } else {
        await db.run(
          "UPDATE organizations SET name = ?, logo_url = ?, sso_provider = ?, sso_config = ?, updated_at = ? WHERE id = ?",
          org.name, org.logo_url ?? null, org.sso_provider ?? null, org.sso_config ? JSON.stringify(org.sso_config) : null, now, orgId
        );
      }

      // Apply teams
      if (org.teams) {
        for (const team of org.teams) {
          const teamId = `team_${org.slug}_${team.slug}`;

          const existingTeam = await db.get<any>("SELECT id FROM teams WHERE id = ?", teamId);
          if (!existingTeam) {
            await db.run(
              "INSERT INTO teams (id, organization_id, name, slug, description) VALUES (?,?,?,?,?)",
              teamId, orgId, team.name, team.slug, team.description ?? null
            );
          } else {
            await db.run(
              "UPDATE teams SET name = ?, description = ?, updated_at = ? WHERE id = ?",
              team.name, team.description ?? null, now, teamId
            );
          }

          // Provider access
          if (team.providers) {
            for (const pa of team.providers) {
              const existingAccess = await db.get<any>(
                "SELECT id FROM team_provider_access WHERE team_id = ? AND provider_id = ?",
                teamId, pa.id
              );
              if (existingAccess) {
                await db.run(
                  "UPDATE team_provider_access SET enabled = ?, rate_limit_rpm = ?, monthly_budget_usd = ? WHERE team_id = ? AND provider_id = ?",
                  pa.enabled !== false ? 1 : 0, pa.rate_limit_rpm ?? null, pa.monthly_budget_usd ?? null, teamId, pa.id
                );
              } else {
                await db.run(
                  "INSERT INTO team_provider_access (id, team_id, provider_id, enabled, rate_limit_rpm, monthly_budget_usd) VALUES (?,?,?,?,?,?)",
                  newId("tpa"), teamId, pa.id, pa.enabled !== false ? 1 : 0, pa.rate_limit_rpm ?? null, pa.monthly_budget_usd ?? null
                );
              }
            }
          }

          // MCP policies
          if (team.mcp_policies) {
            for (const mp of team.mcp_policies) {
              const existingPolicy = await db.get<any>(
                "SELECT id FROM team_mcp_policies WHERE team_id = ? AND connector_id = ?",
                teamId, mp.connector_id
              );
              if (existingPolicy) {
                await db.run(
                  "UPDATE team_mcp_policies SET policy = ? WHERE team_id = ? AND connector_id = ?",
                  mp.policy, teamId, mp.connector_id
                );
              } else {
                await db.run(
                  "INSERT INTO team_mcp_policies (id, team_id, connector_id, policy) VALUES (?,?,?,?)",
                  newId("mcp_pol"), teamId, mp.connector_id, mp.policy
                );
              }
            }
          }

          // Projects
          if (team.projects) {
            for (const proj of team.projects) {
              const projId = `proj_${org.slug}_${team.slug}_${proj.slug}`;
              const existingProj = await db.get<any>("SELECT id FROM projects WHERE id = ?", projId);
              if (!existingProj) {
                await db.run(
                  "INSERT INTO projects (id, team_id, name, slug, description) VALUES (?,?,?,?,?)",
                  projId, teamId, proj.name, proj.slug, proj.description ?? null
                );
              }
            }
          }
        }
      }
    }
  }
}
