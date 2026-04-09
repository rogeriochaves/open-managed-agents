import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AuthConfig {
  apiKey?: string;
  source: "env" | "dotenv" | "claude-code" | "none";
}

/**
 * Resolve authentication credentials in priority order:
 * 1. ANTHROPIC_API_KEY environment variable
 * 2. x-api-key header from the request (per-request override)
 * 3. Claude Code OAuth token (from local config)
 */
export function resolveAuth(): AuthConfig {
  // 1. Environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY, source: "env" };
  }

  // 2. Try to read Claude Code's config for OAuth token
  const claudeToken = readClaudeCodeToken();
  if (claudeToken) {
    return { apiKey: claudeToken, source: "claude-code" };
  }

  return { source: "none" };
}

/**
 * Attempt to read the Claude Code OAuth token from local config.
 *
 * Claude Code stores an encrypted token in:
 *   ~/Library/Application Support/Claude/config.json  (macOS)
 *   ~/.config/Claude/config.json  (Linux)
 *
 * The token is encrypted via keytar (macOS Keychain / libsecret).
 * If we can access it, we can use it as a bearer token for the API.
 *
 * NOTE: This reads the encrypted blob. Decrypting requires keytar native
 * module access to the system keychain, which is a future enhancement.
 * For now, this serves as the detection + documentation layer.
 */
function readClaudeCodeToken(): string | null {
  try {
    const platform = process.platform;
    let configPath: string;

    if (platform === "darwin") {
      configPath = join(
        homedir(),
        "Library",
        "Application Support",
        "Claude",
        "config.json"
      );
    } else if (platform === "linux") {
      configPath = join(homedir(), ".config", "Claude", "config.json");
    } else {
      configPath = join(homedir(), "AppData", "Roaming", "Claude", "config.json");
    }

    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const tokenCache = config["oauth:tokenCache"];

    if (!tokenCache || typeof tokenCache !== "string") {
      return null;
    }

    // The token is encrypted with keytar. We detect its presence
    // but can't decrypt without native keychain access.
    // Future: use keytar or security CLI to decrypt.
    //
    // For now, users should either:
    // 1. Set ANTHROPIC_API_KEY in .env
    // 2. Use `oma auth login` (future OAuth flow)
    console.log(
      "Detected Claude Code installation with cached OAuth token. " +
        "To use Claude Code auth, set ANTHROPIC_API_KEY or run `oma auth login`."
    );
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the API key to use for a request.
 * Checks request header first, then falls back to resolved auth.
 */
export function getApiKeyForRequest(
  headerKey: string | undefined,
  authConfig: AuthConfig
): string | undefined {
  return headerKey || authConfig.apiKey;
}
