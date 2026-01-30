import { assertNever } from "@app/lib/assert";
import { AnthropicModel, isAnthropicModel, AnthropicLLM } from "./anthropic";
import { GeminiModel, isGeminiModel, GeminiLLM } from "./gemini";
import { isMistralModel, MistralModel, MistralLLM } from "./mistral";
import { isMoonshotAIModel, MoonshotAIModel, MoonshotAILLM } from "./moonshotai";
import { isDeepseekModel, DeepseekModel, DeepseekLLM } from "./deepseek";
import { isOpenAIModel, OpenAIModel, OpenAILLM } from "./openai";
import { isRedPillModel, RedPillModel, RedPillLLM } from "./redpill";
import { LLM, ModelConfig } from "./index";

export type Model =
  | AnthropicModel
  | GeminiModel
  | OpenAIModel
  | MistralModel
  | MoonshotAIModel
  | DeepseekModel
  | RedPillModel;

export const MODELS: Record<Model, true> = {
  "claude-opus-4-5": true,
  "claude-sonnet-4-5": true,
  "claude-haiku-4-5": true,
  "gemini-3-pro-preview": true,
  "gemini-2.5-pro": true,
  "gemini-2.5-flash": true,
  "gemini-2.5-flash-lite": true,
  "gpt-5.2-pro": true,
  "gpt-5.2": true,
  "gpt-5.1": true,
  "gpt-5.1-codex": true,
  "gpt-5": true,
  "gpt-5-codex": true,
  "gpt-5-mini": true,
  "gpt-5-nano": true,
  "gpt-4.1": true,
  "devstral-medium-latest": true,
  "mistral-large-latest": true,
  "mistral-small-latest": true,
  "codestral-latest": true,
  "kimi-k2-thinking": true,
  "deepseek-chat": true,
  "deepseek-reasoner": true,
  "kimi-k2.5": true,
  "glm-4.7": true,
  "llama-3.3-70b-instruct": true,
  "qwen-2.5-7b-instruct": true,
};

export type provider =
  | "openai"
  | "moonshotai"
  | "deepseek"
  | "anthropic"
  | "gemini"
  | "mistral"
  | "redpill";

export function isProvider(str: string): str is provider {
  return [
    "gemini",
    "anthropic",
    "openai",
    "mistral",
    "moonshotai",
    "deepseek",
    "redpill",
  ].includes(str);
}

export function isModel(model: string): model is Model {
  return (
    isAnthropicModel(model) ||
    isOpenAIModel(model) ||
    isGeminiModel(model) ||
    isMistralModel(model) ||
    isMoonshotAIModel(model) ||
    isDeepseekModel(model) ||
    isRedPillModel(model)
  );
}

export function providerFromModel(
  model:
    | OpenAIModel
    | MoonshotAIModel
    | AnthropicModel
    | GeminiModel
    | MistralModel
    | DeepseekModel
    | RedPillModel,
): provider {
  if (isOpenAIModel(model)) return "openai";
  if (isMoonshotAIModel(model)) return "moonshotai";
  if (isAnthropicModel(model)) return "anthropic";
  if (isGeminiModel(model)) return "gemini";
  if (isMistralModel(model)) return "mistral";
  if (isDeepseekModel(model)) return "deepseek";
  if (isRedPillModel(model)) return "redpill";
  else assertNever(model);
}

/**
 * Factory function to create an LLM instance from a model and config.
 * Centralizes the logic for determining which LLM class to instantiate.
 */
export function createLLM(model: Model, config?: ModelConfig): LLM {
  config = config ?? {};
  if (isAnthropicModel(model)) {
    return new AnthropicLLM(config, model);
  } else if (isGeminiModel(model)) {
    return new GeminiLLM(config, model);
  } else if (isOpenAIModel(model)) {
    return new OpenAILLM(config, model);
  } else if (isMistralModel(model)) {
    return new MistralLLM(config, model);
  } else if (isMoonshotAIModel(model)) {
    return new MoonshotAILLM(config, model);
  } else if (isDeepseekModel(model)) {
    return new DeepseekLLM(config, model);
  } else if (isRedPillModel(model)) {
    return new RedPillLLM(config, model);
  } else {
    assertNever(model);
  }
}
