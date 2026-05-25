import { AnthropicProvider, type AnthropicConfig } from "./anthropic.js";
import {
  OpenAICompatibleProvider,
  type OpenAICompatibleConfig,
} from "./openai-compatible.js";
import type { LLMProvider } from "./types.js";

export interface ProviderConfig {
  provider: "anthropic" | "openai-compatible";
  apiKey: string;
  model?: string;
  baseURL?: string;
}

// Create an LLM provider instance from config
export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === "anthropic") {
    return new AnthropicProvider({
      apiKey: config.apiKey,
      model: config.model,
    } as AnthropicConfig);
  }

  if (config.provider !== "openai-compatible") {
    throw new Error(`Unknown provider: ${config.provider}`);
  }

  // OpenAI-compatible provider requires baseURL and model
  if (!config.baseURL) {
    throw new Error("baseURL is required for openai-compatible provider");
  }
  if (!config.model) {
    throw new Error("model is required for openai-compatible provider");
  }

  return new OpenAICompatibleProvider({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    model: config.model,
  } as OpenAICompatibleConfig);
}