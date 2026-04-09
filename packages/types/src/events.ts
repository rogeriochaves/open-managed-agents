import type { ContentBlock, TextBlock, ImageBlock, DocumentBlock } from "./common.js";

// ── Retry status ────────────────────────────────────────────────────────────

export interface RetryStatusRetrying {
  type: "retrying";
}

export interface RetryStatusExhausted {
  type: "exhausted";
}

export interface RetryStatusTerminal {
  type: "terminal";
}

export type RetryStatus =
  | RetryStatusRetrying
  | RetryStatusExhausted
  | RetryStatusTerminal;

// ── Error types ─────────────────────────────────────────────────────────────

export interface UnknownError {
  type: "unknown_error";
  message: string;
  retry_status: RetryStatus;
}

export interface ModelOverloadedError {
  type: "model_overloaded_error";
  message: string;
  retry_status: RetryStatus;
}

export interface ModelRateLimitedError {
  type: "model_rate_limited_error";
  message: string;
  retry_status: RetryStatus;
}

export interface ModelRequestFailedError {
  type: "model_request_failed_error";
  message: string;
  retry_status: RetryStatus;
}

export interface MCPConnectionFailedError {
  type: "mcp_connection_failed_error";
  mcp_server_name: string;
  message: string;
  retry_status: RetryStatus;
}

export interface MCPAuthenticationFailedError {
  type: "mcp_authentication_failed_error";
  mcp_server_name: string;
  message: string;
  retry_status: RetryStatus;
}

export interface BillingError {
  type: "billing_error";
  message: string;
  retry_status: RetryStatus;
}

export type SessionErrorType =
  | UnknownError
  | ModelOverloadedError
  | ModelRateLimitedError
  | ModelRequestFailedError
  | MCPConnectionFailedError
  | MCPAuthenticationFailedError
  | BillingError;

// ── Stop reasons ────────────────────────────────────────────────────────────

export interface SessionEndTurn {
  type: "end_turn";
}

export interface SessionRequiresAction {
  type: "requires_action";
  event_ids: string[];
}

export interface SessionRetriesExhausted {
  type: "retries_exhausted";
}

export type StopReason =
  | SessionEndTurn
  | SessionRequiresAction
  | SessionRetriesExhausted;

// ── Model usage ─────────────────────────────────────────────────────────────

export interface SpanModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  speed?: "standard" | "fast" | null;
}

export type EvaluatedPermission = "allow" | "ask" | "deny";

// ── User events ─────────────────────────────────────────────────────────────

export interface UserMessageEvent {
  id: string;
  type: "user.message";
  content: ContentBlock[];
  processed_at?: string | null;
}

export interface UserMessageEventParams {
  type: "user.message";
  content: ContentBlock[];
}

export interface UserInterruptEvent {
  id: string;
  type: "user.interrupt";
  processed_at?: string | null;
}

export interface UserInterruptEventParams {
  type: "user.interrupt";
}

export interface UserToolConfirmationEvent {
  id: string;
  type: "user.tool_confirmation";
  tool_use_id: string;
  result: "allow" | "deny";
  deny_message?: string | null;
  processed_at?: string | null;
}

export interface UserToolConfirmationEventParams {
  type: "user.tool_confirmation";
  tool_use_id: string;
  result: "allow" | "deny";
  deny_message?: string | null;
}

export interface UserCustomToolResultEvent {
  id: string;
  type: "user.custom_tool_result";
  custom_tool_use_id: string;
  content?: ContentBlock[];
  is_error?: boolean | null;
  processed_at?: string | null;
}

export interface UserCustomToolResultEventParams {
  type: "user.custom_tool_result";
  custom_tool_use_id: string;
  content?: ContentBlock[];
  is_error?: boolean | null;
}

// ── Agent events ────────────────────────────────────────────────────────────

export interface AgentMessageEvent {
  id: string;
  type: "agent.message";
  content: TextBlock[];
  processed_at: string;
}

export interface AgentThinkingEvent {
  id: string;
  type: "agent.thinking";
  processed_at: string;
}

export interface AgentToolUseEvent {
  id: string;
  type: "agent.tool_use";
  name: string;
  input: Record<string, unknown>;
  processed_at: string;
  evaluated_permission?: EvaluatedPermission;
}

export interface AgentToolResultEvent {
  id: string;
  type: "agent.tool_result";
  tool_use_id: string;
  content?: ContentBlock[];
  is_error?: boolean | null;
  processed_at: string;
}

export interface AgentMCPToolUseEvent {
  id: string;
  type: "agent.mcp_tool_use";
  name: string;
  mcp_server_name: string;
  input: Record<string, unknown>;
  processed_at: string;
  evaluated_permission?: EvaluatedPermission;
}

export interface AgentMCPToolResultEvent {
  id: string;
  type: "agent.mcp_tool_result";
  mcp_tool_use_id: string;
  content?: ContentBlock[];
  is_error?: boolean | null;
  processed_at: string;
}

export interface AgentCustomToolUseEvent {
  id: string;
  type: "agent.custom_tool_use";
  name: string;
  input: Record<string, unknown>;
  processed_at: string;
}

export interface AgentThreadContextCompactedEvent {
  id: string;
  type: "agent.thread_context_compacted";
  processed_at: string;
}

// ── Session status events ───────────────────────────────────────────────────

export interface SessionStatusRunningEvent {
  id: string;
  type: "session.status_running";
  processed_at: string;
}

export interface SessionStatusRescheduledEvent {
  id: string;
  type: "session.status_rescheduled";
  processed_at: string;
}

export interface SessionStatusIdleEvent {
  id: string;
  type: "session.status_idle";
  stop_reason: StopReason;
  processed_at: string;
}

export interface SessionStatusTerminatedEvent {
  id: string;
  type: "session.status_terminated";
  processed_at: string;
}

export interface SessionErrorEvent {
  id: string;
  type: "session.error";
  error: SessionErrorType;
  processed_at: string;
}

export interface SessionDeletedEvent {
  id: string;
  type: "session.deleted";
  processed_at: string;
}

// ── Span events ─────────────────────────────────────────────────────────────

export interface SpanModelRequestStartEvent {
  id: string;
  type: "span.model_request_start";
  processed_at: string;
}

export interface SpanModelRequestEndEvent {
  id: string;
  type: "span.model_request_end";
  model_request_start_id: string;
  model_usage: SpanModelUsage;
  is_error: boolean | null;
  processed_at: string;
}

// ── Union types ─────────────────────────────────────────────────────────────

export type SessionEvent =
  | UserMessageEvent
  | UserInterruptEvent
  | UserToolConfirmationEvent
  | UserCustomToolResultEvent
  | AgentCustomToolUseEvent
  | AgentMessageEvent
  | AgentThinkingEvent
  | AgentMCPToolUseEvent
  | AgentMCPToolResultEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentThreadContextCompactedEvent
  | SessionErrorEvent
  | SessionStatusRescheduledEvent
  | SessionStatusRunningEvent
  | SessionStatusIdleEvent
  | SessionStatusTerminatedEvent
  | SpanModelRequestStartEvent
  | SpanModelRequestEndEvent
  | SessionDeletedEvent;

export type StreamSessionEvent = SessionEvent;

export type EventParams =
  | UserMessageEventParams
  | UserInterruptEventParams
  | UserToolConfirmationEventParams
  | UserCustomToolResultEventParams;

export interface SendSessionEvents {
  data?: Array<
    | UserMessageEvent
    | UserInterruptEvent
    | UserToolConfirmationEvent
    | UserCustomToolResultEvent
  >;
}

export interface EventListParams {
  order?: "asc" | "desc";
  after_id?: string;
  before_id?: string;
  limit?: number;
}

export interface EventSendParams {
  events: EventParams[];
}
