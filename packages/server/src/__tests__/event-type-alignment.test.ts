/**
 * Meta-lint: every event type the server emits must match a
 * declared member of the SessionEvent union.
 *
 * Last iteration caught `session.stopped` — an event type the
 * engine emitted on the cooperative-cancellation branch but
 * that wasn't in packages/types/src/events.ts. The client's
 * EVENT_BADGES map had no entry for it, so a user-cancelled
 * session fell through to the default grey badge.
 *
 * Same class of silent drift the schema ↔ handler alignment
 * lint (`schema-handler-alignment.test.ts`) closes — a wire
 * that looks right if you only check one side. This test
 * closes the event side: every `storeEvent(sessionId, "<type>",
 * …)` literal in the server source, plus every `INSERT INTO
 * events (…, "<type>", …)` literal in the route handlers,
 * must match a `type: "<name>"` declaration inside
 * packages/types/src/events.ts.
 *
 * It does NOT try to validate dynamic `evt.type` values — those
 * come from the /v1/sessions/:id/events API and are already
 * zod-validated against the declared union at the request
 * boundary. Only literal strings in .ts code are in scope.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const TYPES_EVENTS_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "types",
  "src",
  "events.ts",
);
const SERVER_SRC_DIR = join(__dirname, "..");

/**
 * Extract every `type: "foo.bar"` literal from packages/types/
 * src/events.ts. That's how each concrete SessionEvent interface
 * declares its discriminator (see AgentMessageEvent → type:
 * "agent.message", SessionStatusTerminatedEvent → type:
 * "session.status_terminated", etc.).
 *
 * We ignore the generic `type?: string` kind — we want the
 * string literals that narrow the union.
 */
function extractDeclaredTypes(): Set<string> {
  const src = readFileSync(TYPES_EVENTS_PATH, "utf-8");
  const declared = new Set<string>();
  // Match `type: "word.word"` or `type: "word.word_word"` —
  // scoped to prefixes the engine/routes actually emit
  // (session|agent|user|span).
  const re =
    /\btype:\s*"((?:session|agent|user|span)\.[a-z_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    declared.add(m[1]!);
  }
  return declared;
}

interface EmittedType {
  type: string;
  file: string;
  line: number;
}

/**
 * Walk every .ts file under packages/server/src (excluding
 * __tests__) and collect the literal event-type strings
 * passed to storeEvent(sessionId, "<type>", …) and to INSERT
 * INTO events (…, '<type>', …).
 */
function collectEmittedTypes(dir: string): EmittedType[] {
  const results: EmittedType[] = [];
  walk(dir, (file) => {
    if (file.endsWith(".ts") && !file.includes("__tests__")) {
      const src = readFileSync(file, "utf-8");
      // storeEvent(sessionId, "…", { ... }) — inline
      // storeEvent(\n  sessionId,\n  "…",\n  { ... }) — multiline
      // Both forms end with a quoted string literal as the 2nd
      // positional arg before the closing `,`.
      const storeEventRe =
        /storeEvent\(\s*[^,]+,\s*"((?:session|agent|user|span)\.[a-z_]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = storeEventRe.exec(src)) !== null) {
        results.push({
          type: m[1]!,
          file: file.replace(SERVER_SRC_DIR + "/", ""),
          line: lineOf(src, m.index),
        });
      }
      // Routes sometimes INSERT directly via SQL rather than
      // going through storeEvent. Match positional `"<type>"`
      // strings inside an INSERT-INTO-events block.
      const insertRe =
        /INSERT INTO events[^;]*?\n[\s\S]*?"((?:session|agent|user|span)\.[a-z_]+)"/g;
      while ((m = insertRe.exec(src)) !== null) {
        results.push({
          type: m[1]!,
          file: file.replace(SERVER_SRC_DIR + "/", ""),
          line: lineOf(src, m.index),
        });
      }
    }
  });
  return results;
}

function walk(dir: string, fn: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, fn);
    else fn(full);
  }
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

describe("Event type alignment (storeEvent ↔ SessionEvent union)", () => {
  const declared = extractDeclaredTypes();
  const emitted = collectEmittedTypes(SERVER_SRC_DIR);

  it("extracts a non-empty set of declared types", () => {
    // Sanity check — if our regex misses, the lint is silently
    // useless. The current union has >= 15 concrete types.
    expect(declared.size).toBeGreaterThanOrEqual(15);
    // Spot-check a few that we know are there.
    expect(declared.has("agent.message")).toBe(true);
    expect(declared.has("session.status_terminated")).toBe(true);
    expect(declared.has("session.error")).toBe(true);
  });

  it("finds at least one emit site per engine status event", () => {
    // Sanity check the collector: the engine definitely emits
    // these, so if the regex misses we'd silently accept anything.
    const emittedTypes = new Set(emitted.map((e) => e.type));
    expect(emittedTypes.has("session.status_running")).toBe(true);
    expect(emittedTypes.has("session.status_idle")).toBe(true);
    expect(emittedTypes.has("session.status_terminated")).toBe(true);
    expect(emittedTypes.has("session.error")).toBe(true);
    expect(emittedTypes.has("agent.message")).toBe(true);
  });

  it("every emitted event type is declared on the SessionEvent union", () => {
    const undeclared = emitted.filter((e) => !declared.has(e.type));
    if (undeclared.length > 0) {
      const lines = undeclared
        .map((u) => `  - ${u.file}:${u.line} emits "${u.type}"`)
        .join("\n");
      throw new Error(
        `Found event types that are emitted by the server but not declared in packages/types/src/events.ts:\n${lines}\n\n` +
          `This is the class of drift caught in 75367ed — the engine emitted "session.stopped" but the SessionEvent union never listed it, so the client's EVENT_BADGES map fell through to the default grey badge. ` +
          `Either add the new type to the union in packages/types/src/events.ts (and expose it through the web client's EVENT_BADGES map), or change the emit site to use a declared type.`,
      );
    }
  });

  it("does NOT regress on the session.stopped bug specifically", () => {
    // Anchor test — a direct assertion that the exact type
    // name from 75367ed can't silently come back, even if
    // someone renames something else on the union and the
    // structural test above passes by coincidence.
    const stoppedEmits = emitted.filter((e) => e.type === "session.stopped");
    expect(
      stoppedEmits,
      `storeEvent(..., "session.stopped") is back — see 75367ed for why this was removed`,
    ).toEqual([]);
  });
});
