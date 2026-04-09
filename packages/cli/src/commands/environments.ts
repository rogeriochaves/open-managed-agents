import { Command } from "commander";
import { getClient } from "../client.js";
import { output, formatDate } from "../output.js";

export function environmentsCommand(): Command {
  const cmd = new Command("environments").description("Manage environments");

  cmd
    .command("create")
    .description("Create an environment")
    .requiredOption("--name <name>", "Environment name")
    .option("--description <desc>", "Description")
    .option(
      "--networking <type>",
      "Network type: unrestricted or limited",
      "unrestricted"
    )
    .option("--allowed-hosts <hosts>", "Comma-separated allowed hosts (for limited)")
    .option("--allow-mcp-servers", "Allow MCP server access (for limited)")
    .option("--allow-package-managers", "Allow package managers (for limited)")
    .option("--packages-pip <pkgs>", "Comma-separated pip packages")
    .option("--packages-npm <pkgs>", "Comma-separated npm packages")
    .option("--packages-apt <pkgs>", "Comma-separated apt packages")
    .action(async (opts) => {
      const client = getClient();
      const networking =
        opts.networking === "limited"
          ? {
              type: "limited" as const,
              allowed_hosts: opts.allowedHosts?.split(",") ?? [],
              allow_mcp_servers: !!opts.allowMcpServers,
              allow_package_managers: !!opts.allowPackageManagers,
            }
          : { type: "unrestricted" as const };

      const packages: Record<string, string[]> = {};
      if (opts.packagesPip) packages.pip = opts.packagesPip.split(",");
      if (opts.packagesNpm) packages.npm = opts.packagesNpm.split(",");
      if (opts.packagesApt) packages.apt = opts.packagesApt.split(",");

      const body: Record<string, unknown> = {
        name: opts.name,
        config: {
          type: "cloud",
          networking,
          ...(Object.keys(packages).length > 0 && { packages }),
        },
      };
      if (opts.description) body.description = opts.description;

      const result = await client.beta.environments.create(body as any);
      output(result, (r) => ({
        headers: ["ID", "Name", "Networking", "Created"],
        rows: [
          [r.id, r.name, r.config.networking.type, formatDate(r.created_at)],
        ],
      }));
    });

  cmd
    .command("list")
    .description("List environments")
    .option("--include-archived", "Include archived")
    .action(async (opts) => {
      const client = getClient();
      const params: Record<string, unknown> = {};
      if (opts.includeArchived) params.include_archived = true;
      const page = await client.beta.environments.list(params as any);
      const items = (page as any).data ?? [];
      output(items, (envs: any[]) => ({
        headers: ["ID", "Name", "Type", "Networking", "Status"],
        rows: envs.map((e) => [
          e.id,
          e.name,
          e.config.type,
          e.config.networking.type,
          e.archived_at ? "archived" : "active",
        ]),
      }));
    });

  cmd
    .command("get <environmentId>")
    .description("Retrieve an environment")
    .action(async (envId: string) => {
      const client = getClient();
      const result = await client.beta.environments.retrieve(envId);
      output(result, (r) => ({
        headers: ["ID", "Name", "Networking", "Created"],
        rows: [
          [r.id, r.name, r.config.networking.type, formatDate(r.created_at)],
        ],
      }));
    });

  cmd
    .command("update <environmentId>")
    .description("Update an environment")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .action(async (envId: string, opts) => {
      const client = getClient();
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      const result = await client.beta.environments.update(envId, body as any);
      console.log(`Updated environment ${result.id}`);
    });

  cmd
    .command("delete <environmentId>")
    .description("Delete an environment")
    .action(async (envId: string) => {
      const client = getClient();
      const result = await client.beta.environments.delete(envId);
      console.log(`Deleted environment ${result.id}`);
    });

  cmd
    .command("archive <environmentId>")
    .description("Archive an environment")
    .action(async (envId: string) => {
      const client = getClient();
      const result = await client.beta.environments.archive(envId);
      console.log(`Archived environment ${result.id}`);
    });

  return cmd;
}
