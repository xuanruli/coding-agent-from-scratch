import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ChatResponse,
  ChatOptions,
  LLMProvider,
  StreamEvent,
  ContentBlock,
  ToolResultBlock,
  ToolUseBlock,
  TextBlock,
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

  private formatContent(
    content: string | ContentBlock[]
  ): string | Record<string, unknown>[] {
    if (typeof content === "string") return content;
    return content.map((block) => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "tool_use") {
        return { type: "tool_use", id: block.id, name: block.name, input: block.input };
      }
      // tool_result
      return {
        type: "tool_result",
        tool_use_id: (block as ToolResultBlock).toolUseId,
        content: block.content,
        ...(block.isError ? { is_error: true } : {}),
      };
    });
  }

  async chat(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: messages.map((m) => ({ role: m.role, content: this.formatContent(m.content) })),
    };
    if (options?.system) params.system = options.system;

    if (options?.tools) {
      params.tools = options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
    }

    const response = await this.client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsNonStreaming
    );

    // Extract text from response content blocks
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    const content: ContentBlock[] = response.content.map((b: any) => {
      if (b.type === "tool_use") {
        return { type: "tool_use", id: b.id, name: b.name, input: b.input } as ToolUseBlock;
      }
      return { type: "text", text: b.text } as TextBlock;
    });

    const stopReason: ChatResponse["stopReason"] =
    response.stop_reason === "end_turn"
      ? "end_turn"
      : response.stop_reason === "tool_use"
        ? "tool_use"
        : "max_tokens";
    
    return {
      content,
      text,
      stopReason,
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
      params as unknown as Anthropic.MessageCreateParamsNonStreaming
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
