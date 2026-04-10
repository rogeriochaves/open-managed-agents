import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionChunk,
  ProviderConfig,
  ContentPart,
  ChatMessage,
} from "./index.js";

export class AnthropicProvider implements LLMProvider {
  readonly type = "anthropic";
  readonly name: string;
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.defaultModel = config.defaultModel ?? "claude-sonnet-4-6";
    this.client = new Anthropic({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const messages = this.toAnthropicMessages(params.messages);

    const response = await this.client.messages.create({
      model: params.model || this.defaultModel,
      max_tokens: params.max_tokens ?? 8192,
      ...(params.system ? { system: params.system } : {}),
      messages,
      ...(params.tools?.length
        ? {
            tools: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
            })),
          }
        : {}),
    });

    return {
      content: this.fromAnthropicContent(response.content),
      stop_reason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: (response.usage as any).cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
      },
      model: response.model,
    };
  }

  async *chatStream(params: ChatCompletionParams): AsyncIterable<ChatCompletionChunk> {
    const messages = this.toAnthropicMessages(params.messages);

    const stream = this.client.messages.stream({
      model: params.model || this.defaultModel,
      max_tokens: params.max_tokens ?? 8192,
      ...(params.system ? { system: params.system } : {}),
      messages,
      ...(params.tools?.length
        ? {
            tools: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
            })),
          }
        : {}),
    });

    let currentToolId: string | undefined;
    let currentToolName: string | undefined;
    let currentToolInput = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "text") {
          // text block starting
        } else if (block.type === "tool_use") {
          currentToolId = block.id;
          currentToolName = block.name;
          currentToolInput = "";
        } else if (block.type === "thinking") {
          yield { type: "thinking", text: "" };
        }
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          yield { type: "text", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          currentToolInput += delta.partial_json;
        } else if (delta.type === "thinking_delta") {
          yield { type: "thinking", text: (delta as any).thinking };
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolId && currentToolName) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(currentToolInput || "{}");
          } catch {}
          yield {
            type: "tool_use",
            id: currentToolId,
            name: currentToolName,
            input,
          };
          currentToolId = undefined;
          currentToolName = undefined;
          currentToolInput = "";
        }
      } else if (event.type === "message_delta") {
        yield {
          type: "stop",
          stop_reason: (event.delta as any).stop_reason === "tool_use" ? "tool_use" : "end_turn",
        };
      } else if (event.type === "message_start") {
        const usage = event.message.usage;
        yield {
          type: "usage",
          usage: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_input_tokens: (usage as any).cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: (usage as any).cache_creation_input_tokens ?? 0,
          },
        };
      }
    }
  }

  async listModels(): Promise<string[]> {
    return [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-sonnet-4-5-20250929",
      "claude-opus-4-5-20251101",
    ];
  }

  private toAnthropicMessages(messages: ChatMessage[]): Anthropic.Messages.MessageParam[] {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (typeof m.content === "string") {
          return { role: m.role as "user" | "assistant", content: m.content };
        }

        const content: Anthropic.Messages.ContentBlockParam[] = m.content.map((part) => {
          if (part.type === "text") {
            return { type: "text" as const, text: part.text! };
          }
          if (part.type === "tool_use") {
            return {
              type: "tool_use" as const,
              id: part.id!,
              name: part.name!,
              input: part.input ?? {},
            };
          }
          if (part.type === "tool_result") {
            const resultContent =
              typeof part.content === "string"
                ? part.content
                : Array.isArray(part.content)
                  ? part.content.map((c) => ({ type: "text" as const, text: c.text ?? "" }))
                  : "";
            return {
              type: "tool_result" as const,
              tool_use_id: part.tool_use_id!,
              content: resultContent,
              is_error: part.is_error ?? false,
            };
          }
          return { type: "text" as const, text: "" };
        });

        return { role: m.role as "user" | "assistant", content };
      });
  }

  private fromAnthropicContent(content: Anthropic.Messages.ContentBlock[]): ContentPart[] {
    return content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
      return { type: "text" as const, text: "" };
    });
  }
}
