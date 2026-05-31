import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeReadTool, readToolDefinition } from "../src/tools/read.js";

const TEST_DIR = join(import.meta.dirname, "__fixtures__");
const TEST_FILE = join(TEST_DIR, "sample.txt");
const BINARY_FILE = join(TEST_DIR, "binary.bin");

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  // Create a sample text file with known content
  const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}: content`);
  writeFileSync(TEST_FILE, `${lines.join("\n")}\n`);
  // Create a binary file
  const buf = Buffer.alloc(100);
  buf[0] = 0x89; // PNG-like header
  buf[5] = 0x00; // Null byte
  writeFileSync(BINARY_FILE, buf);
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("readToolDefinition", () => {
  it("should have correct name and required fields", () => {
    expect(readToolDefinition.name).toBe("read_file");
    expect(readToolDefinition.inputSchema.required).toContain("file_path");
  });
});

describe("executeReadTool", () => {
  it("should read entire file with line numbers", async () => {
    const result = await executeReadTool({ file_path: TEST_FILE });
    expect(result).toContain("1\tLine 1: content");
    expect(result).toContain("20\tLine 20: content");
  });

  it("should support offset parameter", async () => {
    const result = await executeReadTool({ file_path: TEST_FILE, offset: 5 });
    const lines = result.split("\n");
    expect(lines[0]).toMatch(/^\s*5\tLine 5: content$/);
    // Should still include lines after offset
    expect(result).toContain("Line 20: content");
  });

  it("should support limit parameter", async () => {
    const result = await executeReadTool({ file_path: TEST_FILE, limit: 3 });
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/1\tLine 1: content/);
    expect(lines[2]).toMatch(/3\tLine 3: content/);
  });

  it("should support offset + limit together", async () => {
    const result = await executeReadTool({
      file_path: TEST_FILE,
      offset: 10,
      limit: 5,
    });
    const lines = result.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/10\tLine 10: content/);
    expect(lines[4]).toMatch(/14\tLine 14: content/);
  });

  it("should return error for non-existent file", async () => {
    const result = await executeReadTool({ file_path: "/no/such/file.txt" });
    expect(result).toContain("Error: file not found");
  });

  it("should return error for directory", async () => {
    const result = await executeReadTool({ file_path: TEST_DIR });
    expect(result).toContain("Error: not a file");
  });

  it("should detect binary files", async () => {
    const result = await executeReadTool({ file_path: BINARY_FILE });
    expect(result).toContain("Error: binary file detected");
  });

  it("should return empty message for out-of-range offset", async () => {
    const result = await executeReadTool({ file_path: TEST_FILE, offset: 999 });
    expect(result).toContain("empty");
  });

  it("should return error for invalid offset", async () => {
    const result = await executeReadTool({ file_path: TEST_FILE, offset: 0 });
    expect(result).toContain("Error: offset must be >= 1");
  });
});
