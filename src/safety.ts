import * as fs from "node:fs";
import * as path from "node:path";

/**
 * File system sandbox — restrict file operations to allowed directories.
 *
 * Prevents the agent from reading/writing sensitive paths like ~/.ssh,
 * /etc/passwd, or files outside the project directory.
 */
export class FileSystemSandbox {
  private allowedPaths: string[];
  private blockedPatterns: RegExp[];

  constructor(allowedPaths: string[], extraBlocked?: RegExp[]) {
    this.allowedPaths = allowedPaths.map((p) => path.resolve(p));
    this.blockedPatterns = [
      /\.env($|\.)/, // .env files
      /\/(\.ssh|\.gnupg)\//, // SSH/GPG keys
      /\/\.git\/config$/, // git credentials
      /\/(passwd|shadow)$/, // system auth files
      /\/credentials\.json$/, // cloud credentials
      /\/\.aws\//, // AWS config
      ...(extraBlocked ?? []),
    ];
  }

  /**
   * Check if a file path is allowed for read/write operations.
   * Returns an error message if blocked, or null if allowed.
   */
  check(filePath: string): string | null {
    const resolved = path.resolve(filePath);

    // Check blocked patterns first
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(resolved)) {
        return `Blocked: "${filePath}" matches a sensitive file pattern.`;
      }
    }

    // Check if within allowed directories
    const inAllowed = this.allowedPaths.some(
      (allowed) =>
        resolved === allowed || resolved.startsWith(allowed + path.sep)
    );

    if (!inAllowed) {
      return `Blocked: "${filePath}" is outside allowed directories.`;
    }

    return null; // allowed
  }

  /**
   * Check if a path is allowed (returns boolean).
   */
  isAllowed(filePath: string): boolean {
    return this.check(filePath) === null;
  }
}

/**
 * Dangerous command patterns that require user confirmation.
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+(-[rf]+\s+|.*--no-preserve-root)/,
    reason: "Recursive/forced file deletion",
  },
  {
    pattern: /\bgit\s+push\s+.*--force/,
    reason: "Force push may overwrite remote history",
  },
  {
    pattern: /\bgit\s+reset\s+--hard/,
    reason: "Hard reset discards uncommitted changes",
  },
  { pattern: /\bchmod\s+777\b/, reason: "Sets world-writable permissions" },
  {
    pattern: /\bcurl\s+.*\|\s*(sh|bash)\b/,
    reason: "Piping remote script to shell",
  },
  { pattern: /\bsudo\s+/, reason: "Elevated privilege execution" },
  {
    pattern: /\b(DROP|DELETE\s+FROM|TRUNCATE)\b/i,
    reason: "Destructive database operation",
  },
  { pattern: /\bkill\s+-9\b/, reason: "Forceful process termination" },
];

/**
 * Check if a command is dangerous and needs confirmation.
 * Returns the reason if dangerous, or null if safe.
 */
export function checkDangerousCommand(command: string): string | null {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return reason;
    }
  }
  return null;
}

/**
 * Read project configuration from a CLAUDE.md file.
 *
 * Looks for CLAUDE.md in the project root and returns its contents
 * as context to inject into the system prompt.
 */
export function readProjectConfig(projectDir: string): string | null {
  const candidates = ["CLAUDE.md", ".claude/CLAUDE.md"];

  for (const candidate of candidates) {
    const filePath = path.join(projectDir, candidate);
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      // file doesn't exist, try next
    }
  }

  return null;
}

/**
 * Gather git repository information for context injection.
 */
export interface GitInfo {
  branch: string;
  lastCommit: string;
  status: string;
  remoteUrl: string;
}

/**
 * Parse git info from command outputs.
 * Each field is optional and defaults to empty string.
 */
export function parseGitInfo(fields: {
  branch?: string;
  lastCommit?: string;
  status?: string;
  remoteUrl?: string;
}): GitInfo {
  return {
    branch: fields.branch?.trim() ?? "",
    lastCommit: fields.lastCommit?.trim() ?? "",
    status: fields.status?.trim() ?? "",
    remoteUrl: fields.remoteUrl?.trim() ?? "",
  };
}

/**
 * Format git info for injection into system prompt.
 */
export function formatGitContext(info: GitInfo): string {
  const lines: string[] = ["## Project Context"];

  if (info.branch) lines.push(`- Branch: ${info.branch}`);
  if (info.lastCommit) lines.push(`- Last commit: ${info.lastCommit}`);
  if (info.remoteUrl) lines.push(`- Remote: ${info.remoteUrl}`);
  if (info.status) lines.push(`- Status:\n${info.status}`);

  return lines.length > 1 ? lines.join("\n") : "";
}
