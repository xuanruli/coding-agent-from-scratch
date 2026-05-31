import { describe, expect, it, vi } from "vitest";
import type { AgentConfig, ToolExecutor } from "../src/agent.js";
import { runAgent } from "../src/agent.js";
import type { ChatResponse, LLMProvider, Tool } from "../src/llm/types.js";

// Helper to create a mock provider with predefined responses
function mockProvider(responses: ChatResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    chat: vi.fn(async () => responses[callIndex++]),
    stream: vi.fn(),
  } as unknown as LLMProvider;
}

// A simple test tool definition
const testTool: Tool = {
  name: "test_tool",
  description: "A test tool",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

const baseConfig = (
  provider: LLMProvider,
  executeTool?: ToolExecutor
): AgentConfig => ({
  provider,
  system: "You are a test assistant.",
  tools: [testTool],
  executeTool: executeTool ?? (async () => "tool result"),
});

describe("runAgent", () => {
  it("should return text when LLM responds without tool use", async () => {
    const provider = mockProvider([
      {
        content: [{ type: "text", text: "Hello!" }],
        text: "Hello!",
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const result = await runAgent(baseConfig(provider), "Hi");

    expect(result.text).toBe("Hello!");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.iterations).toBe(1);
  });

  it("should execute tool calls and continue the loop", async () => {
    const provider = mockProvider([
      // First response: LLM calls a tool
      {
        content: [
          { type: "text", text: "Let me check." },
          {
            type: "tool_use",
            id: "call_1",
            name: "test_tool",
            input: { query: "hello" },
          },
        ],
        text: "Let me check.",
        stopReason: "tool_use",
        usage: { inputTokens: 15, outputTokens: 10 },
      },
      // Second response: LLM finishes
      {
        content: [{ type: "text", text: "The result is ready." }],
        text: "The result is ready.",
        stopReason: "end_turn",
        usage: { inputTokens: 30, outputTokens: 8 },
      },
    ]);

    const executeTool = vi.fn(async () => "tool output");

    const result = await runAgent(
      baseConfig(provider, executeTool),
      "Check something"
    );

    expect(result.text).toBe("The result is ready.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("test_tool");
    expect(result.toolCalls[0].input).toEqual({ query: "hello" });
    expect(result.toolCalls[0].result).toBe("tool output");
    expect(result.iterations).toBe(2);
    expect(executeTool).toHaveBeenCalledWith("test_tool", { query: "hello" });
  });

  it("should accumulate token usage across iterations", async () => {
    const provider = mockProvider([
      {
        content: [
          {
            type: "tool_use",
            id: "c1",
            name: "test_tool",
            input: { query: "x" },
          },
        ],
        text: "",
        stopReason: "tool_use",
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      {
        content: [{ type: "text", text: "Final." }],
        text: "Final.",
        stopReason: "end_turn",
        usage: { inputTokens: 200, outputTokens: 30 },
      },
    ]);

    const result = await runAgent(baseConfig(provider), "Count tokens");

    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(80);
  });
});
