import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Check } from "lucide-react";
import { ConnectorIcon } from "./ui/connector-icon";
import { Badge } from "./ui/badge";
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

  const { data } = useQuery({
    queryKey: ["mcp-connectors", search, category],
    queryFn: () =>
      api.listMCPConnectors({
        search: search || undefined,
        category: category || undefined,
      }),
  });

  const connectors = data?.data ?? [];

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
          return (
            <button
              key={connector.id}
              onClick={() => onToggle(connector)}
              className={`cursor-pointer flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                isSelected
                  ? "border-accent-blue bg-accent-blue/10"
                  : "border-surface-border bg-surface-secondary hover:border-accent-blue/50"
              }`}
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
              <Badge
                variant="default"
                className="text-[9px] shrink-0"
              >
                {connector.auth_type}
              </Badge>
            </button>
          );
        })}
      </div>

      {connectors.length === 0 && (
        <p className="text-center text-xs text-text-muted py-4">
          No connectors found.
        </p>
      )}
    </div>
  );
}
