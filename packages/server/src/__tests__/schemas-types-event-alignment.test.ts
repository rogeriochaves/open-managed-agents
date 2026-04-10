/**
 * Meta-lint: server zod event schemas ↔ types package interfaces.
 *
 * Fourth lint in the boundary-drift series. The server's
 * packages/server/src/schemas/events.ts uses z.literal("agent.
 * message"), z.literal("session.status_terminated"), etc. to
 * validate incoming event payloads and to tag stored rows. The
 * types package at packages/types/src/events.ts declares the
 * same strings as discriminator literals on concrete interfaces
 * that the web + CLI consume via @open-managed-agents/types.
 *
 * Nothing crosschecks the two. If someone adds a new event type
 * to the zod schemas but forgets the TS interface (or vice
 * versa), the client types will miss the new event OR zod will
 * reject a payload the client considers valid. Same class of
 * silent drift 75367ed caught on the runtime side.
 *
 * Strategy: read both files as raw text, extract the declared
 * type strings via regex, assert the two sets are equal, and
 * report the symmetric diff on failure so reviewers can see
 * which side is missing which type.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SERVER_SCHEMAS_PATH = join(
  __dirname,
  "..",
  "schemas",
  "events.ts",
);
const TYPES_EVENTS_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "types",
  "src",
  "events.ts",
);

function extractServerZodLiterals(): Set<string> {
  const src = readFileSync(SERVER_SCHEMAS_PATH, "utf-8");
  const set = new Set<string>();
  const re =
    /z\.literal\("((?:session|agent|user|span)\.[a-z_]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    set.add(m[1]!);
  }
  return set;
}

function extractTypesInterfaceLiterals(): Set<string> {
  const src = readFileSync(TYPES_EVENTS_PATH, "utf-8");
  const set = new Set<string>();
  const re =
    /\btype:\s*"((?:session|agent|user|span)\.[a-z_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    set.add(m[1]!);
  }
  return set;
}

describe("Server zod event schemas ↔ types package interface literals", () => {
  const server = extractServerZodLiterals();
  const types = extractTypesInterfaceLiterals();

  it("extracts non-empty sets from both sides", () => {
    // Sanity check — a broken regex on either side would make
    // the equality check vacuously pass with two empty sets.
    expect(server.size).toBeGreaterThanOrEqual(15);
    expect(types.size).toBeGreaterThanOrEqual(15);
    expect(server.has("agent.message")).toBe(true);
    expect(types.has("agent.message")).toBe(true);
    expect(server.has("session.status_terminated")).toBe(true);
    expect(types.has("session.status_terminated")).toBe(true);
  });

  it("the two sets are identical — no drift", () => {
    // Events the server validates but the types package doesn't
    // declare. A client receiving one of these would see an
    // unrecognized type literal that doesn't narrow the union.
    const missingFromTypes = [...server].filter((t) => !types.has(t));
    // Events the types package declares but the server doesn't
    // validate. A client sending one of these would get rejected
    // at the zod boundary despite TypeScript believing it's valid.
    const missingFromServer = [...types].filter((t) => !server.has(t));

    if (missingFromTypes.length > 0 || missingFromServer.length > 0) {
      const lines: string[] = [];
      if (missingFromTypes.length > 0) {
        lines.push(
          `\nDeclared as z.literal() in packages/server/src/schemas/events.ts but MISSING from the types package at packages/types/src/events.ts:`,
        );
        for (const t of missingFromTypes) lines.push(`  - "${t}"`);
      }
      if (missingFromServer.length > 0) {
        lines.push(
          `\nDeclared on a SessionEvent interface in packages/types/src/events.ts but MISSING from the server zod schemas at packages/server/src/schemas/events.ts:`,
        );
        for (const t of missingFromServer) lines.push(`  - "${t}"`);
      }
      throw new Error(
        `Server zod event schemas and the types package interfaces have drifted.${lines.join("\n")}\n\n` +
          `Fourth lint in the boundary-drift series (3266289, fbb287e, dcf3509). Add the missing declaration to whichever side is behind so the server's runtime validation and the client's compile-time types agree.`,
      );
    }

    // Also assert the equality directly so vitest produces a
    // diff when the sets differ — the error above covers the
    // reporting, this covers the default test output.
    expect([...server].sort()).toEqual([...types].sort());
  });
});
