import type {
    LLMProvider,
    Message,
    ChatOptions,
    ChatResponse,
    StreamEvent,
  } from "./llm/types.js";
  
  // Retry configuration
  export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  }
  
  export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
  };
  
  // Calculate exponential backoff delay with jitter
  export function calculateDelay(
    attempt: number,
    config: RetryConfig
  ): number {
    const exponential = config.baseDelayMs * Math.pow(2, attempt);
    const capped = Math.min(exponential, config.maxDelayMs);
    // Add jitter: random value between 0 and capped
    return Math.floor(Math.random() * capped);
  }
  
  // Check if an error is retryable (network/server errors)
  export function isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Network errors
      if (msg.includes("network") || msg.includes("econnreset") || msg.includes("timeout")) {
        return true;
      }
      // Rate limiting
      if (msg.includes("rate limit") || msg.includes("429")) {
        return true;
      }
      // Server errors (5xx)
      if (msg.includes("500") || msg.includes("502") || msg.includes("503")) {
        return true;
      }
    }
    // Check status code on error objects with status property
    const errObj = error as Record<string, unknown>;
    if (typeof errObj?.status === "number") {
      return errObj.status >= 500 || errObj.status === 429;
    }
    return false;
  }
  
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  /**
   * Wraps an LLM provider with automatic retry logic.
   * Retries on network errors, rate limits, and server errors.
   */
  export class RetryProvider implements LLMProvider {
    private provider: LLMProvider;
    private config: RetryConfig;
  
    constructor(provider: LLMProvider, config?: Partial<RetryConfig>) {
      this.provider = provider;
      this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    }
  
    async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
      let lastError: unknown;
  
      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          return await this.provider.chat(messages, options);
        } catch (error) {
          lastError = error;
          if (!isRetryable(error) || attempt === this.config.maxRetries) {
            throw error;
          }
          const delay = calculateDelay(attempt, this.config);
          await sleep(delay);
        }
      }
  
      throw lastError;
    }
  
    async *stream(
      messages: Message[],
      options?: ChatOptions
    ): AsyncIterable<StreamEvent> {
      let lastError: unknown;
  
      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          yield* this.provider.stream(messages, options);
          return;
        } catch (error) {
          lastError = error;
          if (!isRetryable(error) || attempt === this.config.maxRetries) {
            throw error;
          }
          const delay = calculateDelay(attempt, this.config);
          await sleep(delay);
        }
      }
  
      throw lastError;
    }
  }
  
  /**
   * Wraps a tool executor to catch errors and return them as strings
   * instead of throwing, so the LLM can see and handle the error.
   */
  export function safeToolExecutor(
    executor: (name: string, input: Record<string, unknown>) => Promise<string>,
    knownTools?: Set<string>
  ): (name: string, input: Record<string, unknown>) => Promise<string> {
    return async (name: string, input: Record<string, unknown>) => {
      // Check if tool is known
      if (knownTools && !knownTools.has(name)) {
        return `Error: unknown tool "${name}". Available tools: ${[...knownTools].join(", ")}`;
      }
  
      try {
        return await executor(name, input);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return `Error executing ${name}: ${message}`;
      }
    };
  }