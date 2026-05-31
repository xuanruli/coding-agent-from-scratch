import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";
import * as z from "zod";
import type { Tool } from "../llm/types.js";
import { toInputSchema } from "./schema.js";

export const grepInputSchema = z.object({
  pattern: z.string().describe("The regex pattern to search for"),
  path: z
    .string()
    .optional()
    .describe("File or directory to search in (default: current directory)"),
  include: z
    .string()
    .optional()
    .describe('Glob filter for file names (e.g. "*.ts", "*.py")'),
});

export type GrepToolInput = z.infer<typeof grepInputSchema>;

// Tool definition for LLM
export const grepToolDefinition: Tool = {
  name: "grep",
  description:
    "Search file contents for a pattern (regex supported). " +
    "Returns matching lines with file paths and line numbers.",
  inputSchema: toInputSchema(grepInputSchema),
};

const MAX_MATCHES = 100;
const MAX_FILE_SIZE = 512 * 1024; // 512KB

// Directories to skip
const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "dist", "build",
  ".next", ".cache", "coverage",
]);

// Simple glob to regex for file name matching
function fileGlobToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

// Search a single file for the pattern
async function searchFile(
  filePath: string,
  relPath: string,
  regex: RegExp,
  matches: GrepMatch[]
): Promise<void> {
  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    return;
  }
  if (fileStats.size > MAX_FILE_SIZE) return;

  let content: string;
  try {
    const buf = await readFile(filePath);
    // Quick binary check
    if (buf.includes(0)) return;
    content = buf.toString("utf-8");
  } catch {
    return;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (matches.length >= MAX_MATCHES) return;
    if (regex.test(lines[i])) {
      matches.push({ file: relPath, line: i + 1, text: lines[i] });
    }
  }
}

// Recursively walk and search files
async function walkAndSearch(
  dir: string,
  baseDir: string,
  regex: RegExp,
  fileFilter: RegExp | null,
  matches: GrepMatch[]
): Promise<void> {
  if (matches.length >= MAX_MATCHES) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (matches.length >= MAX_MATCHES) return;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkAndSearch(fullPath, baseDir, regex, fileFilter, matches);
    } else if (entry.isFile()) {
      if (fileFilter && !fileFilter.test(entry.name)) continue;
      const relPath = relative(baseDir, fullPath);
      await searchFile(fullPath, relPath, regex, matches);
    }
  }
}

export async function executeGrepTool(input: GrepToolInput): Promise<string> {
  const { pattern, path: searchPath = ".", include } = input;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    return `Error: invalid regex pattern: ${(err as Error).message}`;
  }

  const fileFilter = include ? fileGlobToRegex(include) : null;

  // Check if path is a single file or directory
  let pathStats;
  try {
    pathStats = await stat(searchPath);
  } catch {
    return `Error: path not found: ${searchPath}`;
  }

  const matches: GrepMatch[] = [];

  if (pathStats.isFile()) {
    await searchFile(searchPath, searchPath, regex, matches);
  } else if (pathStats.isDirectory()) {
    await walkAndSearch(searchPath, searchPath, regex, fileFilter, matches);
  } else {
    return `Error: invalid path: ${searchPath}`;
  }

  if (matches.length === 0) {
    return `No matches for "${pattern}"`;
  }

  let output = matches
    .map((m) => `${m.file}:${m.line}: ${m.text}`)
    .join("\n");

  if (matches.length >= MAX_MATCHES) {
    output += `\n\n(showing first ${MAX_MATCHES} matches)`;
  }

  return output;
}