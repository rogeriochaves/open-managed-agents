/**
 * MCP client wrapper.
 *
 * Thin convenience layer over @modelcontextprotocol/sdk that connects
 * to a remote MCP server via the StreamableHTTPClientTransport, injects
 * a Bearer token from our mcp_connections table, and exposes two
 * operations we actually need:
 *
 *   listTools(url, token)        — returns the server's tool catalog
 *   callTool(url, token, n, i)   — executes a tool and returns its result
 *
 * A single connection is used per call: we open the transport, do the
 * operation, and close it. The MCP session overhead is tiny and this
 * keeps the code straightforward — session pooling is a later
 * optimization when we start streaming tool outputs.
 *
 * If the MCP server can't be reached or the token is rejected, we
 * throw a typed error so the calling route can surface a clean 502
 * or 401 to the user rather than leaking stack traces.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { decrypt } from "./encryption.js";
import { getDB } from "../db/index.js";

export interface MCPTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export class MCPClientError extends Error {
  public readonly status: number;
  public readonly type: string;
  constructor(message: string, status = 502, type = "mcp_error") {
    super(message);
    this.status = status;
    this.type = type;
  }
}

function buildTransport(url: string, token?: string | null): StreamableHTTPClientTransport {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
  });
}

async function withClient<T>(
  url: string,
  token: string | null,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = buildTransport(url, token);
  const client = new Client(
    { name: "open-managed-agents", version: "0.2.0" },
    { capabilities: {} },
  );
  try {
    await client.connect(transport);
    return await fn(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/401|unauth/i.test(msg)) {
      throw new MCPClientError(
        `MCP server ${url} rejected the stored credential (401)`,
        401,
        "mcp_unauthorized",
      );
    }
    throw new MCPClientError(`Failed to talk to MCP server ${url}: ${msg}`);
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore close errors */
    }
  }
}

/**
 * Load the decrypted token for a given connector in a given org,
 * or null if no credential is stored.
 */
export async function loadConnectorToken(
  organizationId: string,
  connectorId: string,
): Promise<string | null> {
  const db = await getDB();
  const row = await db.get<{ token_encrypted: string }>(
    "SELECT token_encrypted FROM mcp_connections WHERE organization_id = ? AND connector_id = ?",
    organizationId,
    connectorId,
  );
  if (!row?.token_encrypted) return null;
  try {
    return decrypt(row.token_encrypted);
  } catch {
    return null;
  }
}

/**
 * List the tool catalog exposed by an MCP server at `url`.
 * Maps the MCP response shape onto our internal `MCPTool` shape
 * (with input_schema snake_case to match the rest of the server).
 */
export async function listMCPTools(
  url: string,
  token: string | null,
): Promise<MCPTool[]> {
  return withClient(url, token, async (client) => {
    const result = await client.listTools();
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? undefined,
      input_schema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown>,
    }));
  });
}

/**
 * Execute a single tool call against an MCP server at `url`.
 */
export async function callMCPTool(
  url: string,
  token: string | null,
  name: string,
  input: Record<string, unknown>,
): Promise<MCPToolResult> {
  return withClient(url, token, async (client) => {
    const result = await client.callTool({
      name,
      arguments: input,
    });
    const content = (result.content ?? []) as Array<{
      type: string;
      text?: string;
    }>;
    return {
      content,
      is_error: result.isError === true,
    };
  });
}
