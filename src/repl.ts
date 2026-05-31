// Built-in command handler
export interface Command {
  name: string;
  description: string;
  execute: () => string | undefined;
}

// REPL configuration
export interface ReplConfig {
  prompt?: string;
  exitKeywords?: string[];
  commands?: Command[];
  onInput?: (input: string) => Promise<string>;
}

const DEFAULT_PROMPT = "> ";
const DEFAULT_EXIT_KEYWORDS = ["/exit", "/quit"];

// Default built-in commands
function defaultCommands(): Command[] {
  return [
    {
      name: "/help",
      description: "Show available commands",
      execute: () => "help_placeholder", // replaced at runtime
    },
    {
      name: "/clear",
      description: "Clear the screen",
      execute: () => {
        process.stdout.write("\x1B[2J\x1B[H");
      },
    },
  ];
}

/**
 * Format the help text listing all available commands.
 */
export function formatHelp(
  commands: Command[],
  exitKeywords: string[]
): string {
  const lines = ["Available commands:"];
  for (const cmd of commands) {
    lines.push(`  ${cmd.name.padEnd(12)} ${cmd.description}`);
  }
  lines.push(`  ${exitKeywords[0].padEnd(12)} Exit the REPL`);
  return lines.join("\n");
}

/**
 * Check if the input is a multi-line paste (contains newlines).
 */
export function isMultiLine(input: string): boolean {
  return input.includes("\n");
}

/**
 * Normalize user input: trim whitespace, collapse multi-line.
 */
export function normalizeInput(input: string): string {
  return input.trim();
}

/**
 * Parse the command name from user input (e.g., "/help arg" → "/help").
 */
export function parseCommand(input: string): string {
  return input.trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Terminal display width of a single character (CJK/emoji = 2, others = 1).
 */
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp > 0xffff) return 2; // emoji / supplementary
  // CJK Unified Ideographs and common fullwidth ranges
  if (
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Read a line of input from a raw-mode stdin with correct CJK backspace.
 *
 * Bypasses Node's readline entirely — handles UTF-8 decoding and
 * display-width-aware backspace manually.
 * Returns null on Ctrl-C / Ctrl-D (EOF).
 */
function readLine(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    const chars: string[] = [];
    const wasTTY = process.stdin.isRaw;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (data: string) => {
      for (const ch of data) {
        const code = ch.codePointAt(0) ?? 0;

        // Enter
        if (code === 0x0d || code === 0x0a) {
          cleanup();
          process.stdout.write("\r\n");
          resolve(chars.join(""));
          return;
        }

        // Backspace / DEL
        if (code === 0x7f || code === 0x08) {
          if (chars.length > 0) {
            const removed = chars.pop()!;
            const w = charWidth(removed);
            process.stdout.write("\b \b".repeat(w));
          }
          continue;
        }

        // Ctrl-C
        if (code === 0x03) {
          cleanup();
          process.stdout.write("\r\n");
          resolve(null);
          return;
        }

        // Ctrl-D — EOF when line is empty
        if (code === 0x04) {
          if (chars.length === 0) {
            cleanup();
            process.stdout.write("\r\n");
            resolve(null);
            return;
          }
          continue;
        }

        // Ctrl-U — clear line
        if (code === 0x15) {
          while (chars.length > 0) {
            const w = charWidth(chars.pop()!);
            process.stdout.write("\b \b".repeat(w));
          }
          continue;
        }

        // Skip escape sequences and other control chars
        if (code === 0x1b || code < 0x20) {
          continue;
        }

        // Printable character — echo and record
        chars.push(ch);
        process.stdout.write(ch);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasTTY ?? false);
      }
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}

/**
 * Create and run an interactive REPL.
 *
 * Returns a cleanup function that closes the readline interface.
 * In production, this runs an event loop. For testing, use
 * processInput() directly.
 */
export function createRepl(config: ReplConfig = {}): {
  processInput: (input: string) => Promise<string | null>;
  close: () => void;
} {
  const {
    exitKeywords = DEFAULT_EXIT_KEYWORDS,
    commands = [],
    onInput,
  } = config;

  // Merge default + user commands
  const allCommands = [...defaultCommands(), ...commands];

  // Fix help command to list all commands
  const helpCmd = allCommands.find((c) => c.name === "/help");
  if (helpCmd) {
    helpCmd.execute = () => formatHelp(allCommands, exitKeywords);
  }

  /**
   * Process a single input line. Returns:
   * - null if the REPL should exit
   * - string response otherwise
   */
  async function processInput(raw: string): Promise<string | null> {
    const input = normalizeInput(raw);

    if (!input) return "";

    // Check exit
    const cmdName = parseCommand(input);
    if (exitKeywords.includes(cmdName)) {
      return null; // signal exit
    }

    // Check built-in commands
    const cmd = allCommands.find((c) => c.name === cmdName);
    if (cmd) {
      const result = cmd.execute();
      return result ?? "";
    }

    // Delegate to user handler
    if (onInput) {
      return await onInput(input);
    }

    return `Unknown command: ${cmdName}. Type /help for available commands.`;
  }

  function close() {
    // no-op
  }

  return { processInput, close };
}

/**
 * Run the REPL interactively (reads from stdin).
 * This is the main entry point for the CLI.
 */
export async function runRepl(config: ReplConfig = {}): Promise<void> {
  const { prompt = DEFAULT_PROMPT } = config;
  const repl = createRepl(config);
  const useCbreak = !!process.stdin.isTTY;

  // Banner is handled by the CLI entry point

  while (true) {
    let raw: string | null;

    if (useCbreak) {
      raw = await readLine(prompt);
      if (raw === null) {
        process.stdout.write("Goodbye!\n");
        break;
      }
    } else {
      // Non-TTY fallback: simple line reading
      const { createInterface } = await import("node:readline");
      const rl = createInterface({ input: process.stdin, terminal: false });
      process.stdout.write(prompt);
      raw = await new Promise<string>((resolve) => rl.once("line", resolve));
      rl.close();
    }

    const result = await repl.processInput(raw);

    if (result === null) {
      process.stdout.write("Goodbye!\n");
      break;
    }

    if (result) {
      process.stdout.write(`${result}\n`);
    }
  }
}
