import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ArrowLeft,
  Search,
  ChevronRight,
  Save,
  Play,
  ChevronDown,
  Sparkles,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { CodeBlock } from "../components/ui/code-block";
import { Badge } from "../components/ui/badge";
import { ConnectorIcon } from "../components/ui/connector-icon";
import { MCPConnectorBrowser } from "../components/mcp-connector-browser";
import * as api from "../lib/api";
import type {
  AgentBuilderMessage,
  AgentBuilderDraft,
} from "../lib/api";
import type { Agent, Environment, Session } from "@open-managed-agents/types";

/* ── Template data ───────────────────────────────────────────────────── */

interface Template {
  name: string;
  description: string;
  connectors: string[];
  config: Record<string, unknown>;
}

const TEMPLATES: Template[] = [
  {
    name: "Blank agent config",
    description: "A blank starting point with the core toolset.",
    connectors: [],
    config: {
      name: "my-agent",
      description: "A new agent",
      model: "claude-sonnet-4-6",
      system: "You are a helpful assistant.",
      mcp_servers: [],
      tools: [
        {
          type: "agent_toolset_20260401",
          default_config: { enabled: true, permission_policy: { type: "always_allow" } },
        },
      ],
      skills: [],
    },
  },
  {
    name: "Deep researcher",
    description:
      "Conducts multi-step web research with source synthesis and citations.",
    connectors: [],
    config: {
      name: "deep-researcher",
      description: "Conducts multi-step web research with source synthesis and citations.",
      model: "claude-sonnet-4-6",
      system:
        "You are a research assistant. Conduct thorough web research, synthesize sources, and provide citations.",
      mcp_servers: [],
      tools: [
        {
          type: "agent_toolset_20260401",
          default_config: { enabled: true, permission_policy: { type: "always_allow" } },
        },
      ],
      skills: [{ type: "anthropic", skill_id: "web_search" }],
    },
  },
  {
    name: "Structured extractor",
    description: "Parses unstructured text into a typed JSON schema.",
    connectors: [],
    config: {
      name: "structured-extractor",
      description: "Parses unstructured text into a typed JSON schema.",
      model: "claude-sonnet-4-6",
      system:
        "You extract structured data from unstructured text. Output valid JSON matching the requested schema.",
      mcp_servers: [],
      tools: [],
      skills: [],
    },
  },
  {
    name: "Field monitor",
    description:
      "Scans software blogs for a topic and writes a weekly what-changed brief.",
    connectors: ["notion"],
    config: {
      name: "field-monitor",
      description: "Scans software blogs for a topic and writes a weekly what-changed brief.",
      model: "claude-sonnet-4-6",
      system:
        "You monitor software blogs and news sources. Summarize changes and write weekly briefs.",
      mcp_servers: [{ type: "url", name: "notion", url: "https://mcp.notion.com/sse" }],
      tools: [],
      skills: [{ type: "anthropic", skill_id: "web_search" }],
    },
  },
  {
    name: "Support agent",
    description:
      "Answers customer questions from your docs and knowledge base, and escalates when needed.",
    connectors: ["notion", "slack"],
    config: {
      name: "support-agent",
      description: "Answers customer questions from your docs and knowledge base.",
      model: "claude-sonnet-4-6",
      system:
        "You are a customer support agent. Answer questions from documentation and escalate when needed.",
      mcp_servers: [
        { type: "url", name: "notion", url: "https://mcp.notion.com/sse" },
        { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
      ],
      tools: [],
      skills: [],
    },
  },
  {
    name: "Incident commander",
    description:
      "Triages a Sentry alert, opens a Linear incident ticket, and runs the Slack war room.",
    connectors: ["sentry", "linear", "slack", "github"],
    config: {
      name: "incident-commander",
      description: "Triages alerts, opens incident tickets, and runs war rooms.",
      model: "claude-sonnet-4-6",
      system: "You are an incident commander. Triage alerts, create tickets, and coordinate response.",
      mcp_servers: [
        { type: "url", name: "sentry", url: "https://mcp.sentry.io/sse" },
        { type: "url", name: "linear", url: "https://mcp.linear.app/sse" },
        { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
        { type: "url", name: "github", url: "https://mcp.github.com/sse" },
      ],
      tools: [],
      skills: [],
    },
  },
  {
    name: "Feedback miner",
    description:
      "Clusters raw feedback from Slack and Notion into themes and drafts Asana tasks for the top asks.",
    connectors: ["slack", "notion", "asana"],
    config: {
      name: "feedback-miner",
      description: "Clusters feedback into themes and drafts tasks for top asks.",
      model: "claude-sonnet-4-6",
      system: "You mine and cluster customer feedback, then draft actionable tasks.",
      mcp_servers: [
        { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
        { type: "url", name: "notion", url: "https://mcp.notion.com/sse" },
        { type: "url", name: "asana", url: "https://mcp.asana.com/sse" },
      ],
      tools: [],
      skills: [],
    },
  },
  {
    name: "Sprint retro facilitator",
    description:
      "Pulls a closed sprint from Linear, synthesizes themes, and writes the retro doc before the meeting.",
    connectors: ["linear", "slack", "docx"],
    config: {
      name: "sprint-retro-facilitator",
      description: "Synthesizes sprint themes and writes retro docs.",
      model: "claude-sonnet-4-6",
      system: "You facilitate sprint retrospectives by analyzing completed sprints and writing retro docs.",
      mcp_servers: [
        { type: "url", name: "linear", url: "https://mcp.linear.app/sse" },
        { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
      ],
      tools: [],
      skills: [],
    },
  },
  {
    name: "Support-to-eng escalator",
    description:
      "Reads an Intercom conversation, reproduces the bug, and files a linked Jira issue with repro steps.",
    connectors: ["intercom", "atlassian", "slack"],
    config: {
      name: "support-to-eng-escalator",
      description: "Escalates support conversations to engineering with repro steps.",
      model: "claude-sonnet-4-6",
      system:
        "You read support conversations, reproduce bugs, and file detailed engineering tickets.",
      mcp_servers: [
        { type: "url", name: "intercom", url: "https://mcp.intercom.com/sse" },
        { type: "url", name: "atlassian", url: "https://mcp.atlassian.com/sse" },
        { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
      ],
      tools: [],
      skills: [],
    },
  },
  {
    name: "Data analyst",
    description:
      "Load, explore, and visualize data; build reports and answer questions from datasets.",
    connectors: ["amplitude"],
    config: {
      name: "data-analyst",
      description: "Load, explore, and visualize data; build reports.",
      model: "claude-sonnet-4-6",
      system:
        "You are a data analyst. Load datasets, explore data, create visualizations, and answer questions.",
      mcp_servers: [
        { type: "url", name: "amplitude", url: "https://mcp.amplitude.com/sse" },
      ],
      tools: [
        {
          type: "agent_toolset_20260401",
          default_config: { enabled: true, permission_policy: { type: "always_allow" } },
        },
      ],
      skills: [],
    },
  },
  {
    name: "Product analyst (PostHog)",
    description:
      "Query PostHog analytics, analyze funnels, cohorts, and feature flag impact with natural language.",
    connectors: ["posthog", "slack"],
    config: {
      name: "product-analyst-posthog",
      description: "Analyze product data from PostHog using natural language queries.",
      model: "claude-sonnet-4-6",
      system:
        "You are a product analyst with access to PostHog. Query events, analyze funnels, explore cohorts, and report on feature flag impact. Present findings clearly with actionable insights.",
      mcp_servers: [
        { type: "url", name: "posthog", url: "https://mcp.posthog.com/sse" },
        { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
      ],
      tools: [
        {
          type: "agent_toolset_20260401",
          default_config: { enabled: true, permission_policy: { type: "always_allow" } },
        },
      ],
      skills: [],
    },
  },
];

/* ── Helpers ──────────────────────────────────────────────────────────── */

function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  let out = "";
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      out += `${pad}${key}: null\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        out += `${pad}${key}: []\n`;
      } else {
        out += `${pad}${key}:\n`;
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            const lines = toYaml(item as Record<string, unknown>, indent + 2).split("\n").filter(Boolean);
            out += `${pad}  - ${lines[0].trim()}\n`;
            for (const line of lines.slice(1)) {
              out += `${pad}    ${line.trim()}\n`;
            }
          } else {
            out += `${pad}  - ${String(item)}\n`;
          }
        }
      }
    } else if (typeof value === "object") {
      out += `${pad}${key}:\n`;
      out += toYaml(value as Record<string, unknown>, indent + 1);
    } else {
      const str =
        typeof value === "string" && value.includes("\n")
          ? `|\n${value
              .split("\n")
              .map((l) => `${pad}  ${l}`)
              .join("\n")}`
          : String(value);
      out += `${pad}${key}: ${str}\n`;
    }
  }
  return out;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:3001";
  // Use the current origin — the web app proxies /v1 to the API server,
  // so a copy-pasted snippet from the browser will hit the right place.
  return window.location.origin;
}

function generateCurl(
  method: string,
  path: string,
  body: Record<string, unknown>,
): Record<string, string> {
  const json = JSON.stringify(body, null, 2);
  const base = getApiBase();
  const pyKwargs = Object.entries(body)
    .map(([k, v]) => `    "${k}": ${JSON.stringify(v)},`)
    .join("\n");
  const cliArgs = Object.entries(body)
    .map(([k, v]) => `  --${k.replace(/_/g, "-")} '${JSON.stringify(v)}'`)
    .join(" \\\n");

  return {
    curl: `curl -X ${method} ${base}${path} \\
  -H "Content-Type: application/json" \\
  -b "oma_session=$OMA_SESSION" \\
  -d '${json}'`,
    Python: `import httpx

res = httpx.${method.toLowerCase()}(
    "${base}${path}",
    json={
${pyKwargs}
    },
    cookies={"oma_session": "..."},
)
print(res.json())`,
    TypeScript: `const res = await fetch("${base}${path}", {
  method: "${method}",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(${json}),
});
console.log(await res.json());`,
    CLI: `oma ${path.includes("agents") ? "agents create" : path.split("/").slice(-1)[0]} \\
${cliArgs}`,
  };
}

/* ── Steps ───────────────────────────────────────────────────────────── */

const STEPS = [
  "Create agent",
  "Configure environment",
  "Start session",
  "Integrate",
] as const;

type Step = (typeof STEPS)[number];

/* ── Stepper ─────────────────────────────────────────────────────────── */

function Stepper({
  activeIndex,
  completedIndexes,
}: {
  activeIndex: number;
  completedIndexes: Set<number>;
}) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isCompleted = completedIndexes.has(i);
        const isActive = i === activeIndex;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                isCompleted
                  ? "bg-green-600 text-white"
                  : isActive
                    ? "bg-accent-blue text-white"
                    : "bg-surface-hover text-text-muted"
              }`}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-xs font-medium ${
                isActive
                  ? "text-text-primary"
                  : isCompleted
                    ? "text-green-400"
                    : "text-text-muted"
              }`}
            >
              {step}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export function QuickstartPage() {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);
  const [createdEnv, setCreatedEnv] = useState<Environment | null>(null);
  const [createdSession, setCreatedSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const [configTab, setConfigTab] = useState<"Config" | "Preview">("Config");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedMCPConnectors, setSelectedMCPConnectors] = useState<string[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("claude-sonnet-4-6");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  // ── Agent builder chat state ─────────────────────────────────────
  const [builderMessages, setBuilderMessages] = useState<AgentBuilderMessage[]>([]);
  const [builderDraft, setBuilderDraft] = useState<AgentBuilderDraft>({});
  const [builderInput, setBuilderInput] = useState("");
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderDone, setBuilderDone] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chatEndRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [builderMessages, builderLoading]);

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.listProviders(),
  });
  const providers = providersData?.data ?? [];
  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? providers.find((p) => p.is_default) ?? providers[0];

  const { data: modelsData } = useQuery({
    queryKey: ["provider-models", selectedProvider?.id],
    queryFn: () => selectedProvider ? api.listProviderModels(selectedProvider.id) : Promise.resolve({ models: [] }),
    enabled: !!selectedProvider,
  });
  const availableModels = modelsData?.models ?? [];

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return TEMPLATES;
    const q = searchQuery.toLowerCase();
    return TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const markCompleted = (idx: number) => {
    setCompleted((prev) => new Set(prev).add(idx));
  };

  const advanceToStep = (idx: number) => {
    setStep(idx);
  };

  const handleUseTemplate = async () => {
    if (!selectedTemplate) return;
    setIsCreating(true);
    try {
      const agent = await api.createAgent({
        name: selectedTemplate.config.name as string,
        description: selectedTemplate.config.description as string,
        model: selectedModel || selectedTemplate.config.model as string,
        system: selectedTemplate.config.system as string,
        ...(selectedProvider?.id ? { model_provider_id: selectedProvider.id } : {}),
      } as any);
      setCreatedAgent(agent);
      markCompleted(0);
      // Stay at step 0 to show "Agent created" confirmation
    } catch {
      // On API failure, still advance UI for demo purposes
      setCreatedAgent({
        id: "agent_demo_" + Date.now(),
        type: "agent",
        name: selectedTemplate.config.name as string,
        description: selectedTemplate.config.description as string | null,
        system: selectedTemplate.config.system as string | null,
        model: { id: selectedTemplate.config.model as string },
        tools: [],
        mcp_servers: [],
        skills: [],
        metadata: {},
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      markCompleted(0);
    } finally {
      setIsCreating(false);
    }
  };

  const sendBuilderMessage = async () => {
    if (!builderInput.trim() || builderLoading) return;
    const text = builderInput.trim();
    setBuilderInput("");
    setBuilderError(null);

    const nextMessages: AgentBuilderMessage[] = [
      ...builderMessages,
      { role: "user", content: text },
    ];
    setBuilderMessages(nextMessages);
    setBuilderLoading(true);

    try {
      const result = await api.agentBuilderChat({
        messages: nextMessages,
        draft: builderDraft,
        ...(selectedProvider?.id ? { provider_id: selectedProvider.id } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
      });
      setBuilderMessages([
        ...nextMessages,
        { role: "assistant", content: result.reply },
      ]);
      setBuilderDraft(result.draft);
      setBuilderDone(result.done);
    } catch (err: any) {
      const status = err?.status;
      if (status === 503) {
        setBuilderError(
          "No LLM provider configured. Set ANTHROPIC_API_KEY / OPENAI_API_KEY in your environment (or add one under Settings → Providers) and restart the server.",
        );
      } else {
        setBuilderError(err?.message ?? "Something went wrong talking to the LLM.");
      }
    } finally {
      setBuilderLoading(false);
    }
  };

  const handleCreateFromDraft = async () => {
    if (!builderDraft.name) return;
    setIsCreating(true);
    try {
      const agent = await api.createAgent({
        name: builderDraft.name,
        description: builderDraft.description ?? "",
        model: selectedModel || "claude-sonnet-4-6",
        system: builderDraft.system ?? "You are a helpful assistant.",
        mcp_servers: builderDraft.mcp_servers ?? [],
        ...(selectedProvider?.id ? { model_provider_id: selectedProvider.id } : {}),
      } as any);
      setCreatedAgent(agent);
      markCompleted(0);
    } catch (err: any) {
      setBuilderError(err?.message ?? "Failed to create the agent.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectNetworking = async (type: "unrestricted" | "limited") => {
    try {
      const env = await api.createEnvironment({
        name: "general-purpose-env",
        description: type === "unrestricted" ? "Unrestricted networking" : "Limited networking",
        config: {
          type: "cloud",
          networking: type === "unrestricted" ? { type: "unrestricted" } : { type: "limited" },
        },
      });
      setCreatedEnv(env);
      markCompleted(1);
    } catch {
      setCreatedEnv({
        id: "env_demo_" + Date.now(),
        type: "environment",
        name: "general-purpose-env",
        description: type === "unrestricted" ? "Unrestricted networking" : "Limited networking",
        config: {
          type: "cloud",
          networking: type === "unrestricted" ? { type: "unrestricted" } : { type: "limited", allowed_hosts: [], allow_mcp_servers: true, allow_package_managers: true },
          packages: { apt: [], cargo: [], gem: [], go: [], npm: [], pip: [] },
        },
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      markCompleted(1);
    }
  };

  /* ── Render helpers ────────────────────────────────────────────────── */

  /* Right-side content for step 0 (templates / template preview / draft preview) */
  const renderStepZeroRight = () => {
    if (createdAgent) return renderAgentCreated();
    if (selectedTemplate) return renderTemplatePreview();
    if (builderDraft.name) return renderDraftPreview();
    return renderTemplatesGrid();
  };

  const renderDraftPreview = () => {
    const draftConfig = {
      name: builderDraft.name,
      description: builderDraft.description,
      model: selectedModel || "claude-sonnet-4-6",
      system: builderDraft.system,
      mcp_servers: builderDraft.mcp_servers ?? [],
      skills: builderDraft.skills ?? [],
    };
    const yamlStr = toYaml(draftConfig as Record<string, unknown>);
    const jsonStr = JSON.stringify(draftConfig, null, 2);

    return (
      <div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-text-muted">
              Draft agent
            </span>
            <h2 className="text-lg font-semibold text-text-primary">
              {builderDraft.name}
            </h2>
          </div>
          <Button
            variant="primary"
            onClick={handleCreateFromDraft}
            disabled={isCreating || !builderDone}
            title={builderDone ? "Create agent" : "Keep refining until you're ready"}
          >
            {isCreating ? "Creating..." : "Create agent"}
          </Button>
        </div>
        {!builderDone && (
          <p className="mt-2 text-xs text-text-muted">
            Keep chatting to refine — the Create button activates when the
            assistant says it's ready.
          </p>
        )}
        <div className="mt-4">
          <CodeBlock configs={{ YAML: yamlStr, JSON: jsonStr }} />
        </div>
        {(builderDraft.mcp_servers?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-text-muted">
              Connectors
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {builderDraft.mcp_servers!.map((s) => (
                <Badge key={s.name} variant="default">
                  <ConnectorIcon name={s.name} size={14} /> {s.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTemplatesGrid = () => (
    <div>
      {/* Provider & Model selector */}
      {providers.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowProviderDropdown(!showProviderDropdown)}
              className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-hover cursor-pointer"
            >
              <span className="text-text-muted text-xs">Provider:</span>
              <span>{selectedProvider?.name ?? "Select"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
            </button>
            {showProviderDropdown && (
              <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-surface-border bg-surface-card shadow-lg">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProviderId(p.id);
                      setSelectedModel(p.default_model ?? "");
                      setShowProviderDropdown(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-hover cursor-pointer ${
                      selectedProvider?.id === p.id ? "text-accent-blue" : "text-text-primary"
                    }`}
                  >
                    <span className="flex-1">{p.name}</span>
                    <Badge variant="default">{p.type}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="rounded-lg border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none cursor-pointer"
          >
            {selectedProvider?.default_model && !availableModels.includes(selectedProvider.default_model) && (
              <option value={selectedProvider.default_model}>{selectedProvider.default_model}</option>
            )}
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {/* Template grid */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          Browse templates
        </h3>
      </div>
      <div className="mt-3 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates"
          className="w-full rounded-lg border border-surface-border bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {filteredTemplates.map((tpl) => (
          <button
            key={tpl.name}
            onClick={() => setSelectedTemplate(tpl)}
            className="flex flex-col rounded-lg border border-surface-border bg-surface-card p-4 text-left transition-colors hover:border-accent-blue/50 hover:bg-surface-hover cursor-pointer"
          >
            <span className="text-sm font-medium text-text-primary">
              {tpl.name}
            </span>
            <span className="mt-1 line-clamp-2 text-xs text-text-secondary">
              {tpl.description}
            </span>
            {tpl.connectors.length > 0 && (
              <div className="mt-2 flex gap-1">
                {tpl.connectors.map((c) => (
                  <ConnectorIcon key={c} name={c} size={22} />
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  const renderTemplatePreview = () => {
    if (!selectedTemplate) return null;
    const yamlStr = toYaml(selectedTemplate.config);
    const jsonStr = JSON.stringify(selectedTemplate.config, null, 2);

    return (
      <div>
        <button
          onClick={() => setSelectedTemplate(null)}
          className="mb-4 flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to templates
        </button>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-text-muted">
              Template
            </span>
            <h2 className="text-lg font-semibold text-text-primary">
              {selectedTemplate.name}
            </h2>
          </div>
          <Button
            variant="primary"
            onClick={handleUseTemplate}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Use this template"}
          </Button>
        </div>

        <div className="mt-4">
          <CodeBlock configs={{ YAML: yamlStr, JSON: jsonStr }} />
        </div>
      </div>
    );
  };

  const renderAgentCreated = () => {
    const agentConfig = selectedTemplate?.config ?? {
      name: createdAgent?.name,
      description: createdAgent?.description,
      model: createdAgent?.model.id,
      system: createdAgent?.system,
    };
    const body = {
      name: agentConfig.name,
      description: agentConfig.description,
      model: agentConfig.model,
      system: agentConfig.system,
    };
    const curlFormats = generateCurl("POST", "/v1/agents", body as Record<string, unknown>);
    const yamlStr = toYaml(agentConfig as Record<string, unknown>);
    const jsonStr = JSON.stringify(agentConfig, null, 2);

    return (
      <div className="flex gap-6">
        {/* Left panel */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-green-400">
            <Check className="h-5 w-5" />
            <span className="text-sm font-medium">Agent created</span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Your agent is created! Here&apos;s the call that made it:
          </p>
          <div className="mt-3">
            <CodeBlock
              title="POST /v1/agents"
              formats={curlFormats as Record<string, string>}
            />
          </div>
          <div className="mt-4">
            <Button variant="primary" onClick={() => advanceToStep(1)}>
              Next: Configure environment
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-96 shrink-0">
          <div className="flex border-b border-surface-border">
            {(["Config", "Preview"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setConfigTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  configTab === tab
                    ? "border-b-2 border-accent-blue text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {configTab === "Config" && (
            <div className="mt-3 space-y-4">
              <CodeBlock configs={{ YAML: yamlStr, JSON: jsonStr }} />
              <div className="border-t border-surface-border pt-4">
                <MCPConnectorBrowser
                  selectedConnectors={selectedMCPConnectors}
                  onToggle={(connector) => {
                    setSelectedMCPConnectors((prev) =>
                      prev.includes(connector.id)
                        ? prev.filter((id) => id !== connector.id)
                        : [...prev, connector.id]
                    );
                  }}
                />
              </div>
            </div>
          )}
          {configTab === "Preview" && (
            <div className="mt-3 rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-text-muted">
              Preview will render once the session is started.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderConfigureEnvironment = () => (
    <div>
      <p className="text-sm text-text-secondary">
        Environments are container workspaces where your agent runs. Configure
        networking access for your agent.
      </p>
      <h3 className="mt-4 text-sm font-medium text-text-primary">
        Does your agent need access to the open internet, or only specific
        hosts?
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={() => handleSelectNetworking("unrestricted")}
          className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-card p-4 text-left transition-colors hover:border-accent-blue/50 hover:bg-surface-hover cursor-pointer"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-xs font-medium text-text-secondary">
            1
          </span>
          <span className="text-sm font-medium text-text-primary">
            Unrestricted
          </span>
        </button>
        <button
          onClick={() => handleSelectNetworking("limited")}
          className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-card p-4 text-left transition-colors hover:border-accent-blue/50 hover:bg-surface-hover cursor-pointer"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-xs font-medium text-text-secondary">
            2
          </span>
          <span className="text-sm font-medium text-text-primary">
            Limited
          </span>
        </button>
        <button className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-card p-4 text-left transition-colors hover:border-accent-blue/50 hover:bg-surface-hover cursor-pointer">
          <span className="text-sm text-text-muted">Something else</span>
        </button>
      </div>
      <div className="mt-4">
        <Button variant="ghost" onClick={() => { markCompleted(1); advanceToStep(2); }}>
          Skip
        </Button>
      </div>
    </div>
  );

  const renderEnvironmentCreated = () => {
    const body = {
      name: createdEnv?.name ?? "general-purpose-env",
      config: { type: "cloud", networking: { type: "unrestricted" } },
    };
    const curlFormats = generateCurl("POST", "/v1/environments", body);

    return (
      <div>
        <div className="flex items-center gap-2 text-green-400">
          <Check className="h-5 w-5" />
          <span className="text-sm font-medium">Environment created</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Your environment is ready with full internet access. On to sessions!
        </p>
        <div className="mt-3">
          <CodeBlock
            title="POST /v1/environments"
            formats={curlFormats as Record<string, string>}
          />
        </div>
        <div className="mt-4">
          <Button variant="primary" onClick={() => setStep(2)}>
            Next: Start session
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const handleTestRun = async () => {
    if (!createdAgent || !createdEnv) return;
    setIsCreating(true);
    try {
      const session = await api.createSession({
        agent: createdAgent.id,
        environment_id: createdEnv.id,
        title: `Test: ${createdAgent.name}`,
      });
      setCreatedSession(session);
      markCompleted(2);
    } catch {
      setCreatedSession({
        id: "sesn_demo_" + Date.now(),
        type: "session",
        title: `Test: ${createdAgent.name}`,
        status: "idle",
        agent: {
          id: createdAgent.id,
          type: "agent",
          name: createdAgent.name,
          description: createdAgent.description,
          system: createdAgent.system,
          model: createdAgent.model,
          tools: [],
          mcp_servers: [],
          skills: [],
          version: 1,
        },
        environment_id: createdEnv.id,
        resources: [],
        usage: {},
        stats: {},
        metadata: {},
        vault_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      } as Session);
      markCompleted(2);
    } finally {
      setIsCreating(false);
    }
  };

  const renderStartSession = () => (
    <div>
      <p className="text-sm text-text-secondary">
        A session is a running instance of your agent inside an environment.
        Start a test run to see your agent in action.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={handleTestRun} disabled={isCreating}>
          <Play className="h-4 w-4" />
          {isCreating ? "Starting..." : "Test run"}
        </Button>
        <Button variant="secondary">Keep refining</Button>
      </div>
    </div>
  );

  const renderSessionCreated = () => {
    const body = {
      agent: createdAgent?.id ?? "agent_xxx",
      environment_id: createdEnv?.id ?? "env_xxx",
    };
    const curlFormats = generateCurl("POST", "/v1/sessions", body);

    return (
      <div>
        <div className="flex items-center gap-2 text-green-400">
          <Check className="h-5 w-5" />
          <span className="text-sm font-medium">Session created</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Your session is live. Waiting for first message...
        </p>
        <div className="mt-3">
          <CodeBlock
            title="POST /v1/sessions"
            formats={curlFormats as Record<string, string>}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            onClick={() => navigate(`/sessions/${createdSession?.id}`)}
          >
            View session
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={() => advanceToStep(3)}>
            Next: Integrate
          </Button>
        </div>
      </div>
    );
  };

  const renderIntegrate = () => {
    const agentId = createdAgent?.id ?? "agent_xxx";
    const envId = createdEnv?.id ?? "env_xxx";
    const base = getApiBase();

    const integrationCode = {
      curl: `# Create a session and send a message
curl -X POST ${base}/v1/sessions \\
  -H "Content-Type: application/json" \\
  -b "oma_session=$OMA_SESSION" \\
  -d '{
    "agent": "${agentId}",
    "environment_id": "${envId}"
  }'

# Then send a message to the session (use the returned session id)
curl -X POST ${base}/v1/sessions/<session_id>/events \\
  -H "Content-Type: application/json" \\
  -b "oma_session=$OMA_SESSION" \\
  -d '{"events":[{"type":"user.message","content":[{"type":"text","text":"Hello!"}]}]}'`,
      Python: `import httpx

OMA = "${base}"
cookies = {"oma_session": "..."}  # obtain via POST /v1/auth/login

# Create a session
session = httpx.post(
    f"{OMA}/v1/sessions",
    json={"agent": "${agentId}", "environment_id": "${envId}"},
    cookies=cookies,
).json()

# Send a message
httpx.post(
    f"{OMA}/v1/sessions/{session['id']}/events",
    json={"events": [{
        "type": "user.message",
        "content": [{"type": "text", "text": "Hello!"}],
    }]},
    cookies=cookies,
)`,
      TypeScript: `const OMA = "${base}";

// Create a session (browsers: use credentials: "include" to send the cookie)
const session = await fetch(\`\${OMA}/v1/sessions\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    agent: "${agentId}",
    environment_id: "${envId}",
  }),
}).then(r => r.json());

// Send a message
await fetch(\`\${OMA}/v1/sessions/\${session.id}/events\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    events: [{
      type: "user.message",
      content: [{ type: "text", text: "Hello!" }],
    }],
  }),
});`,
      CLI: `# Create a session
oma sessions create \\
  --agent "${agentId}" \\
  --environment-id "${envId}"

# Send a message
oma sessions events create <session_id> \\
  --events '[{"type":"user.message","content":[{"type":"text","text":"Hello!"}]}]'`,
    };

    return (
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Integrate
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Use these code snippets to integrate your agent into your application.
        </p>
        <div className="mt-4">
          <CodeBlock
            title="Integration"
            formats={integrationCode}
          />
        </div>
      </div>
    );
  };

  /* ── Chat pane (step 0, left column) ───────────────────────────────── */

  const renderBuilderChat = () => (
    <div className="flex h-full flex-col">
      <div className="border-b border-surface-border pb-3">
        <h2 className="text-base font-semibold text-text-primary">
          What do you want to build?
        </h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Describe your agent or start with a template.
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto py-4">
        {builderMessages.length === 0 && !builderLoading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-full bg-surface-hover p-3">
              <Sparkles className="h-5 w-5 text-accent-blue" />
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              Tell me what you want your agent to do
            </p>
            <p className="mt-1 text-xs text-text-muted">
              e.g. "a support agent that answers from our Notion docs and
              escalates to Slack"
            </p>
          </div>
        )}
        <div className="space-y-3">
          {builderMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-accent-blue text-white"
                    : "bg-surface-hover text-text-primary"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {builderLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-surface-hover px-4 py-2.5 text-sm text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
          {builderError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600">
              {builderError}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input bar — pinned to bottom of left column */}
      <div className="border-t border-surface-border pt-3">
        <div className="flex items-end gap-2">
          <textarea
            value={builderInput}
            onChange={(e) => setBuilderInput(e.target.value)}
            placeholder="Describe your agent..."
            rows={2}
            disabled={builderLoading}
            className="flex-1 resize-none rounded-xl border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendBuilderMessage();
              }
            }}
          />
          <Button
            variant="primary"
            onClick={sendBuilderMessage}
            disabled={!builderInput.trim() || builderLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {providers.length > 0 && selectedProvider && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
            <Sparkles className="h-3 w-3" />
            Using {selectedProvider.name} · {selectedModel || selectedProvider.default_model}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Step content router ───────────────────────────────────────────── */

  const renderStepNonZero = () => {
    if (step === 1) {
      if (createdEnv) return renderEnvironmentCreated();
      return renderConfigureEnvironment();
    }
    if (step === 2) {
      if (completed.has(2)) return renderSessionCreated();
      return renderStartSession();
    }
    if (step === 3) {
      return renderIntegrate();
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-sm font-medium text-text-secondary">
          Quickstart
        </h1>
        <div className="flex items-center gap-3">
          <Stepper activeIndex={step} completedIndexes={completed} />
          {createdAgent && (
            <div className="ml-4 flex items-center gap-2">
              <Button variant="secondary" size="sm">
                <Save className="h-3.5 w-3.5" />
                Save
                <kbd className="ml-1 rounded bg-surface-hover px-1 text-[10px] text-text-muted">
                  ⌘S
                </kbd>
              </Button>
              <Button variant="primary" size="sm">
                <Play className="h-3.5 w-3.5" />
                Test run
              </Button>
            </div>
          )}
        </div>
      </div>

      {step === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          {/* LEFT: persistent chat pane */}
          <div className="rounded-2xl border border-surface-border bg-surface-card p-4 lg:h-[calc(100vh-180px)] lg:sticky lg:top-6">
            {renderBuilderChat()}
          </div>
          {/* RIGHT: templates / template preview / draft preview / agent created */}
          <div className="min-w-0">{renderStepZeroRight()}</div>
        </div>
      ) : (
        <div>{renderStepNonZero()}</div>
      )}
    </div>
  );
}
