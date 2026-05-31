import { describe, it, expect, beforeEach } from "vitest";
import {
  TaskManager,
  executeTaskTool,
  taskCreateToolDefinition,
  taskUpdateToolDefinition,
  taskListToolDefinition,
  TASK_TOOLS,
} from "../src/task.js";

describe("TaskManager", () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  it("should create tasks with incremental IDs", () => {
    const id1 = manager.create("First task");
    const id2 = manager.create("Second task");
    expect(id1).toBe("task_1");
    expect(id2).toBe("task_2");
    expect(manager.length).toBe(2);
  });

  it("should create tasks with pending status", () => {
    manager.create("My task");
    const task = manager.get("task_1");
    expect(task?.status).toBe("pending");
  });
  
  it("should update task status", () => {
    manager.create("My task");
    const ok = manager.update("task_1", "in_progress");
    expect(ok).toBe(true);
    expect(manager.get("task_1")?.status).toBe("in_progress");
  });

  it("should return false when updating non-existent task", () => {
    expect(manager.update("task_999", "completed")).toBe(false);
  });

  it("should list all tasks", () => {
    manager.create("Task A");
    manager.create("Task B");
    expect(manager.list()).toHaveLength(2);
  });

  it("should filter tasks by status", () => {
    manager.create("Task A");
    manager.create("Task B");
    manager.update("task_1", "completed");
    expect(manager.list("completed")).toHaveLength(1);
    expect(manager.list("pending")).toHaveLength(1);
  });

  it("should format tasks for LLM", () => {
    manager.create("Read the file");
    manager.create("Write the output");
    manager.update("task_1", "completed");
    const formatted = manager.formatForLLM();
    expect(formatted).toContain("[x] task_1: Read the file");
    expect(formatted).toContain("[ ] task_2: Write the output");
  });

  it("should format empty tasks", () => {
    expect(manager.formatForLLM()).toBe("(no tasks)");
  });

  it("should format in_progress and failed tasks", () => {
    manager.create("In progress");
    manager.create("Failed");
    manager.update("task_1", "in_progress");
    manager.update("task_2", "failed");
    const formatted = manager.formatForLLM();
    expect(formatted).toContain("[~] task_1");
    expect(formatted).toContain("[!] task_2");
  });

  it("should clear all tasks", () => {
    manager.create("Task A");
    manager.create("Task B");
    manager.clear();
    expect(manager.length).toBe(0);
    // IDs reset
    const id = manager.create("New task");
    expect(id).toBe("task_1");
  });

  it("should return undefined for non-existent task", () => {
    expect(manager.get("task_999")).toBeUndefined();
  });
});

describe("executeTaskTool", () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  it("should create a task", () => {
    const result = executeTaskTool(manager, "task_create", {
      description: "Write tests",
    });
    expect(result).toBe("Created task_1: Write tests");
    expect(manager.length).toBe(1);
  });

  it("should return error for missing description", () => {
    const result = executeTaskTool(manager, "task_create", {});
    expect(result).toContain("Error");
  });

  it("should update a task", () => {
    manager.create("My task");
    const result = executeTaskTool(manager, "task_update", {
      id: "task_1",
      status: "completed",
    });
    expect(result).toBe("Updated task_1 → completed");
  });

  it("should return error for non-existent task update", () => {
    const result = executeTaskTool(manager, "task_update", {
      id: "task_999",
      status: "completed",
    });
    expect(result).toContain("not found");
  });

  it("should list tasks", () => {
    manager.create("Task A");
    manager.create("Task B");
    const result = executeTaskTool(manager, "task_list", {});
    expect(result).toContain("task_1");
    expect(result).toContain("task_2");
  });

  it("should list filtered tasks", () => {
    manager.create("Task A");
    manager.create("Task B");
    manager.update("task_1", "completed");
    const result = executeTaskTool(manager, "task_list", {
      status: "completed",
    });
    expect(result).toContain("task_1");
    expect(result).not.toContain("task_2");
  });

  it("should return no tasks message for empty list", () => {
    const result = executeTaskTool(manager, "task_list", {});
    expect(result).toBe("(no tasks)");
  });

  it("should return error for unknown tool", () => {
    const result = executeTaskTool(manager, "unknown_tool", {});
    expect(result).toContain("Error");
  });
});

describe("tool definitions", () => {
  it("should have correct tool names", () => {
    expect(taskCreateToolDefinition.name).toBe("task_create");
    expect(taskUpdateToolDefinition.name).toBe("task_update");
    expect(taskListToolDefinition.name).toBe("task_list");
  });

  it("should export all tools in TASK_TOOLS", () => {
    expect(TASK_TOOLS).toHaveLength(3);
    expect(TASK_TOOLS.map((t) => t.name)).toEqual([
      "task_create",
      "task_update",
      "task_list",
    ]);
  });
});