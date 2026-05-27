import { readFile, stat } from "fs/promises";
import type { Tool } from "../llm/types.js";

// Tool definition for LLM
export const readToolDefinition: Tool = {
  name: "read_file",
  description:
    "Read the contents of a file. Returns the file content with line numbers. " +
    "Use offset and limit to read specific portions of large files.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The absolute or relative path to the file to read",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (1-based, default: 1)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read (default: all)",
      },
    },
    required: ["file_path"],
  },
};

export interface ReadToolInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

// Maximum file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

// Check if content is likely binary
function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];
    // Null byte is a strong indicator of binary
    if (byte === 0) return true;
  }
  return false;
}

// Format file content with line numbers
function formatWithLineNumbers(
  content: string,
  offset: number
): string {
  const lines = content.split("\n");
  // Remove trailing empty line from split
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const maxLineNum = offset + lines.length - 1;
  const padWidth = String(maxLineNum).length;
  return lines
    .map((line, i) => {
      const lineNum = String(offset + i).padStart(padWidth, " ");
      return `${lineNum}\t${line}`;
    })
    .join("\n");
}

export async function executeReadTool(input: ReadToolInput): Promise<string> {
  const { file_path, offset = 1, limit } = input;

  // Validate offset
  if (offset < 1) {
    return "Error: offset must be >= 1";
  }

  // Check file exists and get size
  let fileStats;
  try {
    fileStats = await stat(file_path);
  } catch {
    return `Error: file not found: ${file_path}`;
  }

  if (!fileStats.isFile()) {
    return `Error: not a file: ${file_path}`;
  }

  if (fileStats.size > MAX_FILE_SIZE) {
    return `Error: file too large (${fileStats.size} bytes, max ${MAX_FILE_SIZE})`;
  }

  // Read file content
  let buffer: Buffer;
  try {
    buffer = await readFile(file_path);
  } catch (err) {
    return `Error: cannot read file: ${(err as Error).message}`;
  }

  // Binary check
  if (isBinary(buffer)) {
    return `Error: binary file detected: ${file_path}`;
  }

  const content = buffer.toString("utf-8");
  const allLines = content.split("\n");

  // Apply offset and limit
  const startIdx = offset - 1; // Convert to 0-based
  const endIdx = limit !== undefined ? startIdx + limit : allLines.length;
  const selectedLines = allLines.slice(startIdx, endIdx);

  if (selectedLines.length === 0) {
    return `(empty: file has ${allLines.length} lines, offset ${offset} is out of range)`;
  }

  return formatWithLineNumbers(selectedLines.join("\n"), offset);
}