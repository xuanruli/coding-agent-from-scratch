// Core message type for LLM conversation
export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface StreamEvent {
  type: "message_start" | "text_delta" | "message_stop" | "error";
  text?: string;
}

// Response from a chat completion
export interface ChatResponse {
  text: string;
  stopReason: "end_turn" | "max_tokens";
  usage: { inputTokens: number; outputTokens: number };
}

// Options for chat completion
export interface ChatOptions {
  system?: string;
  maxTokens?: number;
}

// Unified interface for LLM providers
export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
}