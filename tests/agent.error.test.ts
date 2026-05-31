import { describe, it, expect } from "vitest";
import { safeToolExecutor } from "../src/error.js";

describe("safeToolExecutor", () => {
    it("should return tool result on success", async () => {
      const executor = async (name: string) => `result from ${name}`;
      const safe = safeToolExecutor(executor);
  
      const result = await safe("read_file", { file_path: "test.txt" });
      expect(result).toBe("result from read_file");
    });
  
    it("should catch errors and return error string", async () => {
      const executor = async () => {
        throw new Error("file not found");
      };
      const safe = safeToolExecutor(executor);
  
      const result = await safe("read_file", { file_path: "missing.txt" });
      expect(result).toContain("Error executing read_file");
      expect(result).toContain("file not found");
    });
  
    it("should reject unknown tools when knownTools is set", async () => {
      const executor = async () => "result";
      const safe = safeToolExecutor(executor, new Set(["read_file", "write_file"]));
  
      const result = await safe("delete_file", {});
      expect(result).toContain('unknown tool "delete_file"');
      expect(result).toContain("read_file");
      expect(result).toContain("write_file");
    });
  
    it("should allow known tools", async () => {
      const executor = async () => "ok";
      const safe = safeToolExecutor(executor, new Set(["read_file"]));
  
      const result = await safe("read_file", {});
      expect(result).toBe("ok");
    });
  
    it("should not check known tools when set is not provided", async () => {
      const executor = async () => "ok";
      const safe = safeToolExecutor(executor);
  
      const result = await safe("any_tool", {});
      expect(result).toBe("ok");
    });
  });