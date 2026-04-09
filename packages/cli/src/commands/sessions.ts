import { Command } from "commander";
import { getClient } from "../client.js";
import { output, formatDate, truncate } from "../output.js";

export function sessionsCommand(): Command {
  const cmd = new Command("sessions").description("Manage sessions");

  cmd
    .command("create")
    .description("Create a session")
    .requiredOption("--agent <agentId>", "Agent ID")
    .requiredOption("--environment <envId>", "Environment ID")
    .option("--title <title>", "Session title")
    .action(async (opts) => {
      const client = getClient();
      const body: Record<string, unknown> = {
        agent: opts.agent,
        environment_id: opts.environment,
      };
      if (opts.title) body.title = opts.title;
      const result = await client.beta.sessions.create(body as any);
      output(result, (r) => ({
        headers: ["ID", "Status", "Agent", "Created"],
        rows: [
          [r.id, r.status, r.agent.id, formatDate(r.created_at)],
        ],
      }));
    });

  cmd
    .command("list")
    .description("List sessions")
    .option("--limit <n>", "Max results", "20")
    .option("--agent-id <id>", "Filter by agent ID")
    .option("--order <dir>", "Sort: asc or desc", "desc")
    .option("--include-archived", "Include archived")
    .action(async (opts) => {
      const client = getClient();
      const params: Record<string, unknown> = {
        limit: Number(opts.limit),
        order: opts.order,
      };
      if (opts.agentId) params.agent_id = opts.agentId;
      if (opts.includeArchived) params.include_archived = true;
      const page = await client.beta.sessions.list(params as any);
      const items = (page as any).data ?? [];
      output(items, (sessions: any[]) => ({
        headers: ["ID", "Title", "Status", "Agent", "Created"],
        rows: sessions.map((s) => [
          s.id,
          truncate(s.title ?? "(untitled)", 25),
          s.status,
          s.agent.id,
          formatDate(s.created_at),
        ]),
      }));
    });

  cmd
    .command("get <sessionId>")
    .description("Retrieve a session")
    .action(async (sessionId: string) => {
      const client = getClient();
      const result = await client.beta.sessions.retrieve(sessionId);
      output(result, (r) => ({
        headers: ["ID", "Status", "Agent", "Input Tokens", "Output Tokens", "Active (s)"],
        rows: [
          [
            r.id,
            r.status,
            r.agent.id,
            String(r.usage.input_tokens ?? 0),
            String(r.usage.output_tokens ?? 0),
            String(r.stats.active_seconds ?? 0),
          ],
        ],
      }));
    });

  cmd
    .command("delete <sessionId>")
    .description("Delete a session")
    .action(async (sessionId: string) => {
      const client = getClient();
      const result = await client.beta.sessions.delete(sessionId);
      console.log(`Deleted session ${result.id}`);
    });

  cmd
    .command("archive <sessionId>")
    .description("Archive a session")
    .action(async (sessionId: string) => {
      const client = getClient();
      const result = await client.beta.sessions.archive(sessionId);
      console.log(`Archived session ${result.id}`);
    });

  cmd
    .command("send <sessionId> <message>")
    .description("Send a message to a session")
    .action(async (sessionId: string, message: string) => {
      const client = getClient();
      const text = message === "-" ? await readStdin() : message;
      await client.beta.sessions.events.send(sessionId, {
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text }],
          },
        ],
      });
      console.log("Message sent.");
    });

  cmd
    .command("events <sessionId>")
    .description("List events for a session")
    .option("--order <dir>", "Sort: asc or desc", "asc")
    .option("--limit <n>", "Max results", "50")
    .action(async (sessionId: string, opts) => {
      const client = getClient();
      const page = await client.beta.sessions.events.list(sessionId, {
        order: opts.order as "asc" | "desc",
        limit: Number(opts.limit),
      });
      const events = (page as any).data ?? [];
      output(events, (items: any[]) => ({
        headers: ["ID", "Type", "Time"],
        rows: items.map((e) => [
          e.id,
          e.type,
          e.processed_at ?? "",
        ]),
      }));
    });

  cmd
    .command("stream <sessionId>")
    .description("Stream events from a session (SSE)")
    .action(async (sessionId: string) => {
      const client = getClient();
      const stream = await client.beta.sessions.events.stream(sessionId);
      for await (const event of stream) {
        const e = event as any;
        const time = e.processed_at
          ? new Date(e.processed_at).toLocaleTimeString()
          : "";
        switch (e.type) {
          case "agent.message":
            for (const block of e.content ?? []) {
              if (block.type === "text") process.stdout.write(block.text);
            }
            console.log();
            break;
          case "agent.tool_use":
            console.log(`\n[Tool: ${e.name}] ${time}`);
            break;
          case "agent.tool_result":
            console.log(`[Result] ${time}`);
            break;
          case "session.status_idle":
            console.log(`\n--- Session idle (${e.stop_reason?.type}) ---`);
            break;
          case "session.status_running":
            console.log(`--- Session running ---`);
            break;
          case "session.status_terminated":
            console.log(`\n--- Session terminated ---`);
            return;
          case "session.error":
            console.error(`\n[Error] ${e.error?.message} (${e.error?.type})`);
            break;
          default:
            // Skip model spans, thinking, etc. in stream output
            break;
        }
      }
    });

  cmd
    .command("run")
    .description("Create a session and enter interactive mode")
    .requiredOption("--agent <agentId>", "Agent ID")
    .requiredOption("--environment <envId>", "Environment ID")
    .action(async (opts) => {
      const client = getClient();
      const session = await client.beta.sessions.create({
        agent: opts.agent,
        environment_id: opts.environment,
      } as any);
      console.log(`Session created: ${session.id}`);
      console.log("Type your message (Ctrl+C to exit):\n");

      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "> ",
      });

      rl.prompt();
      rl.on("line", async (line) => {
        const text = line.trim();
        if (!text) {
          rl.prompt();
          return;
        }

        await client.beta.sessions.events.send(session.id, {
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text }],
            },
          ],
        });

        const stream = await client.beta.sessions.events.stream(session.id);
        for await (const event of stream) {
          const e = event as any;
          switch (e.type) {
            case "agent.message":
              for (const block of e.content ?? []) {
                if (block.type === "text") process.stdout.write(block.text);
              }
              console.log();
              break;
            case "agent.tool_use":
              console.log(`\n[Tool: ${e.name}]`);
              break;
            case "session.status_idle":
              rl.prompt();
              break;
            case "session.status_terminated":
              console.log("\nSession terminated.");
              rl.close();
              return;
          }
        }
      });

      rl.on("close", () => {
        process.exit(0);
      });
    });

  return cmd;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}
