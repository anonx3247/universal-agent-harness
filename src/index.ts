/**
 * Universal Agent Harness Library
 *
 * A multi-agent orchestration system with MCP server support.
 * This library allows you to create and run AI agents that can connect to
 * MCP (Model Context Protocol) servers for various capabilities.
 */

import { RunResource } from "./resources/run";
import { MessageResource } from "./resources/messages";
import { Runner } from "./runner";
import { Model } from "./models/provider";
import { Message } from "./models";
import { Result, ok, err } from "./lib/error";

/** A stored message with its database ID */
export type StoredMessage = Message & { id: number };

/**
 * Configuration for creating a new run
 */
export interface CreateRunConfig {
  /** Unique name for the run */
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
 * Configuration for running (starting or continuing) a run
 */
export interface RunConfig {
  /** Name of the run to continue */
  runName: string;
  /** Optional: Run only specific agent (0-indexed) */
  agentIndex?: number;
  /** Optional: Run only one tick instead of continuous */
  singleTick?: boolean;
  /** Optional: Maximum cost in dollars before stopping */
  maxCost?: number;
  /** Optional: Enable extended thinking (default: true) */
  thinking?: boolean;
  /** Optional: Callback for each agent message */
  onMessage?: (message: StoredMessage) => void;
  /** Optional: Callback for cost updates */
  onCostUpdate?: (cost: number) => void;
  /** Optional: Stop condition — called with the latest message after each tick; return true to stop */
  stopOn?: (message: StoredMessage) => boolean;
}

/**
 * Create a new run
 *
 * @example
 * ```typescript
 * const run = await createRun({
 *   name: "my-run",
 *   problemId: "factorial-problem",
 *   model: "claude-sonnet-4-5",
 *   agentCount: 1,
 *   profile: "example"
 * });
 * ```
 */
export async function createRun(
  config: CreateRunConfig
): Promise<Result<RunResource>> {
  try {
    const run = await RunResource.create({
      name: config.name,
      problem_id: config.problemId,
      model: config.model,
      agent_count: config.agentCount ?? 1,
      profile: config.profile ?? "example",
    });

    return ok(run);
  } catch (error: any) {
    return err("resource_creation_error", error?.message || "Failed to create run", error);
  }
}

/**
 * Continue a run
 *
 * @example
 * ```typescript
 * await run({
 *   runName: "my-run",
 *   singleTick: true,
 *   onMessage: (msg) => console.log("Agent:", msg)
 * });
 * ```
 */
export async function run(
  config: RunConfig
): Promise<Result<{ cost: number; stopped?: true } | void>> {
  // Find run
  const runRes = await RunResource.findByName(config.runName);
  if (runRes.isErr()) {
    return runRes;
  }
  const run = runRes.value;
  const runData = run.toJSON();

  // Determine which agents to run
  const agentIndices: number[] = [];
  if (config.agentIndex !== undefined) {
    agentIndices.push(config.agentIndex);
  } else {
    for (let i = 0; i < runData.agent_count; i++) {
      agentIndices.push(i);
    }
  }

  // Build runners
  const builderResults = await Promise.all(
    agentIndices.map((agentIndex) =>
      Runner.builder(run, agentIndex, {
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

    // Calculate total cost
    const totalCost = await MessageResource.totalCostForRun(run);

    // Check stopOn for single tick
    if (config.stopOn) {
      const msgs = await MessageResource.listMessagesByRun(run);
      const latest = msgs[msgs.length - 1];
      if (latest && config.stopOn(latest.toJSON())) {
        return ok({ cost: totalCost, stopped: true as const });
      }
    }

    return ok({ cost: totalCost });
  }

  // Run continuously
  let tickCount = 0;
  let lastCost = await MessageResource.totalCostForRun(run);

  const runnerPromises = runners.map(async (runner: any) => {
    while (true) {
      const tick = await runner.tick();
      tickCount++;
      if (tick.isErr()) {
        return tick;
      }

      // Get latest message for callbacks and stop condition
      const latestMessages = await MessageResource.listMessagesByRun(run);
      const latest = latestMessages[latestMessages.length - 1];

      if (latest && config.onMessage) {
        config.onMessage(latest.toJSON());
      }

      // Check stop condition
      if (latest && config.stopOn && config.stopOn(latest.toJSON())) {
        return;
      }

      // Update cost after each tick
      if (config.onCostUpdate || config.maxCost) {
        lastCost = await MessageResource.totalCostForRun(run);
        if (config.onCostUpdate) {
          config.onCostUpdate(lastCost);
        }
        if (config.maxCost && lastCost > config.maxCost) {
          return;
        }
      }
    }
  });

  await Promise.all(runnerPromises);
  return ok(undefined);
}

/**
 * Get run by name
 */
export async function getRun(
  name: string
): Promise<Result<RunResource>> {
  return await RunResource.findByName(name);
}

/**
 * List all runs
 */
export async function listRuns(): Promise<RunResource[]> {
  return await RunResource.all();
}

/**
 * Get total cost for a run
 */
export async function getRunCost(
  run: RunResource
): Promise<number> {
  return await MessageResource.totalCostForRun(run);
}

/**
 * Get total tokens for a run
 */
export async function getRunTokens(
  run: RunResource
): Promise<number> {
  return await MessageResource.totalTokensForRun(run);
}

/**
 * Delete a run and all its data
 */
export async function deleteRun(name: string): Promise<Result<void>> {
  const runRes = await RunResource.findByName(name);
  if (runRes.isErr()) {
    return runRes;
  }

  const run = runRes.value;
  await run.delete();

  return { isOk: () => true, isErr: () => false, value: undefined } as any;
}

// Re-export types and utilities
export { RunResource } from "./resources/run";
export { MessageResource } from "./resources/messages";
export { Runner } from "./runner";

// Advisory API
export { sendAdvisory, getPendingAdvisories, advisoryEmitter } from "./lib/advisory";
export type { AdvisoryMessage } from "./lib/advisory";
export { AdvisoryResource } from "./resources/advisory";

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
