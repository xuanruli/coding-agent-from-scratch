import type { Message } from "./llm/types.js";

export class MessageHistory {
  private messages: Message[] = [];

  addUser(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistant(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getLastN(n: number): Message[] {
    return this.messages.slice(-n);
  }

  get length(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
  }

  getLastMessage(): Message | undefined {
    return this.messages[this.messages.length - 1];
  }

  removeLast(): Message | undefined {
    return this.messages.pop();
  }
}