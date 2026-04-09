import { z } from "zod";
import { ContentBlockSchema, TextBlockSchema } from "./common.js";

// ── Retry status ────────────────────────────────────────────────────────────

const RetryStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("retrying") }),
  z.object({ type: z.literal("exhausted") }),
  z.object({ type: z.literal("terminal") }),
]);

// ── Error types ─────────────────────────────────────────────────────────────

const SessionErrorTypeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unknown_error"),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
  z.object({
    type: z.literal("model_overloaded_error"),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
  z.object({
    type: z.literal("model_rate_limited_error"),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
  z.object({
    type: z.literal("model_request_failed_error"),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
  z.object({
    type: z.literal("mcp_connection_failed_error"),
    mcp_server_name: z.string(),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
  z.object({
    type: z.literal("mcp_authentication_failed_error"),
    mcp_server_name: z.string(),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
  z.object({
    type: z.literal("billing_error"),
    message: z.string(),
    retry_status: RetryStatusSchema,
  }),
]);

// ── Stop reasons ────────────────────────────────────────────────────────────

const StopReasonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("end_turn") }),
  z.object({
    type: z.literal("requires_action"),
    event_ids: z.array(z.string()),
  }),
  z.object({ type: z.literal("retries_exhausted") }),
]);

// ── Span model usage ───────────────────────────────────────────────────────

const SpanModelUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number(),
  cache_read_input_tokens: z.number(),
  speed: z.enum(["standard", "fast"]).nullable().optional(),
});

// ── User events ─────────────────────────────────────────────────────────────

const UserMessageEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.message"),
  content: z.array(ContentBlockSchema),
  processed_at: z.string().nullable().optional(),
});

const UserInterruptEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.interrupt"),
  processed_at: z.string().nullable().optional(),
});

const UserToolConfirmationEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.tool_confirmation"),
  tool_use_id: z.string(),
  result: z.enum(["allow", "deny"]),
  deny_message: z.string().nullable().optional(),
  processed_at: z.string().nullable().optional(),
});

const UserCustomToolResultEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.custom_tool_result"),
  custom_tool_use_id: z.string(),
  content: z.array(ContentBlockSchema).optional(),
  is_error: z.boolean().nullable().optional(),
  processed_at: z.string().nullable().optional(),
});

// ── User event params ──────────────────────────────────────────────────────

const UserMessageEventParamsSchema = z.object({
  type: z.literal("user.message"),
  content: z.array(ContentBlockSchema),
});

const UserInterruptEventParamsSchema = z.object({
  type: z.literal("user.interrupt"),
});

const UserToolConfirmationEventParamsSchema = z.object({
  type: z.literal("user.tool_confirmation"),
  tool_use_id: z.string(),
  result: z.enum(["allow", "deny"]),
  deny_message: z.string().nullable().optional(),
});

const UserCustomToolResultEventParamsSchema = z.object({
  type: z.literal("user.custom_tool_result"),
  custom_tool_use_id: z.string(),
  content: z.array(ContentBlockSchema).optional(),
  is_error: z.boolean().nullable().optional(),
});

// ── Agent events ────────────────────────────────────────────────────────────

const AgentMessageEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.message"),
  content: z.array(TextBlockSchema),
  processed_at: z.string(),
});

const AgentThinkingEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.thinking"),
  processed_at: z.string(),
});

const AgentToolUseEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.tool_use"),
  name: z.string(),
  input: z.record(z.unknown()),
  processed_at: z.string(),
  evaluated_permission: z.enum(["allow", "ask", "deny"]).optional(),
});

const AgentToolResultEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.tool_result"),
  tool_use_id: z.string(),
  content: z.array(ContentBlockSchema).optional(),
  is_error: z.boolean().nullable().optional(),
  processed_at: z.string(),
});

const AgentMCPToolUseEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.mcp_tool_use"),
  name: z.string(),
  mcp_server_name: z.string(),
  input: z.record(z.unknown()),
  processed_at: z.string(),
  evaluated_permission: z.enum(["allow", "ask", "deny"]).optional(),
});

const AgentMCPToolResultEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.mcp_tool_result"),
  mcp_tool_use_id: z.string(),
  content: z.array(ContentBlockSchema).optional(),
  is_error: z.boolean().nullable().optional(),
  processed_at: z.string(),
});

const AgentCustomToolUseEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.custom_tool_use"),
  name: z.string(),
  input: z.record(z.unknown()),
  processed_at: z.string(),
});

const AgentThreadContextCompactedEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.thread_context_compacted"),
  processed_at: z.string(),
});

// ── Session status events ───────────────────────────────────────────────────

const SessionStatusRunningEventSchema = z.object({
  id: z.string(),
  type: z.literal("session.status_running"),
  processed_at: z.string(),
});

const SessionStatusRescheduledEventSchema = z.object({
  id: z.string(),
  type: z.literal("session.status_rescheduled"),
  processed_at: z.string(),
});

const SessionStatusIdleEventSchema = z.object({
  id: z.string(),
  type: z.literal("session.status_idle"),
  stop_reason: StopReasonSchema,
  processed_at: z.string(),
});

const SessionStatusTerminatedEventSchema = z.object({
  id: z.string(),
  type: z.literal("session.status_terminated"),
  processed_at: z.string(),
});

const SessionErrorEventSchema = z.object({
  id: z.string(),
  type: z.literal("session.error"),
  error: SessionErrorTypeSchema,
  processed_at: z.string(),
});

const SessionDeletedEventSchema = z.object({
  id: z.string(),
  type: z.literal("session.deleted"),
  processed_at: z.string(),
});

// ── Span events ─────────────────────────────────────────────────────────────

const SpanModelRequestStartEventSchema = z.object({
  id: z.string(),
  type: z.literal("span.model_request_start"),
  processed_at: z.string(),
});

const SpanModelRequestEndEventSchema = z.object({
  id: z.string(),
  type: z.literal("span.model_request_end"),
  model_request_start_id: z.string(),
  model_usage: SpanModelUsageSchema,
  is_error: z.boolean().nullable(),
  processed_at: z.string(),
});

// ── Union types ─────────────────────────────────────────────────────────────

export const SessionEventSchema = z.discriminatedUnion("type", [
  UserMessageEventSchema,
  UserInterruptEventSchema,
  UserToolConfirmationEventSchema,
  UserCustomToolResultEventSchema,
  AgentCustomToolUseEventSchema,
  AgentMessageEventSchema,
  AgentThinkingEventSchema,
  AgentMCPToolUseEventSchema,
  AgentMCPToolResultEventSchema,
  AgentToolUseEventSchema,
  AgentToolResultEventSchema,
  AgentThreadContextCompactedEventSchema,
  SessionErrorEventSchema,
  SessionStatusRescheduledEventSchema,
  SessionStatusRunningEventSchema,
  SessionStatusIdleEventSchema,
  SessionStatusTerminatedEventSchema,
  SpanModelRequestStartEventSchema,
  SpanModelRequestEndEventSchema,
  SessionDeletedEventSchema,
]);

export const EventParamsSchema = z.discriminatedUnion("type", [
  UserMessageEventParamsSchema,
  UserInterruptEventParamsSchema,
  UserToolConfirmationEventParamsSchema,
  UserCustomToolResultEventParamsSchema,
]);

export const EventSendBodySchema = z.object({
  events: z.array(EventParamsSchema),
});

export const SendSessionEventsResponseSchema = z.object({
  data: z
    .array(
      z.discriminatedUnion("type", [
        UserMessageEventSchema,
        UserInterruptEventSchema,
        UserToolConfirmationEventSchema,
        UserCustomToolResultEventSchema,
      ])
    )
    .optional(),
});

export const EventListQuerySchema = z.object({
  order: z.enum(["asc", "desc"]).optional(),
  after_id: z.string().optional(),
  before_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
