import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Send,
  Paperclip,
  Square,
  Clock,
  Copy,
  Download,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ node, ...p }) => <h1 className="text-base font-semibold text-text-primary mt-2 mb-1" {...p} />,
  h2: ({ node, ...p }) => <h2 className="text-sm font-semibold text-text-primary mt-2 mb-1" {...p} />,
  h3: ({ node, ...p }) => <h3 className="text-sm font-semibold text-text-primary mt-2 mb-0.5" {...p} />,
  p: ({ node, ...p }) => <p className="text-sm text-text-primary my-1 whitespace-pre-wrap break-words" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-text-primary" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc pl-5 my-1 text-sm text-text-primary space-y-0.5" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal pl-5 my-1 text-sm text-text-primary space-y-0.5" {...p} />,
  li: ({ node, ...p }) => <li className="text-sm text-text-primary" {...p} />,
  a: ({ node, ...p }) => <a className="text-accent-blue hover:underline" target="_blank" rel="noreferrer" {...p} />,
  code: ({ node, className, children, ...p }) => {
    const isInline = !className;
    if (isInline) {
      return <code className="rounded bg-surface-secondary px-1 py-0.5 text-xs text-accent-blue font-mono" {...p}>{children}</code>;
    }
    return <code className={className} {...p}>{children}</code>;
  },
  pre: ({ node, ...p }) => <pre className="rounded-md bg-surface-secondary border border-surface-border p-3 text-xs text-text-primary overflow-x-auto my-2" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="border-l-2 border-surface-border pl-3 text-text-secondary my-1" {...p} />,
  hr: () => <hr className="my-2 border-surface-border" />,
  table: ({ node, ...p }) => <table className="my-2 border-collapse text-xs" {...p} />,
  th: ({ node, ...p }) => <th className="border border-surface-border px-2 py-1 text-left text-text-secondary font-medium" {...p} />,
  td: ({ node, ...p }) => <td className="border border-surface-border px-2 py-1 text-text-primary" {...p} />,
};
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
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("transcript");
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [stopping, setStopping] = useState(false);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000,
  });

  const handleStop = async () => {
    if (!sessionId) return;
    setStopping(true);
    try {
      await api.stopSession(sessionId);
      await queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      console.error("Failed to stop session:", err);
    } finally {
      setStopping(false);
    }
  };

  // Single source of truth for events: the SSE stream.
  // The server replays existing events on connect, then pushes new ones live.
  // We intentionally do NOT also run a useQuery for initial events — that
  // caused a race where a stale snapshot clobbered live-streamed updates.
  useEffect(() => {
    if (!sessionId) return;
    // Reset events on session change so we don't bleed data across sessions.
    setEvents([]);
    setIsStreaming(true);
    const seenIds = new Set<string>();
    const stream = api.streamSessionEvents(
      sessionId,
      (event) => {
        const eventId = (event as any).id;
        if (eventId) {
          if (seenIds.has(eventId)) return;
          seenIds.add(eventId);
        }
        setEvents((prev) => [...prev, event]);
      },
      () => {
        setIsStreaming(false);
      }
    );

    return () => {
      stream.close();
      setIsStreaming(false);
    };
  }, [sessionId]);

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
      // Events will arrive via SSE stream - no optimistic add needed
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStop}
            disabled={stopping}
          >
            <Square className="h-3.5 w-3.5" />
            {stopping ? "Stopping…" : "Stop"}
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
          {isStreaming && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              live
            </span>
          )}
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
            title="Search events"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const text = events.map((e) => `[${e.type}] ${getEventContent(e)}`).join("\n");
              navigator.clipboard.writeText(text);
            }}
            className="cursor-pointer p-1 text-text-muted hover:text-text-primary"
            title="Copy all events"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const json = JSON.stringify(events, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `session-${sessionId}-events.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="cursor-pointer p-1 text-text-muted hover:text-text-primary"
            title="Download events JSON"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Events + Detail Panel */}
      <div className="flex flex-1 overflow-hidden">
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
                  onClick={() => setSelectedEvent(event)}
                  className={`flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-surface-hover transition-colors ${selectedEvent?.id === event.id ? "bg-surface-hover" : ""}`}
                >
                  <Badge
                    variant={badge.variant as any}
                    className="mt-0.5 shrink-0 min-w-[60px] justify-center"
                  >
                    {badge.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {event.type === "agent.message" ? (
                      <div className="text-sm text-text-primary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                        {content}
                      </p>
                    )}
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
                  onClick={() => setSelectedEvent(event)}
                  className={`flex items-start gap-3 px-6 py-2 cursor-pointer hover:bg-surface-hover transition-colors ${selectedEvent?.id === event.id ? "bg-surface-hover" : ""}`}
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

      {/* Event Detail Side Panel */}
      {selectedEvent && (
        <div className="w-96 shrink-0 border-l border-surface-border overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <Badge variant={getEventBadge(selectedEvent.type).variant as any}>
                {getEventBadge(selectedEvent.type).label}
              </Badge>
              <span className="text-xs text-text-muted capitalize">
                {selectedEvent.type.split(".").pop()}
              </span>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="cursor-pointer p-1 text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {/* Timing */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">Timing</span>
              <div className="mt-1 text-xs text-text-secondary">
                {selectedEvent.processed_at && (
                  <span>{formatElapsed(sessionCreatedAt, selectedEvent.processed_at)}</span>
                )}
              </div>
            </div>

            {/* Content */}
            {selectedEvent.content && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Content</span>
                <div className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                  {selectedEvent.content
                    ?.filter((b: any) => b.type === "text")
                    .map((b: any) => b.text)
                    .join("") || "—"}
                </div>
              </div>
            )}

            {/* Tool info */}
            {selectedEvent.name && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Tool</span>
                <div className="mt-1 text-sm text-text-primary font-mono">{selectedEvent.name}</div>
              </div>
            )}

            {/* Input */}
            {selectedEvent.input && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Input</span>
                <pre className="mt-1 text-xs text-text-secondary bg-surface-secondary rounded p-2 overflow-x-auto">
                  {JSON.stringify(selectedEvent.input, null, 2)}
                </pre>
              </div>
            )}

            {/* Model usage */}
            {selectedEvent.model_usage && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Model Usage</span>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-surface-secondary rounded p-2">
                    <span className="text-text-muted">Input</span>
                    <div className="text-text-primary font-medium">{selectedEvent.model_usage.input_tokens}</div>
                  </div>
                  <div className="bg-surface-secondary rounded p-2">
                    <span className="text-text-muted">Output</span>
                    <div className="text-text-primary font-medium">{selectedEvent.model_usage.output_tokens}</div>
                  </div>
                  <div className="bg-surface-secondary rounded p-2">
                    <span className="text-text-muted">Cache Read</span>
                    <div className="text-text-primary font-medium">{selectedEvent.model_usage.cache_read_input_tokens ?? 0}</div>
                  </div>
                  <div className="bg-surface-secondary rounded p-2">
                    <span className="text-text-muted">Cache Write</span>
                    <div className="text-text-primary font-medium">{selectedEvent.model_usage.cache_creation_input_tokens ?? 0}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Stop reason */}
            {selectedEvent.stop_reason && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Stop Reason</span>
                <div className="mt-1 text-xs text-text-secondary">
                  {selectedEvent.stop_reason.type}
                </div>
              </div>
            )}

            {/* Error */}
            {selectedEvent.error && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Error</span>
                <div className="mt-1 text-xs text-red-400">
                  {selectedEvent.error.message}
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">Raw Event</span>
              <pre className="mt-1 text-[10px] text-text-muted bg-surface-secondary rounded p-2 overflow-x-auto max-h-48">
                {JSON.stringify(selectedEvent, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
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
