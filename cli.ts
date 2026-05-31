/**
 * CLI entry point — ties together all 20 chapters into a working agent.
 *
 * Configurable via environment variables:
 *   AGENT_NAME   — display name shown in banner and prompt (default: "AI Coding")
 *   OPENAI_API_KEY / DEEPSEEK_API_KEY — LLM API key (required)
 *   LLM_BASE_URL — API base URL (default: https://api.openai.com/v1)
 *   LLM_MODEL    — model name (default: gpt-4o-mini)
 */
import * as os from "node:os";
import type * as z from "zod";
import type { AgentConfig } from "./src/agent.js";
import { runAgent } from "./src/agent.js";
import {
  executeScratchpadTool,
  SCRATCHPAD_TOOLS,
  Scratchpad,
  scratchpadGetInputSchema,
  scratchpadListInputSchema,
  scratchpadSetInputSchema,
} from "./src/context.js";
import { RetryProvider, safeToolExecutor } from "./src/error.js";
import { createProvider } from "./src/llm/factory.js";
import type { Tool } from "./src/llm/types.js";
import {
  checkDangerousCommand,
  FileSystemSandbox,
  readProjectConfig,
} from "./src/safety.js";
import { SystemPromptBuilder } from "./src/system-prompt.js";
import {
  executeTaskTool,
  TASK_TOOLS,
  TaskManager,
  taskCreateInputSchema,
  taskListInputSchema,
  taskUpdateInputSchema,
} from "./src/task.js";
import {
  type BashToolInput,
  bashInputSchema,
  bashToolDefinition,
  executeBashTool,
  executeGlobTool,
  executeGrepTool,
  executeReadTool,
  executeWriteTool,
  type GlobToolInput,
  type GrepToolInput,
  globInputSchema,
  globToolDefinition,
  grepInputSchema,
  grepToolDefinition,
  type ReadToolInput,
  readInputSchema,
  readToolDefinition,
  validateToolInput,
  type WriteToolInput,
  writeInputSchema,
  writeToolDefinition,
} from "./src/tools/index.js";
import {
  type CommandPanel,
  runInkApp,
  type SlashCommand,
} from "./src/tui/app.js";

// ── Configuration ──────────────────────────────────────────
const AGENT_NAME = process.env.AGENT_NAME ?? "AI Coding";
const API_KEY =
  process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";
const PROJECT_DIR = process.cwd();

if (!API_KEY) {
  console.error(
    "Error: Set DEEPSEEK_API_KEY or OPENAI_API_KEY environment variable."
  );
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
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
});

// ── Tools (Ch05-08 + Ch11 + Ch15) ─────────────────────────
const taskManager = new TaskManager();
const scratchpad = new Scratchpad();

const allTools: Tool[] = [
  readToolDefinition,
  writeToolDefinition,
  bashToolDefinition,
  globToolDefinition,
  grepToolDefinition,
  ...TASK_TOOLS,
  ...SCRATCHPAD_TOOLS,
];

// ── Safety (Ch20) ──────────────────────────────────────────
const sandbox = new FileSystemSandbox([PROJECT_DIR, os.tmpdir()]);

// ── Tool input validation (runtime, at the LLM trust boundary) ────
const TOOL_SCHEMAS: Record<string, z.ZodType> = {
  read_file: readInputSchema,
  write_file: writeInputSchema,
  bash: bashInputSchema,
  glob: globInputSchema,
  grep: grepInputSchema,
  task_create: taskCreateInputSchema,
  task_update: taskUpdateInputSchema,
  task_list: taskListInputSchema,
  scratchpad_set: scratchpadSetInputSchema,
  scratchpad_get: scratchpadGetInputSchema,
  scratchpad_list: scratchpadListInputSchema,
};

// Live activity reporter — set per turn so the Ink spinner can show which
// tool is currently running. Writing to stdout/stderr directly would corrupt
// Ink's render, so progress is surfaced through this callback instead.
let activityReporter: ((msg: string) => void) | null = null;

// ── Tool Executor (Ch09 + Ch12 + Ch19 + Ch20) ─────────────
async function rawExecutor(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  // Validate the LLM-supplied arguments against the tool's schema before
  // doing anything else. On failure, return the error to the LLM so it can
  // correct the call rather than crashing on malformed input.
  const schema = TOOL_SCHEMAS[name];
  if (schema) {
    const validated = validateToolInput(schema, input);
    if (!validated.ok) return validated.error;
    input = validated.data as Record<string, unknown>;
  }

  activityReporter?.(`Running ${name}…`);

  if (name.startsWith("task_"))
    return executeTaskTool(taskManager, name, input);
  if (name.startsWith("scratchpad_"))
    return executeScratchpadTool(scratchpad, name, input);

  if (name === "read_file" || name === "write_file") {
    const filePath = input.file_path as string;
    const blocked = sandbox.check(filePath);
    if (blocked) return blocked;
  }

  if (name === "bash") {
    const command = input.command as string;
    const danger = checkDangerousCommand(command);
    if (danger)
      return `Blocked: ${danger}. This command requires user confirmation.`;
  }

  switch (name) {
    case "read_file":
      return executeReadTool(input as unknown as ReadToolInput);
    case "write_file":
      return executeWriteTool(input as unknown as WriteToolInput);
    case "bash":
      return executeBashTool(input as unknown as BashToolInput);
    case "glob":
      return executeGlobTool(input as unknown as GlobToolInput);
    case "grep":
      return executeGrepTool(input as unknown as GrepToolInput);
    default:
      return `Error: unknown tool "${name}"`;
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

// ── Slash commands (Ch17) ──────────────────────────────────
const EXIT_KEYWORDS = ["/exit", "/quit"];

// Visual mapping for task status → glyph + color (clean Unicode, no emoji).
const TASK_STATUS_STYLE: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  pending: { icon: "○", color: "gray", label: "pending" },
  in_progress: { icon: "◐", color: "yellow", label: "in progress" },
  completed: { icon: "●", color: "green", label: "completed" },
  failed: { icon: "✗", color: "red", label: "failed" },
};

const commands: SlashCommand[] = [
  {
    name: "/help",
    description: "Show available commands",
    execute: (): CommandPanel => ({
      title: "Commands",
      accent: "cyan",
      rows: [
        ...commands.map((c) => ({
          id: c.name,
          icon: "▸",
          iconColor: "cyan",
          label: c.name,
          value: c.description,
        })),
        {
          id: "/exit",
          icon: "▸",
          iconColor: "cyan",
          label: EXIT_KEYWORDS.join(", "),
          value: "Exit the agent",
        },
      ],
    }),
  },
  { name: "/clear", description: "Clear the screen", execute: () => undefined },
  {
    name: "/tasks",
    description: "Show current tasks",
    execute: (): CommandPanel => ({
      title: "Tasks",
      accent: "blue",
      empty: "No tasks yet.",
      rows: taskManager.list().map((t) => {
        const style = TASK_STATUS_STYLE[t.status] ?? TASK_STATUS_STYLE.pending;
        return {
          id: t.id,
          icon: style.icon,
          iconColor: style.color,
          label: t.description,
          value: `${t.id} · ${style.label}`,
        };
      }),
    }),
  },
  {
    name: "/notes",
    description: "Show scratchpad",
    execute: (): CommandPanel => ({
      title: "Scratchpad",
      accent: "green",
      empty: "Scratchpad is empty.",
      rows: scratchpad.list().map((e) => ({
        id: e.key,
        icon: "◇",
        iconColor: "green",
        label: e.key,
        value: e.value,
      })),
    }),
  },
  {
    name: "/reset",
    description: "Clear tasks and scratchpad",
    execute: () => {
      taskManager.clear();
      scratchpad.clear();
      return "Tasks and scratchpad cleared.";
    },
  },
];

// One agent turn, driving the Ink spinner via the activity reporter.
async function submitTurn(
  input: string,
  hooks: { onActivity: (msg: string) => void }
) {
  activityReporter = hooks.onActivity;
  try {
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
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((t) => ({ name: t.name })),
    };
  } finally {
    activityReporter = null;
  }
}

// ── Main ───────────────────────────────────────────────────
export async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(
      "This interactive CLI requires a TTY. Run it directly in a terminal."
    );
    process.exit(1);
  }
  await runInkApp({
    agentName: AGENT_NAME,
    model: MODEL,
    cwd: PROJECT_DIR,
    exitKeywords: EXIT_KEYWORDS,
    commands,
    submit: submitTurn,
  });
}
