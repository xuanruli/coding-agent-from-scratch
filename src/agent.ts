import {
  createToolResult,
  extractText,
  extractToolUses,
} from "./llm/helpers.js";
import type { ContentBlock, LLMProvider, Message, Tool } from "./llm/types.js";

// Function that executes a tool by name and returns the result string
export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>
) => Promise<string>;

// Configuration for the agent loop
export interface AgentConfig {
  provider: LLMProvider;
  system: string;
  tools: Tool[];
  executeTool: ToolExecutor;
  maxIterations?: number;
  maxTokens?: number;
  parallelToolCalls?: boolean;
}

// Record of a single tool call during the agent loop
export interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

// Result returned after the agent loop completes
export interface AgentResult {
  text: string;
  toolCalls: ToolCallRecord[];
  iterations: number;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Run the agent loop: send user message to LLM, execute tool calls,
 * feed results back, repeat until LLM stops calling tools.
 */
export async function runAgent(
  config: AgentConfig,
  userMessage: string
): Promise<AgentResult> {
  const {
    provider,
    system,
    tools,
    executeTool,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    maxTokens,
    parallelToolCalls = false,
  } = config;

  const messages: Message[] = [{ role: "user", content: userMessage }];
  const toolCalls: ToolCallRecord[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let i = 0; i < maxIterations; i++) {
    const response = await provider.chat(messages, {
      system,
      tools,
      maxTokens,
    });

    totalInput += response.usage.inputTokens;
    totalOutput += response.usage.outputTokens;

    // If LLM did not request tool use, we are done
    if (response.stopReason !== "tool_use") {
      return {
        text: extractText(response.content),
        toolCalls,
        iterations: i + 1,
        inputTokens: totalInput,
        outputTokens: totalOutput,
      };
    }

    // Extract tool use blocks and add assistant message to history
    const uses = extractToolUses(response.content);
    messages.push({ role: "assistant", content: response.content });

    // Execute tool calls (parallel or sequential)
    let results: ContentBlock[];

    if (parallelToolCalls && uses.length > 1) {
      // Execute all tool calls concurrently
      const settled = await Promise.all(
        uses.map(async (use) => {
          const result = await executeTool(use.name, use.input);
          return { use, result };
        })
      );
      results = settled.map(({ use, result }) => {
        toolCalls.push({ name: use.name, input: use.input, result });
        return createToolResult(use.id, result);
      });
    } else {
      // Execute tool calls one at a time
      results = [];
      for (const use of uses) {
        const result = await executeTool(use.name, use.input);
        toolCalls.push({ name: use.name, input: use.input, result });
        results.push(createToolResult(use.id, result));
      }
    }

    // Add tool results as user message
    messages.push({ role: "user", content: results });
  }

  // Max iterations reached without LLM finishing
  return {
    text: "(max iterations reached)",
    toolCalls,
    iterations: maxIterations,
    inputTokens: totalInput,
    outputTokens: totalOutput,
  };
}
