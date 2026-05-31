import { describe, expect, it, vi } from "vitest";
import {
  type Command,
  createRepl,
  formatHelp,
  isMultiLine,
  normalizeInput,
  parseCommand,
} from "../src/repl.js";

describe("normalizeInput", () => {
  it("should trim whitespace", () => {
    expect(normalizeInput("  hello  ")).toBe("hello");
  });

  it("should handle empty string", () => {
    expect(normalizeInput("")).toBe("");
    expect(normalizeInput("   ")).toBe("");
  });
});

describe("parseCommand", () => {
  it("should extract command name", () => {
    expect(parseCommand("/help")).toBe("/help");
    expect(parseCommand("/help arg")).toBe("/help");
  });

  it("should lowercase", () => {
    expect(parseCommand("/HELP")).toBe("/help");
  });

  it("should handle plain text", () => {
    expect(parseCommand("hello world")).toBe("hello");
  });
});

describe("isMultiLine", () => {
  it("should detect newlines", () => {
    expect(isMultiLine("line1\nline2")).toBe(true);
  });

  it("should return false for single line", () => {
    expect(isMultiLine("single line")).toBe(false);
  });
});

describe("formatHelp", () => {
  it("should list commands and exit keyword", () => {
    const commands: Command[] = [
      { name: "/help", description: "Show help", execute: () => "" },
      { name: "/clear", description: "Clear screen", execute: () => {} },
    ];
    const help = formatHelp(commands, ["/exit"]);
    expect(help).toContain("Available commands:");
    expect(help).toContain("/help");
    expect(help).toContain("/clear");
    expect(help).toContain("/exit");
  });
});

describe("createRepl", () => {
  it("should return empty string for blank input", async () => {
    const repl = createRepl();
    expect(await repl.processInput("")).toBe("");
    expect(await repl.processInput("   ")).toBe("");
  });

  it("should return null for exit keywords", async () => {
    const repl = createRepl();
    expect(await repl.processInput("/exit")).toBeNull();
    expect(await repl.processInput("/quit")).toBeNull();
  });

  it("should support custom exit keywords", async () => {
    const repl = createRepl({ exitKeywords: ["/bye"] });
    expect(await repl.processInput("/bye")).toBeNull();
    expect(await repl.processInput("/exit")).not.toBeNull(); // not an exit keyword
  });

  it("should execute /help command", async () => {
    const repl = createRepl();
    const result = await repl.processInput("/help");
    expect(result).toContain("Available commands:");
    expect(result).toContain("/help");
  });

  it("should execute /clear command", async () => {
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const repl = createRepl();
    await repl.processInput("/clear");
    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("should delegate to onInput for non-command text", async () => {
    const onInput = vi.fn(async (input: string) => `Echo: ${input}`);
    const repl = createRepl({ onInput });
    const result = await repl.processInput("hello");
    expect(result).toBe("Echo: hello");
    expect(onInput).toHaveBeenCalledWith("hello");
  });

  it("should show error for unknown commands without onInput", async () => {
    const repl = createRepl();
    const result = await repl.processInput("unknown");
    expect(result).toContain("Unknown command");
  });

  it("should support custom commands", async () => {
    const custom: Command = {
      name: "/test",
      description: "Test command",
      execute: () => "test result",
    };
    const repl = createRepl({ commands: [custom] });
    const result = await repl.processInput("/test");
    expect(result).toBe("test result");
  });

  it("should list custom commands in help", async () => {
    const custom: Command = {
      name: "/test",
      description: "Test command",
      execute: () => "ok",
    };
    const repl = createRepl({ commands: [custom] });
    const help = await repl.processInput("/help");
    expect(help).toContain("/test");
    expect(help).toContain("Test command");
  });

  it("should handle case-insensitive commands", async () => {
    const repl = createRepl();
    expect(await repl.processInput("/HELP")).toContain("Available commands:");
    expect(await repl.processInput("/EXIT")).toBeNull();
  });
});
