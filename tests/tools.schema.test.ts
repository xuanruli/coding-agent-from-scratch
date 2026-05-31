import { describe, expect, it } from "vitest";
import {
  bashInputSchema,
  readInputSchema,
  toInputSchema,
  validateToolInput,
} from "../src/tools/index.js";

describe("toInputSchema", () => {
  it("produces a JSON Schema object with properties and required", () => {
    const schema = toInputSchema(readInputSchema) as Record<string, any>;
    expect(schema.type).toBe("object");
    expect(schema.properties.file_path.type).toBe("string");
    expect(schema.required).toContain("file_path");
  });

  it("carries field descriptions through to the JSON Schema", () => {
    const schema = toInputSchema(readInputSchema) as Record<string, any>;
    expect(schema.properties.file_path.description).toMatch(
      /path to the file/i
    );
  });

  it("strips the $schema field (providers expect a bare parameters object)", () => {
    const schema = toInputSchema(readInputSchema) as Record<string, any>;
    expect(schema.$schema).toBeUndefined();
  });

  it("marks optional fields as not required", () => {
    const schema = toInputSchema(readInputSchema) as Record<string, any>;
    expect(schema.required).not.toContain("offset");
    expect(schema.required).not.toContain("limit");
  });
});

describe("validateToolInput", () => {
  it("accepts valid input and returns typed data", () => {
    const result = validateToolInput(readInputSchema, {
      file_path: "src/index.ts",
      offset: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.file_path).toBe("src/index.ts");
      expect(result.data.offset).toBe(5);
    }
  });

  it("rejects input missing a required field", () => {
    const result = validateToolInput(readInputSchema, { offset: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("file_path");
      expect(result.error).toContain("Invalid arguments");
    }
  });

  it("rejects input with the wrong type", () => {
    const result = validateToolInput(readInputSchema, { file_path: 123 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("file_path");
    }
  });

  it("rejects a non-integer where an integer is expected", () => {
    const result = validateToolInput(readInputSchema, {
      file_path: "a.ts",
      offset: 1.5,
    });
    expect(result.ok).toBe(false);
  });

  it("strips extra unknown properties rather than failing the call", () => {
    const result = validateToolInput(bashInputSchema, {
      command: "ls",
      bogus: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.command).toBe("ls");
      expect((result.data as Record<string, unknown>).bogus).toBeUndefined();
    }
  });

  it("accepts input when only required fields are present", () => {
    const result = validateToolInput(bashInputSchema, { command: "ls -la" });
    expect(result.ok).toBe(true);
  });
});
