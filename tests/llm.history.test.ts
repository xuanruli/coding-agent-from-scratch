import { describe, it, expect } from "vitest";
import { MessageHistory } from "../src/history.js";

describe("MessageHistory", () => {
  it("should add user and assistant messages", () => {
    const history = new MessageHistory();
    history.addUser("Hello");
    history.addAssistant("Hi there!");

    const msgs = history.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: "user", content: "Hello" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "Hi there!" });
  });

  it("should return a copy from getMessages", () => {
    const history = new MessageHistory();
    history.addUser("Hello");
    const msgs = history.getMessages();
    msgs.push({ role: "user", content: "injected" });
    expect(history.getMessages()).toHaveLength(1);
  });

  it("should return correct slice with getLastN", () => {
    const history = new MessageHistory();
    history.addUser("1");
    history.addAssistant("2");
    history.addUser("3");

    const last2 = history.getLastN(2);
    expect(last2).toHaveLength(2);
    expect(last2[0].content).toBe("2");
    expect(last2[1].content).toBe("3");
  });

  it("should return all messages if getLastN exceeds length", () => {
    const history = new MessageHistory();
    history.addUser("only");
    expect(history.getLastN(10)).toHaveLength(1);
  });

  it("should report correct length", () => {
    const history = new MessageHistory();
    expect(history.length).toBe(0);
    history.addUser("1");
    history.addAssistant("2");
    expect(history.length).toBe(2);
  });

  it("should clear all messages", () => {
    const history = new MessageHistory();
    history.addUser("1");
    history.addAssistant("2");
    history.clear();
    expect(history.length).toBe(0);
    expect(history.getMessages()).toEqual([]);
  });

  it("should get last message", () => {
    const history = new MessageHistory();
    expect(history.getLastMessage()).toBeUndefined();
    history.addUser("Hello");
    history.addAssistant("Hi");
    expect(history.getLastMessage()).toEqual({ role: "assistant", content: "Hi" });
  });

  it("should remove last message", () => {
    const history = new MessageHistory();
    history.addUser("Hello");
    history.addAssistant("Hi");
    const removed = history.removeLast();
    expect(removed).toEqual({ role: "assistant", content: "Hi" });
    expect(history.length).toBe(1);
  });

  it("should handle removeLast on empty history", () => {
    const history = new MessageHistory();
    expect(history.removeLast()).toBeUndefined();
  });

  it("should maintain conversation alternation", () => {
    const history = new MessageHistory();
    history.addUser("Q1");
    history.addAssistant("A1");
    history.addUser("Q2");
    history.addAssistant("A2");

    const roles = history.getMessages().map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant"]);
  });
});