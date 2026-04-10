/**
 * LLM Provider abstraction layer.
 *
 * Unified interface for calling different LLM providers using the Vercel
 * AI SDK under the hood. Supports Anthropic, OpenAI, Google (Gemini),
 * Mistral, Groq, and any OpenAI-compatible endpoint (Ollama, LM Studio,
 * OpenRouter, Together, vLLM, etc.) — all with the same agent loop.
 *
 * The public `LLMProvider` interface is stable; swapping the underlying
 * SDK is an internal concern. The engine calls `provider.chat(...)` and
 * gets back a uniform {content, stop_reason, usage} shape.
 */

import { generateText, type ModelMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ContentPart {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  tool_use_id?: string;
  content?: string | ContentPart[];
  is_error?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatCompletionChunk {
  type: "text" | "tool_use" | "thinking" | "stop" | "usage";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  stop_reason?: "end_turn" | "tool_use" | "max_tokens";
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface ChatCompletionParams {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionResult {
  content: ContentPart[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model: string;
}

export interface LLMProvider {
  readonly type: string;
  readonly name: string;

  chat(params: ChatCompletionParams): Promise<ChatCompletionResult>;
  chatStream(params: ChatCompletionParams): AsyncIterable<ChatCompletionChunk>;
  listModels(): Promise<string[]>;
}

/**
 * Supported provider types. To add a new provider:
 * 1. Add the enum value here.
 * 2. Install its `@ai-sdk/<name>` package.
 * 3. Add a factory case in `instantiateModel()`.
 * 4. Add a default model list in `DEFAULT_MODELS`.
 */
export type ProviderType =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "groq"
  | "openai-compatible"
  | "ollama";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  isDefault?: boolean;
}

// ── Default model catalogs ──────────────────────────────────────────────
// Static curated list per provider. `listModels()` returns these unless
// the provider has a live /models endpoint we can query (Ollama below).

const DEFAULT_MODELS: Record<ProviderType, string[]> = {
  anthropic: [
    "claude-opus-4-5",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
  ],
  openai: [
    "gpt-5",
    "gpt-5-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-mini",
  ],
  google: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  mistral: [
    "mistral-large-latest",
    "mistral-medium-latest",
    "mistral-small-latest",
    "pixtral-large-latest",
    "codestral-latest",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  "openai-compatible": [],
  ollama: ["llama3.3", "llama3.1", "qwen2.5", "mistral", "phi3", "gemma2"],
};

// ── Model instantiation ────────────────────────────────────────────────

function instantiateModel(
  config: ProviderConfig,
  modelId: string,
): LanguageModel {
  switch (config.type) {
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
      return provider(modelId);
    }
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
      return provider(modelId);
    }
    case "google": {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
      return provider(modelId);
    }
    case "mistral": {
      const provider = createMistral({
        apiKey: config.apiKey ?? process.env.MISTRAL_API_KEY,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
      return provider(modelId);
    }
    case "groq": {
      const provider = createGroq({
        apiKey: config.apiKey ?? process.env.GROQ_API_KEY,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
      return provider(modelId);
    }
    case "openai-compatible": {
      const provider = createOpenAICompatible({
        name: config.name,
        apiKey: config.apiKey,
        baseURL: config.baseUrl ?? "http://localhost:8000/v1",
      });
      return provider(modelId);
    }
    case "ollama": {
      const provider = createOpenAICompatible({
        name: "ollama",
        apiKey: config.apiKey ?? "ollama",
        baseURL: config.baseUrl ?? "http://localhost:11434/v1",
      });
      return provider(modelId);
    }
    default: {
      // exhaustiveness
      const _never: never = config.type;
      throw new Error(`Unsupported provider type: ${String(_never)}`);
    }
  }
}

// ── Message translation ────────────────────────────────────────────────

/**
 * Translate our wire-format `ChatMessage[]` into the AI SDK's
 * `ModelMessage[]`. Handles:
 *
 *  - plain string user/assistant messages
 *  - assistant messages with tool_use parts → AI SDK `tool-call`
 *  - user messages whose content is a tool_result → AI SDK `tool` role
 *  - mixed assistant messages (text + tool_use)
 */
function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (const msg of messages) {
    const content = msg.content;

    if (typeof content === "string") {
      if (msg.role === "user") {
        out.push({ role: "user", content });
      } else if (msg.role === "assistant") {
        out.push({ role: "assistant", content });
      } else {
        out.push({ role: "system", content });
      }
      continue;
    }

    const toolResults = content.filter((p) => p.type === "tool_result");
    const textParts = content.filter((p) => p.type === "text");
    const toolUses = content.filter((p) => p.type === "tool_use");

    if (toolResults.length > 0 && msg.role === "user") {
      out.push({
        role: "tool",
        content: toolResults.map((r) => {
          const resultText =
            typeof r.content === "string"
              ? r.content
              : (r.content ?? [])
                  .filter((c) => c.type === "text")
                  .map((c) => c.text ?? "")
                  .join("");
          return {
            type: "tool-result",
            toolCallId: r.tool_use_id ?? "",
            toolName: r.name ?? "tool",
            output: { type: "text", value: resultText },
          };
        }),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const parts: Array<
        | { type: "text"; text: string }
        | {
            type: "tool-call";
            toolCallId: string;
            toolName: string;
            input: unknown;
          }
      > = [];
      for (const t of textParts) {
        if (t.text) parts.push({ type: "text", text: t.text });
      }
      for (const u of toolUses) {
        parts.push({
          type: "tool-call",
          toolCallId: u.id ?? "",
          toolName: u.name ?? "",
          input: u.input ?? {},
        });
      }
      if (parts.length > 0) {
        out.push({ role: "assistant", content: parts });
      }
      continue;
    }

    // user message with only text parts
    if (msg.role === "user") {
      const text = textParts.map((t) => t.text ?? "").join("");
      if (text) out.push({ role: "user", content: text });
    }
  }

  return out;
}

// ── Provider impl ──────────────────────────────────────────────────────

class AISDKProvider implements LLMProvider {
  readonly type: string;
  readonly name: string;
  private config: ProviderConfig;
  private defaultModelId: string;

  constructor(config: ProviderConfig) {
    this.type = config.type;
    this.name = config.name;
    this.config = config;
    this.defaultModelId =
      config.defaultModel ?? DEFAULT_MODELS[config.type]?.[0] ?? "";
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const modelId = params.model || this.defaultModelId;
    const model = instantiateModel(this.config, modelId);
    const messages = toModelMessages(params.messages);

    const toolsMap =
      params.tools && params.tools.length > 0
        ? Object.fromEntries(
            params.tools.map((t) => [
              t.name,
              {
                description: t.description,
                inputSchema: t.input_schema,
              },
            ]),
          )
        : undefined;

    const result = await generateText({
      model,
      ...(params.system ? { system: params.system } : {}),
      messages,
      ...(params.max_tokens ? { maxOutputTokens: params.max_tokens } : {}),
      ...(params.temperature != null ? { temperature: params.temperature } : {}),
      ...(toolsMap ? { tools: toolsMap as never } : {}),
    });

    const content: ContentPart[] = [];
    if (result.text && result.text.length > 0) {
      content.push({ type: "text", text: result.text });
    }
    for (const call of result.toolCalls ?? []) {
      content.push({
        type: "tool_use",
        id: (call as { toolCallId: string }).toolCallId,
        name: (call as { toolName: string }).toolName,
        input: (call as { input: Record<string, unknown> }).input ?? {},
      });
    }

    const finish = result.finishReason;
    const stop_reason: ChatCompletionResult["stop_reason"] =
      finish === "tool-calls"
        ? "tool_use"
        : finish === "length"
          ? "max_tokens"
          : "end_turn";

    const usage = result.usage as {
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
    };

    return {
      content,
      stop_reason,
      usage: {
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        cache_read_input_tokens: usage?.cachedInputTokens ?? 0,
      },
      model: modelId,
    };
  }

  async *chatStream(
    params: ChatCompletionParams,
  ): AsyncIterable<ChatCompletionChunk> {
    // Full-result fallback for streaming — emit the whole response as
    // text/tool_use chunks. The agent engine only streams token deltas
    // for UX; correctness does not depend on real token streaming.
    const result = await this.chat(params);
    for (const part of result.content) {
      if (part.type === "text") {
        yield { type: "text", text: part.text ?? "" };
      } else if (part.type === "tool_use") {
        yield {
          type: "tool_use",
          id: part.id,
          name: part.name,
          input: part.input,
        };
      }
    }
    yield {
      type: "stop",
      stop_reason: result.stop_reason,
    };
    yield {
      type: "usage",
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
      },
    };
  }

  async listModels(): Promise<string[]> {
    // Ollama has a live /api/tags endpoint — use it.
    if (this.config.type === "ollama") {
      const baseUrl = this.config.baseUrl ?? "http://localhost:11434/v1";
      const tagsUrl = baseUrl.replace(/\/v1\/?$/, "") + "/api/tags";
      try {
        const res = await fetch(tagsUrl);
        if (!res.ok) return DEFAULT_MODELS.ollama;
        const body = (await res.json()) as { models?: Array<{ name: string }> };
        return (body.models ?? []).map((m) => m.name);
      } catch {
        return DEFAULT_MODELS.ollama;
      }
    }

    return DEFAULT_MODELS[this.config.type] ?? [];
  }
}

// ── Factory + cache ────────────────────────────────────────────────────

const providerInstances = new Map<string, LLMProvider>();

export function createProvider(config: ProviderConfig): LLMProvider {
  const cached = providerInstances.get(config.id);
  if (cached) return cached;
  const provider = new AISDKProvider(config);
  providerInstances.set(config.id, provider);
  return provider;
}

export function clearProviderCache() {
  providerInstances.clear();
}

// Re-exports for legacy imports
export { DEFAULT_MODELS };
