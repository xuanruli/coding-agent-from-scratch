// Content block types for tool use
export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Core message type for LLM conversation
export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface StreamEvent {
  type: "message_start" | "text_delta" | "message_stop" | "error";
  text?: string;
}

// Response from a chat completion
export interface ChatResponse {
  content: ContentBlock[];
  text: string;
  stopReason: "end_turn" | "max_tokens" | "tool_use";
  usage: { inputTokens: number; outputTokens: number };
}

// Options for chat completion
export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  tools?: Tool[];
}

// Unified interface for LLM providers
export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  stream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent>;
}
