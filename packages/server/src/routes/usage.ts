import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDB } from "../db/index.js";

const tags = ["Usage"];

const UsageSummarySchema = z.object({
  total_sessions: z.number(),
  total_events: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  estimated_cost_usd: z.number(),
  by_agent: z.array(z.object({
    agent_id: z.string(),
    agent_name: z.string(),
    session_count: z.number(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    estimated_cost_usd: z.number(),
  })),
  by_provider: z.array(z.object({
    provider_id: z.string(),
    provider_name: z.string(),
    provider_type: z.string(),
    session_count: z.number(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    estimated_cost_usd: z.number(),
  })),
});

const usageSummaryRoute = createRoute({
  method: "get",
  path: "/v1/usage/summary",
  tags,
  summary: "Get usage summary",
  request: {
    query: z.object({
      days: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: {
      description: "Usage summary",
      content: { "application/json": { schema: UsageSummarySchema } },
    },
  },
});

// Cost estimates per 1M tokens (approximate)
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  anthropic: { input: 3.0, output: 15.0 },
  openai: { input: 2.5, output: 10.0 },
  ollama: { input: 0, output: 0 },
  "openai-compatible": { input: 1.0, output: 3.0 },
};

export function registerUsageRoutes(app: OpenAPIHono) {
  app.openapi(usageSummaryRoute, async (c) => {
    const { days } = c.req.valid("query") as any;
    const db = await getDB();

    // Compute cutoff as ISO string — works in both SQLite and Postgres since
    // we store timestamps as ISO TEXT everywhere.
    let sessions: any[];
    if (days) {
      const cutoff = new Date(Date.now() - Math.min(days, 365) * 24 * 60 * 60 * 1000).toISOString();
      sessions = await db.all<any>(
        `SELECT s.id, s.agent_id, s.usage, s.agent_snapshot
         FROM sessions s
         WHERE s.archived_at IS NULL AND s.created_at >= ?`,
        cutoff
      );
    } else {
      sessions = await db.all<any>(
        `SELECT s.id, s.agent_id, s.usage, s.agent_snapshot
         FROM sessions s
         WHERE s.archived_at IS NULL`
      );
    }

    // Aggregate by agent
    const byAgent = new Map<string, {
      agent_name: string;
      session_count: number;
      input_tokens: number;
      output_tokens: number;
      provider_type: string;
    }>();

    // Aggregate by provider
    const byProvider = new Map<string, {
      provider_name: string;
      provider_type: string;
      session_count: number;
      input_tokens: number;
      output_tokens: number;
    }>();

    let totalInput = 0;
    let totalOutput = 0;

    for (const s of sessions) {
      const usage = JSON.parse(s.usage || "{}");
      const snapshot = JSON.parse(s.agent_snapshot || "{}");
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      totalInput += inputTokens;
      totalOutput += outputTokens;

      // By agent
      const agentId = s.agent_id;
      const agentName = snapshot.name ?? "Unknown";
      if (!byAgent.has(agentId)) {
        const providerId = snapshot.model_provider_id;
        const providerRow = providerId
          ? await db.get<any>("SELECT type FROM llm_providers WHERE id = ?", providerId)
          : null;
        byAgent.set(agentId, {
          agent_name: agentName,
          session_count: 0,
          input_tokens: 0,
          output_tokens: 0,
          provider_type: providerRow?.type ?? "anthropic",
        });
      }
      const a = byAgent.get(agentId)!;
      a.session_count++;
      a.input_tokens += inputTokens;
      a.output_tokens += outputTokens;

      // By provider
      const providerId = snapshot.model_provider_id ?? "provider_default";
      if (!byProvider.has(providerId)) {
        const providerRow = await db.get<any>("SELECT name, type FROM llm_providers WHERE id = ?", providerId);
        byProvider.set(providerId, {
          provider_name: providerRow?.name ?? "Default",
          provider_type: providerRow?.type ?? "anthropic",
          session_count: 0,
          input_tokens: 0,
          output_tokens: 0,
        });
      }
      const p = byProvider.get(providerId)!;
      p.session_count++;
      p.input_tokens += inputTokens;
      p.output_tokens += outputTokens;
    }

    const totalEventsRow = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM events");
    const totalEvents = totalEventsRow?.c ?? 0;

    function estimateCost(inputTokens: number, outputTokens: number, providerType: string) {
      const rates = COST_PER_1M[providerType] ?? COST_PER_1M.anthropic;
      return Number(((inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output).toFixed(4));
    }

    const byAgentArr = Array.from(byAgent.entries()).map(([id, d]) => ({
      agent_id: id,
      agent_name: d.agent_name,
      session_count: d.session_count,
      input_tokens: d.input_tokens,
      output_tokens: d.output_tokens,
      estimated_cost_usd: estimateCost(d.input_tokens, d.output_tokens, d.provider_type),
    })).sort((a, b) => b.input_tokens + b.output_tokens - a.input_tokens - a.output_tokens);

    const byProviderArr = Array.from(byProvider.entries()).map(([id, d]) => ({
      provider_id: id,
      provider_name: d.provider_name,
      provider_type: d.provider_type,
      session_count: d.session_count,
      input_tokens: d.input_tokens,
      output_tokens: d.output_tokens,
      estimated_cost_usd: estimateCost(d.input_tokens, d.output_tokens, d.provider_type),
    })).sort((a, b) => b.input_tokens + b.output_tokens - a.input_tokens - a.output_tokens);

    const totalCost = byProviderArr.reduce((sum, p) => sum + p.estimated_cost_usd, 0);

    return c.json({
      total_sessions: sessions.length,
      total_events: totalEvents,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      estimated_cost_usd: Number(totalCost.toFixed(4)),
      by_agent: byAgentArr,
      by_provider: byProviderArr,
    }, 200);
  });
}
