import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { SessionIdParamSchema } from "../schemas/sessions.js";
import {
  SessionEventSchema,
  EventSendBodySchema,
  EventListQuerySchema,
  SendSessionEventsResponseSchema,
} from "../schemas/events.js";

const tags = ["Events"];

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

// ── Register routes ─────────────────────────────────────────────────────────

export function registerEventRoutes(app: OpenAPIHono) {
  app.openapi(listEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const query = c.req.valid("query");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.events.list(sessionId, query);
    return c.json(result as any, 200);
  });

  app.openapi(sendEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.events.send(sessionId, body);
    return c.json(result as any, 200);
  });

  app.openapi(streamEventsRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;

    const stream = await client.beta.sessions.events.stream(sessionId);

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of stream) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    ) as any;
  });
}
