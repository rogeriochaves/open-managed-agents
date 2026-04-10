import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { SessionIdParamSchema } from "../schemas/sessions.js";
import {
  SessionEventSchema,
  EventSendBodySchema,
  EventListQuerySchema,
  SendSessionEventsResponseSchema,
} from "../schemas/events.js";
import { getDB, newId } from "../db/index.js";
import { runAgentLoop, createSSEEmitter } from "../engine/index.js";
import { createProvider } from "../providers/index.js";
import { getProviderConfig } from "./providers.js";

const tags = ["Events"];

// Active SSE streams per session
const activeStreams = new Map<string, Set<(event: any) => void>>();

function notifyStreamListeners(sessionId: string, event: any) {
  const listeners = activeStreams.get(sessionId);
  if (listeners) {
    for (const listener of listeners) {
      listener(event);
    }
  }
}

// ── Route definitions ───────────────────────────────────────────────────────

const listEventsRoute = createRoute({
  method: "get",
  path: "/v1/sessions/{sessionId}/events",
  tags,
  summary: "List session events",
  request: {
    params: SessionIdParamSchema,
    query: EventListQuerySchema,
  },
  responses: {
    200: {
      description: "A list of session events",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(SessionEventSchema),
            has_more: z.boolean(),
            first_id: z.string().nullable(),
            last_id: z.string().nullable(),
          }),
        },
      },
    },
  },
});

const sendEventsRoute = createRoute({
  method: "post",
  path: "/v1/sessions/{sessionId}/events",
  tags,
  summary: "Send events to a session",
  request: {
    params: SessionIdParamSchema,
    body: {
      content: { "application/json": { schema: EventSendBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The created events",
      content: {
        "application/json": { schema: SendSessionEventsResponseSchema },
      },
    },
  },
});

const streamEventsRoute = createRoute({
  method: "get",
  path: "/v1/sessions/{sessionId}/events/stream",
  tags,
  summary: "Stream session events (SSE)",
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "Server-sent event stream",
      content: {
        "text/event-stream": {
          schema: z.any(),
        },
      },
    },
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToEvent(row: any) {
  const data = JSON.parse(row.data ?? "{}");
  return {
    id: row.id,
    type: row.type,
    ...data,
    processed_at: row.processed_at,
  };
}

// ── Register routes ─────────────────────────────────────────────────────────

export function registerEventRoutes(app: OpenAPIHono) {
  app.openapi(listEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const query = c.req.valid("query") as any;
    const db = getDB();

    const order = query.order === "desc" ? "DESC" : "ASC";
    const limit = Math.min(query.limit ?? 100, 1000);

    const conditions: string[] = ["session_id = ?"];
    const values: any[] = [sessionId];

    if (query.after_id) {
      const afterRow = db
        .prepare("SELECT processed_at FROM events WHERE id = ?")
        .get(query.after_id) as any;
      if (afterRow) {
        conditions.push("processed_at > ?");
        values.push(afterRow.processed_at);
      }
    }

    if (query.before_id) {
      const beforeRow = db
        .prepare("SELECT processed_at FROM events WHERE id = ?")
        .get(query.before_id) as any;
      if (beforeRow) {
        conditions.push("processed_at < ?");
        values.push(beforeRow.processed_at);
      }
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const rows = db
      .prepare(
        `SELECT * FROM events ${where} ORDER BY processed_at ${order} LIMIT ?`
      )
      .all(...values, limit + 1) as any[];

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(rowToEvent);

    return c.json(
      {
        data,
        has_more: hasMore,
        first_id: data[0]?.id ?? null,
        last_id: data[data.length - 1]?.id ?? null,
      },
      200
    );
  });

  app.openapi(sendEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const db = getDB();

    // Get session and agent config
    const session = db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as any;

    if (!session) {
      throw Object.assign(new Error(`Session ${sessionId} not found`), { status: 404, type: "not_found" });
    }

    const agentSnapshot = JSON.parse(session.agent_snapshot);

    // Store incoming user events
    const storedEvents: any[] = [];

    for (const evt of body.events ?? []) {
      const id = newId("evt");
      const processed_at = new Date().toISOString();
      const eventData: Record<string, unknown> = {};

      if (evt.content) eventData.content = evt.content;
      if (evt.tool_use_id) eventData.tool_use_id = evt.tool_use_id;
      if (evt.custom_tool_use_id)
        eventData.custom_tool_use_id = evt.custom_tool_use_id;
      if (evt.result !== undefined) eventData.result = evt.result;
      if (evt.deny_message) eventData.deny_message = evt.deny_message;
      if (evt.is_error !== undefined) eventData.is_error = evt.is_error;

      db.prepare(
        "INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, sessionId, evt.type, JSON.stringify(eventData), processed_at);

      const stored = { id, type: evt.type, ...eventData, processed_at };
      storedEvents.push(stored);

      // Notify SSE listeners
      notifyStreamListeners(sessionId, stored);
    }

    // If a user message was sent, trigger the agent loop
    const hasUserMessage = (body.events ?? []).some(
      (e: any) =>
        e.type === "user.message" || e.type === "user.custom_tool_result"
    );

    if (hasUserMessage) {
      // Resolve provider
      const providerConfig = getProviderConfig(agentSnapshot.model_provider_id);
      if (providerConfig) {
        const provider = createProvider(providerConfig);
        const agentConfig = {
          name: agentSnapshot.name,
          system: agentSnapshot.system,
          model: agentSnapshot.model?.id ?? "claude-sonnet-4-6",
          tools: agentSnapshot.tools ?? [],
          mcp_servers: agentSnapshot.mcp_servers ?? [],
          skills: agentSnapshot.skills ?? [],
        };

        // Run agent loop asynchronously (don't block response)
        const emitter = {
          emit(event: any) {
            notifyStreamListeners(sessionId, event);
          },
          close() {},
        };

        runAgentLoop(sessionId, agentConfig, provider, emitter).catch(
          (err) => {
            console.error(`Agent loop failed for session ${sessionId}:`, err);
          }
        );
      }
    }

    return c.json({ data: storedEvents }, 200);
  });

  app.openapi(streamEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Send existing events first
        const db = getDB();
        const rows = db
          .prepare(
            "SELECT * FROM events WHERE session_id = ? ORDER BY processed_at ASC"
          )
          .all(sessionId) as any[];

        for (const row of rows) {
          const event = rowToEvent(row);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }

        // Subscribe to new events
        const listener = (event: any) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // Stream closed
            cleanup();
          }
        };

        if (!activeStreams.has(sessionId)) {
          activeStreams.set(sessionId, new Set());
        }
        activeStreams.get(sessionId)!.add(listener);

        function cleanup() {
          const listeners = activeStreams.get(sessionId);
          if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
              activeStreams.delete(sessionId);
            }
          }
        }

        // Clean up after 5 minutes (max SSE connection time)
        setTimeout(() => {
          cleanup();
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {}
        }, 5 * 60 * 1000);

        // Handle abort
        c.req.raw.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {}
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }) as any;
  });
}
