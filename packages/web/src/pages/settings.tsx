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
  X,
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

  // ── Governance mutations ──────────────────────────────────────────
  const setProviderAccessMut = useMutation({
    mutationFn: async (params: {
      providerId: string;
      enabled: boolean;
      rate_limit_rpm?: number | null;
      monthly_budget_usd?: number | null;
    }) => {
      const res = await fetch(`/v1/teams/${activeTeamId}/provider-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider_id: params.providerId,
          enabled: params.enabled,
          rate_limit_rpm: params.rate_limit_rpm ?? null,
          monthly_budget_usd: params.monthly_budget_usd ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["provider-access", activeTeamId] }),
  });

  const setMcpPolicyMut = useMutation({
    mutationFn: async (params: {
      connectorId: string;
      policy: "allowed" | "blocked" | "requires_approval";
    }) => {
      const res = await fetch(`/v1/teams/${activeTeamId}/mcp-policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          connector_id: params.connectorId,
          policy: params.policy,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["mcp-policies", activeTeamId] }),
  });

  const nextPolicy = (
    p: "allowed" | "blocked" | "requires_approval",
  ): "allowed" | "blocked" | "requires_approval" => {
    if (p === "allowed") return "blocked";
    if (p === "blocked") return "requires_approval";
    return "allowed";
  };

  // ── Organization tab — Add team state ─────────────────────────
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);

  const addTeamMut = useMutation({
    mutationFn: async (params: {
      orgId: string;
      name: string;
      slug: string;
      description: string;
    }) => {
      const res = await fetch(`/v1/organizations/${params.orgId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: params.name,
          slug: params.slug,
          ...(params.description ? { description: params.description } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setTeamOpen(false);
      setTeamName("");
      setTeamSlug("");
      setTeamDescription("");
      setTeamError(null);
    },
    onError: (err: any) => setTeamError(err?.message ?? "Failed to add team"),
  });

  // ── Organization tab — Add user state ─────────────────────────
  const [userOpen, setUserOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "member" | "viewer">(
    "member",
  );
  const [userError, setUserError] = useState<string | null>(null);

  const addUserMut = useMutation({
    mutationFn: async (params: {
      email: string;
      name: string;
      role: "admin" | "member" | "viewer";
      organization_id: string;
    }) => {
      const res = await fetch(`/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUserOpen(false);
      setUserEmail("");
      setUserName("");
      setUserRole("member");
      setUserError(null);
    },
    onError: (err: any) => setUserError(err?.message ?? "Failed to add user"),
  });

  // Auto-derive slug from name when the user hasn't touched it
  const [teamSlugTouched, setTeamSlugTouched] = useState(false);
  const handleTeamNameChange = (v: string) => {
    setTeamName(v);
    if (!teamSlugTouched) {
      setTeamSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

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

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">Teams</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setTeamOpen(true);
                setTeamError(null);
              }}
            >
              <Plus className="h-3 w-3" />
              Add team
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {teams.map((team: any) => (
              <div key={team.id} className="flex items-center gap-3 rounded-md border border-surface-border bg-surface-secondary px-3 py-2">
                <Users className="h-4 w-4 text-text-muted" />
                <span className="text-sm text-text-primary flex-1">{team.name}</span>
                <Badge variant="default">{team.slug}</Badge>
              </div>
            ))}
            {teams.length === 0 && (
              <p className="text-xs text-text-muted py-2">No teams yet.</p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">Users</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setUserOpen(true);
                setUserError(null);
              }}
            >
              <Plus className="h-3 w-3" />
              Add user
            </Button>
          </div>
          <div className="mt-2 space-y-2">
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
            {users.length === 0 && (
              <p className="text-xs text-text-muted py-2">No users yet.</p>
            )}
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
          {/* Provider access — now interactive ────────────────── */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
              <Key className="h-4 w-4" /> Provider Access
            </h3>
            <p className="text-xs text-text-muted mb-3">
              Click the toggle to grant or revoke a team's access to an LLM provider. Optional RPM and monthly budget caps apply on the enforcement path at session create time.
            </p>
            <div className="space-y-2">
              {providers.map((p) => {
                const access = providerAccess.find(
                  (a: any) => a.provider_id === p.id,
                );
                const enabled = access?.enabled === true || access?.enabled === 1;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border border-surface-border bg-surface-card px-3 py-2"
                  >
                    <span className="text-sm text-text-primary flex-1">
                      {p.name}
                    </span>
                    <input
                      key={`rpm-${p.id}-${access?.rate_limit_rpm ?? "none"}`}
                      type="number"
                      min={0}
                      defaultValue={access?.rate_limit_rpm ?? ""}
                      placeholder="RPM"
                      title="Rate limit (requests per minute)"
                      className="w-20 rounded-md border border-surface-border bg-surface-secondary px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                      onBlur={(e) => {
                        const v = e.target.value
                          ? Number(e.target.value)
                          : null;
                        if (v === (access?.rate_limit_rpm ?? null)) return;
                        setProviderAccessMut.mutate({
                          providerId: p.id,
                          enabled,
                          rate_limit_rpm: v,
                          monthly_budget_usd: access?.monthly_budget_usd ?? null,
                        });
                      }}
                    />
                    <div className="flex items-center text-xs text-text-muted">
                      <span className="mr-1">$</span>
                      <input
                        key={`budget-${p.id}-${access?.monthly_budget_usd ?? "none"}`}
                        type="number"
                        min={0}
                        defaultValue={access?.monthly_budget_usd ?? ""}
                        placeholder="budget"
                        title="Monthly budget in USD"
                        className="w-20 rounded-md border border-surface-border bg-surface-secondary px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                        onBlur={(e) => {
                          const v = e.target.value
                            ? Number(e.target.value)
                            : null;
                          if (v === (access?.monthly_budget_usd ?? null)) return;
                          setProviderAccessMut.mutate({
                            providerId: p.id,
                            enabled,
                            rate_limit_rpm: access?.rate_limit_rpm ?? null,
                            monthly_budget_usd: v,
                          });
                        }}
                      />
                      <span className="ml-1">/mo</span>
                    </div>
                    <button
                      onClick={() =>
                        setProviderAccessMut.mutate({
                          providerId: p.id,
                          enabled: !enabled,
                          rate_limit_rpm: access?.rate_limit_rpm ?? null,
                          monthly_budget_usd: access?.monthly_budget_usd ?? null,
                        })
                      }
                      className="cursor-pointer"
                      title={enabled ? "Revoke access" : "Grant access"}
                    >
                      <Badge
                        variant={
                          enabled
                            ? "active"
                            : access
                              ? "terminated"
                              : "default"
                        }
                      >
                        {enabled
                          ? "Enabled"
                          : access
                            ? "Disabled"
                            : "Not set"}
                      </Badge>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MCP policies — now interactive ─────────────────────── */}
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" /> MCP Integration Policies
            </h3>
            <p className="text-xs text-text-muted mb-3">
              Click a policy badge to cycle through <strong>allowed</strong> → <strong>blocked</strong> → <strong>requires_approval</strong>. "Not set" defaults to allowed for backward compat.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {connectors.map((c) => {
                const policy = mcpPolicies.find(
                  (p: any) => p.connector_id === c.id,
                );
                const policyValue = (policy?.policy ?? "allowed") as
                  | "allowed"
                  | "blocked"
                  | "requires_approval";
                const variant =
                  policyValue === "allowed"
                    ? "active"
                    : policyValue === "blocked"
                      ? "terminated"
                      : "rescheduling";
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border border-surface-border bg-surface-card px-3 py-2"
                  >
                    <span className="text-sm text-text-primary flex-1">
                      {c.name}
                    </span>
                    <button
                      onClick={() =>
                        setMcpPolicyMut.mutate({
                          connectorId: c.id,
                          policy: nextPolicy(policyValue),
                        })
                      }
                      className="cursor-pointer"
                      title="Click to cycle policy"
                    >
                      <Badge variant={variant as any}>{policyValue}</Badge>
                    </button>
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
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-text-primary mb-1">Settings</h1>
      <p className="text-sm text-text-secondary mb-6">
        Configure providers, organizations, and governance policies.
      </p>

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

      {/* Add team dialog ─────────────────────────────────────────── */}
      {teamOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTeamOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Add team
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  A team groups members + gets its own provider access and MCP policies.
                </p>
              </div>
              <button
                onClick={() => setTeamOpen(false)}
                className="cursor-pointer rounded-md p-1 text-text-muted hover:bg-surface-hover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Name
              </span>
              <input
                type="text"
                autoFocus
                value={teamName}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                placeholder="e.g. Platform"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Slug
              </span>
              <input
                type="text"
                value={teamSlug}
                onChange={(e) => {
                  setTeamSlug(e.target.value);
                  setTeamSlugTouched(true);
                }}
                placeholder="platform"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-mono focus:border-accent-blue focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Description
              </span>
              <input
                type="text"
                value={teamDescription}
                onChange={(e) => setTeamDescription(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            {teamError && <p className="mt-3 text-xs text-red-600">{teamError}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setTeamOpen(false)}
                disabled={addTeamMut.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!firstOrgId || !teamName.trim() || !teamSlug.trim()) return;
                  addTeamMut.mutate({
                    orgId: firstOrgId,
                    name: teamName.trim(),
                    slug: teamSlug.trim(),
                    description: teamDescription.trim(),
                  });
                }}
                disabled={
                  addTeamMut.isPending || !teamName.trim() || !teamSlug.trim()
                }
              >
                {addTeamMut.isPending ? "Adding…" : "Add team"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add user dialog ─────────────────────────────────────────── */}
      {userOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUserOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Add user
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  The user is added to the organization without a password.
                  Share{" "}
                  <code className="font-mono">POST /v1/auth/change-password</code>{" "}
                  with them to set one.
                </p>
              </div>
              <button
                onClick={() => setUserOpen(false)}
                className="cursor-pointer rounded-md p-1 text-text-muted hover:bg-surface-hover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Email
              </span>
              <input
                type="email"
                autoFocus
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="alice@example.com"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Name
              </span>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Alice Example"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Role
              </span>
              <select
                value={userRole}
                onChange={(e) =>
                  setUserRole(e.target.value as "admin" | "member" | "viewer")
                }
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none cursor-pointer"
              >
                <option value="viewer">Viewer — read only</option>
                <option value="member">Member — can create agents</option>
                <option value="admin">Admin — full control</option>
              </select>
            </label>

            {userError && <p className="mt-3 text-xs text-red-600">{userError}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setUserOpen(false)}
                disabled={addUserMut.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!firstOrgId || !userEmail.trim() || !userName.trim()) return;
                  addUserMut.mutate({
                    email: userEmail.trim(),
                    name: userName.trim(),
                    role: userRole,
                    organization_id: firstOrgId,
                  });
                }}
                disabled={
                  addUserMut.isPending || !userEmail.trim() || !userName.trim()
                }
              >
                {addUserMut.isPending ? "Adding…" : "Add user"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
