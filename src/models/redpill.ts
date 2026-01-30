import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
} from "openai/resources/chat";
import {
  LLM,
  ModelConfig,
  Message,
  Tool,
  TokenUsage,
} from "./index";
import { PreTrainedTokenizer } from "@huggingface/transformers";

import OpenAI from "openai";
import { Result, err, ok } from "@app/lib/error";
import { assertNever } from "@app/lib/assert";
import { removeNulls } from "@app/lib/utils";
import { CompletionUsage } from "openai/resources/completions";

export type RedPillModel =
  | "kimi-k2.5"
  | "glm-4.7"
  | "llama-3.3-70b-instruct"
  | "qwen-2.5-7b-instruct";

export function isRedPillModel(model: string): model is RedPillModel {
  return [
    "kimi-k2.5",
    "glm-4.7",
    "llama-3.3-70b-instruct",
    "qwen-2.5-7b-instruct",
  ].includes(model);
}

// Map our model names to RedPill API format (with provider prefix)
function getRedPillAPIModelName(model: RedPillModel): string {
  const mapping: Record<RedPillModel, string> = {
    "kimi-k2.5": "moonshotai/kimi-k2.5",
    "glm-4.7": "zhipuai/glm-4",
    "llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
    "qwen-2.5-7b-instruct": "phala/qwen-2.5-7b-instruct",
  };
  return mapping[model];
}

type RedPillTokenPrices = {
  input: number;
  cacheHits: number;
  output: number;
};

function normalizeTokenPrices(
  costPerMillionInputTokens: number,
  costPerMillionOutputTokens: number,
  costPerMillionCacheTokens?: number,
): RedPillTokenPrices {
  return {
    input: costPerMillionInputTokens / 1_000_000,
    output: costPerMillionOutputTokens / 1_000_000,
    cacheHits: (costPerMillionCacheTokens ?? costPerMillionInputTokens * 0.1) / 1_000_000,
  };
}

// Pricing from https://www.redpill.ai/models (as of 2025-01-30)
// Note: Cache pricing not available, defaulting to 10% of input price
const TOKEN_PRICING: Record<RedPillModel, RedPillTokenPrices> = {
  "kimi-k2.5": normalizeTokenPrices(0.60, 3.00, 0.06),
  "glm-4.7": normalizeTokenPrices(0.85, 3.30, 0.085),
  "llama-3.3-70b-instruct": normalizeTokenPrices(2.00, 2.00, 0.20),
  "qwen-2.5-7b-instruct": normalizeTokenPrices(0.04, 0.10, 0.004),
};

export class RedPillLLM extends LLM {
  private client: OpenAI;
  private model: RedPillModel;

  constructor(config: ModelConfig, model: RedPillModel = "llama-3.3-70b-instruct") {
    super(config);
    this.client = new OpenAI({
      apiKey: process.env.REDPILL_API_KEY,
      baseURL: "https://api.redpill.ai/v1",
    });
    this.model = model;
  }

  messages(prompt: string, messages: Message[]) {
    const inputItems: ChatCompletionMessageParam[] = [
      { role: "system", content: prompt },
      ...removeNulls(
        messages
          .map((msg) => {
            switch (msg.role) {
              case "user":
                return msg.content.map((c) => {
                  switch (c.type) {
                    case "text":
                      return { role: "user" as const, content: c.text };
                    case "tool_result":
                      return {
                        role: "tool" as const,
                        name: c.toolUseName,
                        tool_call_id: c.toolUseId,
                        id: c.toolUseId,
                        content: JSON.stringify(c.content),
                      };
                    default:
                      return undefined;
                  }
                });
              case "agent":
                const message: ChatCompletionAssistantMessageParam & {
                  reasoning_content?: string;
                } = {
                  role: "assistant",
                  content: null,
                };
                msg.content.forEach((c) => {
                  switch (c.type) {
                    case "text":
                      message.content = c.text;
                      break;
                    case "thinking":
                      message.reasoning_content = c.thinking;
                      break;
                    case "tool_use":
                      message.tool_calls = message.tool_calls ?? [];
                      message.tool_calls.push({
                        type: "function" as const,
                        id: c.id,
                        function: {
                          name: c.name,
                          arguments: JSON.stringify(c.input),
                        },
                      });
                      break;
                  }
                });
                return [message];
            }
          })
          .flat(),
      ),
    ];

    return inputItems;
  }

  async generate(
    messages: Message[],
    prompt: string,
    tools: Tool[],
  ): Promise<Result<{ message: Message; tokenUsage?: TokenUsage }>> {
    try {
      const input = this.messages(prompt, messages);

      const response = await this.client.chat.completions.create(
        {
          model: getRedPillAPIModelName(this.model),
          messages: input,
          ...(tools.length > 0 && {
            tool_choice: "auto",
            tools: tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema as any,
              },
            })),
          }),
        },
        {},
      );

      const message = response.choices[0].message;
      const textContent = message.content;
      const thinkingContent =
        "reasoning_content" in message
          ? (message.reasoning_content as string)
          : undefined;
      const toolCalls = message.tool_calls;

      const output = [];

      if (textContent) {
        output.push({
          type: "text" as const,
          text: textContent,
          provider: null,
        });
      }

      if (thinkingContent) {
        output.push({
          type: "thinking" as const,
          thinking: thinkingContent,
          provider: null,
        });
      }

      if (toolCalls) {
        output.push(
          ...toolCalls
            .filter((t) => t.type === "function")
            .map((toolCall) => {
              return {
                type: "tool_use" as const,
                id: toolCall.id,
                name: toolCall.function.name,
                input: JSON.parse(toolCall.function.arguments),
                provider: {
                  redpill: {
                    id: toolCall.id,
                  },
                },
              };
            }),
        );
      }

      if (!textContent && !toolCalls) {
        output.push({
          type: "text" as const,
          text: "",
          provider: null,
        });
      }

      const tokenUsage = response.usage
        ? this.tokenUsage(response.usage)
        : undefined;

      return ok({
        message: {
          role: "agent",
          content: output,
        },
        tokenUsage,
      });
    } catch (error) {
      return err("model_error", "Failed to generate model response", error);
    }
  }

  private tokenUsage(usage: CompletionUsage): TokenUsage {
    return {
      total: usage.total_tokens,
      input: usage.prompt_tokens,
      output: usage.completion_tokens,
      cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
      thinking: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    };
  }

  protected costPerTokenUsage(tokenUsage: TokenUsage): number {
    const pricing = TOKEN_PRICING[this.model];
    const nonCachedInput = tokenUsage.input - tokenUsage.cached;
    const c =
      nonCachedInput * pricing.input +
      tokenUsage.output * pricing.output +
      tokenUsage.cached * pricing.cacheHits;
    return c;
  }

  async tokens(
    messages: Message[],
    prompt: string,
    tools: Tool[],
  ): Promise<Result<number>> {
    // Simple token estimation: ~4 chars per token
    const str = [messages, prompt, tools]
      .map((x) => JSON.stringify(x))
      .reduce((acc, cur) => acc + cur);

    const estimatedTokens = Math.ceil(str.length / 4);
    return ok(estimatedTokens);
  }

  maxTokens(): number {
    switch (this.model) {
      case "kimi-k2.5":
        return 262000; // 262K context from RedPill
      case "glm-4.7":
        return 128000;
      case "llama-3.3-70b-instruct":
        return 128000;
      case "qwen-2.5-7b-instruct":
        return 32000;
      default:
        assertNever(this.model);
    }
  }
}
