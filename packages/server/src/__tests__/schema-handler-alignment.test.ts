/**
 * Meta-lint: every field declared on a Body/Query zod schema must
 * be referenced by the handler that accepts it.
 *
 * Three iterations in a row caught silent-no-op bugs where the
 * zod schema advertised a field the handler never read:
 *
 *   51465dd — after_id on every list route
 *   8382006 — created_at[gte|lte|gt|lt] on agents+sessions lists
 *   d41cd67 — display_name + metadata on vault update
 *                 metadata on environment update
 *
 * All three shared the same shape: zod happily validates the
 * request, the handler ignores the field, the 200 response looks
 * normal, and the caller has no way to notice the write was a
 * no-op. This test closes the class going forward.
 *
 * It reads each schemas/*.ts file as text, extracts the field
 * names from Body/Query schema blocks via regex, then reads the
 * corresponding routes/*.ts file and asserts every field name is
 * referenced in the handler body at least once. It does NOT try
 * to be clever — a substring search for `body.<field>` or
 * `query.<field>` (or the bracket-quoted form for keys with
 * special characters) is the whole check.
 *
 * Intentional exceptions are allowed via an allowlist keyed on
 * `<Schema>.<field>` with a required reason. Adding an entry
 * forces a reviewer to justify why the field exists on the
 * schema without being wired — e.g. agent_version requires a
 * DbAdapter.jsonPathEquals helper before it can be plumbed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Repo-root relative to this test file: packages/server/src/__tests__/
const SCHEMAS_DIR = join(__dirname, "..", "schemas");
const ROUTES_DIR = join(__dirname, "..", "routes");

interface SchemaRef {
  schemaFile: string; // e.g. "agents.ts"
  schemaName: string; // e.g. "AgentUpdateBodySchema"
  kind: "body" | "query"; // which side of the handler the fields land on
  routeFile: string; // e.g. "agents.ts"
  fields: string[];
}

// Exceptions: fields declared on a schema that are intentionally
// NOT wired in the handler, with the reason. Keyed on
// `<SchemaName>.<fieldName>`. Any new entry here is a conscious
// decision recorded in review.
const ALLOWED_UNWIRED = new Map<string, string>([
  [
    "SessionListQuerySchema.agent_version",
    "Requires DbAdapter.jsonPathEquals for dialect-portable JSON queries. Raw json_extract is sqlite-only and would break the postgres-smoke CI job.",
  ],
]);

// Shared helpers: if the handler imports/calls one of these, the
// listed fields are considered wired. This covers the legitimate
// case where a handler delegates a bundle of related query params
// to a helper in lib/pagination.ts (or similar) instead of inlining
// the WHERE-building logic per route.
const HELPER_WIRING: Array<{
  marker: string; // substring to match in the handler body
  fields: string[]; // fields considered wired if marker is present
}> = [
  {
    marker: "buildCreatedAtClauses(query)",
    fields: [
      "created_at[gt]",
      "created_at[gte]",
      "created_at[lt]",
      "created_at[lte]",
    ],
  },
];

// Schemas we know are Body inputs to a mutating handler
const BODY_SCHEMAS: Array<{ file: string; name: string }> = [
  { file: "agents.ts", name: "AgentCreateBodySchema" },
  { file: "agents.ts", name: "AgentUpdateBodySchema" },
  { file: "sessions.ts", name: "SessionCreateBodySchema" },
  { file: "sessions.ts", name: "SessionUpdateBodySchema" },
  { file: "environments.ts", name: "EnvironmentCreateBodySchema" },
  { file: "environments.ts", name: "EnvironmentUpdateBodySchema" },
  { file: "vaults.ts", name: "VaultCreateBodySchema" },
  { file: "vaults.ts", name: "VaultUpdateBodySchema" },
];

// Query schemas that the list handlers read
const QUERY_SCHEMAS: Array<{ file: string; name: string }> = [
  { file: "agents.ts", name: "AgentListQuerySchema" },
  { file: "sessions.ts", name: "SessionListQuerySchema" },
  { file: "environments.ts", name: "EnvironmentListQuerySchema" },
  { file: "vaults.ts", name: "VaultListQuerySchema" },
];

/**
 * Extract the zod object keys from a schema block.
 *
 * Handles both
 *   z.object({ field1: ..., "quoted-field": ... })
 *   PageCursorQuerySchema.extend({ ... })
 *
 * And ignores fields inherited from the extended schema —
 * PageCursorQuerySchema's after_id / before_id / limit are
 * checked separately against every list handler via the
 * after_id clause test (pagination.test.ts).
 */
function extractSchemaFields(source: string, schemaName: string): string[] {
  // Grab the block between `${schemaName} = ... ({` and the matching `})`
  const startRegex = new RegExp(
    `export const ${schemaName}\\s*=\\s*[^{]*\\{`,
  );
  const startMatch = source.match(startRegex);
  if (!startMatch) {
    throw new Error(`Schema ${schemaName} not found in source`);
  }
  const startIdx = startMatch.index! + startMatch[0].length;

  // Walk forward counting brace depth so nested z.object({...})
  // inside a field's definition doesn't trip the scanner.
  let depth = 1;
  let endIdx = startIdx;
  while (endIdx < source.length && depth > 0) {
    const ch = source[endIdx]!;
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    endIdx++;
  }
  const block = source.slice(startIdx, endIdx - 1);

  // Pull top-level keys. A key is either:
  //   foo: ...
  //   "foo[bar]": ...
  // at the START of a line (after indentation), and followed by :.
  // Nested keys inside z.object({...}) are at deeper indentation.
  // We use a simple rule: the key must be at indent level 2 (matching
  // the file's convention of two-space indentation) OR directly
  // after a newline.
  const fields: string[] = [];
  const keyRegex = /^\s{2}(?:"([^"]+)"|(\w+)):/gm;
  let m: RegExpExecArray | null;
  while ((m = keyRegex.exec(block)) !== null) {
    fields.push(m[1] ?? m[2]!);
  }
  return fields;
}

/**
 * Given a field name, return the possible token forms the
 * handler might use to reference it. Plain identifiers can be
 * written as `.field` or `["field"]`; bracket-key fields like
 * `created_at[gte]` must use the bracket form.
 */
function fieldReferenceForms(field: string): string[] {
  if (/^\w+$/.test(field)) {
    return [`.${field}`, `["${field}"]`, `['${field}']`];
  }
  return [`["${field}"]`, `['${field}']`];
}

function checkFieldsReferenced(
  routeSource: string,
  schemaName: string,
  kind: "body" | "query",
  fields: string[],
): string[] {
  // Fields wired via a shared helper (if any helper marker is
  // present in this handler, add its fields to the "wired" set)
  const helperWired = new Set<string>();
  for (const { marker, fields: helperFields } of HELPER_WIRING) {
    if (routeSource.includes(marker)) {
      for (const f of helperFields) helperWired.add(f);
    }
  }

  const unreferenced: string[] = [];
  for (const field of fields) {
    const allowKey = `${schemaName}.${field}`;
    if (ALLOWED_UNWIRED.has(allowKey)) continue;
    if (helperWired.has(field)) continue;

    const forms = fieldReferenceForms(field);
    const prefix = kind === "body" ? "body" : "query";
    const found = forms.some(
      (f) =>
        routeSource.includes(`${prefix}${f}`) ||
        // `const { field } = body` is also a valid reference
        routeSource.includes(`{ ${field} }`) ||
        routeSource.includes(`{ ${field},`) ||
        routeSource.includes(`, ${field} }`) ||
        routeSource.includes(`, ${field},`),
    );
    if (!found) unreferenced.push(field);
  }
  return unreferenced;
}

/**
 * Strip TypeScript line and block comments from a source file.
 *
 * Without this, comments like
 *   // VaultUpdateBodySchema declares { display_name, metadata }
 * would count as a real reference to display_name and mask a
 * genuine silent-no-op bug. A round-trip comment stripper that
 * handles strings+regex accurately is overkill — we use a loose
 * but safe replace that keeps strings intact by not tokenizing
 * anything between matched quote pairs.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const c2 = src[i + 1]!;
    // Single-line string
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          out += src[i]! + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i]!;
        i++;
      }
      if (i < src.length) {
        out += src[i]!;
        i++;
      }
      continue;
    }
    // Block comment
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    // Line comment
    if (c === "/" && c2 === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function loadPair(
  schemaFile: string,
  schemaName: string,
): { schemaSrc: string; routeSrc: string } {
  const schemaSrc = readFileSync(join(SCHEMAS_DIR, schemaFile), "utf-8");
  // Strip comments from the route source — comments often mention
  // the field names in prose ("VaultUpdateBodySchema declares
  // { display_name, metadata }"), which would mask a real bug if
  // the handler body drifts away from the schema.
  const routeSrc = stripComments(
    readFileSync(join(ROUTES_DIR, schemaFile), "utf-8"),
  );
  return { schemaSrc, routeSrc };
}

describe("Schema ↔ handler field alignment (silent no-op regression guard)", () => {
  it.each(BODY_SCHEMAS)(
    "every field on $name is referenced by body.<field> in the handler",
    ({ file, name }) => {
      const { schemaSrc, routeSrc } = loadPair(file, name);
      const fields = extractSchemaFields(schemaSrc, name);
      // Every update/create schema must declare at least one field
      // or our parser is broken.
      expect(fields.length, `${name} parsed zero fields`).toBeGreaterThan(0);

      const unreferenced = checkFieldsReferenced(
        routeSrc,
        name,
        "body",
        fields,
      );
      if (unreferenced.length > 0) {
        throw new Error(
          `${name} declares field(s) ${JSON.stringify(unreferenced)} that are not referenced in routes/${file}. ` +
            `This is the silent-no-op class caught in 51465dd/8382006/d41cd67 — the handler accepts the field but never writes it. ` +
            `Either wire the field in the handler, or add an entry to ALLOWED_UNWIRED with a reason.`,
        );
      }
    },
  );

  it.each(QUERY_SCHEMAS)(
    "every field on $name is referenced by query.<field> in the handler",
    ({ file, name }) => {
      const { schemaSrc, routeSrc } = loadPair(file, name);
      const fields = extractSchemaFields(schemaSrc, name);
      expect(fields.length, `${name} parsed zero fields`).toBeGreaterThan(0);

      const unreferenced = checkFieldsReferenced(
        routeSrc,
        name,
        "query",
        fields,
      );
      if (unreferenced.length > 0) {
        throw new Error(
          `${name} declares field(s) ${JSON.stringify(unreferenced)} that are not referenced in routes/${file}. ` +
            `This is the silent-no-op class caught in 51465dd/8382006/d41cd67. ` +
            `Either wire the field in the handler, or add an entry to ALLOWED_UNWIRED with a reason.`,
        );
      }
    },
  );

  it("ALLOWED_UNWIRED entries all carry a non-empty reason", () => {
    for (const [key, reason] of ALLOWED_UNWIRED) {
      expect(
        reason.trim().length,
        `${key} has an empty reason — explain why this field is not wired`,
      ).toBeGreaterThan(20);
    }
  });

  it("ALLOWED_UNWIRED entries point at real schema fields", () => {
    // Guard against the allowlist drifting — if someone renames a
    // schema field, the exception should be removed or updated,
    // not silently forgotten.
    for (const key of ALLOWED_UNWIRED.keys()) {
      const [schemaName, fieldName] = key.split(".");
      expect(schemaName, `bad ALLOWED_UNWIRED key: ${key}`).toBeTruthy();
      expect(fieldName, `bad ALLOWED_UNWIRED key: ${key}`).toBeTruthy();

      const schemaEntry = [...BODY_SCHEMAS, ...QUERY_SCHEMAS].find(
        (s) => s.name === schemaName,
      );
      expect(
        schemaEntry,
        `ALLOWED_UNWIRED references unknown schema ${schemaName}`,
      ).toBeDefined();

      const src = readFileSync(
        join(SCHEMAS_DIR, schemaEntry!.file),
        "utf-8",
      );
      const fields = extractSchemaFields(src, schemaName!);
      expect(
        fields.includes(fieldName!),
        `ALLOWED_UNWIRED has ${key} but ${fieldName} no longer exists on ${schemaName}`,
      ).toBe(true);
    }
  });
});
