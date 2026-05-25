import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../src/llm/anthropic.js";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible.js";
import { createProvider } from "../src/llm/factory.js";
import type { Message } from "../src/llm/types.js";

// ── AnthropicProvider ──

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Hello from Claude!" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      };
    },
  };
});

vi.mock("openai", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: { role: "assistant", content: "Hello from GPT!" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        },
      };
    },
  };
});

describe("AnthropicProvider", () => {
  it("should send a message and return a ChatResponse", async () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const response = await provider.chat(messages);

    expect(response.text).toBe("Hello from Claude!");
    expect(response.stopReason).toBe("end_turn");
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("should pass system prompt and maxTokens", async () => {
    const provider = new AnthropicProvider({
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
    });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    await provider.chat(messages, {
      system: "You are helpful.",
      maxTokens: 1024,
    });

    const mockCreate = (provider as any).client.messages.create;
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toBe("You are helpful.");
    expect(callArgs.max_tokens).toBe(1024);
    expect(callArgs.model).toBe("claude-haiku-4-5-20251001");
  });
});

// ── OpenAICompatibleProvider ──

describe("OpenAICompatibleProvider", () => {
  it("should send a message and return a ChatResponse", async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const response = await provider.chat(messages);

    expect(response.text).toBe("Hello from GPT!");
    expect(response.stopReason).toBe("end_turn");
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("should prepend system message", async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const messages: Message[] = [{ role: "user", content: "Hi" }];
    await provider.chat(messages, { system: "Be helpful." });

    const mockCreate = (provider as any).client.chat.completions.create;
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({
      role: "system",
      content: "Be helpful.",
    });
  });
});

// ── Factory ──

describe("createProvider", () => {
  it("should create AnthropicProvider", () => {
    const p = createProvider({ provider: "anthropic", apiKey: "key" });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it("should create OpenAICompatibleProvider", () => {
    const p = createProvider({
      provider: "openai-compatible",
      apiKey: "key",
      baseURL: "https://api.example.com",
      model: "model-1",
    });
    expect(p).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("should throw if baseURL missing for openai-compatible", () => {
    expect(() =>
      createProvider({
        provider: "openai-compatible",
        apiKey: "key",
        model: "m",
      })
    ).toThrow("baseURL");
  });

  it("should throw if model missing for openai-compatible", () => {
    expect(() =>
      createProvider({
        provider: "openai-compatible",
        apiKey: "key",
        baseURL: "https://api.example.com",
      })
    ).toThrow("model");
  });

  it("should throw for unknown provider", () => {
    expect(() =>
      createProvider({ provider: "unknown" as any, apiKey: "key" })
    ).toThrow();
  });
});