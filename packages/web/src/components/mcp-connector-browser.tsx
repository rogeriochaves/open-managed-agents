import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Check, Link as LinkIcon, X } from "lucide-react";
import { ConnectorIcon } from "./ui/connector-icon";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import * as api from "../lib/api";

interface MCPConnectorBrowserProps {
  selectedConnectors: string[];
  onToggle: (connector: api.MCPConnector) => void;
}

const CATEGORIES = [
  { id: "", label: "All" },
  { id: "communication", label: "Communication" },
  { id: "development", label: "Development" },
  { id: "project-management", label: "Project Mgmt" },
  { id: "knowledge-base", label: "Knowledge Base" },
  { id: "monitoring", label: "Monitoring" },
  { id: "analytics", label: "Analytics" },
  { id: "support", label: "Support" },
  { id: "storage", label: "Storage" },
  { id: "database", label: "Database" },
  { id: "payments", label: "Payments" },
];

export function MCPConnectorBrowser({
  selectedConnectors,
  onToggle,
}: MCPConnectorBrowserProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [connectTarget, setConnectTarget] = useState<api.MCPConnector | null>(
    null,
  );
  const [tokenInput, setTokenInput] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["mcp-connectors", search, category],
    queryFn: () =>
      api.listMCPConnectors({
        search: search || undefined,
        category: category || undefined,
      }),
  });

  const connectors = data?.data ?? [];

  const handleConnect = async () => {
    if (!connectTarget || !tokenInput.trim()) return;
    setConnectBusy(true);
    setConnectError(null);
    try {
      await api.connectMCPConnector(connectTarget.id, tokenInput.trim());
      setConnectTarget(null);
      setTokenInput("");
      queryClient.invalidateQueries({ queryKey: ["mcp-connectors"] });
    } catch (err: any) {
      setConnectError(err?.message ?? "Failed to save credential.");
    } finally {
      setConnectBusy(false);
    }
  };

  const handleDisconnect = async (connector: api.MCPConnector) => {
    try {
      await api.disconnectMCPConnector(connector.id);
      queryClient.invalidateQueries({ queryKey: ["mcp-connectors"] });
    } catch {
      // swallow — UI will refetch
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-text-primary">
        Available Connectors
      </h4>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search connectors..."
          className="w-full rounded-md border border-surface-border bg-surface-secondary py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
        />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              category === cat.id
                ? "bg-accent-blue text-white"
                : "bg-surface-hover text-text-muted hover:text-text-primary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Connector grid */}
      <div className="grid grid-cols-2 gap-2">
        {connectors.map((connector) => {
          const isSelected = selectedConnectors.includes(connector.id);
          const isConnected = connector.connected === true;
          return (
            <div
              key={connector.id}
              className={`group relative flex flex-col gap-2 rounded-lg border p-2.5 transition-colors ${
                isSelected
                  ? "border-accent-blue bg-accent-blue/10"
                  : isConnected
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-surface-border bg-surface-secondary hover:border-accent-blue/50"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(connector)}
                className="cursor-pointer flex items-center gap-2.5 text-left"
              >
                <ConnectorIcon name={connector.icon} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-text-primary truncate">
                      {connector.name}
                    </span>
                    {isSelected && (
                      <Check className="h-3 w-3 text-accent-blue shrink-0" />
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted line-clamp-1">
                    {connector.description}
                  </span>
                </div>
              </button>
              <div className="flex items-center justify-between gap-1">
                <Badge
                  variant="default"
                  className="text-[9px] shrink-0"
                >
                  {connector.auth_type}
                </Badge>
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(connector)}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Check className="h-3 w-3" />
                    Connected
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConnectTarget(connector);
                      setTokenInput("");
                      setConnectError(null);
                    }}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-accent-blue hover:text-white"
                  >
                    <LinkIcon className="h-3 w-3" />
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {connectors.length === 0 && (
        <p className="text-center text-xs text-text-muted py-4">
          No connectors found.
        </p>
      )}

      {/* Connect-token modal ─────────────────────────────────────── */}
      {connectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConnectTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ConnectorIcon name={connectTarget.icon} size={32} />
                <div>
                  <h3 className="text-base font-semibold text-text-primary">
                    Connect {connectTarget.name}
                  </h3>
                  <p className="text-xs text-text-muted">
                    Paste an API token or access key. It's encrypted at rest
                    with AES-256-GCM and scoped to your organization.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConnectTarget(null)}
                className="cursor-pointer rounded-md p-1 text-text-muted hover:bg-surface-hover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-text-secondary">
                {connectTarget.auth_type === "oauth"
                  ? "Access token (use a personal access token until OAuth lands)"
                  : "API token"}
              </span>
              <input
                type="password"
                autoFocus
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={`Paste your ${connectTarget.name} token…`}
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConnect();
                }}
              />
            </label>
            {connectError && (
              <p className="mt-2 text-xs text-red-600">{connectError}</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConnectTarget(null)}
                disabled={connectBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConnect}
                disabled={!tokenInput.trim() || connectBusy}
              >
                {connectBusy ? "Saving…" : "Save credential"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
