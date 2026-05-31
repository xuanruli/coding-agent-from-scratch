import { expect, it, describe } from "vitest";
import { stripAnsi } from "../src/markdown.js";
import { renderInline } from "../src/markdown.js";
import { ansi } from "../src/markdown.js";


describe("stripAnsi", () => {
    it("should remove ANSI codes", () => {
      expect(stripAnsi(`${ansi.BOLD}hello${ansi.RESET}`)).toBe("hello");
    });
  
    it("should return plain text unchanged", () => {
      expect(stripAnsi("hello")).toBe("hello");
    });
  });
  
  describe("renderInline", () => {
    it("should render bold text", () => {
      const result = renderInline("this is **bold** text");
      expect(result).toContain(ansi.BOLD);
      expect(stripAnsi(result)).toBe("this is bold text");
    });
  
    it("should render __bold__ with underscores", () => {
      const result = renderInline("this is __bold__ text");
      expect(stripAnsi(result)).toBe("this is bold text");
    });
  
    it("should render inline code", () => {
      const result = renderInline("use `console.log`");
      expect(result).toContain(ansi.CYAN);
      expect(stripAnsi(result)).toBe("use console.log");
    });
  
    it("should render italic", () => {
      const result = renderInline("this is *italic* text");
      expect(result).toContain(ansi.ITALIC);
      expect(stripAnsi(result)).toBe("this is italic text");
    });
  
    it("should handle mixed inline formatting", () => {
      const result = renderInline("**bold** and `code`");
      const plain = stripAnsi(result);
      expect(plain).toContain("bold");
      expect(plain).toContain("code");
    });
  
    it("should return plain text unchanged", () => {
      expect(renderInline("no formatting")).toBe("no formatting");
    });
  });