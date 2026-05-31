import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import * as z from "zod";
import type { Tool } from "../llm/types.js";
import { toInputSchema } from "./schema.js";

export const globInputSchema = z.object({
  pattern: z
    .string()
    .describe('The pattern to match files against (e.g. "*.ts", "src/**/*.py")'),
  path: z
    .string()
    .optional()
    .describe("The directory to search in (default: current directory)"),
});

export type GlobToolInput = z.infer<typeof globInputSchema>;

// Tool definition for LLM
export const globToolDefinition: Tool = {
  name: "glob",
  description:
    "Find files matching a glob-like pattern. " +
    "Searches recursively from the given directory. " +
    "Returns matching file paths sorted alphabetically.",
  inputSchema: toInputSchema(globInputSchema),
};

const MAX_RESULTS = 200;

// Directories to always skip
const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "dist", "build",
  ".next", ".cache", "coverage",
]);

// Convert a simple glob pattern to a RegExp
function globToRegex(pattern: string): RegExp {
  // Replace ** with a placeholder, then handle * and ?
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(`^${regexStr}$`);
}

// Recursively walk directory and collect files
async function walkDir(
  dir: string,
  baseDir: string,
  regex: RegExp,
  results: string[]
): Promise<void> {
  if (results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkDir(join(dir, entry.name), baseDir, regex, results);
    } else if (entry.isFile()) {
      const relPath = relative(baseDir, join(dir, entry.name));
      if (regex.test(relPath)) {
        results.push(relPath);
      }
    }
  }
}

export async function executeGlobTool(input: GlobToolInput): Promise<string> {
  const { pattern, path: searchPath = "." } = input;

  // Verify search path exists
  try {
    const s = await stat(searchPath);
    if (!s.isDirectory()) {
      return `Error: not a directory: ${searchPath}`;
    }
  } catch {
    return `Error: directory not found: ${searchPath}`;
  }

  const regex = globToRegex(pattern);
  const results: string[] = [];
  await walkDir(searchPath, searchPath, regex, results);

  results.sort();

  if (results.length === 0) {
    return `No files matching "${pattern}" found in ${searchPath}`;
  }

  let output = results.join("\n");
  if (results.length >= MAX_RESULTS) {
    output += `\n\n(showing first ${MAX_RESULTS} matches)`;
  }
  return output;
}