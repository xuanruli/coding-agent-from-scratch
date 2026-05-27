import OpenAI from "openai";
import type {
  Message,
  ChatResponse,
  ChatOptions,
  LLMProvider,
  StreamEvent,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
  ToolResultBlock,
} from "./types.js";

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAICompatibleConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
  }

  private formatMessages(
    messages: Message[],
    system?: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const formatted: OpenAI.ChatCompletionMessageParam[] = [];
    if (system) {
      formatted.push({ role: "system", content: system });
    }
    for (const m of messages) {
      if (typeof m.content === "string") {
        formatted.push({ role: m.role, content: m.content });
        continue;
      }
      // ContentBlock[] — handle assistant with tool_use and user with tool_result
      if (m.role === "assistant") {
        const textParts = m.content.filter((b) => b.type === "text");
        const toolUses = m.content.filter((b) => b.type === "tool_use") as ToolUseBlock[];
        formatted.push({
          role: "assistant",
          content: textParts.length
            ? textParts.map((b) => (b as TextBlock).text).join("")
            : null,
          tool_calls: toolUses.map((t) => ({
            id: t.id,
            type: "function" as const,
            function: { name: t.name, arguments: JSON.stringify(t.input) },
          })),
        } as any);
      } else {
        // user role with tool_result blocks
        for (const block of m.content) {
          if (block.type === "tool_result") {
            const tr = block as ToolResultBlock;
            formatted.push({
              role: "tool",
              tool_call_id: tr.toolUseId,
              content: tr.content,
            } as any);
          }
        }
      }
    }
    return formatted;
  }

  async chat(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: this.formatMessages(messages, options?.system),
    };
    if (options?.tools?.length) {
      (params as any).tools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }
    const response = await this.client.chat.completions.create(params as any);

    const choice = response.choices[0];

    const content: ContentBlock[] = [];
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content } as TextBlock);
    }
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        } as ToolUseBlock);
      }
    }

    const stopReason: ChatResponse["stopReason"] =
      choice.finish_reason === "stop"
        ? "end_turn"
        : choice.finish_reason === "tool_calls"
          ? "tool_use"
          : "max_tokens";

    return {
      text: choice.message.content ?? "",
      content,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: this.formatMessages(messages, options?.system),
      stream: true,
    });
  
    yield { type: "message_start" };
  
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text_delta", text: delta.content };
      }
    }
  
    yield { type: "message_stop" };
  }
}
