import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { executeGlobTool, globToolDefinition } from "../src/tools/glob.js";
import { executeGrepTool, grepToolDefinition } from "../src/tools/grep.js";

const TEST_DIR = join(import.meta.dirname, "__search_fixtures__");

beforeAll(() => {
  mkdirSync(join(TEST_DIR, "src", "utils"), { recursive: true });
  mkdirSync(join(TEST_DIR, "tests"), { recursive: true });

  writeFileSync(join(TEST_DIR, "src", "main.ts"), 'const x = "hello";\nconsole.log(x);\n');
  writeFileSync(join(TEST_DIR, "src", "utils", "helper.ts"), "export function add(a: number, b: number) {\n  return a + b;\n}\n");
  writeFileSync(join(TEST_DIR, "src", "utils", "format.py"), "def format_name(name: str) -> str:\n    return name.strip()\n");
  writeFileSync(join(TEST_DIR, "tests", "main.test.ts"), 'import { test } from "vitest";\ntest("works", () => {});\n');
  writeFileSync(join(TEST_DIR, "README.md"), "# Project\nThis is a test project.\n");
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Glob Tests ──

describe("globToolDefinition", () => {
  it("should have correct name", () => {
    expect(globToolDefinition.name).toBe("glob");
  });
});

describe("executeGlobTool", () => {
  it("should find files matching *.ts pattern", async () => {
    const result = await executeGlobTool({ pattern: "*.ts", path: join(TEST_DIR, "src") });
    expect(result).toContain("main.ts");
  });

  it("should find files recursively with **", async () => {
    const result = await executeGlobTool({ pattern: "**/*.ts", path: TEST_DIR });
    expect(result).toContain("main.ts");
    expect(result).toContain("helper.ts");
    expect(result).toContain("main.test.ts");
  });

  it("should find .py files", async () => {
    const result = await executeGlobTool({ pattern: "**/*.py", path: TEST_DIR });
    expect(result).toContain("format.py");
    expect(result).not.toContain(".ts");
  });

  it("should return message for no matches", async () => {
    const result = await executeGlobTool({ pattern: "*.xyz", path: TEST_DIR });
    expect(result).toContain("No files matching");
  });

  it("should return error for non-existent directory", async () => {
    const result = await executeGlobTool({ pattern: "*.ts", path: "/no/such/dir" });
    expect(result).toContain("Error: directory not found");
  });
});

// ── Grep Tests ──

describe("grepToolDefinition", () => {
  it("should have correct name", () => {
    expect(grepToolDefinition.name).toBe("grep");
  });
});

describe("executeGrepTool", () => {
  it("should find pattern in files", async () => {
    const result = await executeGrepTool({ pattern: "hello", path: TEST_DIR });
    expect(result).toContain("main.ts");
    expect(result).toContain("hello");
  });

  it("should support regex patterns", async () => {
    const result = await executeGrepTool({ pattern: "function\\s+\\w+", path: TEST_DIR });
    expect(result).toContain("helper.ts");
    expect(result).toContain("add");
  });

  it("should filter by file type with include", async () => {
    const result = await executeGrepTool({
      pattern: "return",
      path: TEST_DIR,
      include: "*.py",
    });
    expect(result).toContain("format.py");
    expect(result).not.toContain(".ts");
  });

  it("should search a single file", async () => {
    const result = await executeGrepTool({
      pattern: "console",
      path: join(TEST_DIR, "src", "main.ts"),
    });
    expect(result).toContain("console.log");
  });

  it("should show line numbers", async () => {
    const result = await executeGrepTool({ pattern: "console", path: TEST_DIR });
    // Format: file:line: text
    expect(result).toMatch(/main\.ts:\d+:/);
  });

  it("should return message for no matches", async () => {
    const result = await executeGrepTool({ pattern: "nonexistent_xyz", path: TEST_DIR });
    expect(result).toContain("No matches");
  });

  it("should return error for invalid regex", async () => {
    const result = await executeGrepTool({ pattern: "[invalid", path: TEST_DIR });
    expect(result).toContain("Error: invalid regex");
  });
});