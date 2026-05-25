import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ChatResponse,
  ChatOptions,
  LLMProvider,
} from "./types.js";

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-sonnet-4-20250514";
  }

  async chat(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (options?.system) params.system = options.system;

    const response = await this.client.messages.create(
      params as Anthropic.MessageCreateParamsNonStreaming
    );

    // Extract text from response content blocks
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    return {
      text,
      stopReason:
        response.stop_reason === "end_turn" ? "end_turn" : "max_tokens",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}