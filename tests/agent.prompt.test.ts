import { describe, expect, it } from "vitest";
import type { Tool } from "../src/llm/types.js";
import {
  createCodingAssistantPrompt,
  SystemPromptBuilder,
} from "../src/system-prompt.js";

const sampleTools: Tool[] = [
  { name: "read_file", description: "Read a file", inputSchema: {} },
  { name: "write_file", description: "Write a file", inputSchema: {} },
];

describe("SystemPromptBuilder", () => {
  it("should build empty prompt when no sections", () => {
    const builder = new SystemPromptBuilder();
    expect(builder.build()).toBe("");
  });

  it("should add sections and build in priority order", () => {
    const prompt = new SystemPromptBuilder()
      .addSection("Low", "low content", 10)
      .addSection("High", "high content", 90)
      .addSection("Mid", "mid content", 50)
      .build();

    const lines = prompt.split("\n");
    const headings = lines.filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## High", "## Mid", "## Low"]);
  });

  it("should set role with highest priority", () => {
    const builder = new SystemPromptBuilder()
      .addSection("Other", "other", 50)
      .setRole("You are a helper.");

    const prompt = builder.build();
    expect(prompt.startsWith("## Role")).toBe(true);
    expect(prompt).toContain("You are a helper.");
  });

  it("should add rules as bullet list", () => {
    const builder = new SystemPromptBuilder().addRules(["Rule 1", "Rule 2"]);
    const prompt = builder.build();
    expect(prompt).toContain("- Rule 1");
    expect(prompt).toContain("- Rule 2");
  });

  it("should generate tool guide from definitions", () => {
    const builder = new SystemPromptBuilder().addToolGuide(sampleTools);
    const prompt = builder.build();
    expect(prompt).toContain("**read_file**: Read a file");
    expect(prompt).toContain("**write_file**: Write a file");
  });

  it("should set output constraints", () => {
    const builder = new SystemPromptBuilder().setOutputConstraints("Be brief.");
    const prompt = builder.build();
    expect(prompt).toContain("## Output Format");
    expect(prompt).toContain("Be brief.");
  });

  it("should support method chaining", () => {
    const builder = new SystemPromptBuilder()
      .setRole("Helper")
      .addRules(["Rule"])
      .addToolGuide(sampleTools)
      .setOutputConstraints("Format");

    expect(builder.getSections()).toHaveLength(4);
  });

  it("should return sections copy via getSections", () => {
    const builder = new SystemPromptBuilder().addSection("A", "a");
    const sections = builder.getSections();
    sections.push({ title: "B", content: "b" });
    expect(builder.getSections()).toHaveLength(1);
  });

  it("should clear all sections", () => {
    const builder = new SystemPromptBuilder().setRole("Test").addRules(["r"]);
    builder.clear();
    expect(builder.getSections()).toHaveLength(0);
    expect(builder.build()).toBe("");
  });

  it("should use default priority 0 when not specified", () => {
    const builder = new SystemPromptBuilder()
      .addSection("A", "a")
      .addSection("B", "b");
    const sections = builder.getSections();
    expect(sections[0].priority).toBe(0);
    expect(sections[1].priority).toBe(0);
  });
});

describe("buildWithBudget", () => {
  it("should include all sections when under budget", () => {
    const prompt = new SystemPromptBuilder()
      .addSection("A", "short", 10)
      .addSection("B", "short", 20)
      .buildWithBudget(10000);

    expect(prompt).toContain("## A");
    expect(prompt).toContain("## B");
  });

  it("should drop low-priority sections when over budget", () => {
    const prompt = new SystemPromptBuilder()
      .addSection("Important", "x".repeat(50), 100)
      .addSection("Nice", "y".repeat(50), 50)
      .addSection("Optional", "z".repeat(50), 10)
      .buildWithBudget(130);

    expect(prompt).toContain("## Important");
    expect(prompt).toContain("## Nice");
    expect(prompt).not.toContain("## Optional");
  });

  it("should always include at least the first section", () => {
    const prompt = new SystemPromptBuilder()
      .addSection("Big", "x".repeat(1000), 100)
      .buildWithBudget(10); // budget too small

    expect(prompt).toContain("## Big");
  });

  it("should return empty for empty builder", () => {
    expect(new SystemPromptBuilder().buildWithBudget(100)).toBe("");
  });
});

describe("createCodingAssistantPrompt", () => {
  it("should create a prompt with all sections", () => {
    const prompt = createCodingAssistantPrompt(sampleTools);

    expect(prompt).toContain("## Role");
    expect(prompt).toContain("## Rules");
    expect(prompt).toContain("## Available Tools");
    expect(prompt).toContain("## Output Format");
    expect(prompt).toContain("read_file");
  });

  it("should put role section first", () => {
    const prompt = createCodingAssistantPrompt(sampleTools);
    expect(prompt.startsWith("## Role")).toBe(true);
  });

  it("should work with empty tools list", () => {
    const prompt = createCodingAssistantPrompt([]);
    expect(prompt).toContain("## Role");
    expect(prompt).toContain("## Available Tools");
  });
});
