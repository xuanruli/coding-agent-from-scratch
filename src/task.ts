import * as z from "zod";
import type { Tool } from "./llm/types.js";
import { toInputSchema } from "./tools/schema.js";

// Task status
export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

const taskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

// A single task in the plan
export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
}

// Manages a list of tasks for the agent
export class TaskManager {
  private tasks: Task[] = [];
  private nextId = 1;

  // Create a new task and return its ID
  create(description: string): string {
    const id = `task_${this.nextId++}`;
    this.tasks.push({ id, description, status: "pending" });
    return id;
  }

  // Update the status of a task
  update(id: string, status: TaskStatus): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return false;
    task.status = status;
    return true;
  }

  // Get a single task by ID
  get(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  // List all tasks, optionally filtered by status
  list(status?: TaskStatus): Task[] {
    if (status) return this.tasks.filter((t) => t.status === status);
    return [...this.tasks];
  }

  // Format tasks as a readable string for LLM context
  formatForLLM(): string {
    if (this.tasks.length === 0) return "(no tasks)";
    return this.tasks
      .map((t) => {
        const icon =
          t.status === "completed"
            ? "[x]"
            : t.status === "in_progress"
              ? "[~]"
              : t.status === "failed"
                ? "[!]"
                : "[ ]";
        return `${icon} ${t.id}: ${t.description}`;
      })
      .join("\n");
  }

  // Clear all tasks
  clear(): void {
    this.tasks = [];
    this.nextId = 1;
  }

  get length(): number {
    return this.tasks.length;
  }
}

// Tool input schemas (single source of truth for type + JSON Schema)
export const taskCreateInputSchema = z.object({
  description: z.string().describe("Description of the task to create"),
});

export const taskUpdateInputSchema = z.object({
  id: z.string().describe("The task ID to update"),
  status: taskStatusSchema.describe("The new status for the task"),
});

export const taskListInputSchema = z.object({
  status: taskStatusSchema
    .optional()
    .describe("Filter tasks by status (optional)"),
});

// Tool definitions for task management
export const taskCreateToolDefinition: Tool = {
  name: "task_create",
  description: "Create a new task in the plan. Returns the task ID.",
  inputSchema: toInputSchema(taskCreateInputSchema),
};

export const taskUpdateToolDefinition: Tool = {
  name: "task_update",
  description:
    'Update the status of an existing task. Status can be "pending", "in_progress", "completed", or "failed".',
  inputSchema: toInputSchema(taskUpdateInputSchema),
};

export const taskListToolDefinition: Tool = {
  name: "task_list",
  description:
    "List all tasks in the current plan with their status. Optionally filter by status.",
  inputSchema: toInputSchema(taskListInputSchema),
};

// Execute a task management tool
export function executeTaskTool(
  manager: TaskManager,
  name: string,
  input: Record<string, unknown>
): string {
  switch (name) {
    case "task_create": {
      const desc = input.description as string;
      if (!desc) return "Error: description is required";
      const id = manager.create(desc);
      return `Created ${id}: ${desc}`;
    }
    case "task_update": {
      const id = input.id as string;
      const status = input.status as TaskStatus;
      if (!id || !status) return "Error: id and status are required";
      const ok = manager.update(id, status);
      return ok ? `Updated ${id} → ${status}` : `Error: task ${id} not found`;
    }
    case "task_list": {
      const status = input.status as TaskStatus | undefined;
      const tasks = manager.list(status);
      if (tasks.length === 0) return "(no tasks)";
      return tasks
        .map((t) => `${t.id} [${t.status}]: ${t.description}`)
        .join("\n");
    }
    default:
      return `Error: unknown task tool "${name}"`;
  }
}

// All task tool definitions
export const TASK_TOOLS: Tool[] = [
  taskCreateToolDefinition,
  taskUpdateToolDefinition,
  taskListToolDefinition,
];
