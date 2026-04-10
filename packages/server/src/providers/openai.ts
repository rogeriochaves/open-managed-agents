import OpenAI from "openai";
import type {
  LLMProvider,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionChunk,
  ProviderConfig,
  ContentPart,
  ChatMessage,
} from "./index.js";

export class OpenAIProvider implements LLMProvider {
  readonly type: string;
  readonly name: string;
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.type = config.type;
    this.name = config.name;

    const baseURL =
      config.type === "ollama"
        ? config.baseUrl ?? "http://localhost:11434/v1"
        : config.baseUrl;

    this.defaultModel =
      config.defaultModel ??
      (config.type === "ollama" ? "llama3.1" : "gpt-4o");

    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? "ollama",
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const messages = this.toOpenAIMessages(params);

    const response = await this.client.chat.completions.create({
      model: params.model || this.defaultModel,
      messages,
      max_tokens: params.max_tokens ?? 8192,
      ...(params.temperature != null ? { temperature: params.temperature } : {}),
      ...(params.tools?.length
        ? {
            tools: params.tools.map((t) => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
              },
            })),
          }
        : {}),
    });

    const choice = response.choices[0]!;
    const content = this.fromOpenAIContent(choice);

    return {
      content,
      stop_reason:
        choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  async *chatStream(
    params: ChatCompletionParams
  ): AsyncIterable<ChatCompletionChunk> {
    const messages = this.toOpenAIMessages(params);

    const stream = await this.client.chat.completions.create({
      model: params.model || this.defaultModel,
      messages,
      max_tokens: params.max_tokens ?? 8192,
      stream: true,
      ...(params.temperature != null ? { temperature: params.temperature } : {}),
      ...(params.tools?.length
        ? {
            tools: params.tools.map((t) => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
              },
            })),
          }
        : {}),
    });

    const toolCalls = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        yield { type: "text", text: delta.content };
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              args: "",
            });
          }
          const existing = toolCalls.get(idx)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
        }
      }

      // Check for finish
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        // Emit accumulated tool calls
        for (const [, tc] of toolCalls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.args || "{}");
          } catch {}
          yield {
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input,
          };
        }

        yield {
          type: "stop",
          stop_reason:
            finishReason === "tool_calls" ? "tool_use" : "end_turn",
        };

        // Usage from final chunk
        if (chunk.usage) {
          yield {
            type: "usage",
            usage: {
              input_tokens: chunk.usage.prompt_tokens,
              output_tokens: chunk.usage.completion_tokens,
            },
          };
        }
      }
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data
        .map((m) => m.id)
        .filter(
          (id) =>
            id.startsWith("gpt-") ||
            id.startsWith("o1") ||
            id.startsWith("o3") ||
            id.startsWith("o4") ||
            // Ollama / other providers
            !id.includes("/")
        )
        .sort();
    } catch {
      if (this.type === "ollama") {
        return ["llama3.1", "llama3.2", "mistral", "codellama", "phi3"];
      }
      return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"];
    }
  }

  private toOpenAIMessages(
    params: ChatCompletionParams
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (params.system) {
      messages.push({ role: "system", content: params.system });
    }

    for (const msg of params.messages) {
      if (msg.role === "system") continue;

      if (typeof msg.content === "string") {
        if (msg.tool_call_id) {
          // Tool result message
          messages.push({
            role: "tool",
            tool_call_id: msg.tool_call_id,
            content: msg.content,
          });
        } else if (msg.role === "assistant" && msg.tool_calls?.length) {
          messages.push({
            role: "assistant",
            content: msg.content || null,
            tool_calls: msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.input),
              },
            })),
          });
        } else {
          messages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
        continue;
      }

      // Complex content parts
      const hasToolUse = msg.content.some((p) => p.type === "tool_use");
      const hasToolResult = msg.content.some((p) => p.type === "tool_result");

      if (hasToolUse && msg.role === "assistant") {
        const textParts = msg.content
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");
        const toolUses = msg.content.filter((p) => p.type === "tool_use");

        messages.push({
          role: "assistant",
          content: textParts || null,
          tool_calls: toolUses.map((tc) => ({
            id: tc.id!,
            type: "function" as const,
            function: {
              name: tc.name!,
              arguments: JSON.stringify(tc.input ?? {}),
            },
          })),
        });
      } else if (hasToolResult) {
        for (const part of msg.content) {
          if (part.type === "tool_result") {
            const resultText =
              typeof part.content === "string"
                ? part.content
                : Array.isArray(part.content)
                  ? part.content.map((c) => c.text ?? "").join("")
                  : "";
            messages.push({
              role: "tool",
              tool_call_id: part.tool_use_id!,
              content: resultText,
            });
          }
        }
      } else {
        const textContent = msg.content
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");
        messages.push({
          role: msg.role as "user" | "assistant",
          content: textContent,
        });
      }
    }

    return messages;
  }

  private fromOpenAIContent(
    choice: OpenAI.ChatCompletion.Choice
  ): ContentPart[] {
    const parts: ContentPart[] = [];

    if (choice.message.content) {
      parts.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {}
        parts.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
    }

    return parts;
  }
}
