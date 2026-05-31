import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../src/llm/anthropic.js";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible.js";
import {
  extractText,
  extractToolUses,
  createToolResult,
} from "../src/llm/helpers.js";
import type { Message, Tool, ContentBlock } from "../src/llm/types.js";

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        create: vi.fn(),
        stream: vi.fn(),
      };
    },
  };
});

// Mock OpenAI SDK
vi.mock("openai", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
    },
  };
});

const testTool: Tool = {
  name: "read_file",
  description: "Read a file",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
};

// ── Anthropic with Tools ──

describe("AnthropicProvider with tools", () => {
  it("should send tool definitions and parse tool_use response", async () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const mockCreate = (provider as any).client.messages.create;
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Let me read that file." },
        {
          type: "tool_use",
          id: "call_123",
          name: "read_file",
          input: { path: "/src/main.ts" },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const messages: Message[] = [{ role: "user", content: "Read main.ts" }];
    const response = await provider.chat(messages, { tools: [testTool] });

    expect(response.stopReason).toBe("tool_use");
    expect(response.content).toHaveLength(2);
    expect(response.content[0]).toEqual({
      type: "text",
      text: "Let me read that file.",
    });
    expect(response.content[1]).toEqual({
      type: "tool_use",
      id: "call_123",
      name: "read_file",
      input: { path: "/src/main.ts" },
    });

    // Verify tools were sent
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools[0].name).toBe("read_file");
  });

  it("should format messages with ContentBlock[] content", async () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const mockCreate = (provider as any).client.messages.create;
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Done." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 30, output_tokens: 5 },
    });

    const messages: Message[] = [
      { role: "user", content: "Read main.ts" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Reading..." },
          {
            type: "tool_use",
            id: "call_123",
            name: "read_file",
            input: { path: "/src/main.ts" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            toolUseId: "call_123",
            content: "console.log('hello');",
          },
        ],
      },
    ];

    await provider.chat(messages);

    const callArgs = mockCreate.mock.calls[0][0];
    const assistantMsg = callArgs.messages[1];
    expect(assistantMsg.content).toEqual([
      { type: "text", text: "Reading..." },
      {
        type: "tool_use",
        id: "call_123",
        name: "read_file",
        input: { path: "/src/main.ts" },
      },
    ]);

    const userMsg = callArgs.messages[2];
    expect(userMsg.content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "call_123",
        content: "console.log('hello');",
      },
    ]);
  });
});

// ── OpenAI Compatible with Tools ──

describe("OpenAICompatibleProvider with tools", () => {
  it("should convert tools to function format and parse response", async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const mockCreate = (provider as any).client.chat.completions.create;
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Let me read that.",
            tool_calls: [
              {
                id: "call_456",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: '{"path":"/src/main.ts"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 15 },
    });

    const messages: Message[] = [{ role: "user", content: "Read main.ts" }];
    const response = await provider.chat(messages, { tools: [testTool] });

    expect(response.stopReason).toBe("tool_use");
    expect(response.content).toHaveLength(2);
    expect(response.content[0]).toEqual({
      type: "text",
      text: "Let me read that.",
    });
    expect(response.content[1]).toEqual({
      type: "tool_use",
      id: "call_456",
      name: "read_file",
      input: { path: "/src/main.ts" },
    });
  });

  it("should format messages with tool result content blocks", async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const mockCreate = (provider as any).client.chat.completions.create;
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { role: "assistant", content: "The file contains hello." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
    });

    const messages: Message[] = [
      { role: "user", content: "Read main.ts" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Reading..." },
          {
            type: "tool_use",
            id: "call_456",
            name: "read_file",
            input: { path: "/src/main.ts" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            toolUseId: "call_456",
            content: "console.log('hello');",
          },
        ],
      },
    ];

    await provider.chat(messages);

    const callArgs = mockCreate.mock.calls[0][0];
    // Assistant message should have tool_calls
    const assistantMsg = callArgs.messages[1];
    expect(assistantMsg.tool_calls).toBeDefined();
    expect(assistantMsg.tool_calls[0].function.name).toBe("read_file");

    // Tool result should be role: "tool"
    const toolMsg = callArgs.messages[2];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("call_456");
  });
});

// ── Helper Functions ──

describe("Helper functions", () => {
  it("extractText should join text from text blocks", () => {
    const content: ContentBlock[] = [
      { type: "text", text: "Hello " },
      { type: "tool_use", id: "1", name: "test", input: {} },
      { type: "text", text: "world" },
    ];
    expect(extractText(content)).toBe("Hello world");
  });

  it("extractText should return empty string for no text blocks", () => {
    const content: ContentBlock[] = [
      { type: "tool_use", id: "1", name: "test", input: {} },
    ];
    expect(extractText(content)).toBe("");
  });

  it("extractToolUses should filter tool_use blocks", () => {
    const content: ContentBlock[] = [
      { type: "text", text: "Hello" },
      { type: "tool_use", id: "1", name: "read_file", input: { path: "a.ts" } },
      { type: "tool_use", id: "2", name: "write_file", input: { path: "b.ts" } },
    ];
    const tools = extractToolUses(content);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("read_file");
    expect(tools[1].name).toBe("write_file");
  });

  it("createToolResult should create a ToolResultBlock", () => {
    const result = createToolResult("call_1", "file contents");
    expect(result).toEqual({
      type: "tool_result",
      toolUseId: "call_1",
      content: "file contents",
    });
  });

  it("createToolResult should support isError flag", () => {
    const result = createToolResult("call_1", "not found", true);
    expect(result).toEqual({
      type: "tool_result",
      toolUseId: "call_1",
      content: "not found",
      isError: true,
    });
  });
});