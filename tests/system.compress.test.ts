import { describe, expect, it, vi } from "vitest";
import type { CompressorConfig } from "../src/compress.js";
import {
  compressConversation,
  needsCompression,
  summarizeMessages,
} from "../src/compress.js";
import type { LLMProvider, Message } from "../src/llm/types.js";

// Mock provider that returns a fixed summary
function mockProvider(
  summaryText = "Summary of the conversation."
): LLMProvider {
  return {
    chat: vi.fn(async () => ({
      content: [{ type: "text" as const, text: summaryText }],
      text: summaryText,
      stopReason: "end_turn" as const,
      usage: { inputTokens: 100, outputTokens: 20 },
    })),
    stream: vi.fn(),
  } as unknown as LLMProvider;
}

function userMsg(text: string): Message {
  return { role: "user", content: text };
}

function assistantMsg(text: string): Message {
  return { role: "assistant", content: text };
}

// Build a long conversation
function buildConversation(pairs: number): Message[] {
  const msgs: Message[] = [];
  for (let i = 0; i < pairs; i++) {
    msgs.push(userMsg(`Question ${i}: ${"x".repeat(200)}`));
    msgs.push(assistantMsg(`Answer ${i}: ${"y".repeat(200)}`));
  }
  return msgs;
}

describe("summarizeMessages", () => {
  it("should call the provider and return summary text", async () => {
    const provider = mockProvider("This is the summary.");
    const msgs: Message[] = [userMsg("Hello"), assistantMsg("Hi there!")];

    const summary = await summarizeMessages(provider, msgs);
    expect(summary).toBe("This is the summary.");
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it("should format tool_use blocks in messages", async () => {
    const provider = mockProvider("Summary with tools.");
    const msgs: Message[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "1",
            name: "read_file",
            input: { file_path: "test.txt" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", toolUseId: "1", content: "file contents..." },
        ],
      },
    ];

    const summary = await summarizeMessages(provider, msgs);
    expect(summary).toBe("Summary with tools.");

    // Verify the formatted input contains tool info
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const inputContent = (call[0] as Message[])[0].content as string;
    expect(inputContent).toContain("[Tool call: read_file]");
    expect(inputContent).toContain("[Tool result:");
  });
});

describe("compressConversation", () => {
  it("should not compress when under budget", async () => {
    const config: CompressorConfig = {
      provider: mockProvider(),
      maxTokens: 100000,
      keepRecentMessages: 4,
    };

    const msgs = [userMsg("Hi"), assistantMsg("Hello")];
    const result = await compressConversation(config, msgs);

    expect(result.compressed).toBe(false);
    expect(result.messages).toHaveLength(2);
    expect(result.originalCount).toBe(2);
    expect(result.compressedCount).toBe(2);
    expect(result.summaryTokens).toBe(0);
  });

  it("should not compress when message count <= keepRecentMessages", async () => {
    const config: CompressorConfig = {
      provider: mockProvider(),
      maxTokens: 10, // very low budget
      keepRecentMessages: 4,
    };

    const msgs = [userMsg("A"), assistantMsg("B")];
    const result = await compressConversation(config, msgs);
    expect(result.compressed).toBe(false);
  });

  it("should compress when over budget", async () => {
    const provider = mockProvider("Compressed summary.");
    const config: CompressorConfig = {
      provider,
      maxTokens: 100, // very tight budget
      keepRecentMessages: 2,
    };

    const msgs = buildConversation(10); // 20 messages, way over budget
    const result = await compressConversation(config, msgs);

    expect(result.compressed).toBe(true);
    expect(result.originalCount).toBe(20);
    // summary + 2 recent = 3
    expect(result.compressedCount).toBe(3);
    expect(result.summaryTokens).toBeGreaterThan(0);

    // First message should be the summary
    const firstContent = result.messages[0].content as string;
    expect(firstContent).toContain("[Previous conversation summary]");
    expect(firstContent).toContain("Compressed summary.");

    // Last messages should be the recent ones
    expect(result.messages[result.messages.length - 1]).toBe(
      msgs[msgs.length - 1]
    );
  });

  it("should call provider.chat for summarization", async () => {
    const provider = mockProvider("sum");
    const config: CompressorConfig = {
      provider,
      maxTokens: 10,
      keepRecentMessages: 2,
    };

    const msgs = buildConversation(5);
    await compressConversation(config, msgs);
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });
});

describe("needsCompression", () => {
  it("should return false for short conversations", () => {
    const msgs = [userMsg("Hi"), assistantMsg("Hello")];
    expect(needsCompression(msgs, 100000)).toBe(false);
  });

  it("should return true for long conversations", () => {
    const msgs = buildConversation(50); // very long
    expect(needsCompression(msgs, 100)).toBe(true);
  });

  it("should return false for empty conversation", () => {
    expect(needsCompression([], 1000)).toBe(false);
  });
});
