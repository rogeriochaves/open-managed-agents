import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Plus,
  Trash2,
  Shield,
  Users,
  Key,
  Server,
  Building2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import * as api from "../lib/api";

type Tab = "providers" | "organization" | "governance";

const PROVIDER_TYPES = [
  { value: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-6" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o" },
  { value: "openai-compatible", label: "OpenAI Compatible", defaultModel: "" },
  { value: "ollama", label: "Ollama", defaultModel: "llama3.1" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("providers");
  const queryClient = useQueryClient();

  // ── Provider state ─────────────────────────────────────────────────
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", type: "anthropic", api_key: "", base_url: "", default_model: "claude-sonnet-4-6" });

  const { data: providersData } = useQuery({ queryKey: ["providers"], queryFn: api.listProviders });
  const providers = providersData?.data ?? [];

  const addProviderMut = useMutation({
    mutationFn: (p: any) => api.createProvider(p),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["providers"] }); setShowAddProvider(false); setNewProvider({ name: "", type: "anthropic", api_key: "", base_url: "", default_model: "claude-sonnet-4-6" }); },
  });

  const deleteProviderMut = useMutation({
    mutationFn: (id: string) => api.deleteProvider(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  // ── Org state ──────────────────────────────────────────────────────
  const { data: orgsData } = useQuery({ queryKey: ["orgs"], queryFn: () => fetch("/v1/organizations").then(r => r.json()) });
  const orgs = (orgsData as any)?.data ?? [];

  const { data: usersData } = useQuery({ queryKey: ["users"], queryFn: () => fetch("/v1/users").then(r => r.json()) });
  const users = (usersData as any)?.data ?? [];

  // Get teams for first org
  const firstOrgId = orgs[0]?.id;
  const { data: teamsData } = useQuery({
    queryKey: ["teams", firstOrgId],
    queryFn: () => fetch(`/v1/organizations/${firstOrgId}/teams`).then(r => r.json()),
    enabled: !!firstOrgId,
  });
  const teams = (teamsData as any)?.data ?? [];

  // ── Governance state ───────────────────────────────────────────────
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const activeTeamId = selectedTeamId ?? teams[0]?.id;

  const { data: accessData } = useQuery({
    queryKey: ["provider-access", activeTeamId],
    queryFn: () => fetch(`/v1/teams/${activeTeamId}/provider-access`).then(r => r.json()),
    enabled: !!activeTeamId,
  });
  const providerAccess = (accessData as any)?.data ?? [];

  const { data: policiesData } = useQuery({
    queryKey: ["mcp-policies", activeTeamId],
    queryFn: () => fetch(`/v1/teams/${activeTeamId}/mcp-policies`).then(r => r.json()),
    enabled: !!activeTeamId,
  });
  const mcpPolicies = (policiesData as any)?.data ?? [];

  const { data: connectorsData } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.listMCPConnectors(),
  });
  const connectors = connectorsData?.data ?? [];

  // ── Renders ────────────────────────────────────────────────────────

  const renderProviders = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">LLM Providers</h2>
          <p className="text-sm text-text-secondary mt-1">Configure which LLM providers are available for agents.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAddProvider(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Provider
        </Button>
      </div>

      {showAddProvider && (
        <div className="mb-4 rounded-lg border border-accent-blue/30 bg-surface-card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3">Add LLM Provider</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Name</label>
              <input value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))} placeholder="My Provider" className="w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Type</label>
              <select value={newProvider.type} onChange={e => { const t = PROVIDER_TYPES.find(p => p.value === e.target.value); setNewProvider(p => ({ ...p, type: e.target.value, default_model: t?.defaultModel ?? "" })); }} className="w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none">
                {PROVIDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">API Key</label>
              <input type="password" value={newProvider.api_key} onChange={e => setNewProvider(p => ({ ...p, api_key: e.target.value }))} placeholder="sk-..." className="w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Default Model</label>
              <input value={newProvider.default_model} onChange={e => setNewProvider(p => ({ ...p, default_model: e.target.value }))} placeholder="claude-sonnet-4-6" className="w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
            </div>
            {(newProvider.type === "openai-compatible" || newProvider.type === "ollama") && (
              <div className="col-span-2">
                <label className="text-xs text-text-muted block mb-1">Base URL</label>
                <input value={newProvider.base_url} onChange={e => setNewProvider(p => ({ ...p, base_url: e.target.value }))} placeholder="http://localhost:11434/v1" className="w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowAddProvider(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => addProviderMut.mutate(newProvider)} disabled={!newProvider.name}>Add</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {providers.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-card px-4 py-3">
            <Server className="h-5 w-5 text-text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{p.name}</span>
                <Badge variant={p.is_default ? "active" : "default"}>{p.type}</Badge>
                {p.is_default && <Badge variant="info">default</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
                <span>Model: {p.default_model ?? "—"}</span>
                <span>{p.has_api_key ? "API key configured" : "No API key"}</span>
                {p.base_url && <span>URL: {p.base_url}</span>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => deleteProviderMut.mutate(p.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {providers.length === 0 && (
          <p className="text-sm text-text-muted py-8 text-center">No providers configured. Add one to get started.</p>
        )}
      </div>
    </div>
  );

  const renderOrganization = () => (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-4">Organization</h2>

      {orgs.map((org: any) => (
        <div key={org.id} className="rounded-lg border border-surface-border bg-surface-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-5 w-5 text-text-muted" />
            <span className="text-sm font-medium text-text-primary">{org.name}</span>
            <Badge variant="default">{org.slug}</Badge>
          </div>

          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mt-4 mb-2">Teams</h3>
          <div className="space-y-2">
            {teams.map((team: any) => (
              <div key={team.id} className="flex items-center gap-3 rounded-md border border-surface-border bg-surface-secondary px-3 py-2">
                <Users className="h-4 w-4 text-text-muted" />
                <span className="text-sm text-text-primary flex-1">{team.name}</span>
                <Badge variant="default">{team.slug}</Badge>
              </div>
            ))}
          </div>

          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mt-4 mb-2">Users</h3>
          <div className="space-y-2">
            {users.map((user: any) => (
              <div key={user.id} className="flex items-center gap-3 rounded-md border border-surface-border bg-surface-secondary px-3 py-2">
                <div className="h-6 w-6 rounded-full bg-accent-blue/20 flex items-center justify-center text-xs text-accent-blue font-medium">
                  {user.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1">
                  <span className="text-sm text-text-primary">{user.name}</span>
                  <span className="text-xs text-text-muted ml-2">{user.email}</span>
                </div>
                <Badge variant={user.role === "admin" ? "active" : "default"}>{user.role}</Badge>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderGovernance = () => (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Governance</h2>
      <p className="text-sm text-text-secondary mb-4">Control which providers and integrations each team can access.</p>

      {teams.length > 1 && (
        <div className="flex gap-2 mb-4">
          {teams.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedTeamId(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm cursor-pointer ${activeTeamId === t.id ? "bg-accent-blue text-white" : "bg-surface-secondary text-text-muted hover:text-text-primary"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {activeTeamId && (
        <>
          {/* Provider access */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
              <Key className="h-4 w-4" /> Provider Access
            </h3>
            <div className="space-y-2">
              {providers.map((p) => {
                const access = providerAccess.find((a: any) => a.provider_id === p.id);
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-md border border-surface-border bg-surface-card px-3 py-2">
                    <span className="text-sm text-text-primary flex-1">{p.name}</span>
                    {access ? (
                      <>
                        <Badge variant={access.enabled ? "active" : "terminated"}>
                          {access.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {access.rate_limit_rpm && (
                          <span className="text-xs text-text-muted">{access.rate_limit_rpm} RPM</span>
                        )}
                        {access.monthly_budget_usd && (
                          <span className="text-xs text-text-muted">${access.monthly_budget_usd}/mo</span>
                        )}
                      </>
                    ) : (
                      <Badge variant="default">Not configured</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* MCP policies */}
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" /> MCP Integration Policies
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {connectors.map((c) => {
                const policy = mcpPolicies.find((p: any) => p.connector_id === c.id);
                const policyValue = policy?.policy ?? "allowed";
                const variant = policyValue === "allowed" ? "active" : policyValue === "blocked" ? "terminated" : "rescheduling";
                return (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border border-surface-border bg-surface-card px-3 py-2">
                    <span className="text-sm text-text-primary flex-1">{c.name}</span>
                    <Badge variant={variant as any}>{policyValue}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-5 w-5 text-text-muted" />
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border mb-6">
        {([
          { id: "providers" as Tab, label: "Providers", icon: Server },
          { id: "organization" as Tab, label: "Organization", icon: Building2 },
          { id: "governance" as Tab, label: "Governance", icon: Shield },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === id
                ? "border-accent-blue text-text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "providers" && renderProviders()}
      {tab === "organization" && renderOrganization()}
      {tab === "governance" && renderGovernance()}
    </div>
  );
}
