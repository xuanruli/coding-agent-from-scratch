import * as z from "zod";
import type { Message, Tool } from "./llm/types.js";
import { estimateMessageTokens, estimateTokens } from "./token-counter.js";
import { toInputSchema } from "./tools/schema.js";

/**
 * Agent Scratchpad — persistent working notes across iterations.
 *
 * The scratchpad lets the agent maintain structured notes (plan, findings,
 * decisions) that persist across conversation turns. It is injected into
 * each LLM call so the agent can stay on track without re-reading the
 * entire conversation.
 */
export class Scratchpad {
  private entries: Array<{ key: string; value: string }> = [];

  set(key: string, value: string): void {
    const idx = this.entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      this.entries[idx].value = value;
    } else {
      this.entries.push({ key, value });
    }
  }

  get(key: string): string | undefined {
    return this.entries.find((e) => e.key === key)?.value;
  }

  delete(key: string): boolean {
    const idx = this.entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      this.entries.splice(idx, 1);
      return true;
    }
    return false;
  }

  has(key: string): boolean {
    return this.entries.some((e) => e.key === key);
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * Format scratchpad as text to inject into the system prompt or
   * a user message.
   */
  format(): string {
    if (this.entries.length === 0) return "";
    const lines = this.entries.map((e) => `- **${e.key}**: ${e.value}`);
    return `## Scratchpad\n${lines.join("\n")}`;
  }

  get size(): number {
    return this.entries.length;
  }
}

// Tool input schemas (single source of truth for type + JSON Schema)
export const scratchpadSetInputSchema = z.object({
  key: z.string().describe("Note key (e.g. 'plan', 'findings')"),
  value: z.string().describe("Note content"),
});

export const scratchpadGetInputSchema = z.object({
  key: z.string().describe("Note key to read"),
});

export const scratchpadListInputSchema = z.object({});

// Scratchpad tool definitions for the agent
export const SCRATCHPAD_TOOLS: Tool[] = [
  {
    name: "scratchpad_set",
    description: "Save a note to the scratchpad. Use this to track your plan, findings, or decisions.",
    inputSchema: toInputSchema(scratchpadSetInputSchema),
  },
  {
    name: "scratchpad_get",
    description: "Read a note from the scratchpad by key.",
    inputSchema: toInputSchema(scratchpadGetInputSchema),
  },
  {
    name: "scratchpad_list",
    description: "List all scratchpad entries.",
    inputSchema: toInputSchema(scratchpadListInputSchema),
  },
];

/**
 * Execute a scratchpad tool call.
 */
export function executeScratchpadTool(
  scratchpad: Scratchpad,
  name: string,
  input: Record<string, unknown>
): string {
  switch (name) {
    case "scratchpad_set": {
      const key = input.key as string;
      const value = input.value as string;
      scratchpad.set(key, value);
      return `Saved "${key}" to scratchpad.`;
    }
    case "scratchpad_get": {
      const key = input.key as string;
      const value = scratchpad.get(key);
      return value ?? `No entry found for "${key}".`;
    }
    case "scratchpad_list":
      return scratchpad.format() || "Scratchpad is empty.";
    default:
      return `Unknown scratchpad tool: ${name}`;
  }
}

/**
 * Select messages using a sliding window strategy.
 *
 * Keeps the first message (usually the initial user request) and
 * the most recent N messages, dropping messages in between when
 * the total exceeds the token budget.
 */
export function selectMessages(
  messages: Message[],
  maxTokens: number
): Message[] {
  if (messages.length <= 2) return [...messages];

  // Always keep the first message
  const first = messages[0];
  const firstTokens = estimateMessageTokens(first);

  if (firstTokens >= maxTokens) return [first];

  // Fill from the end
  let budget = maxTokens - firstTokens;
  const tail: Message[] = [];

  for (let i = messages.length - 1; i >= 1; i--) {
    const tokens = estimateMessageTokens(messages[i]);
    if (tokens > budget) break;
    budget -= tokens;
    tail.unshift(messages[i]);
  }

  return [first, ...tail];
}

/**
 * Detect potential context poisoning — when a tool result contains
 * text that looks like it's trying to inject instructions.
 *
 * Returns suspicious patterns found, or empty array if clean.
 */
export function detectContextPoisoning(text: string): string[] {
  const patterns = [
    { pattern: /ignore (?:all )?(?:previous |above )?instructions/i, label: "instruction override" },
    { pattern: /you are now/i, label: "role hijacking" },
    { pattern: /system:\s/i, label: "system prompt injection" },
    { pattern: /\bdo not\b.*\btool/i, label: "tool suppression" },
    { pattern: /<\/?(?:system|instruction|prompt)>/i, label: "fake XML tags" },
  ];

  const found: string[] = [];
  for (const { pattern, label } of patterns) {
    if (pattern.test(text)) {
      found.push(label);
    }
  }
  return found;
}