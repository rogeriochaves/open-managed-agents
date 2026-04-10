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
  ScrollText,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import * as api from "../lib/api";

type Tab = "providers" | "organization" | "governance" | "audit";

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
  // NB: every query goes through api.* so a 401 actually throws (with
  // .status=401) and the global QueryCache.onError hook bounces the
  // user to /login. Direct `fetch(...).then(r => r.json())` silently
  // swallows 401s — the error body lands as data and the page shows
  // empty org/user/team lists with no indication anything is wrong.
  const { data: orgsData } = useQuery({
    queryKey: ["orgs"],
    queryFn: api.listOrganizations,
  });
  const orgs = orgsData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
  });
  const users = usersData?.data ?? [];

  // Get teams for first org
  const firstOrgId = orgs[0]?.id;
  const { data: teamsData } = useQuery({
    queryKey: ["teams", firstOrgId],
    queryFn: () => api.listTeams(firstOrgId!),
    enabled: !!firstOrgId,
  });
  const teams = teamsData?.data ?? [];

  // ── Governance state ───────────────────────────────────────────────
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const activeTeamId = selectedTeamId ?? teams[0]?.id;

  const { data: accessData } = useQuery({
    queryKey: ["provider-access", activeTeamId],
    queryFn: () => api.listTeamProviderAccess(activeTeamId!),
    enabled: !!activeTeamId,
  });
  const providerAccess = accessData?.data ?? [];

  const { data: policiesData } = useQuery({
    queryKey: ["mcp-policies", activeTeamId],
    queryFn: () => api.listTeamMcpPolicies(activeTeamId!),
    enabled: !!activeTeamId,
  });
  const mcpPolicies = policiesData?.data ?? [];

  // ── Audit log state ────────────────────────────────────────────────
  const [auditResourceType, setAuditResourceType] = useState<string>("");
  const { data: auditData } = useQuery({
    queryKey: ["audit-log", auditResourceType],
    queryFn: () =>
      api.listAuditLog({
        limit: 100,
        ...(auditResourceType ? { resource_type: auditResourceType } : {}),
      }),
    enabled: tab === "audit",
  });
  const auditEntries = auditData?.data ?? [];

  const { data: connectorsData } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.listMCPConnectors(),
  });
  const connectors = connectorsData?.data ?? [];

  // ── Governance mutations ──────────────────────────────────────────
  const setProviderAccessMut = useMutation({
    mutationFn: (params: {
      providerId: string;
      enabled: boolean;
      rate_limit_rpm?: number | null;
      monthly_budget_usd?: number | null;
    }) =>
      api.setTeamProviderAccess(activeTeamId!, {
        provider_id: params.providerId,
        enabled: params.enabled,
        rate_limit_rpm: params.rate_limit_rpm ?? null,
        monthly_budget_usd: params.monthly_budget_usd ?? null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["provider-access", activeTeamId] }),
  });

  const setMcpPolicyMut = useMutation({
    mutationFn: (params: {
      connectorId: string;
      policy: "allowed" | "blocked" | "requires_approval";
    }) =>
      api.setTeamMcpPolicy(activeTeamId!, {
        connector_id: params.connectorId,
        policy: params.policy,
      }),
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
    mutationFn: (params: {
      orgId: string;
      name: string;
      slug: string;
      description: string;
    }) =>
      api.createTeam(params.orgId, {
        name: params.name,
        slug: params.slug,
        ...(params.description ? { description: params.description } : {}),
      }),
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
  const [userPassword, setUserPassword] = useState("");
  const [userError, setUserError] = useState<string | null>(null);

  const addUserMut = useMutation({
    mutationFn: (params: {
      email: string;
      name: string;
      role: "admin" | "member" | "viewer";
      organization_id: string;
      password?: string;
    }) => api.createUser(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUserOpen(false);
      setUserEmail("");
      setUserName("");
      setUserRole("member");
      setUserPassword("");
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
                const enabled = access?.enabled === true;
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

  // ── Audit log render ───────────────────────────────────────────────
  const userNameById = (userId: string | null): string => {
    if (!userId) return "system";
    return users.find((u: any) => u.id === userId)?.name ?? userId;
  };

  const actionVariant = (
    action: string,
  ): "active" | "terminated" | "info" | "default" => {
    if (action === "create" || action === "connect") return "active";
    // `stop`/`disconnect` join archive/delete on the terminated
    // (red) branch — all five are "the user ended this thing"
    // actions and should read the same visual weight.
    if (
      action === "archive" ||
      action === "delete" ||
      action === "stop" ||
      action === "disconnect"
    ) {
      return "terminated";
    }
    if (action === "update") return "info";
    return "default";
  };

  const renderAudit = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Audit log</h2>
          <p className="text-sm text-text-secondary mt-1">
            Every create, update, archive, and delete is recorded with the
            acting user, resource, and timestamp. Newest first.
          </p>
        </div>
        <select
          value={auditResourceType}
          onChange={(e) => setAuditResourceType(e.target.value)}
          className="rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
        >
          <option value="">All resources</option>
          <option value="agent">Agents</option>
          <option value="session">Sessions</option>
          <option value="environment">Environments</option>
          <option value="vault">Vaults</option>
          <option value="provider">Providers</option>
          <option value="organization">Organizations</option>
          <option value="team">Teams</option>
          <option value="user">Users</option>
        </select>
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-card overflow-hidden">
        {auditEntries.length === 0 ? (
          <p className="p-6 text-sm text-text-muted text-center">
            No audit entries yet. Create or modify a resource and they'll
            show up here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs text-text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Actor</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Resource</th>
                <th className="text-left px-4 py-2">Resource ID</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-surface-border last:border-0 hover:bg-surface-hover/40"
                >
                  <td className="px-4 py-2 text-xs text-text-secondary whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs text-text-primary">
                    {userNameById(entry.user_id)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-secondary capitalize">
                    {entry.resource_type}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-text-muted font-mono break-all">
                    {entry.resource_id ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
          { id: "audit" as Tab, label: "Audit log", icon: ScrollText },
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
      {tab === "audit" && renderAudit()}

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
                  Set an initial password here so the new user can log in
                  right away. They can change it themselves later.
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

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Initial password
              </span>
              <input
                type="password"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
              <span className="mt-1 block text-[10px] text-text-muted">
                Share this with the user on a private channel — they can
                change it from the login screen later.
              </span>
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
                  if (userPassword && userPassword.length < 8) {
                    setUserError("Password must be at least 8 characters");
                    return;
                  }
                  addUserMut.mutate({
                    email: userEmail.trim(),
                    name: userName.trim(),
                    role: userRole,
                    organization_id: firstOrgId,
                    ...(userPassword ? { password: userPassword } : {}),
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
