/**
 * Terminal markdown renderer using ANSI escape codes.
 *
 * Converts a subset of markdown (headings, bold, inline code,
 * code blocks, lists, horizontal rules) into ANSI-colored output
 * suitable for terminal display.
 */

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

export const ansi = { RESET, BOLD, DIM, ITALIC, UNDERLINE, CYAN, GREEN, YELLOW, MAGENTA, GRAY, BG_GRAY, WHITE };

/**
 * Render inline markdown: **bold**, `code`, *italic*
 */
export function renderInline(text: string): string {
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/__(.+?)__/g, `${BOLD}$1${RESET}`)
    // Inline code: `code`
    .replace(/`([^`]+)`/g, `${CYAN}$1${RESET}`)
    // Italic: *text* or _text_ (but not inside words with underscores)
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, `${ITALIC}$1${RESET}`)
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, `${ITALIC}$1${RESET}`);
}

/**
 * Render a code block with optional language label.
 */
export function renderCodeBlock(code: string, language?: string): string {
  const header = language
    ? `${GRAY}┌─ ${language} ${"─".repeat(Math.max(0, 40 - language.length))}┐${RESET}\n`
    : `${GRAY}┌${"─".repeat(44)}┐${RESET}\n`;

  const lines = code.split("\n").map(
    (line) => `${GRAY}│${RESET} ${BG_GRAY}${WHITE}${line}${RESET}`
  );

  const footer = `\n${GRAY}└${"─".repeat(44)}┘${RESET}`;

  return header + lines.join("\n") + footer;
}

/**
 * Render a heading (# to ###).
 */
export function renderHeading(text: string, level: number): string {
  const prefix = level === 1
    ? `${BOLD}${MAGENTA}`
    : level === 2
    ? `${BOLD}${GREEN}`
    : `${BOLD}${YELLOW}`;
  return `\n${prefix}${"#".repeat(level)} ${text}${RESET}\n`;
}

/**
 * Render a list item (- or *).
 */
export function renderListItem(text: string, indent = 0): string {
  const pad = " ".repeat(indent);
  return `${pad}${GREEN}•${RESET} ${renderInline(text)}`;
}

/**
 * Render a horizontal rule.
 */
export function renderHorizontalRule(): string {
  return `${GRAY}${"─".repeat(48)}${RESET}`;
}

/**
 * Render a complete markdown string for terminal output.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeBuffer: string[] = [];

  for (const line of lines) {
    // Code block start/end
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        output.push(renderCodeBlock(codeBuffer.join("\n"), codeLanguage));
        codeBuffer = [];
        inCodeBlock = false;
        codeLanguage = "";
      } else {
        // Start code block
        inCodeBlock = true;
        codeLanguage = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      output.push(renderHorizontalRule());
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      output.push(renderHeading(headingMatch[2], headingMatch[1].length));
      continue;
    }

    // Unordered list items
    const listMatch = line.match(/^(\s*)[*-]\s+(.+)/);
    if (listMatch) {
      output.push(renderListItem(listMatch[2], listMatch[1].length));
      continue;
    }

    // Ordered list items
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (orderedMatch) {
      output.push(renderListItem(orderedMatch[2], orderedMatch[1].length));
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      output.push("");
      continue;
    }

    // Regular paragraph text
    output.push(renderInline(line));
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    output.push(renderCodeBlock(codeBuffer.join("\n"), codeLanguage));
  }

  return output.join("\n");
}

/**
 * Strip all ANSI escape codes from a string (useful for testing).
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}