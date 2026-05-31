import { spawn } from "node:child_process";
import * as z from "zod";
import type { Tool } from "../llm/types.js";
import { toInputSchema } from "./schema.js";

export const bashInputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Timeout in milliseconds (default: 30000)"),
});

export type BashToolInput = z.infer<typeof bashInputSchema>;

// Tool definition for LLM
export const bashToolDefinition: Tool = {
  name: "bash",
  description:
    "Execute a bash command and return its output. " +
    "Use this to run shell commands, scripts, or system utilities.",
  inputSchema: toInputSchema(bashInputSchema),
};

const DEFAULT_TIMEOUT = 30_000; // 30 seconds
const MAX_OUTPUT_SIZE = 100_000; // 100KB

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_SIZE) return output;
  const half = Math.floor(MAX_OUTPUT_SIZE / 2);
  return `${output.slice(0, half)}\n\n... (truncated) ...\n\n${output.slice(-half)}`;
}

export function executeBashTool(input: BashToolInput): Promise<string> {
  const { command, timeout = DEFAULT_TIMEOUT } = input;

  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], {
      timeout,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      resolve(`Error: failed to execute command: ${err.message}`);
    });

    child.on("close", (code, signal) => {
      const parts: string[] = [];

      if (stdout.trim()) {
        parts.push(truncateOutput(stdout.trim()));
      }
      if (stderr.trim()) {
        parts.push(`STDERR:\n${truncateOutput(stderr.trim())}`);
      }

      if (signal === "SIGTERM") {
        parts.push(`\nError: command timed out after ${timeout}ms`);
      } else if (code !== 0) {
        parts.push(`\nExit code: ${code}`);
      }

      resolve(parts.join("\n") || "(no output)");
    });
  });
}
