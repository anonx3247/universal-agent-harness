/**
 * Universal Agent Harness Library
 *
 * A multi-agent orchestration system with MCP server support.
 * This library allows you to create and run AI agents that can connect to
 * MCP (Model Context Protocol) servers for various capabilities.
 */

import { ExperimentResource } from "./resources/experiment";
import { MessageResource } from "./resources/messages";
import { Runner } from "./runner";
import { Model } from "./models/provider";
import { MCPServerConfig } from "./lib/mcp-config";
import { Result } from "./lib/error";

/**
 * Configuration for creating a new experiment
 */
export interface CreateExperimentConfig {
  /** Unique name for the experiment */
  name: string;
  /** Problem ID (directory name in problems/) */
  problemId: string;
  /** AI model to use (e.g., "claude-sonnet-4-5") */
  model: Model;
  /** Number of agents to create (default: 1) */
  agentCount?: number;
  /** Profile name (default: "example") */
  profile?: string;
}

/**
 * Configuration for running an experiment
 */
export interface RunExperimentConfig {
  /** Name of the experiment to run */
  experimentName: string;
  /** Optional: Run only specific agent (0-indexed) */
  agentIndex?: number;
  /** Optional: Run only one tick instead of continuous */
  singleTick?: boolean;
  /** Optional: Maximum cost in dollars before stopping */
  maxCost?: number;
  /** Optional: Enable extended thinking (default: true) */
  thinking?: boolean;
  /** Optional: Callback for each agent message */
  onMessage?: (message: any) => void;
  /** Optional: Callback for cost updates */
  onCostUpdate?: (cost: number) => void;
}

/**
 * Create a new experiment
 *
 * @example
 * ```typescript
 * const experiment = await createExperiment({
 *   name: "my-experiment",
 *   problemId: "factorial-problem",
 *   model: "claude-sonnet-4-5",
 *   agentCount: 1,
 *   profile: "example"
 * });
 * ```
 */
export async function createExperiment(
  config: CreateExperimentConfig
): Promise<ExperimentResource> {
  const experiment = await ExperimentResource.create({
    name: config.name,
    problem_id: config.problemId,
    model: config.model,
    agent_count: config.agentCount ?? 1,
    profile: config.profile ?? "example",
  });

  return experiment;
}

/**
 * Run an experiment
 *
 * @example
 * ```typescript
 * await runExperiment({
 *   experimentName: "my-experiment",
 *   singleTick: true,
 *   onMessage: (msg) => console.log("Agent:", msg)
 * });
 * ```
 */
export async function runExperiment(
  config: RunExperimentConfig
): Promise<Result<void>> {
  // Find experiment
  const experimentRes = await ExperimentResource.findByName(config.experimentName);
  if (experimentRes.isErr()) {
    return experimentRes;
  }
  const experiment = experimentRes.value;
  const expData = experiment.toJSON();

  // Determine which agents to run
  const agentIndices: number[] = [];
  if (config.agentIndex !== undefined) {
    agentIndices.push(config.agentIndex);
  } else {
    for (let i = 0; i < expData.agent_count; i++) {
      agentIndices.push(i);
    }
  }

  // Build runners
  const builderResults = await Promise.all(
    agentIndices.map((agentIndex) =>
      Runner.builder(experiment, agentIndex, {
        thinking: config.thinking ?? true,
      })
    )
  );

  // Check for errors
  for (const res of builderResults) {
    if (res.isErr()) {
      return res;
    }
  }

  const runners = builderResults
    .filter((r) => r.isOk())
    .map((r) => r.value);

  // Run single tick if requested
  if (config.singleTick) {
    const tickResults = await Promise.all(runners.map((r: any) => r.tick()));
    for (const tick of tickResults) {
      if (tick.isErr()) {
        return tick;
      }
    }
    return { isOk: () => true, isErr: () => false, value: undefined } as any;
  }

  // Run continuously
  let tickCount = 0;
  let lastCost = await MessageResource.totalCostForExperiment(experiment);

  const runnerPromises = runners.map(async (runner: any) => {
    while (true) {
      // Check cost limit
      if (config.maxCost && tickCount % 20 === 0) {
        lastCost = await MessageResource.totalCostForExperiment(experiment);
        if (config.onCostUpdate) {
          config.onCostUpdate(lastCost);
        }
        if (lastCost > config.maxCost) {
          return;
        }
      }

      const tick = await runner.tick();
      tickCount++;
      if (tick.isErr()) {
        return tick;
      }
    }
  });

  await Promise.all(runnerPromises);
  return { isOk: () => true, isErr: () => false, value: undefined } as any;
}

/**
 * Get experiment by name
 */
export async function getExperiment(
  name: string
): Promise<Result<ExperimentResource>> {
  return await ExperimentResource.findByName(name);
}

/**
 * List all experiments
 */
export async function listExperiments(): Promise<ExperimentResource[]> {
  return await ExperimentResource.all();
}

/**
 * Get total cost for an experiment
 */
export async function getExperimentCost(
  experiment: ExperimentResource
): Promise<number> {
  return await MessageResource.totalCostForExperiment(experiment);
}

/**
 * Get total tokens for an experiment
 */
export async function getExperimentTokens(
  experiment: ExperimentResource
): Promise<number> {
  return await MessageResource.totalTokensForExperiment(experiment);
}

/**
 * Delete an experiment and all its data
 */
export async function deleteExperiment(name: string): Promise<Result<void>> {
  const experimentRes = await ExperimentResource.findByName(name);
  if (experimentRes.isErr()) {
    return experimentRes;
  }

  const experiment = experimentRes.value;
  await experiment.delete();

  return { isOk: () => true, isErr: () => false, value: undefined } as any;
}

// Re-export types and utilities
export { ExperimentResource } from "./resources/experiment";
export { MessageResource } from "./resources/messages";
export { Runner } from "./runner";

// Model types and utilities
export type { Model } from "./models/provider";
export { createLLM, MODELS } from "./models/provider";
export type {
  Message,
  TextContent,
  ToolUse,
  ToolResult,
  Thinking,
  Tool,
  TokenUsage,
  ModelConfig,
  ProviderData,
} from "./models";
export { LLM } from "./models";

// MCP and configuration types
export type { MCPServerConfig, ProfileConfig } from "./lib/mcp-config";
export type { Result } from "./lib/error";

// Profile utilities
export { listProfiles, getDefaultProfile, profileExists, getProfilesDir, getProfilePath, getProfileDir } from "./lib/profiles";

// Problem utilities
export { listProblems, problemExists, getProblemContent, getProblemPath, getProblemDir, getProblemsDir } from "./lib/problems";
