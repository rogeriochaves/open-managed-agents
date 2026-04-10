/**
 * Meta-lint: every SessionEvent type declared in
 * packages/types/src/events.ts must have a matching entry in
 * the web's EVENT_BADGES map in session-detail.tsx.
 *
 * Third lint in the boundary-drift series after:
 *
 *   3266289 — schema ↔ handler alignment (request side)
 *   fbb287e — storeEvent ↔ SessionEvent union (server emit side)
 *
 * This closes the UI render side. Before 75367ed the engine
 * emitted `session.stopped` — a type NOT in the SessionEvent
 * union — and the UI fell through to the default grey badge
 * with the raw string "stopped" as the label. That bug was
 * about the server half. But the UI half has the same risk in
 * reverse: if someone adds a new type to the union and forgets
 * to add a matching EVENT_BADGES entry, the new type renders
 * with the default grey badge and no friendly label.
 *
 * Strategy: read packages/types/src/events.ts as raw text (same
 * as the server lint — zod/ts AST is overkill for this), extract
 * every `type: "<name>"` literal from concrete SessionEvent
 * interfaces, and assert each one is a key in the EVENT_BADGES
 * object literal in pages/session-detail.tsx.
 */

import { readFileSync } from "node:fs";
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
const SESSION_DETAIL_PATH = join(
  __dirname,
  "..",
  "pages",
  "session-detail.tsx",
);

function extractDeclaredTypes(): Set<string> {
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

function extractBadgeKeys(): Set<string> {
  const src = readFileSync(SESSION_DETAIL_PATH, "utf-8");
  // Anchor on `= {` (the start of the OBJECT LITERAL), not on
  // the first `{` after the variable name. The original anchor
  // was stealing the `{` inside the `Record<string, { label:
  // string; variant: string }>` type annotation, so `block`
  // ended up scoping the type annotation body instead of the
  // real event map.
  const startMatch = src.match(/const EVENT_BADGES\b[^=]*=\s*\{/);
  if (!startMatch) {
    throw new Error("EVENT_BADGES literal not found in session-detail.tsx");
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
  const block = src.slice(startIdx, end - 1);
  // The block is already scoped to the EVENT_BADGES object
  // literal, so any `"foo.bar":` inside is a badge key. Don't
  // anchor to line starts — trailing newline/whitespace
  // variations made the earlier regex miss span.* entries.
  const keyRegex =
    /"((?:session|agent|user|span)\.[a-z_]+)"\s*:/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = keyRegex.exec(block)) !== null) {
    set.add(m[1]!);
  }
  return set;
}

describe("EVENT_BADGES ↔ SessionEvent union alignment", () => {
  const declared = extractDeclaredTypes();
  const badges = extractBadgeKeys();

  it("extracts a non-empty set of declared types", () => {
    // Sanity check — if the regex misses, the lint is vacuously
    // passing. Pin the floor to something well below current
    // counts so it's stable across additions but catches a
    // broken extractor.
    expect(declared.size).toBeGreaterThanOrEqual(15);
    expect(declared.has("agent.message")).toBe(true);
    expect(declared.has("session.status_terminated")).toBe(true);
  });

  it("extracts a non-empty set of badge keys", () => {
    expect(badges.size).toBeGreaterThanOrEqual(15);
    expect(badges.has("agent.message")).toBe(true);
    expect(badges.has("session.status_terminated")).toBe(true);
  });

  it("every declared SessionEvent type has an EVENT_BADGES entry", () => {
    const missing = [...declared].filter((t) => !badges.has(t));
    if (missing.length > 0) {
      throw new Error(
        `The following SessionEvent types are declared in packages/types/src/events.ts ` +
          `but have no matching entry in EVENT_BADGES in session-detail.tsx:\n` +
          missing.map((t) => `  - "${t}"`).join("\n") +
          `\n\nWithout an EVENT_BADGES entry, the UI falls through to the default grey ` +
          `badge with the raw type suffix as the label. Third lint in the boundary-drift ` +
          `series (see 3266289 + fbb287e); this closes the render side. ` +
          `\n\nAdd an entry to EVENT_BADGES with a friendly label + a variant from the ` +
          `Badge component's BadgeVariant union.`,
      );
    }
  });

  it("does NOT have EVENT_BADGES entries for undeclared types", () => {
    // The reverse check: if the badges map has a key that isn't
    // in the SessionEvent union, that's dead code (or a typo —
    // e.g. "session.stoped" vs "session.stopped"). Catching
    // orphans here stops the map from accumulating leftovers
    // after a type rename.
    const orphans = [...badges].filter((k) => !declared.has(k));
    if (orphans.length > 0) {
      throw new Error(
        `EVENT_BADGES has keys that are not declared in the SessionEvent union:\n` +
          orphans.map((k) => `  - "${k}"`).join("\n") +
          `\n\nEither remove the orphan entry, or fix the typo. Orphans accumulate ` +
          `silently when a type gets renamed on the server side and nobody updates the ` +
          `EVENT_BADGES keys to match.`,
      );
    }
  });
});
