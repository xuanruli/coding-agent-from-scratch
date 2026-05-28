import type { Tool } from "./llm/types.js";

// A named section in the system prompt
export interface PromptSection {
  title: string;
  content: string;
  priority?: number; // higher = more important, kept first when truncating
}

/**
 * Build structured system prompts from composable sections.
 *
 * Sections are rendered in priority order (highest first), each with
 * a markdown heading. Tool descriptions can be auto-generated from
 * Tool definitions.
 */
export class SystemPromptBuilder {
  private sections: PromptSection[] = [];

  // Add a named section with optional priority (default 0)
  addSection(title: string, content: string, priority = 0): this {
    this.sections.push({ title, content, priority });
    return this;
  }

  // Set the agent's role/identity
  setRole(role: string): this {
    return this.addSection("Role", role, 100);
  }

  // Add behavioral rules
  addRules(rules: string[]): this {
    const content = rules.map((r) => `- ${r}`).join("\n");
    return this.addSection("Rules", content, 80);
  }

  // Auto-generate tool usage guide from Tool definitions
  addToolGuide(tools: Tool[]): this {
    const lines = tools.map(
      (t) => `- **${t.name}**: ${t.description}`
    );
    return this.addSection("Available Tools", lines.join("\n"), 60);
  }

  // Add output format constraints
  setOutputConstraints(constraints: string): this {
    return this.addSection("Output Format", constraints, 40);
  }

  // Build the final prompt string, sorted by priority (high → low)
  build(): string {
    const sorted = [...this.sections].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );
    return sorted
      .map((s) => `## ${s.title}\n${s.content}`)
      .join("\n\n");
  }

  // Build with a token budget — drop lowest-priority sections if over limit
  buildWithBudget(maxChars: number): string {
    const sorted = [...this.sections].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    const parts: string[] = [];
    let total = 0;

    for (const section of sorted) {
      const block = `## ${section.title}\n${section.content}`;
      if (total + block.length + 2 > maxChars && parts.length > 0) {
        break; // stop adding sections when budget exceeded
      }
      parts.push(block);
      total += block.length + 2; // +2 for "\n\n" separator
    }

    return parts.join("\n\n");
  }

  // Get all sections (for inspection/testing)
  getSections(): PromptSection[] {
    return [...this.sections];
  }

  // Clear all sections
  clear(): this {
    this.sections = [];
    return this;
  }
}

/**
 * Create a pre-configured system prompt for a coding assistant.
 */
export function createCodingAssistantPrompt(tools: Tool[]): string {
  return new SystemPromptBuilder()
    .setRole(
      "You are a coding assistant. Help the user with software engineering tasks " +
      "by reading files, writing code, and running commands. Be concise and accurate."
    )
    .addRules([
      "Always read a file before modifying it.",
      "Explain what you are about to do before using tools.",
      "If a task is complex, break it into steps and track progress with task tools.",
      "Never execute destructive commands without confirmation.",
    ])
    .addToolGuide(tools)
    .setOutputConstraints(
      "Respond in the user's language. Use markdown for code blocks. " +
      "Keep explanations brief and focused."
    )
    .build();
}