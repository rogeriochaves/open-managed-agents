/**
 * Governance config loading (IAC) integration test.
 *
 * Verifies that `createApp({ governanceConfigPath })` reads a JSON
 * config file and reflects the resulting org → team → project →
 * provider-access → mcp-policy rows via the public governance API.
 *
 * This is the backing test for the "infra-as-code deployments" claim
 * in the README.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-gov-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.ACME_OKTA_CLIENT_SECRET = "test-secret-xyz";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const configPath = join(tmpDir, "governance.json");
writeFileSync(
  configPath,
  JSON.stringify({
    providers: [
      {
        name: "Anthropic (IAC)",
        type: "anthropic",
        api_key: "sk-ant-test",
        default_model: "claude-sonnet-4-6",
        is_default: true,
      },
      {
        name: "OpenAI (IAC)",
        type: "openai",
        api_key: "sk-test",
        default_model: "gpt-4o",
      },
    ],
    organizations: [
      {
        name: "Acme Corp",
        slug: "acme",
        sso_provider: "okta",
        sso_config: { issuer: "https://acme.okta.com" },
        teams: [
          {
            name: "Engineering",
            slug: "engineering",
            description: "Backend engineers",
            providers: [
              {
                id: "provider_anthropic",
                enabled: true,
                rate_limit_rpm: 1000,
                monthly_budget_usd: 500,
              },
              {
                id: "provider_openai",
                enabled: true,
                rate_limit_rpm: 500,
                monthly_budget_usd: 200,
              },
            ],
            mcp_policies: [
              { connector_id: "slack", policy: "allowed" },
              { connector_id: "postgres", policy: "requires_approval" },
              { connector_id: "stripe", policy: "blocked" },
            ],
            projects: [{ name: "Backend Services", slug: "backend" }],
          },
          {
            name: "Marketing",
            slug: "marketing",
            providers: [
              {
                id: "provider_anthropic",
                enabled: true,
                rate_limit_rpm: 200,
                monthly_budget_usd: 100,
              },
            ],
            mcp_policies: [
              { connector_id: "notion", policy: "allowed" },
              { connector_id: "github", policy: "blocked" },
            ],
            projects: [{ name: "Content Pipeline", slug: "content" }],
          },
        ],
      },
    ],
  })
);

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({
    skipProviderSeed: true,
    governanceConfigPath: configPath,
  });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Governance config (IAC)", () => {
  it("inserts providers defined in the config", async () => {
    const res = await app.request("/v1/providers");
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string; type: string }>;
    };
    const byId = Object.fromEntries(body.data.map((p) => [p.id, p]));
    expect(byId["provider_anthropic"]?.name).toBe("Anthropic (IAC)");
    expect(byId["provider_openai"]?.name).toBe("OpenAI (IAC)");
  });

  it("inserts the Acme organization", async () => {
    const res = await app.request("/v1/organizations");
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string; slug: string }>;
    };
    const acme = body.data.find((o) => o.slug === "acme");
    expect(acme?.name).toBe("Acme Corp");
    expect(acme?.id).toBe("org_acme");
  });

  it("inserts the Engineering and Marketing teams under Acme", async () => {
    const res = await app.request("/v1/organizations/org_acme/teams");
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string; slug: string }>;
    };
    const slugs = body.data.map((t) => t.slug).sort();
    expect(slugs).toEqual(["engineering", "marketing"]);
  });

  it("inserts the Backend Services project under Engineering", async () => {
    const res = await app.request(
      "/v1/teams/team_acme_engineering/projects"
    );
    const body = (await res.json()) as {
      data: Array<{ name: string; slug: string }>;
    };
    const backend = body.data.find((p) => p.slug === "backend");
    expect(backend?.name).toBe("Backend Services");
  });

  it("applies per-team provider access with limits and budgets", async () => {
    const res = await app.request(
      "/v1/teams/team_acme_engineering/provider-access"
    );
    const body = (await res.json()) as {
      data: Array<{
        provider_id: string;
        enabled: boolean;
        rate_limit_rpm: number | null;
        monthly_budget_usd: number | null;
      }>;
    };
    const anthropic = body.data.find(
      (a) => a.provider_id === "provider_anthropic"
    );
    expect(anthropic?.enabled).toBe(true);
    expect(anthropic?.rate_limit_rpm).toBe(1000);
    expect(anthropic?.monthly_budget_usd).toBe(500);
  });

  it("applies MCP policies per team (allowed / blocked / requires_approval)", async () => {
    const res = await app.request(
      "/v1/teams/team_acme_engineering/mcp-policies"
    );
    const body = (await res.json()) as {
      data: Array<{ connector_id: string; policy: string }>;
    };
    const byConnector = Object.fromEntries(
      body.data.map((p) => [p.connector_id, p.policy])
    );
    expect(byConnector["slack"]).toBe("allowed");
    expect(byConnector["postgres"]).toBe("requires_approval");
    expect(byConnector["stripe"]).toBe("blocked");
  });

  it("applies different MCP policies for a different team", async () => {
    const res = await app.request(
      "/v1/teams/team_acme_marketing/mcp-policies"
    );
    const body = (await res.json()) as {
      data: Array<{ connector_id: string; policy: string }>;
    };
    const byConnector = Object.fromEntries(
      body.data.map((p) => [p.connector_id, p.policy])
    );
    expect(byConnector["notion"]).toBe("allowed");
    expect(byConnector["github"]).toBe("blocked");
  });
});
