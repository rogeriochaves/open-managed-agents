import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Copy, Check, Pencil, Save, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusVariant } from "../components/ui/badge";
import { CodeBlock } from "../components/ui/code-block";
import { MCPConnectorBrowser } from "../components/mcp-connector-browser";
import { ConnectorIcon } from "../components/ui/connector-icon";
import * as api from "../lib/api";

interface McpServerEntry {
  name: string;
  url?: string;
  type?: string;
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [configFormat, setConfigFormat] = useState<"yaml" | "json">("yaml");
  const [copied, setCopied] = useState(false);

  // ── Edit mode state ───────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSystem, setEditSystem] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editMcpServers, setEditMcpServers] = useState<McpServerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api.getAgent(agentId!),
    enabled: !!agentId,
  });

  // Seed the form fields whenever a new agent loads or we leave edit mode
  useEffect(() => {
    if (!agent) return;
    setEditName(agent.name);
    setEditDescription(agent.description ?? "");
    setEditSystem(agent.system ?? "");
    setEditModel(agent.model?.id ?? "");
    setEditMcpServers(
      (agent.mcp_servers ?? []).map((s: any) => ({
        name: s.name,
        url: s.url,
        type: s.type ?? "url",
      })),
    );
  }, [agent]);

  const toggleMcpConnector = (connector: api.MCPConnector) => {
    setEditMcpServers((prev) => {
      const exists = prev.some((s) => s.name === connector.id);
      if (exists) {
        return prev.filter((s) => s.name !== connector.id);
      }
      return [
        ...prev,
        { name: connector.id, url: connector.url, type: "url" },
      ];
    });
  };

  const removeMcpServer = (name: string) => {
    setEditMcpServers((prev) => prev.filter((s) => s.name !== name));
  };

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    setEditError(null);
    try {
      await api.updateAgent(agent.id, {
        // Optimistic concurrency token — the server rejects updates
        // where this doesn't match the row's current version, so a
        // stale tab can't silently overwrite another user's edits.
        version: agent.version,
        name: editName.trim(),
        description: editDescription.trim() || null,
        system: editSystem.trim() || null,
        model: editModel.trim() || agent.model?.id,
        mcp_servers: editMcpServers,
      } as any);
      await queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!agent) return;
    setEditName(agent.name);
    setEditDescription(agent.description ?? "");
    setEditSystem(agent.system ?? "");
    setEditModel(agent.model?.id ?? "");
    setEditMcpServers(
      (agent.mcp_servers ?? []).map((s: any) => ({
        name: s.name,
        url: s.url,
        type: s.type ?? "url",
      })),
    );
    setEditError(null);
    setIsEditing(false);
  };

  const handleArchive = async () => {
    if (!agent) return;
    if (
      !window.confirm(
        `Archive agent "${agent.name}"? It will disappear from the active list. You can still view it with "Show archived" on the agents page.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await api.archiveAgent(agent.id);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      navigate("/agents");
    } catch (err) {
      setArchiving(false);
      setEditError(
        err instanceof Error ? err.message : "Failed to archive agent",
      );
    }
  };

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
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !editName.trim()}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {status === "active" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleArchive}
                  disabled={archiving}
                >
                  <Archive className="h-3.5 w-3.5" />
                  {archiving ? "Archiving…" : "Archive"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Config / edit panel */}
        <div className="flex-1 overflow-y-auto">
          {isEditing ? (
            <div className="p-6 space-y-5 max-w-2xl">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Name
                </span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Description
                </span>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Model
                </span>
                <input
                  type="text"
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  placeholder="e.g. claude-sonnet-4-6, gpt-5-mini, gemini-2.5-flash"
                  className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-mono focus:border-accent-blue focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  System prompt
                </span>
                <textarea
                  value={editSystem}
                  onChange={(e) => setEditSystem(e.target.value)}
                  rows={10}
                  placeholder="You are a helpful assistant…"
                  className="mt-1 w-full resize-y rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-mono focus:border-accent-blue focus:outline-none"
                />
              </label>

              {/* MCP servers — editable connector list */}
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  MCP servers
                </span>
                {editMcpServers.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editMcpServers.map((s) => (
                      <span
                        key={s.name}
                        className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-secondary px-2 py-0.5 text-xs text-text-primary"
                      >
                        <ConnectorIcon name={s.name} size={14} />
                        {s.name}
                        <button
                          type="button"
                          onClick={() => removeMcpServer(s.name)}
                          className="cursor-pointer rounded-full p-0.5 text-text-muted hover:bg-red-500/10 hover:text-red-600"
                          aria-label={`Remove ${s.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-text-muted">
                    No connectors. Pick one below to add it.
                  </p>
                )}
                <div className="mt-3 rounded-md border border-surface-border bg-surface-secondary p-3">
                  <MCPConnectorBrowser
                    selectedConnectors={editMcpServers.map((s) => s.name)}
                    onToggle={toggleMcpConnector}
                  />
                </div>
              </div>

              {editError && (
                <p className="text-xs text-red-600">{editError}</p>
              )}

              <p className="text-[11px] text-text-muted">
                Tools and skills are still read-only — edit the full config via{" "}
                <code className="font-mono">
                  POST /v1/agents/{agent.id}
                </code>
                .
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}
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
