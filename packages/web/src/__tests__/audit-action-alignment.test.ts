/**
 * Meta-lint: every audit log action string the server writes
 * must be handled by settings.tsx actionVariant.
 *
 * Fifth lint in the boundary-drift series. The server's route
 * handlers call auditLog(userId, "<action>", <resource>, ...)
 * on every mutation (create / update / archive / delete / stop
 * / etc.), and the Settings → Audit log tab renders each row's
 * action with a colored badge via actionVariant(). If an
 * engineer adds a new auditLog call site with a new action
 * string and forgets to update actionVariant, the new entries
 * fall through to the default grey badge — no visual styling
 * and no distinction from unknown actions.
 *
 * Same template as the earlier four lints — grep one side,
 * parse the other, compute symmetric diff, report file + line.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SERVER_ROUTES_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "server",
  "src",
  "routes",
);
const SETTINGS_PATH = join(__dirname, "..", "pages", "settings.tsx");

/**
 * Walk every .ts file under packages/server/src/routes and pull
 * the literal action strings passed to auditLog(...). The server
 * uses the pattern `auditLog(userId, "<action>", "<resource>",
 * ...)` so the 2nd positional arg is always the action.
 */
function extractServerAuditActions(): Set<string> {
  const set = new Set<string>();
  // The first positional arg is almost always `await currentUserId(c)`
  // which contains its own nested parens, so a simple `[^)]*?`
  // match stops at the first `)` of currentUserId and misses the
  // action. Pin on the pattern `"<action>", "<resource>"` where
  // the resource is one of the known audit resource types — that
  // unambiguously anchors the action arg regardless of what the
  // first arg looks like.
  const resourceTypes = [
    "agent",
    "session",
    "environment",
    "vault",
    "provider",
    "organization",
    "team",
    "project",
    "user",
    "mcp_connector",
    "credential",
    "audit_log",
  ].join("|");
  walk(SERVER_ROUTES_DIR, (file) => {
    if (!file.endsWith(".ts")) return;
    const src = readFileSync(file, "utf-8");
    const re = new RegExp(
      `auditLog\\([\\s\\S]*?,\\s*"([a-z_]+)"\\s*,\\s*"(?:${resourceTypes})"`,
      "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      set.add(m[1]!);
    }
  });
  return set;
}

function walk(dir: string, fn: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, fn);
    else fn(full);
  }
}

/**
 * Scan settings.tsx actionVariant for the action strings it
 * handles. The function is a series of `if (action === "foo")`
 * or `action === "foo" || action === "bar"` conditionals.
 */
function extractUiHandledActions(): Set<string> {
  const src = readFileSync(SETTINGS_PATH, "utf-8");
  // Anchor on the actionVariant declaration to avoid pulling in
  // unrelated string comparisons elsewhere in the file.
  const startMatch = src.match(/const actionVariant\s*=[^{]*\{/);
  if (!startMatch) {
    throw new Error("actionVariant not found in settings.tsx");
  }
  const startIdx = startMatch.index! + startMatch[0].length;
  let depth = 1;
  let end = startIdx;
  while (end < src.length && depth > 0) {
    const c = src[end]!;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    end++;
  }
  const body = src.slice(startIdx, end - 1);
  const set = new Set<string>();
  // Match action === "foo" — capture the literal
  const re = /action\s*===\s*"([a-z_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    set.add(m[1]!);
  }
  return set;
}

describe("Audit log action alignment (server writes ↔ UI actionVariant)", () => {
  const written = extractServerAuditActions();
  const handled = extractUiHandledActions();

  it("extracts a non-empty set from the server side", () => {
    // Sanity floor so a broken regex can't vacuously pass.
    expect(written.size).toBeGreaterThanOrEqual(4);
    expect(written.has("create")).toBe(true);
    expect(written.has("update")).toBe(true);
    expect(written.has("archive")).toBe(true);
  });

  it("extracts a non-empty set from settings.tsx actionVariant", () => {
    expect(handled.size).toBeGreaterThanOrEqual(4);
    expect(handled.has("create")).toBe(true);
    expect(handled.has("update")).toBe(true);
  });

  it("every server-written action is handled by actionVariant", () => {
    const missing = [...written].filter((a) => !handled.has(a));
    if (missing.length > 0) {
      throw new Error(
        `The following audit log actions are written by packages/server/src/routes/*.ts via auditLog(...) but have no matching case in settings.tsx actionVariant:\n` +
          missing.map((a) => `  - "${a}"`).join("\n") +
          `\n\nWithout an explicit case, the audit log tab renders these entries with the default grey badge — no color, no visual distinction from unknown actions. ` +
          `Fifth lint in the boundary-drift series (see 3266289, fbb287e, dcf3509, 0e2998f). ` +
          `Add the new action to the actionVariant conditional chain with an appropriate BadgeVariant (active/terminated/info/default).`,
      );
    }
  });

  it("every UI-handled action is actually written by some server auditLog call", () => {
    // Reverse check: if actionVariant has a case for an action
    // that no route emits, that's dead code / typo / leftover
    // from a removed route. Orphans accumulate silently.
    const orphans = [...handled].filter((a) => !written.has(a));
    if (orphans.length > 0) {
      throw new Error(
        `settings.tsx actionVariant handles actions that are NOT written by any auditLog(...) call in packages/server/src/routes/*.ts:\n` +
          orphans.map((a) => `  - "${a}"`).join("\n") +
          `\n\nEither remove the orphan case, or fix the typo if it's a rename from an earlier version.`,
      );
    }
  });
});
