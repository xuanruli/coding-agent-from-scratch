import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../src/llm/anthropic.js";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible.js";
import type { Message, StreamEvent } from "../src/llm/types.js";

// Helper to create async iterable from array
async function* asyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

// Helper to collect all events from stream
async function collectEvents(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

// ── Anthropic Streaming ──

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        create: vi.fn(),
        stream: vi.fn().mockReturnValue(
          asyncIterable([
            { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
            { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
          ])
        ),
      };
    },
  };
});

vi.mock("openai", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue(
            asyncIterable([
              { choices: [{ delta: { content: "Hello" } }] },
              { choices: [{ delta: { content: " world" } }] },
            ])
          ),
        },
      };
    },
  };
});

describe("AnthropicProvider streaming", () => {
  it("should yield message_start, text_delta events, and message_stop", async () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const events = await collectEvents(provider.stream(messages));

    expect(events[0].type).toBe("message_start");
    expect(events[1]).toEqual({ type: "text_delta", text: "Hello" });
    expect(events[2]).toEqual({ type: "text_delta", text: " world" });
    expect(events[events.length - 1].type).toBe("message_stop");
  });

  it("should produce full text from text_delta events", async () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    let fullText = "";
    for await (const event of provider.stream(messages)) {
      if (event.type === "text_delta" && event.text) fullText += event.text;
    }
    expect(fullText).toBe("Hello world");
  });
});

describe("OpenAICompatibleProvider streaming", () => {
  it("should yield message_start, text_delta events, and message_stop", async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const events = await collectEvents(provider.stream(messages));

    expect(events[0].type).toBe("message_start");
    expect(events[1]).toEqual({ type: "text_delta", text: "Hello" });
    expect(events[2]).toEqual({ type: "text_delta", text: " world" });
    expect(events[events.length - 1].type).toBe("message_stop");
  });

  it("should produce full text from text_delta events", async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    let fullText = "";
    for await (const event of provider.stream(messages)) {
      if (event.type === "text_delta" && event.text) fullText += event.text;
    }
    expect(fullText).toBe("Hello world");
  });
});