import { describe, it, expect, vi } from "vitest";
import { runAgent } from "../src/agent.js";
import type { ToolExecutor } from "../src/agent.js";
import type { LLMProvider, ChatResponse, Tool, ContentBlock } from "../src/llm/types.js";

function mockProvider(responses: ChatResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    chat: vi.fn(async () => responses[callIndex++]),
    stream: vi.fn(),
  } as unknown as LLMProvider;
}

const testTool: Tool = {
  name: "test_tool",
  description: "A test tool",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

it("should execute multiple tool calls concurrently when enabled", async () => {
    const provider = mockProvider([
      {
        content: [
          { type: "tool_use", id: "c1", name: "test_tool", input: { query: "a" } },
          { type: "tool_use", id: "c2", name: "test_tool", input: { query: "b" } },
          { type: "tool_use", id: "c3", name: "test_tool", input: { query: "c" } },
        ],
        text: "",
        stopReason: "tool_use",
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [{ type: "text", text: "All done." }],
        text: "All done.",
        stopReason: "end_turn",
        usage: { inputTokens: 20, outputTokens: 5 },
      },
    ]);
  
    // Track execution order via timestamps
    const startTimes: number[] = [];
    const executeTool: ToolExecutor = async (_name, input) => {
      startTimes.push(Date.now());
      // Simulate async work
      await new Promise((r) => setTimeout(r, 50));
      return `result-${input.query}`;
    };
  
    const result = await runAgent(
      {
        provider,
        system: "test",
        tools: [testTool],
        executeTool,
        parallelToolCalls: true,
      },
      "Do three things"
    );
  
    expect(result.toolCalls).toHaveLength(3);
    expect(result.toolCalls[0].result).toBe("result-a");
    expect(result.toolCalls[1].result).toBe("result-b");
    expect(result.toolCalls[2].result).toBe("result-c");
  
    // All three should start within a small window (parallel)
    const span = Math.max(...startTimes) - Math.min(...startTimes);
    expect(span).toBeLessThan(30); // All started nearly simultaneously
  });


  it("should execute sequentially when parallel is disabled", async () => {
    const provider = mockProvider([
      {
        content: [
          { type: "tool_use", id: "c1", name: "test_tool", input: { query: "a" } },
          { type: "tool_use", id: "c2", name: "test_tool", input: { query: "b" } },
        ],
        text: "",
        stopReason: "tool_use",
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [{ type: "text", text: "Done." }],
        text: "Done.",
        stopReason: "end_turn",
        usage: { inputTokens: 20, outputTokens: 5 },
      },
    ]);
  
    const startTimes: number[] = [];
    const executeTool: ToolExecutor = async (_name, input) => {
      startTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return `result-${input.query}`;
    };
  
    await runAgent(
      {
        provider,
        system: "test",
        tools: [testTool],
        executeTool,
        parallelToolCalls: false,
      },
      "Do two things"
    );
  
    // Sequential: second should start after first finishes (~50ms gap)
    expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(40);
  });

  it("should preserve result order matching tool call order", async () => {
    const provider = mockProvider([
      {
        content: [
          { type: "tool_use", id: "c1", name: "test_tool", input: { query: "slow" } },
          { type: "tool_use", id: "c2", name: "test_tool", input: { query: "fast" } },
        ],
        text: "",
        stopReason: "tool_use",
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [{ type: "text", text: "OK" }],
        text: "OK",
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);
  
    // First call takes longer than second
    const executeTool: ToolExecutor = async (_name, input) => {
      const delay = input.query === "slow" ? 80 : 10;
      await new Promise((r) => setTimeout(r, delay));
      return `done-${input.query}`;
    };
  
    const result = await runAgent(
      {
        provider,
        system: "test",
        tools: [testTool],
        executeTool,
        parallelToolCalls: true,
      },
      "Order test"
    );
  
    // Results should match tool call order, not completion order
    expect(result.toolCalls[0].result).toBe("done-slow");
    expect(result.toolCalls[1].result).toBe("done-fast");
  
    // Tool results sent to LLM should also be in order
    const secondCallMessages = (provider.chat as ReturnType<typeof vi.fn>).mock
      .calls[1][0];
    const toolResults = secondCallMessages[2].content;
    expect(toolResults[0].toolUseId).toBe("c1");
    expect(toolResults[1].toolUseId).toBe("c2");
  });


  it("should fall back to sequential for single tool call even if parallel enabled", async () => {
    const provider = mockProvider([
      {
        content: [
          { type: "tool_use", id: "c1", name: "test_tool", input: { query: "only" } },
        ],
        text: "",
        stopReason: "tool_use",
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [{ type: "text", text: "OK" }],
        text: "OK",
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);
  
    const executeTool = vi.fn(async () => "result");
  
    const result = await runAgent(
      {
        provider,
        system: "test",
        tools: [testTool],
        executeTool,
        parallelToolCalls: true,
      },
      "Single tool"
    );
  
    expect(result.toolCalls).toHaveLength(1);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });