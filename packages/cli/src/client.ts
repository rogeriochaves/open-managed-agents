/**
 * CLI HTTP client.
 *
 * We use the Anthropic SDK's wire protocol as-is (our server exposes
 * the same /v1/* routes), but point its baseURL at the self-hosted
 * Open Managed Agents server rather than api.anthropic.com.
 *
 * Config, in order of precedence:
 *   OMA_API_BASE   — full URL to the OMA server (default http://localhost:3001)
 *   OMA_API_KEY    — optional bearer / x-api-key for the OMA server
 *   ANTHROPIC_API_KEY — fallback if OMA_API_KEY is not set (the SDK
 *                       requires *some* api_key string, even if the
 *                       server does not actually validate it).
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getApiBase(): string {
  return (
    process.env.OMA_API_BASE ??
    process.env.OPEN_MANAGED_AGENTS_API_BASE ??
    "http://localhost:3001"
  );
}

export function getClient(): Anthropic {
  if (!client) {
    const apiKey =
      process.env.OMA_API_KEY ??
      process.env.ANTHROPIC_API_KEY ??
      // The SDK requires a non-empty string but our self-hosted
      // server does not necessarily validate it.
      "oma-local";

    client = new Anthropic({
      apiKey,
      baseURL: getApiBase(),
    });
  }
  return client;
}
