import { describe, it, expect } from "vitest";
import { executeBashTool, bashToolDefinition } from "../src/tools/bash.js";

describe("bashToolDefinition", () => {
  it("should have correct name and required fields", () => {
    expect(bashToolDefinition.name).toBe("bash");
    expect(bashToolDefinition.inputSchema.required).toContain("command");
  });
});

describe("executeBashTool", () => {
  it("should execute a simple command", async () => {
    const result = await executeBashTool({ command: "echo hello" });
    expect(result).toBe("hello");
  });

  it("should capture stdout from multi-line output", async () => {
    const result = await executeBashTool({ command: "echo 'line1'; echo 'line2'" });
    expect(result).toContain("line1");
    expect(result).toContain("line2");
  });

  it("should capture stderr", async () => {
    const result = await executeBashTool({ command: "echo error >&2" });
    expect(result).toContain("STDERR:");
    expect(result).toContain("error");
  });

  it("should report non-zero exit code", async () => {
    const result = await executeBashTool({ command: "exit 42" });
    expect(result).toContain("Exit code: 42");
  });

  it("should handle command not found", async () => {
    const result = await executeBashTool({ command: "nonexistent_cmd_xyz" });
    expect(result).toContain("not found");
  });

  it("should timeout long-running commands", async () => {
    const result = await executeBashTool({
      command: "sleep 60",
      timeout: 500,
    });
    expect(result).toContain("timed out");
  }, 5000);

  it("should return no output for empty command", async () => {
    const result = await executeBashTool({ command: "true" });
    expect(result).toBe("(no output)");
  });

  it("should handle pipe commands", async () => {
    const result = await executeBashTool({
      command: "echo 'hello world' | tr 'a-z' 'A-Z'",
    });
    expect(result).toBe("HELLO WORLD");
  });
});