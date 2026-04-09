import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Archive, Copy, Check } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusVariant } from "../components/ui/badge";
import { CodeBlock } from "../components/ui/code-block";
import * as api from "../lib/api";

function agentToYaml(agent: any): string {
  const lines: string[] = [];
  lines.push(`name: ${agent.name}`);
  if (agent.description) lines.push(`description: ${agent.description}`);
  lines.push(`model: ${agent.model?.id ?? agent.model}`);
  if (agent.model?.speed) lines.push(`speed: ${agent.model.speed}`);
  if (agent.system) {
    lines.push(`system: |-`);
    agent.system.split("\n").forEach((l: string) => lines.push(`  ${l}`));
  }
  lines.push(`mcp_servers: ${agent.mcp_servers?.length ? "" : "[]"}`);
  agent.mcp_servers?.forEach((s: any) => {
    lines.push(`  - name: ${s.name}`);
    lines.push(`    type: ${s.type}`);
    lines.push(`    url: ${s.url}`);
  });
  lines.push(`tools:`);
  if (!agent.tools?.length) {
    lines[lines.length - 1] = "tools: []";
  } else {
    agent.tools.forEach((t: any) => {
      lines.push(`  - type: ${t.type}`);
      if (t.default_config) {
        lines.push(`    default_config:`);
        lines.push(`      enabled: ${t.default_config.enabled}`);
        if (t.default_config.permission_policy) {
          lines.push(
            `      permission_policy: { type: ${t.default_config.permission_policy.type} }`
          );
        }
      }
    });
  }
  lines.push(`skills: ${agent.skills?.length ? "" : "[]"}`);
  agent.skills?.forEach((s: any) => {
    lines.push(`  - type: ${s.type}`);
    lines.push(`    skill_id: ${s.skill_id}`);
  });
  return lines.join("\n");
}

export function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [configFormat, setConfigFormat] = useState<"yaml" | "json">("yaml");
  const [copied, setCopied] = useState(false);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api.getAgent(agentId!),
    enabled: !!agentId,
  });

  const handleCopy = async () => {
    if (!agent) return;
    const text =
      configFormat === "yaml"
        ? agentToYaml(agent)
        : JSON.stringify(agent, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading agent...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Agent not found</p>
      </div>
    );
  }

  const status = agent.archived_at ? "archived" : "active";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-surface-border px-6 py-3">
        <Link
          to="/agents"
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text-primary">
            {agent.name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={statusVariant(status)}>{status}</Badge>
            <span className="text-xs text-text-muted">v{agent.version}</span>
            <span className="text-xs text-text-muted">·</span>
            <span className="text-xs text-text-muted">{agent.model?.id}</span>
            <span className="text-xs text-text-muted">·</span>
            <span className="text-xs text-text-muted font-mono">
              {agent.id}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm">
          <Archive className="h-3.5 w-3.5" />
          Archive
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Config panel */}
        <div className="flex-1 overflow-y-auto">
          {/* Format tabs */}
          <div className="flex items-center border-b border-surface-border px-6">
            {(["yaml", "json"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setConfigFormat(fmt)}
                className={`cursor-pointer px-4 py-2.5 text-sm font-medium uppercase ${
                  configFormat === fmt
                    ? "border-b-2 border-accent-blue text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {fmt}
              </button>
            ))}
            <button
              onClick={handleCopy}
              className="ml-auto flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>

          {/* Config content */}
          <pre className="p-6 text-xs text-text-code font-mono whitespace-pre-wrap">
            {configFormat === "yaml"
              ? agentToYaml(agent)
              : JSON.stringify(agent, null, 2)}
          </pre>
        </div>

        {/* Info sidebar */}
        <div className="w-80 shrink-0 border-l border-surface-border overflow-y-auto p-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Details
          </h3>

          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs text-text-muted">Agent ID</dt>
              <dd className="mt-0.5 text-sm text-text-primary font-mono break-all">
                {agent.id}
              </dd>
            </div>

            {agent.description && (
              <div>
                <dt className="text-xs text-text-muted">Description</dt>
                <dd className="mt-0.5 text-sm text-text-secondary">
                  {agent.description}
                </dd>
              </div>
            )}

            <div>
              <dt className="text-xs text-text-muted">Model</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {agent.model?.id}
                {agent.model?.speed && agent.model.speed !== "standard" && (
                  <Badge variant="info" className="ml-2">
                    {agent.model.speed}
                  </Badge>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-muted">Version</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {agent.version}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-muted">Tools</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {agent.tools?.length ?? 0} toolset(s)
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-muted">MCP Servers</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {agent.mcp_servers?.length
                  ? agent.mcp_servers.map((s: any) => s.name).join(", ")
                  : "None"}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-muted">Skills</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {agent.skills?.length
                  ? agent.skills.map((s: any) => s.skill_id).join(", ")
                  : "None"}
              </dd>
            </div>

            {Object.keys(agent.metadata ?? {}).length > 0 && (
              <div>
                <dt className="text-xs text-text-muted">Metadata</dt>
                <dd className="mt-0.5 space-y-1">
                  {Object.entries(agent.metadata).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-text-muted">{k}:</span>
                      <span className="text-text-primary">{v as string}</span>
                    </div>
                  ))}
                </dd>
              </div>
            )}

            <div>
              <dt className="text-xs text-text-muted">Created</dt>
              <dd className="mt-0.5 text-sm text-text-secondary">
                {new Date(agent.created_at).toLocaleString()}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-text-muted">Updated</dt>
              <dd className="mt-0.5 text-sm text-text-secondary">
                {new Date(agent.updated_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
