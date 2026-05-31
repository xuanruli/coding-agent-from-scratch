import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as z from "zod";
import type { Tool } from "../llm/types.js";
import { toInputSchema } from "./schema.js";

export const writeInputSchema = z.object({
  file_path: z
    .string()
    .describe("The absolute or relative path to the file to write"),
  content: z.string().describe("The content to write to the file"),
});

export type WriteToolInput = z.infer<typeof writeInputSchema>;

export const writeToolDefinition: Tool = {
  name: "write_file",
  description:
    "Write content to a file. Creates the file if it doesn't exist, " +
    "or overwrites it if it does. Automatically creates parent directories.",
  inputSchema: toInputSchema(writeInputSchema),
};

// Generate a unified diff between old and new content
function generateDiff(
  oldContent: string,
  newContent: string,
  filePath: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const result: string[] = [];
  result.push(`--- a/${filePath}`);
  result.push(`+++ b/${filePath}`);

  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length);
  let hasChanges = false;
  const hunks: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      hunks.push(` ${oldLine}`);
    } else {
      hasChanges = true;
      if (oldLine !== undefined) hunks.push(`-${oldLine}`);
      if (newLine !== undefined) hunks.push(`+${newLine}`);
    }
  }

  if (!hasChanges) return "(no changes)";

  result.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
  result.push(...hunks);
  return result.join("\n");
}

export async function executeWriteTool(input: WriteToolInput): Promise<string> {
  const { file_path, content } = input;

  // Read existing content for diff (if file exists)
  let oldContent: string | null = null;
  try {
    oldContent = await readFile(file_path, "utf-8");
  } catch {
    // File doesn't exist yet — that's fine
  }

  // Create parent directories
  try {
    await mkdir(dirname(file_path), { recursive: true });
  } catch {
    // Directory already exists
  }

  // Write the file
  try {
    await writeFile(file_path, content, "utf-8");
  } catch (err) {
    return `Error: cannot write file: ${(err as Error).message}`;
  }

  // Build result message
  const lines = content.split("\n").length;
  if (oldContent === null) {
    return `Created ${file_path} (${lines} lines)`;
  }

  const diff = generateDiff(oldContent, content, file_path);
  return `Updated ${file_path} (${lines} lines)\n\n${diff}`;
}
