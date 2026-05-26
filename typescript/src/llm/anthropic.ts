import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ChatResponse,
  ChatOptions,
  LLMProvider,
  StreamEvent,
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

  async *stream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    const params: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (options?.system) params.system = options.system;
  
    const stream = this.client.messages.stream(
      params as Anthropic.MessageCreateParamsNonStreaming
    );
  
    yield { type: "message_start" };
  
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text_delta", text: event.delta.text };
      }
    }
  
    yield { type: "message_stop" };
  }
}

type A = string;
type B = number;

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  items: (A | B)[];
}

type UserItem<T extends User> = T['items'][number];


