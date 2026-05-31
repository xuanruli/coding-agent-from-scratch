import type { ContentBlock, Message, Tool } from "./llm/types.js";

/**
 * Estimate token count for a string.
 *
 * Uses a simple heuristic: ~4 characters per token for English,
 * ~2 characters per token for CJK text. This is faster than calling
 * the tokenizer API and sufficient for budget management.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let cjkChars = 0;
  let otherChars = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // CJK Unified Ideographs + common ranges
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3000 && code <= 0x303f) || // CJK Punctuation
      (code >= 0x3040 && code <= 0x30ff) || // Hiragana + Katakana
      (code >= 0xff00 && code <= 0xffef) // Fullwidth forms
    ) {
      cjkChars++;
    } else {
      otherChars++;
    }
  }

  // ~2 chars/token for CJK, ~4 chars/token for other
  return Math.ceil(cjkChars / 2) + Math.ceil(otherChars / 4);
}

/**
 * Estimate tokens in a single content block.
 */
function estimateBlockTokens(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return estimateTokens(block.text);
    case "tool_use":
      return (
        estimateTokens(block.name) + estimateTokens(JSON.stringify(block.input))
      );
    case "tool_result":
      return estimateTokens(block.content);
    default:
      return 0;
  }
}

/**
 * Estimate token count for a single message.
 */
export function estimateMessageTokens(message: Message): number {
  // Base overhead per message (role tag, formatting)
  const overhead = 4;

  if (typeof message.content === "string") {
    return overhead + estimateTokens(message.content);
  }

  // Array of content blocks
  return (
    overhead +
    message.content.reduce((sum, block) => sum + estimateBlockTokens(block), 0)
  );
}

/**
 * Estimate total tokens for a conversation (messages + system + tools).
 */
export function estimateConversationTokens(
  messages: Message[],
  system?: string,
  tools?: Tool[]
): number {
  let total = 0;

  // System prompt
  if (system) {
    total += estimateTokens(system);
  }

  // Tool definitions
  if (tools) {
    for (const tool of tools) {
      total +=
        estimateTokens(tool.name) +
        estimateTokens(tool.description) +
        estimateTokens(JSON.stringify(tool.inputSchema));
    }
  }

  // Messages
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }

  return total;
}

// Known context window limits for common models
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-sonnet-4-20250514": 200000,
  "claude-haiku-4-20250414": 200000,
  "claude-3-5-sonnet-20241022": 200000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "deepseek-chat": 64000,
  "deepseek-coder": 128000,
};

/**
 * Get the context window limit for a model.
 * Returns undefined if the model is not in the known list.
 */
export function getModelContextLimit(model: string): number | undefined {
  return MODEL_CONTEXT_LIMITS[model];
}

/**
 * Context window budget manager.
 *
 * Tracks token usage and enforces limits to prevent context overflow.
 * Reserves tokens for the response so the model always has room to reply.
 */
export interface ContextBudget {
  maxContextTokens: number;
  reservedForResponse: number;
}

export const DEFAULT_BUDGET: ContextBudget = {
  maxContextTokens: 64000,
  reservedForResponse: 4096,
};

/**
 * Calculate remaining budget for input tokens.
 */
export function remainingBudget(
  budget: ContextBudget,
  usedTokens: number
): number {
  return Math.max(
    0,
    budget.maxContextTokens - budget.reservedForResponse - usedTokens
  );
}

/**
 * Check if adding more tokens would exceed the budget.
 */
export function isOverBudget(
  budget: ContextBudget,
  usedTokens: number
): boolean {
  return usedTokens >= budget.maxContextTokens - budget.reservedForResponse;
}
