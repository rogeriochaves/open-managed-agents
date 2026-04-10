/**
 * LLM Provider abstraction layer.
 *
 * Unified interface for calling different LLM providers (Anthropic, OpenAI,
 * OpenAI-compatible, Ollama) with the same agent loop.
 */

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
  // text/thinking
  text?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // stop
  stop_reason?: "end_turn" | "tool_use" | "max_tokens";
  // usage
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

  /**
   * Send a chat completion request and get the full result.
   */
  chat(params: ChatCompletionParams): Promise<ChatCompletionResult>;

  /**
   * Stream a chat completion request, yielding chunks.
   */
  chatStream(params: ChatCompletionParams): AsyncIterable<ChatCompletionChunk>;

  /**
   * List available models for this provider.
   */
  listModels(): Promise<string[]>;
}

export type ProviderType = "anthropic" | "openai" | "openai-compatible" | "ollama";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  isDefault?: boolean;
}

import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

const providerInstances = new Map<string, LLMProvider>();

export function createProvider(config: ProviderConfig): LLMProvider {
  const cached = providerInstances.get(config.id);
  if (cached) return cached;

  let provider: LLMProvider;

  switch (config.type) {
    case "anthropic":
      provider = new AnthropicProvider(config);
      break;
    case "openai":
    case "openai-compatible":
    case "ollama":
      provider = new OpenAIProvider(config);
      break;
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }

  providerInstances.set(config.id, provider);
  return provider;
}

export function clearProviderCache() {
  providerInstances.clear();
}
