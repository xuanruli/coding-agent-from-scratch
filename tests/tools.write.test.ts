import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeWriteTool, writeToolDefinition } from "../src/tools/write.js";

const TEST_DIR = join(import.meta.dirname, "__write_fixtures__");

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeToolDefinition", () => {
  it("should have correct name and required fields", () => {
    expect(writeToolDefinition.name).toBe("write_file");
    expect(writeToolDefinition.inputSchema.required).toContain("file_path");
    expect(writeToolDefinition.inputSchema.required).toContain("content");
  });
});

describe("executeWriteTool", () => {
  it("should create a new file", async () => {
    const path = join(TEST_DIR, "new.txt");
    const result = await executeWriteTool({
      file_path: path,
      content: "hello\nworld\n",
    });
    expect(result).toContain("Created");
    expect(result).toContain("new.txt");
    expect(readFileSync(path, "utf-8")).toBe("hello\nworld\n");
  });

  it("should create parent directories", async () => {
    const path = join(TEST_DIR, "deep", "nested", "file.txt");
    const result = await executeWriteTool({
      file_path: path,
      content: "nested content",
    });
    expect(result).toContain("Created");
    expect(existsSync(path)).toBe(true);
  });

  it("should overwrite existing file and show diff", async () => {
    const path = join(TEST_DIR, "existing.txt");
    writeFileSync(path, "old line 1\nold line 2\n");
    const result = await executeWriteTool({
      file_path: path,
      content: "new line 1\nold line 2\n",
    });
    expect(result).toContain("Updated");
    expect(result).toContain("-old line 1");
    expect(result).toContain("+new line 1");
    expect(readFileSync(path, "utf-8")).toBe("new line 1\nold line 2\n");
  });

  it("should show no changes when content is identical", async () => {
    const path = join(TEST_DIR, "same.txt");
    writeFileSync(path, "same content\n");
    const result = await executeWriteTool({
      file_path: path,
      content: "same content\n",
    });
    expect(result).toContain("(no changes)");
  });

  it("should report line count", async () => {
    const path = join(TEST_DIR, "lines.txt");
    const result = await executeWriteTool({
      file_path: path,
      content: "a\nb\nc\n",
    });
    expect(result).toContain("4 lines");
  });
});
