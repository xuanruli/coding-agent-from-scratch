import OpenAI from "openai";
import type {
  Message,
  ChatResponse,
  ChatOptions,
  LLMProvider,
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

  // Format messages for OpenAI API, prepending system message if present
  private formatMessages(
    messages: Message[],
    system?: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const formatted: OpenAI.ChatCompletionMessageParam[] = [];
    if (system) {
      formatted.push({ role: "system", content: system });
    }
    for (const m of messages) {
      formatted.push({ role: m.role, content: m.content });
    }
    return formatted;
  }

  async chat(
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: this.formatMessages(messages, options?.system),
    });

    const choice = response.choices[0];
    return {
      text: choice.message.content ?? "",
      stopReason:
        choice.finish_reason === "stop" ? "end_turn" : "max_tokens",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
