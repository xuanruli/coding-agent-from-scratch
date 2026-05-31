import { ansi } from "./markdown.js";

const { RESET, DIM, CYAN, GREEN, YELLOW, MAGENTA, GRAY } = ansi;

/**
 * Spinner animation for long-running operations.
 *
 * Shows a rotating character sequence with a message, updating
 * in-place using terminal control codes.
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _message: string;

  constructor(message: string) {
    this._message = message;
  }

  get message(): string {
    return this._message;
  }

  /** Get the current frame character. */
  currentFrame(): string {
    return this.frames[this.frameIndex % this.frames.length];
  }

  /** Start the spinner animation. */
  start(): void {
    this.timer = setInterval(() => {
      const frame = this.frames[this.frameIndex % this.frames.length];
      process.stderr.write(`\r${CYAN}${frame}${RESET} ${this._message}`);
      this.frameIndex++;
    }, 80);
  }

  /** Update the spinner message while running. */
  update(message: string): void {
    this._message = message;
  }

  /** Stop the spinner and clear the line. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stderr.write("\r\x1B[K"); // clear line
  }

  /** Stop and show a success message. */
  succeed(message?: string): void {
    this.stop();
    process.stderr.write(`${GREEN}✔${RESET} ${message ?? this._message}\n`);
  }

  /** Stop and show a failure message. */
  fail(message?: string): void {
    this.stop();
    process.stderr.write(`${YELLOW}✖${RESET} ${message ?? this._message}\n`);
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }
}

/**
 * Format a tool call for display.
 *
 * Shows the tool name with its key parameters, e.g.:
 *   🔧 read_file(file_path: "src/main.ts")
 */
export function formatToolCall(
  name: string,
  input: Record<string, unknown>
): string {
  const params = formatParams(input);
  return `${MAGENTA}🔧 ${name}${RESET}${DIM}(${params})${RESET}`;
}

/**
 * Format tool parameters, showing key-value pairs concisely.
 */
export function formatParams(
  input: Record<string, unknown>,
  maxLen = 80
): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "";

  const parts = entries.map(([k, v]) => {
    const val =
      typeof v === "string" ? `"${truncate(v, 40)}"` : JSON.stringify(v);
    return `${k}: ${val}`;
  });

  const joined = parts.join(", ");
  return joined.length > maxLen ? `${joined.slice(0, maxLen - 3)}...` : joined;
}

/**
 * Format elapsed time in a human-readable way.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format a tool result for display.
 *
 * Long results are collapsed to show only the first few lines.
 */
export function formatToolResult(
  result: string,
  maxLines = 5,
  maxLineLen = 120
): string {
  const lines = result.split("\n");
  const totalLines = lines.length;

  const shown = lines
    .slice(0, maxLines)
    .map((line) =>
      line.length > maxLineLen ? `${line.slice(0, maxLineLen - 3)}...` : line
    );

  if (totalLines > maxLines) {
    shown.push(`${GRAY}... (${totalLines - maxLines} more lines)${RESET}`);
  }

  return shown.join("\n");
}

/**
 * Display a complete tool call cycle: name, params, result, duration.
 */
export function formatToolCycle(
  name: string,
  input: Record<string, unknown>,
  result: string,
  durationMs: number
): string {
  const header = formatToolCall(name, input);
  const time = `${DIM}[${formatDuration(durationMs)}]${RESET}`;
  const body = formatToolResult(result);
  return `${header} ${time}\n${body}`;
}

/**
 * Truncate a string to maxLen, adding ... if truncated.
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}
