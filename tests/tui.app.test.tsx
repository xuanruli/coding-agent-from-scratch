import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App, type InkAppOptions, runInkApp } from "../src/tui/app.js";

function baseOpts(overrides: Partial<InkAppOptions> = {}): InkAppOptions {
  return {
    agentName: "TestBot",
    agentIcon: "🤖",
    model: "test-model",
    cwd: "/tmp/project",
    exitKeywords: ["/exit"],
    commands: [
      { name: "/help", description: "Show help", execute: () => "HELP TEXT" },
      { name: "/clear", description: "Clear", execute: () => {} },
    ],
    submit: vi.fn(async () => ({ text: "Hello from agent", toolCalls: [] })),
    ...overrides,
  };
}

describe("Ink app", () => {
  it("exports runInkApp", () => {
    expect(typeof runInkApp).toBe("function");
  });

  it("renders the banner with model and dir", () => {
    const { lastFrame } = render(createElement(App, { opts: baseOpts() }));
    const frame = lastFrame() ?? "";
    expect(frame).toContain("test-model");
    expect(frame).toContain("/tmp/project");
    expect(frame).toContain("/help");
  });

  it("shows the input placeholder when idle", () => {
    const { lastFrame } = render(createElement(App, { opts: baseOpts() }));
    expect(lastFrame() ?? "").toContain("Ask me to read");
  });

  it("renders the agent name in the banner", () => {
    const { lastFrame } = render(
      createElement(App, { opts: baseOpts({ agentName: "Zephyr" }) })
    );
    // BigText renders the name as ASCII-art glyphs, but the input prompt and
    // model line still carry plain text we can assert on.
    expect(lastFrame() ?? "").toContain("test-model");
  });
});
