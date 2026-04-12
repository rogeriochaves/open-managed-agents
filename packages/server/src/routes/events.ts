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
import { currentUser } from "../lib/current-user.js";

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
    const db = await getDB();

    const order = query.order === "desc" ? "DESC" : "ASC";
    const limit = Math.min(query.limit ?? 100, 1000);

    const conditions: string[] = ["session_id = ?"];
    const values: any[] = [sessionId];

    if (query.after_id) {
      const afterRow = await db.get<any>(
        "SELECT processed_at FROM events WHERE id = ?",
        query.after_id
      );
      if (afterRow) {
        conditions.push("processed_at > ?");
        values.push(afterRow.processed_at);
      }
    }

    if (query.before_id) {
      const beforeRow = await db.get<any>(
        "SELECT processed_at FROM events WHERE id = ?",
        query.before_id
      );
      if (beforeRow) {
        conditions.push("processed_at < ?");
        values.push(beforeRow.processed_at);
      }
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const rows = await db.all<any>(
      `SELECT * FROM events ${where} ORDER BY processed_at ${order} LIMIT ?`,
      ...values,
      limit + 1
    );

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
    const db = await getDB();

    // Get session and agent config
    const session = await db.get<any>("SELECT * FROM sessions WHERE id = ?", sessionId);

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

      await db.run(
        "INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)",
        id, sessionId, evt.type, JSON.stringify(eventData), processed_at
      );

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

    // Handle user.tool_confirmation: approve or deny a pending tool call
    for (const evt of body.events ?? []) {
      if (evt.type === "user.tool_confirmation") {
        const { tool_use_id: toolUseId, result, deny_message } = evt;

        if (result === "allow") {
          // Load the tool_use event, patch evaluated_permission, save back.
          // We avoid json_replace (SQLite-only) by reading as text,
          // parsing, and writing the updated JSON as text — works for both
          // SQLite and Postgres since both store JSON as TEXT.
          //
          // The tool_use event is identified by its tool_use_id (stored in the
          // JSON data field), not by the event's own id.
          const rows = await db.all<{ id: string; data: string }>(
            "SELECT id, data FROM events WHERE session_id = ? AND type IN (?, ?) AND json_extract(data, '$.tool_use_id') = ? LIMIT 1",
            sessionId,
            "agent.tool_use",
            "agent.mcp_tool_use",
            toolUseId
          );
          const row = rows[0];
          if (row) {
            try {
              const parsed = JSON.parse(row.data);
              parsed.evaluated_permission = "allow";
              await db.run(
                "UPDATE events SET data = ? WHERE id = ?",
                JSON.stringify(parsed),
                row.id
              );
            } catch {
              // Malformed JSON in the row — skip.
            }
          }
        } else if (result === "deny") {
          // Inject a denial tool result so the model sees the denial in history
          await db.run(
            `INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)`,
            newId("evt"),
            sessionId,
            "agent.tool_result",
            JSON.stringify({
              tool_use_id: toolUseId,
              content: [{ type: "text", text: deny_message ?? "Tool execution was denied by the user." }],
              is_error: true,
            }),
            new Date().toISOString()
          );
        }
      }
    }

    if (hasUserMessage || (body.events ?? []).some((e: any) => e.type === "user.tool_confirmation")) {
      // Resolve provider
      const providerConfig = await getProviderConfig(agentSnapshot.model_provider_id);
      if (providerConfig) {
        const provider = createProvider(providerConfig);
        const agentConfig = {
          name: agentSnapshot.name,
          system: agentSnapshot.system,
          model: agentSnapshot.model?.id ?? "claude-sonnet-4-6",
          tools: agentSnapshot.tools ?? [],
          mcp_servers: agentSnapshot.mcp_servers ?? [],
          skills: agentSnapshot.skills ?? [],
          vault_ids: JSON.parse(session.vault_ids ?? "[]"),
        };

        // Resolve the caller's org so the engine can look up stored
        // MCP credentials scoped to that org.
        const user = await currentUser(c);
        const organizationId = user?.organization_id ?? "org_default";

        // Run agent loop asynchronously (don't block response)
        const emitter = {
          emit(event: any) {
            notifyStreamListeners(sessionId, event);
          },
          close() {},
        };

        runAgentLoop(
          sessionId,
          agentConfig,
          provider,
          emitter,
          20,
          organizationId,
        ).catch((err) => {
          console.error(`Agent loop failed for session ${sessionId}:`, err);
        });
      }
    }

    return c.json({ data: storedEvents }, 200);
  });

  app.openapi(streamEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");

    const encoder = new TextEncoder();
    // Load existing events before building the stream so we can use async I/O.
    const db = await getDB();
    const existingRows = await db.all<any>(
      "SELECT * FROM events WHERE session_id = ? ORDER BY processed_at ASC",
      sessionId
    );

    const stream = new ReadableStream({
      start(controller) {
        for (const row of existingRows) {
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
