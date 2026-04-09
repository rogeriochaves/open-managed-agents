import { Command } from "commander";
import { getClient } from "../client.js";
import { output, formatDate, truncate } from "../output.js";

export function agentsCommand(): Command {
  const cmd = new Command("agents").description("Manage agents");

  cmd
    .command("create")
    .description("Create an agent")
    .requiredOption("--name <name>", "Agent name")
    .requiredOption("--model <model>", "Model ID (e.g. claude-sonnet-4-6)")
    .option("--system <prompt>", "System prompt")
    .option("--description <desc>", "Agent description")
    .option("--json <json>", "Full JSON body (overrides other flags)")
    .action(async (opts) => {
      const client = getClient();
      const body = opts.json
        ? JSON.parse(opts.json)
        : {
            name: opts.name,
            model: opts.model,
            ...(opts.system && { system: opts.system }),
            ...(opts.description && { description: opts.description }),
          };
      const result = await client.beta.agents.create(body);
      output(result, (r) => ({
        headers: ["ID", "Name", "Model", "Version"],
        rows: [[r.id, r.name, r.model.id, String(r.version)]],
      }));
    });

  cmd
    .command("list")
    .description("List agents")
    .option("--limit <n>", "Max results", "20")
    .option("--include-archived", "Include archived agents")
    .action(async (opts) => {
      const client = getClient();
      const params: Record<string, unknown> = {
        limit: Number(opts.limit),
      };
      if (opts.includeArchived) params.include_archived = true;
      const page = await client.beta.agents.list(params as any);
      const agents = (page as any).data ?? [];
      output(agents, (items: any[]) => ({
        headers: ["ID", "Name", "Model", "Version", "Status", "Created"],
        rows: items.map((a) => [
          a.id,
          truncate(a.name, 30),
          a.model.id,
          String(a.version),
          a.archived_at ? "archived" : "active",
          formatDate(a.created_at),
        ]),
      }));
    });

  cmd
    .command("get <agentId>")
    .description("Retrieve an agent")
    .option("--version <n>", "Specific version")
    .action(async (agentId: string, opts) => {
      const client = getClient();
      const params = opts.version ? { version: Number(opts.version) } : {};
      const result = await client.beta.agents.retrieve(agentId, params);
      output(result, (r) => ({
        headers: ["ID", "Name", "Model", "Version", "Created"],
        rows: [[r.id, r.name, r.model.id, String(r.version), formatDate(r.created_at)]],
      }));
    });

  cmd
    .command("update <agentId>")
    .description("Update an agent")
    .requiredOption("--version <n>", "Current version (for concurrency)")
    .option("--name <name>", "New name")
    .option("--system <prompt>", "New system prompt")
    .option("--description <desc>", "New description")
    .action(async (agentId: string, opts) => {
      const client = getClient();
      const body: Record<string, unknown> = {
        version: Number(opts.version),
      };
      if (opts.name) body.name = opts.name;
      if (opts.system) body.system = opts.system;
      if (opts.description) body.description = opts.description;
      const result = await client.beta.agents.update(agentId, body as any);
      output(result, (r) => ({
        headers: ["ID", "Name", "Version"],
        rows: [[r.id, r.name, String(r.version)]],
      }));
    });

  cmd
    .command("archive <agentId>")
    .description("Archive an agent")
    .action(async (agentId: string) => {
      const client = getClient();
      const result = await client.beta.agents.archive(agentId);
      console.log(`Archived agent ${result.id}`);
    });

  return cmd;
}
