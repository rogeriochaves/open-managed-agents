#!/usr/bin/env node
import { Command } from "commander";
import { agentsCommand } from "./commands/agents.js";
import { environmentsCommand } from "./commands/environments.js";
import { sessionsCommand } from "./commands/sessions.js";
import { vaultsCommand } from "./commands/vaults.js";
import { setOutputFormat } from "./output.js";

const program = new Command()
  .name("oma")
  .description("Open Managed Agents CLI - manage agents, sessions, environments, and vaults")
  .version("0.1.0")
  .option("--output <format>", "Output format: table or json", "table")
  .hook("preAction", (thisCommand) => {
    const format = thisCommand.opts().output;
    if (format === "json" || format === "table") {
      setOutputFormat(format);
    }
  });

program.addCommand(agentsCommand());
program.addCommand(environmentsCommand());
program.addCommand(sessionsCommand());
program.addCommand(vaultsCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
