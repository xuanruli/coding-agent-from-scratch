import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { stripAnsi } from "../src/markdown.js";
import {
  formatDuration,
  formatParams,
  formatToolCall,
  formatToolCycle,
  formatToolResult,
  Spinner,
  truncate,
} from "../src/tool-display.js";

describe("truncate", () => {
  it("should return short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should truncate long text with ...", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("should handle exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("formatParams", () => {
  it("should format key-value pairs", () => {
    const result = formatParams({ file_path: "test.txt", limit: 10 });
    expect(result).toContain("file_path:");
    expect(result).toContain('"test.txt"');
    expect(result).toContain("limit: 10");
  });

  it("should truncate long strings", () => {
    const result = formatParams({ content: "x".repeat(100) });
    expect(result).toContain("...");
  });

  it("should return empty for empty input", () => {
    expect(formatParams({})).toBe("");
  });

  it("should truncate overall length", () => {
    const input: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      input[`key${i}`] = "value";
    }
    const result = formatParams(input, 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });
});

describe("formatToolCall", () => {
  it("should show tool name and params", () => {
    const result = stripAnsi(
      formatToolCall("read_file", { file_path: "test.txt" })
    );
    expect(result).toContain("read_file");
    expect(result).toContain("test.txt");
  });

  it("should handle empty params", () => {
    const result = stripAnsi(formatToolCall("list_tasks", {}));
    expect(result).toContain("list_tasks");
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(50)).toBe("50ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(30000)).toBe("30.0s");
  });

  it("should format minutes", () => {
    expect(formatDuration(90000)).toBe("1.5m");
  });
});

describe("formatToolResult", () => {
  it("should show short results fully", () => {
    const result = formatToolResult("line 1\nline 2");
    expect(result).toContain("line 1");
    expect(result).toContain("line 2");
  });

  it("should collapse long results", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const result = formatToolResult(lines, 5);
    expect(result).toContain("line 0");
    expect(result).toContain("line 4");
    expect(result).toContain("15 more lines");
  });

  it("should truncate long lines", () => {
    const longLine = "x".repeat(200);
    const result = formatToolResult(longLine, 5, 50);
    expect(stripAnsi(result).length).toBeLessThan(200);
  });

  it("should handle empty result", () => {
    expect(formatToolResult("")).toBe("");
  });
});

describe("formatToolCycle", () => {
  it("should combine header, timing, and result", () => {
    const result = stripAnsi(
      formatToolCycle(
        "read_file",
        { file_path: "test.txt" },
        "file contents",
        150
      )
    );
    expect(result).toContain("read_file");
    expect(result).toContain("test.txt");
    expect(result).toContain("150ms");
    expect(result).toContain("file contents");
  });
});

describe("Spinner", () => {
  it("should store message", () => {
    const spinner = new Spinner("Loading...");
    expect(spinner.message).toBe("Loading...");
  });

  it("should update message", () => {
    const spinner = new Spinner("Loading...");
    spinner.update("Still loading...");
    expect(spinner.message).toBe("Still loading...");
  });

  it("should cycle through frames", () => {
    const spinner = new Spinner("test");
    const first = spinner.currentFrame();
    expect(first).toBe("⠋");
  });

  it("should report running state", () => {
    const spinner = new Spinner("test");
    expect(spinner.isRunning).toBe(false);
  });

  it("should start and stop", async () => {
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const spinner = new Spinner("test");
    spinner.start();
    expect(spinner.isRunning).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    spinner.stop();
    expect(spinner.isRunning).toBe(false);
    writeSpy.mockRestore();
  });

  it("should show succeed message", () => {
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const spinner = new Spinner("test");
    spinner.succeed("Done!");
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(stripAnsi(output)).toContain("Done!");
    writeSpy.mockRestore();
  });

  it("should show fail message", () => {
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const spinner = new Spinner("test");
    spinner.fail("Failed!");
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(stripAnsi(output)).toContain("Failed!");
    writeSpy.mockRestore();
  });
});
