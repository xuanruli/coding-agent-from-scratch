import { describe, expect, it } from "vitest";
import type { Message, Tool } from "../src/llm/types.js";
import {
  DEFAULT_BUDGET,
  estimateConversationTokens,
  estimateMessageTokens,
  estimateTokens,
  getModelContextLimit,
  isOverBudget,
  remainingBudget,
} from "../src/token-counter.js";

describe("estimateTokens", () => {
  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should estimate English text at ~4 chars/token", () => {
    // "Hello World" = 11 chars → ceil(11/4) = 3
    expect(estimateTokens("Hello World")).toBe(3);
  });

  it("should estimate CJK text at ~2 chars/token", () => {
    // "你好世界" = 4 CJK chars → ceil(4/2) = 2
    expect(estimateTokens("你好世界")).toBe(2);
  });

  it("should handle mixed CJK and English", () => {
    // "Hello你好" = 5 English + 2 CJK → ceil(5/4) + ceil(2/2) = 2 + 1 = 3
    expect(estimateTokens("Hello你好")).toBe(3);
  });

  it("should handle long text proportionally", () => {
    const text = "a".repeat(1000);
    expect(estimateTokens(text)).toBe(250); // 1000/4
  });

  it("should handle Japanese text as CJK", () => {
    // Hiragana chars
    const tokens = estimateTokens("こんにちは");
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(5);
  });
});

describe("estimateMessageTokens", () => {
  it("should estimate string content message", () => {
    const msg: Message = { role: "user", content: "Hello World" };
    // 4 (overhead) + 3 (text) = 7
    expect(estimateMessageTokens(msg)).toBe(7);
  });

  it("should estimate content block message", () => {
    const msg: Message = {
      role: "assistant",
      content: [{ type: "text", text: "Hello World" }],
    };
    // 4 (overhead) + 3 (text block) = 7
    expect(estimateMessageTokens(msg)).toBe(7);
  });

  it("should estimate tool_use blocks", () => {
    const msg: Message = {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "123",
          name: "read_file",
          input: { file_path: "test.txt" },
        },
      ],
    };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBeGreaterThan(4); // overhead + tool name + input
  });

  it("should estimate tool_result blocks", () => {
    const msg: Message = {
      role: "user",
      content: [
        {
          type: "tool_result",
          toolUseId: "123",
          content: "file contents here",
        },
      ],
    };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBeGreaterThan(4);
  });
});

describe("estimateConversationTokens", () => {
  it("should count messages only", () => {
    const messages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const tokens = estimateConversationTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("should include system prompt tokens", () => {
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const withSystem = estimateConversationTokens(messages, "You are helpful.");
    const without = estimateConversationTokens(messages);
    expect(withSystem).toBeGreaterThan(without);
  });

  it("should include tool definition tokens", () => {
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const tools: Tool[] = [
      {
        name: "read_file",
        description: "Read a file",
        inputSchema: { type: "object" },
      },
    ];
    const withTools = estimateConversationTokens(messages, undefined, tools);
    const without = estimateConversationTokens(messages);
    expect(withTools).toBeGreaterThan(without);
  });

  it("should return 0 for empty conversation", () => {
    expect(estimateConversationTokens([])).toBe(0);
  });
});

describe("getModelContextLimit", () => {
  it("should return limit for known models", () => {
    expect(getModelContextLimit("deepseek-chat")).toBe(64000);
    expect(getModelContextLimit("gpt-4o")).toBe(128000);
    expect(getModelContextLimit("claude-sonnet-4-20250514")).toBe(200000);
  });

  it("should return undefined for unknown models", () => {
    expect(getModelContextLimit("unknown-model")).toBeUndefined();
  });
});

describe("ContextBudget", () => {
  it("should have sensible defaults", () => {
    expect(DEFAULT_BUDGET.maxContextTokens).toBe(64000);
    expect(DEFAULT_BUDGET.reservedForResponse).toBe(4096);
  });

  it("should calculate remaining budget", () => {
    const budget = { maxContextTokens: 10000, reservedForResponse: 2000 };
    // Available = 10000 - 2000 - 3000 = 5000
    expect(remainingBudget(budget, 3000)).toBe(5000);
  });

  it("should not return negative remaining", () => {
    const budget = { maxContextTokens: 1000, reservedForResponse: 500 };
    expect(remainingBudget(budget, 2000)).toBe(0);
  });

  it("should detect over budget", () => {
    const budget = { maxContextTokens: 10000, reservedForResponse: 2000 };
    expect(isOverBudget(budget, 7000)).toBe(false);
    expect(isOverBudget(budget, 8000)).toBe(true);
    expect(isOverBudget(budget, 9000)).toBe(true);
  });
});
