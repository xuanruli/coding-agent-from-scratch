import type { ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock } from "./types.js";

export function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function extractToolUses(content: ContentBlock[]): ToolUseBlock[] {
  return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

export function createToolResult(
  toolUseId: string,
  content: string,
  isError = false
): ToolResultBlock {
  return { type: "tool_result", toolUseId, content, ...(isError ? { isError: true } : {}) };
}