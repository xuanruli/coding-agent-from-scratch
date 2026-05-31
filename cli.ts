/**
 * CLI entry point — ties together all 20 chapters into a working agent.
 *
 * Configurable via environment variables:
 *   AGENT_NAME   — display name shown in banner and prompt (default: "AI Coding")
 *   AGENT_ICON   — emoji icon for banner and prompt (default: "🤖")
 *   OPENAI_API_KEY / DEEPSEEK_API_KEY — LLM API key (required)
 *   LLM_BASE_URL — API base URL (default: https://api.openai.com/v1)
 *   LLM_MODEL    — model name (default: gpt-4o-mini)
 */
import * as os from "node:os";
import { createProvider } from "./src/llm/factory.js";
import { runAgent } from "./src/agent.js";
import type { AgentConfig } from "./src/agent.js";
import { TaskManager, executeTaskTool, TASK_TOOLS } from "./src/task.js";
import { RetryProvider, safeToolExecutor } from "./src/error.js";
import { SystemPromptBuilder } from "./src/system-prompt.js";
import { Scratchpad, SCRATCHPAD_TOOLS, executeScratchpadTool } from "./src/context.js";
import { renderMarkdown } from "./src/markdown.js";
import { Spinner, formatToolCycle } from "./src/tool-display.js";
import { FileSystemSandbox, checkDangerousCommand, readProjectConfig } from "./src/safety.js";
import { runRepl } from "./src/repl.js";
import {
  readToolDefinition, executeReadTool, type ReadToolInput,
  writeToolDefinition, executeWriteTool, type WriteToolInput,
  bashToolDefinition, executeBashTool, type BashToolInput,
  globToolDefinition, executeGlobTool, type GlobToolInput,
  grepToolDefinition, executeGrepTool, type GrepToolInput,
} from "./src/tools/index.js";
import type { Tool } from "./src/llm/types.js";

// ── Configuration ──────────────────────────────────────────
const AGENT_NAME = process.env.AGENT_NAME ?? "AI Coding";
const AGENT_ICON = process.env.AGENT_ICON ?? "🤖";
const API_KEY = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";
const PROJECT_DIR = process.cwd();

if (!API_KEY) {
  console.error("Error: Set DEEPSEEK_API_KEY or OPENAI_API_KEY environment variable.");
  process.exit(1);
}

// ── LLM Provider (Ch01 + Ch12 retry) ──────────────────────
const baseProvider = createProvider({
  provider: "openai-compatible",
  apiKey: API_KEY,
  baseURL: BASE_URL,
  model: MODEL,
});
const provider = new RetryProvider(baseProvider, {
  maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5000,
});

// ── Tools (Ch05-08 + Ch11 + Ch15) ─────────────────────────
const taskManager = new TaskManager();
const scratchpad = new Scratchpad();

const allTools: Tool[] = [
  readToolDefinition, writeToolDefinition, bashToolDefinition,
  globToolDefinition, grepToolDefinition,
  ...TASK_TOOLS,
  ...SCRATCHPAD_TOOLS,
];

// ── Safety (Ch20) ──────────────────────────────────────────
const sandbox = new FileSystemSandbox([PROJECT_DIR, os.tmpdir()]);

// ── Tool Executor (Ch09 + Ch12 + Ch19 + Ch20) ─────────────
async function rawExecutor(name: string, input: Record<string, unknown>): Promise<string> {
  if (name.startsWith("task_")) return executeTaskTool(taskManager, name, input);
  if (name.startsWith("scratchpad_")) return executeScratchpadTool(scratchpad, name, input);

  if (name === "read_file" || name === "write_file") {
    const filePath = input.file_path as string;
    const blocked = sandbox.check(filePath);
    if (blocked) return blocked;
  }

  if (name === "bash") {
    const command = input.command as string;
    const danger = checkDangerousCommand(command);
    if (danger) return `⚠️ Blocked: ${danger}. This command requires user confirmation.`;
  }

  const spinner = new Spinner(`${name}...`);
  spinner.start();
  const start = performance.now();

  try {
    let result: string;
    switch (name) {
      case "read_file": result = await executeReadTool(input as unknown as ReadToolInput); break;
      case "write_file": result = await executeWriteTool(input as unknown as WriteToolInput); break;
      case "bash": result = await executeBashTool(input as unknown as BashToolInput); break;
      case "glob": result = await executeGlobTool(input as unknown as GlobToolInput); break;
      case "grep": result = await executeGrepTool(input as unknown as GrepToolInput); break;
      default: result = `Error: unknown tool "${name}"`;
    }

    const ms = performance.now() - start;
    spinner.succeed(`${name} [${Math.round(ms)}ms]`);
    return result;
  } catch (err) {
    spinner.fail(`${name} failed`);
    throw err;
  }
}

const knownTools = new Set(allTools.map((t) => t.name));
const executeTool = safeToolExecutor(rawExecutor, knownTools);

// ── System Prompt (Ch13 + Ch20) ────────────────────────────
const projectConfig = readProjectConfig(PROJECT_DIR);
const promptBuilder = new SystemPromptBuilder()
  .setRole(
    "You are a coding assistant. Help the user with software engineering tasks " +
    "by reading files, writing code, and running commands. Be concise and accurate."
  )
  .addRules([
    "Always read a file before modifying it.",
    "Explain what you are about to do before using tools.",
    "If a task is complex, break it into steps using task tools.",
    "Never execute destructive commands without confirmation.",
    "Use the scratchpad to track your plan and findings.",
  ])
  .addToolGuide(allTools)
  .setOutputConstraints(
    "Respond in the user's language. Use markdown for code blocks. Keep explanations brief."
  );

if (projectConfig) {
  promptBuilder.addSection("Project Instructions", projectConfig, 90);
}

const systemPrompt = promptBuilder.build();

// ── Banner ─────────────────────────────────────────────────
const W = 58;
const RC = "\x1b[38;5;204m";
const RB = "\x1b[1;38;5;204m";
const GY = "\x1b[38;5;247m";
const PK = "\x1b[38;5;218m";
const XX = "\x1b[0m";

function dw(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0xFFFF) w += 2;
    else w += 1;
  }
  return w;
}

function row(text: string, ...colorParts: string[]): string {
  const pad = " ".repeat(W - dw(text));
  const inner = colorParts.join("") + pad + RC;
  return `║${inner}║`;
}

function showBanner(): void {
  let cwd = PROJECT_DIR;
  if (cwd.length > 40) cwd = "..." + cwd.slice(-37);

  const title = `     ${AGENT_ICON}  ${AGENT_NAME}`;
  const subtitle = "     Your AI Coding Assistant";

  const border = "═".repeat(W);
  const blank = row("", "");

  console.log(`
${RC}╔${border}╗
${blank}
${row(title, `     ${AGENT_ICON}  `, RB, AGENT_NAME, XX, RC)}
${blank}
${row(subtitle, GY, subtitle)}
${blank}
${row(`     Model:  ${MODEL}`, GY, "     Model:  ", PK, MODEL)}
${row(`     Dir:    ${cwd}`, GY, "     Dir:    ", PK, cwd)}
${blank}
${row("     Type /help for commands · /exit to quit", GY, "     Type ", PK, "/help", GY, " for commands · ", PK, "/exit", GY, " to quit")}
${blank}
╚${border}╝${XX}
`);
}

// ── REPL (Ch17) ────────────────────────────────────────────
const promptStr = `${RC}${AGENT_ICON} > ${XX}`;

// ── Main ───────────────────────────────────────────────────
export async function main(): Promise<void> {
  showBanner();
  await runRepl({
    prompt: promptStr,
    commands: [
      { name: "/tasks", description: "Show current tasks", execute: () => taskManager.formatForLLM() || "No tasks." },
      { name: "/notes", description: "Show scratchpad", execute: () => scratchpad.format() || "Scratchpad is empty." },
      { name: "/reset", description: "Clear tasks and scratchpad", execute: () => { taskManager.clear(); scratchpad.clear(); return "Cleared."; } },
    ],
    onInput: async (input: string) => {
      const config: AgentConfig = {
        provider,
        system: systemPrompt,
        tools: allTools,
        executeTool,
        maxIterations: 50,
        maxTokens: 4096,
        parallelToolCalls: true,
      };

      const result = await runAgent(config, input);
      return renderMarkdown(result.text);
    },
  });
}