import { useQuery } from "@tanstack/react-query";
import { BarChart3, Coins, Zap, MessageSquare } from "lucide-react";
import { Badge } from "../components/ui/badge";
import * as api from "../lib/api";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function TokenBar({ input, output, maxTotal }: { input: number; output: number; maxTotal: number }) {
  const total = input + output;
  if (maxTotal === 0) return null;
  const pct = (total / maxTotal) * 100;
  const inputPct = total > 0 ? (input / total) * pct : 0;
  const outputPct = total > 0 ? (output / total) * pct : 0;

  return (
    <div className="h-2 w-full rounded-full bg-surface-hover flex overflow-hidden">
      <div className="h-full bg-accent-blue/60 rounded-l-full" style={{ width: `${inputPct}%` }} />
      <div className="h-full bg-accent-blue rounded-r-full" style={{ width: `${outputPct}%` }} />
    </div>
  );
}

export function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["usage-summary"],
    queryFn: api.getUsageSummary,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">Usage</h1>
        <p className="text-sm text-text-secondary mb-6">
          Token usage and estimated costs across all agents and providers.
        </p>
        <p className="text-sm text-text-muted">Loading usage data...</p>
      </div>
    );
  }

  const maxAgentTokens = Math.max(...data.by_agent.map((a) => a.input_tokens + a.output_tokens), 1);
  const maxProviderTokens = Math.max(...data.by_provider.map((p) => p.input_tokens + p.output_tokens), 1);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-text-primary mb-1">Usage</h1>
      <p className="text-sm text-text-secondary mb-6">
        Token usage and estimated costs across all agents and providers.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Sessions</span>
          </div>
          <span className="text-2xl font-bold text-text-primary">{data.total_sessions}</span>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <Zap className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Events</span>
          </div>
          <span className="text-2xl font-bold text-text-primary">{data.total_events}</span>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Tokens</span>
          </div>
          <span className="text-2xl font-bold text-text-primary">
            {formatTokens(data.total_input_tokens + data.total_output_tokens)}
          </span>
          <div className="text-xs text-text-muted mt-0.5">
            {formatTokens(data.total_input_tokens)} in / {formatTokens(data.total_output_tokens)} out
          </div>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <Coins className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Est. Cost</span>
          </div>
          <span className="text-2xl font-bold text-text-primary">
            ${data.estimated_cost_usd.toFixed(2)}
          </span>
        </div>
      </div>

      {/* By Provider */}
      <h2 className="text-sm font-medium text-text-primary mb-3">By Provider</h2>
      <div className="rounded-lg border border-surface-border bg-surface-card mb-8">
        {data.by_provider.length === 0 ? (
          <p className="p-4 text-sm text-text-muted text-center">No usage data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs text-text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-2">Provider</th>
                <th className="text-right px-4 py-2">Sessions</th>
                <th className="text-right px-4 py-2">Input</th>
                <th className="text-right px-4 py-2">Output</th>
                <th className="px-4 py-2 w-48">Usage</th>
                <th className="text-right px-4 py-2">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.by_provider.map((p) => (
                <tr key={p.provider_id} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-medium">{p.provider_name}</span>
                      <Badge variant="default">{p.provider_type}</Badge>
                    </div>
                  </td>
                  <td className="text-right px-4 py-2.5 text-text-secondary">{p.session_count}</td>
                  <td className="text-right px-4 py-2.5 text-text-secondary tabular-nums">{formatTokens(p.input_tokens)}</td>
                  <td className="text-right px-4 py-2.5 text-text-secondary tabular-nums">{formatTokens(p.output_tokens)}</td>
                  <td className="px-4 py-2.5">
                    <TokenBar input={p.input_tokens} output={p.output_tokens} maxTotal={maxProviderTokens} />
                  </td>
                  <td className="text-right px-4 py-2.5 text-text-primary font-medium">${p.estimated_cost_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* By Agent */}
      <h2 className="text-sm font-medium text-text-primary mb-3">By Agent</h2>
      <div className="rounded-lg border border-surface-border bg-surface-card">
        {data.by_agent.length === 0 ? (
          <p className="p-4 text-sm text-text-muted text-center">No usage data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs text-text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-right px-4 py-2">Sessions</th>
                <th className="text-right px-4 py-2">Input</th>
                <th className="text-right px-4 py-2">Output</th>
                <th className="px-4 py-2 w-48">Usage</th>
                <th className="text-right px-4 py-2">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.by_agent.map((a) => (
                <tr key={a.agent_id} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-2.5 text-text-primary font-medium">{a.agent_name}</td>
                  <td className="text-right px-4 py-2.5 text-text-secondary">{a.session_count}</td>
                  <td className="text-right px-4 py-2.5 text-text-secondary tabular-nums">{formatTokens(a.input_tokens)}</td>
                  <td className="text-right px-4 py-2.5 text-text-secondary tabular-nums">{formatTokens(a.output_tokens)}</td>
                  <td className="px-4 py-2.5">
                    <TokenBar input={a.input_tokens} output={a.output_tokens} maxTotal={maxAgentTokens} />
                  </td>
                  <td className="text-right px-4 py-2.5 text-text-primary font-medium">${a.estimated_cost_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
