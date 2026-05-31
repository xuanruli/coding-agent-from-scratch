import type { LLMProvider, Message } from "./llm/types.js";
import { estimateMessageTokens } from "./token-counter.js";

/**
 * Configuration for conversation compression.
 */
export interface CompressorConfig {
  provider: LLMProvider;
  /** Maximum tokens before triggering compression */
  maxTokens: number;
  /** Number of recent messages to always keep uncompressed */
  keepRecentMessages: number;
  /** Maximum tokens for the summary */
  summaryMaxTokens?: number;
}

export const DEFAULT_COMPRESSOR_CONFIG: Partial<CompressorConfig> = {
  maxTokens: 50000,
  keepRecentMessages: 6,
  summaryMaxTokens: 1024,
};

/**
 * Result of a compression operation.
 */
export interface CompressResult {
  messages: Message[];
  compressed: boolean;
  originalCount: number;
  compressedCount: number;
  summaryTokens: number;
}

/**
 * Generate a summary of messages using the LLM.
 */
export async function summarizeMessages(
  provider: LLMProvider,
  messages: Message[],
  maxTokens = 1024
): Promise<string> {
  const formatted = messages
    .map((m) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : m.content
              .map((b) => {
                if (b.type === "text") return b.text;
                if (b.type === "tool_use") return `[Tool call: ${b.name}]`;
                if (b.type === "tool_result") return `[Tool result: ${b.content.slice(0, 200)}]`;
                return "";
              })
              .join("\n");
      return `${m.role}: ${content}`;
    })
    .join("\n\n");

  const response = await provider.chat(
    [
      {
        role: "user",
        content: `Summarize this conversation concisely. Focus on: what the user asked, what tools were used, what was accomplished, and any important decisions or findings.\n\n${formatted}`,
      },
    ],
    {
      system:
        "You are a conversation summarizer. Produce a concise summary that captures the key information needed to continue the conversation. Do not include pleasantries or meta-commentary.",
      maxTokens,
    }
  );

  return response.text;
}

/**
 * Compress a conversation by summarizing old messages and keeping recent ones.
 *
 * Strategy:
 * 1. Estimate total tokens in the conversation
 * 2. If under budget, return messages unchanged
 * 3. Otherwise, split into "old" and "recent" segments
 * 4. Summarize the old messages into a single summary message
 * 5. Return [summary, ...recent]
 */
export async function compressConversation(
  config: CompressorConfig,
  messages: Message[]
): Promise<CompressResult> {
  const {
    provider,
    maxTokens,
    keepRecentMessages,
    summaryMaxTokens = 1024,
  } = config;

  // Calculate total tokens
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateMessageTokens(m),
    0
  );

  // Not over budget — no compression needed
  if (totalTokens <= maxTokens || messages.length <= keepRecentMessages) {
    return {
      messages: [...messages],
      compressed: false,
      originalCount: messages.length,
      compressedCount: messages.length,
      summaryTokens: 0,
    };
  }

  // Split into old (to summarize) and recent (to keep)
  const splitIndex = messages.length - keepRecentMessages;
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // Summarize old messages
  const summary = await summarizeMessages(
    provider,
    oldMessages,
    summaryMaxTokens
  );

  // Create summary as the first message
  const summaryMessage: Message = {
    role: "user",
    content: `[Previous conversation summary]\n${summary}`,
  };

  const result = [summaryMessage, ...recentMessages];

  return {
    messages: result,
    compressed: true,
    originalCount: messages.length,
    compressedCount: result.length,
    summaryTokens: estimateMessageTokens(summaryMessage),
  };
}

/**
 * Check if a conversation needs compression based on token count.
 */
export function needsCompression(
  messages: Message[],
  maxTokens: number
): boolean {
  const total = messages.reduce(
    (sum, m) => sum + estimateMessageTokens(m),
    0
  );
  return total > maxTokens;
}