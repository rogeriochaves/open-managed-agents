/**
 * Unit test for the Postgres SQL translator.
 *
 * Our routes are written with `?` placeholders because they target
 * SQLite first; the postgres adapter rewrites them to `$1..$N`
 * on the fly. That rewrite is the highest-risk pure function in
 * the whole DB layer — if it ever mishandles a quoted literal the
 * entire postgres path silently corrupts queries.
 *
 * This test runs translateSql() directly — no live postgres needed.
 */

import { describe, it, expect } from "vitest";
import { translateSql } from "../db/postgres.js";

describe("Postgres translateSql", () => {
  it("passes through SQL with no placeholders", () => {
    expect(translateSql("SELECT 1")).toBe("SELECT 1");
  });

  it("replaces a single ? with $1", () => {
    expect(translateSql("SELECT * FROM users WHERE id = ?")).toBe(
      "SELECT * FROM users WHERE id = $1"
    );
  });

  it("numbers placeholders sequentially", () => {
    expect(
      translateSql(
        "UPDATE agents SET name = ?, description = ?, updated_at = ? WHERE id = ?"
      )
    ).toBe(
      "UPDATE agents SET name = $1, description = $2, updated_at = $3 WHERE id = $4"
    );
  });

  it("leaves ? alone inside single-quoted string literals", () => {
    expect(
      translateSql(
        "INSERT INTO logs (message) VALUES ('what??') RETURNING id"
      )
    ).toBe("INSERT INTO logs (message) VALUES ('what??') RETURNING id");
  });

  it("leaves ? alone inside double-quoted identifiers", () => {
    // Not legal SQL but translator should still preserve it
    expect(translateSql('SELECT "col?name" FROM t WHERE x = ?')).toBe(
      'SELECT "col?name" FROM t WHERE x = $1'
    );
  });

  it("mixes placeholders with a ?-containing literal correctly", () => {
    // Placeholder, literal with ?, placeholder
    const input =
      "SELECT * FROM messages WHERE author = ? AND text LIKE '%?%' AND id > ?";
    const output =
      "SELECT * FROM messages WHERE author = $1 AND text LIKE '%?%' AND id > $2";
    expect(translateSql(input)).toBe(output);
  });

  it("handles multiple string literals in one statement", () => {
    const input =
      "SELECT 'a??b', 'c?d', ? FROM dual WHERE x = ? AND y = 'z??z'";
    const output =
      "SELECT 'a??b', 'c?d', $1 FROM dual WHERE x = $2 AND y = 'z??z'";
    expect(translateSql(input)).toBe(output);
  });

  it("handles the real INSERT shape used by the agents route", () => {
    const input =
      "INSERT INTO agents (id, name, description, system, model_id, tools, mcp_servers, skills, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const output =
      "INSERT INTO agents (id, name, description, system, model_id, tools, mcp_servers, skills, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)";
    expect(translateSql(input)).toBe(output);
  });

  it("numbers correctly past 9 (two-digit placeholders)", () => {
    const input =
      "SELECT ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ?";
    const output =
      "SELECT $1 , $2 , $3 , $4 , $5 , $6 , $7 , $8 , $9 , $10 , $11 , $12 , $13";
    expect(translateSql(input)).toBe(output);
  });

  it("handles an empty string input", () => {
    expect(translateSql("")).toBe("");
  });
});
