import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Send,
  Paperclip,
  Square,
  Clock,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusVariant } from "../components/ui/badge";
import * as api from "../lib/api";
import type { SessionEvent } from "@open-managed-agents/types";

type ViewMode = "transcript" | "debug";

const EVENT_BADGES: Record<string, { label: string; variant: string }> = {
  "session.status_running": { label: "Running", variant: "running" },
  "session.status_idle": { label: "Idle", variant: "idle" },
  "session.status_terminated": { label: "Terminated", variant: "terminated" },
  "session.status_rescheduled": { label: "Rescheduled", variant: "rescheduling" },
  "session.error": { label: "Error", variant: "terminated" },
  "session.deleted": { label: "Deleted", variant: "terminated" },
  "user.message": { label: "User", variant: "info" },
  "user.interrupt": { label: "Interrupt", variant: "rescheduling" },
  "user.tool_confirmation": { label: "Confirm", variant: "info" },
  "user.custom_tool_result": { label: "Tool Result", variant: "info" },
  "agent.message": { label: "Agent", variant: "active" },
  "agent.thinking": { label: "Thinking", variant: "rescheduling" },
  "agent.tool_use": { label: "Tool", variant: "rescheduling" },
  "agent.tool_result": { label: "Result", variant: "default" },
  "agent.mcp_tool_use": { label: "MCP Tool", variant: "rescheduling" },
  "agent.mcp_tool_result": { label: "MCP Result", variant: "default" },
  "agent.custom_tool_use": { label: "Custom Tool", variant: "rescheduling" },
  "agent.thread_context_compacted": { label: "Compacted", variant: "default" },
  "span.model_request_start": { label: "Model", variant: "default" },
  "span.model_request_end": { label: "Model", variant: "default" },
};

function getEventBadge(type: string) {
  return EVENT_BADGES[type] ?? { label: type.split(".").pop() ?? type, variant: "default" };
}

function getEventContent(event: any): string {
  if (event.content) {
    return event.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  if (event.name) return event.name;
  if (event.type === "agent.thinking") return "Thinking...";
  if (event.type === "session.status_idle") {
    const reason = event.stop_reason?.type ?? "end_turn";
    return `Session idle (${reason})`;
  }
  if (event.type === "session.error") {
    return event.error?.message ?? "Unknown error";
  }
  if (event.type === "span.model_request_end" && event.model_usage) {
    const u = event.model_usage;
    return `${u.input_tokens} input → ${u.output_tokens} output · ${u.cache_read_input_tokens} cache read · ${u.cache_creation_input_tokens} cache write`;
  }
  if (event.type === "span.model_request_start") return "Model request start";
  return "";
}

function formatElapsed(sessionCreatedAt: string, eventTime: string): string {
  const start = new Date(sessionCreatedAt).getTime();
  const evt = new Date(eventTime).getTime();
  const diff = Math.max(0, Math.floor((evt - start) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatTokens(event: any): string {
  if (event.type === "span.model_request_end" && event.model_usage) {
    const u = event.model_usage;
    return `${(u.input_tokens / 1000).toFixed(1)}k / ${u.output_tokens}`;
  }
  return "";
}

function formatDuration(event: any): string {
  // For tool results, we could calculate duration from the matching tool_use
  return "";
}

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>("transcript");
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000,
  });

  // Load initial events
  const { data: initialEvents } = useQuery({
    queryKey: ["session-events", sessionId],
    queryFn: () => api.listSessionEvents(sessionId!, { order: "asc", limit: 100 }),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (initialEvents?.data) {
      setEvents(initialEvents.data);
    }
  }, [initialEvents]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const handleSend = async () => {
    if (!message.trim() || !sessionId) return;
    const text = message.trim();
    setMessage("");
    try {
      await api.sendSessionEvents(sessionId, {
        events: [{ type: "user.message", content: [{ type: "text", text }] }],
      });
      // Optimistically add the event
      setEvents((prev) => [
        ...prev,
        {
          type: "user.message",
          content: [{ type: "text", text }],
          processed_at: new Date().toISOString(),
          id: `local_${Date.now()}`,
        },
      ]);
    } catch (err) {
      console.error("Failed to send:", err);
    }
  };

  const filteredEvents = searchQuery
    ? events.filter(
        (e) =>
          e.type.includes(searchQuery.toLowerCase()) ||
          getEventContent(e).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : events;

  // Transcript view: condense events into meaningful rows
  const transcriptEvents = filteredEvents.filter(
    (e) =>
      e.type === "user.message" ||
      e.type === "agent.message" ||
      e.type === "agent.tool_use" ||
      e.type === "agent.mcp_tool_use" ||
      e.type === "session.status_idle" ||
      e.type === "session.error"
  );

  const sessionCreatedAt = session?.created_at ?? new Date().toISOString();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-surface-border px-6 py-3">
        <Link
          to="/sessions"
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-sm font-medium text-text-primary">
            {session?.title ?? sessionId}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {session && (
              <>
                <Badge variant={statusVariant(session.status)}>
                  {session.status}
                </Badge>
                <span className="text-xs text-text-muted">
                  {session.agent?.name}
                </span>
                <span className="text-xs text-text-muted">·</span>
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {session.stats?.active_seconds
                    ? `${session.stats.active_seconds}s active`
                    : "0s"}
                </span>
                {session.usage?.input_tokens ? (
                  <span className="text-xs text-text-muted">
                    · {session.usage.input_tokens} in / {session.usage.output_tokens ?? 0} out tokens
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>
        {session?.status === "running" && (
          <Button variant="secondary" size="sm">
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-surface-border px-6 py-2">
        <div className="flex rounded-lg border border-surface-border bg-surface-secondary">
          {(["transcript", "debug"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`cursor-pointer px-3 py-1 text-xs font-medium capitalize transition-colors ${
                viewMode === mode
                  ? "bg-accent-blue text-white rounded-lg"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted">
          {events.length} events
        </span>
        <div className="ml-auto flex items-center gap-2">
          {showSearch && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter events..."
              className="h-7 rounded-md border border-surface-border bg-surface-secondary px-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              autoFocus
            />
          )}
          <button
            onClick={() => setShowSearch((s) => !s)}
            className="cursor-pointer p-1 text-text-muted hover:text-text-primary"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">
              No events yet. Events will appear here as they occur.
            </p>
          </div>
        ) : viewMode === "transcript" ? (
          <div className="divide-y divide-surface-border">
            {transcriptEvents.map((event, i) => {
              const badge = getEventBadge(event.type);
              const content = getEventContent(event);
              const elapsed = event.processed_at
                ? formatElapsed(sessionCreatedAt, event.processed_at)
                : "";
              const tokens = formatTokens(event);

              return (
                <div
                  key={event.id ?? i}
                  className="flex items-start gap-3 px-6 py-3"
                >
                  <Badge
                    variant={badge.variant as any}
                    className="mt-0.5 shrink-0 min-w-[60px] justify-center"
                  >
                    {badge.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                      {content}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-text-muted">
                    {tokens && <span>{tokens}</span>}
                    {elapsed && <span className="tabular-nums">{elapsed}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {filteredEvents.map((event, i) => {
              const badge = getEventBadge(event.type);
              const content = getEventContent(event);
              const elapsed = event.processed_at
                ? formatElapsed(sessionCreatedAt, event.processed_at)
                : "";
              const tokens = formatTokens(event);

              return (
                <div
                  key={event.id ?? i}
                  className="flex items-start gap-3 px-6 py-2"
                >
                  <Badge
                    variant={badge.variant as any}
                    className="mt-0.5 shrink-0 min-w-[70px] justify-center text-[10px]"
                  >
                    {badge.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-secondary whitespace-pre-wrap break-words line-clamp-3">
                      {content || event.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[10px] text-text-muted tabular-nums">
                    {tokens && <span>{tokens}</span>}
                    {elapsed && <span>{elapsed}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={eventsEndRef} />
      </div>

      {/* Message input */}
      {session?.status !== "terminated" && (
        <div className="border-t border-surface-border px-6 py-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              placeholder="Send a message to the agent"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1 rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
            />
            <Button type="button" variant="ghost" size="sm">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="submit"
              disabled={!message.trim() || (session?.status as string) === "terminated"}
              size="sm"
            >
              Send
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
