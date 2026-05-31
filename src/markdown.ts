/**
 * Terminal markdown renderer.
 *
 */
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

// ANSI escape codes
const RESET = "\x1B[0m";
const BOLD = "\x1B[1m";
const DIM = "\x1B[2m";
const ITALIC = "\x1B[3m";
const UNDERLINE = "\x1B[4m";
const CYAN = "\x1B[36m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const MAGENTA = "\x1B[35m";
const GRAY = "\x1B[90m";
const BG_GRAY = "\x1B[48;5;236m";
const WHITE = "\x1B[97m";

export const ansi = {
  RESET,
  BOLD,
  DIM,
  ITALIC,
  UNDERLINE,
  CYAN,
  GREEN,
  YELLOW,
  MAGENTA,
  GRAY,
  BG_GRAY,
  WHITE,
};

/**
 * Render inline markdown: **bold**, `code`, *italic*
 */
export function renderInline(text: string): string {
  return (
    text
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`)
      .replace(/__(.+?)__/g, `${BOLD}$1${RESET}`)
      // Inline code: `code`
      .replace(/`([^`]+)`/g, `${CYAN}$1${RESET}`)
      // Italic: *text* or _text_ (but not inside words with underscores)
      .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, `${ITALIC}$1${RESET}`)
      .replace(/(?<!\w)_([^_]+)_(?!\w)/g, `${ITALIC}$1${RESET}`)
  );
}

// Configure marked once with the terminal renderer (syntax highlighting via
// cli-highlight is applied automatically by marked-terminal).
marked.use(
  markedTerminal({
    reflowText: false,
    tab: 2,
  }) as Parameters<typeof marked.use>[0]
);

/**
 * Render a complete markdown string into ANSI-formatted terminal output.
 *
 * Uses marked + marked-terminal for CommonMark-correct rendering with
 * colored headings, lists, tables, blockquotes, and highlighted code blocks.
 */
export function renderMarkdown(markdown: string): string {
  const out = marked.parse(markdown) as string;
  return out.replace(/\n+$/, "");
}

/**
 * Strip all ANSI escape codes from a string (useful for testing).
 */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ANSI escape (ESC) char is intentional
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}
