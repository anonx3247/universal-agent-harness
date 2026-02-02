#!/usr/bin/env node

import { Command } from "commander";
import { Err, SrchdError } from "./lib/error";
import { RunResource } from "./resources/run";
import { run as runExecution } from "./index";
import { Model, MODELS } from "./models/provider";
import { MessageResource } from "./resources/messages";
import { db } from "./db";
import { messages } from "./db/schema";
import { eq } from "drizzle-orm";
import { select, confirm, number, prompt } from "./lib/prompts";
import { listProfiles, getDefaultProfile, profileExists } from "./lib/profiles";
import { listProblems, problemExists, getProblemContent } from "./lib/problems";

const exitWithError = (err: Err<SrchdError>) => {
  console.error(
    `\x1b[31mError [${err.error.code}] ${err.error.message}\x1b[0m`,
  );
  if (err.error.cause) {
    console.error(`\x1b[31mCause: ${err.error.cause.message}\x1b[0m`);
  }
  process.exit(1);
};

const program = new Command();

program
  .name("agent-harness")
  .description("Universal agent harness management CLI")
  .version("0.1.0");

// Create command
program
  .command("create [name]")
  .description("Create a new run")
  .option("-p, --problem <id>", "Problem ID (directory name in problems/)")
  .option("-m, --model <model>", "AI model to use", "claude-sonnet-4-5")
  .option("-n, --agents <count>", "Number of agents", "1")
  .option("--profile <profile>", "Agent profile (defaults to 'example' or first available)")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (name?: string, options?: any) => {
    console.log("\n\x1b[1m=== Create New Run ===\x1b[0m\n");

    // Get run name
    if (!name) {
      name = await prompt("Run name: ");
      if (!name) {
        console.log("Error: Run name is required.");
        process.exit(1);
      }
    }

    // Check if run already exists
    const existing = await RunResource.findByName(name);
    if (existing.isOk()) {
      console.log(`Error: Run '${name}' already exists.`);
      process.exit(1);
    }

    // Get problem ID
    let problemId: string;
    if (options?.problem) {
      problemId = options.problem;
      // Validate problem exists
      if (!problemExists(problemId)) {
        console.log(`Error: Problem '${problemId}' not found.`);
        process.exit(1);
      }
    } else {
      // Get available problems
      const problemsResult = listProblems();
      if (problemsResult.isErr()) {
        console.log(`Error: ${problemsResult.error.message}`);
        console.log(`\nCreate a problem directory in ./problems/ with a problem.md file.`);
        process.exit(1);
      }
      const availableProblems = problemsResult.value;

      if (availableProblems.length === 0) {
        console.log("Error: No problems found.");
        console.log(`\nCreate a problem directory in ./problems/ with a problem.md file.`);
        process.exit(1);
      }

      problemId = await select(
        "Select problem:",
        availableProblems,
        availableProblems[0],
      );
    }

    // Get problem content for display
    const problemResult = getProblemContent(problemId);
    if (problemResult.isErr()) {
      return exitWithError(problemResult);
    }
    console.log(`\nProblem '${problemId}' loaded (${problemResult.value.length} characters)`);

    // Select model
    let model: Model;
    if (options?.model) {
      model = options.model as Model;
    } else {
      const modelChoices = Object.keys(MODELS) as Model[];
      model = await select(
        "Select AI model:",
        modelChoices,
        "claude-sonnet-4-5",
      );
    }

    // Get agent count
    let agentCount: number;
    if (options?.agents) {
      agentCount = parseInt(options.agents, 10);
    } else {
      agentCount = await number(
        "Number of agents",
        1,
        1,
        100,
      );
    }

    // Select profile
    let profile: string;
    if (options?.profile) {
      profile = options.profile;
      // Validate profile exists
      if (!profileExists(profile)) {
        console.log(`Error: Profile '${profile}' not found.`);
        process.exit(1);
      }
    } else {
      // Get available profiles
      const profilesResult = listProfiles();
      if (profilesResult.isErr()) {
        return exitWithError(profilesResult);
      }
      const validProfiles = profilesResult.value;

      // Get default profile
      const defaultProfileResult = getDefaultProfile();
      if (defaultProfileResult.isErr()) {
        return exitWithError(defaultProfileResult);
      }
      const defaultProfile = defaultProfileResult.value;

      profile = await select(
        "Select agent profile:",
        validProfiles,
        defaultProfile,
      );
    }

    // Create run
    const run = await RunResource.create({
      name,
      problem_id: problemId,
      model,
      agent_count: agentCount,
      profile,
    });

    const r = run.toJSON();
    console.log(`\n\x1b[32m✓ Run created successfully!\x1b[0m`);
    console.log(`\n  Name:    ${r.name}`);
    console.log(`  Model:   ${r.model}`);
    console.log(`  Agents:  ${r.agent_count}`);
    console.log(`  Profile: ${r.profile}`);
    console.log(`\nRun with: npx tsx src/agent-harness.ts run ${r.name}\n`);
  });

// List command
program
  .command("list")
  .description("List all runs")
  .action(async () => {
    const runs = await RunResource.all();

    if (runs.length === 0) {
      console.log("No runs found.");
      return;
    }

    console.log(`\n\x1b[1mRuns (${runs.length}):\x1b[0m\n`);
    for (const run of runs) {
      const r = run.toJSON();
      const cost = await MessageResource.totalCostForRun(run);
      const tokens = await MessageResource.totalTokensForRun(run);

      console.log(`  \x1b[1m${r.name}\x1b[0m`);
      console.log(`    Model:   ${r.model}`);
      console.log(`    Agents:  ${r.agent_count}`);
      console.log(`    Profile: ${r.profile}`);
      console.log(`    Cost:    $${cost.toFixed(4)} (${tokens.toLocaleString()} tokens)`);
      console.log();
    }
  });


// Run command
program
  .command("run <run-name>")
  .description("Run agents in a run")
  .option("--tick <agent>", "Run single tick for specific agent (0-indexed)")
  .option("--agent <index>", "Run specific agent continuously (0-indexed)")
  .option("--max-cost <amount>", "Maximum cost limit in dollars")
  .option("--no-thinking", "Disable extended thinking")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (runName: string, options?: any) => {
    // Find run
    const runRes = await RunResource.findByName(runName);
    if (runRes.isErr()) {
      return exitWithError(runRes);
    }
    const run = runRes.value;
    const runData = run.toJSON();
    const agentCount = runData.agent_count;

    console.log(`\n\x1b[1m=== Run: ${runName} ===\x1b[0m\n`);
    console.log(`  Model:   ${runData.model}`);
    console.log(`  Agents:  ${agentCount}`);
    console.log(`  Profile: ${runData.profile}`);

    const cost = await MessageResource.totalCostForRun(run);
    console.log(`  Current cost: $${cost.toFixed(4)}\n`);

    // Determine run mode
    let agentIndices: number[] = [];
    let singleTick = false;

    if (options?.tick !== undefined) {
      // Run single tick for specific agent
      const agentIndex = parseInt(options.tick, 10);
      if (agentIndex < 0 || agentIndex >= agentCount) {
        console.log(`Error: Agent index must be between 0 and ${agentCount - 1}`);
        process.exit(1);
      }
      agentIndices = [agentIndex];
      singleTick = true;
    } else if (options?.agent !== undefined) {
      // Run specific agent continuously
      const agentIndex = parseInt(options.agent, 10);
      if (agentIndex < 0 || agentIndex >= agentCount) {
        console.log(`Error: Agent index must be between 0 and ${agentCount - 1}`);
        process.exit(1);
      }
      agentIndices = [agentIndex];
    } else {
      // Interactive mode or all agents
      const runMode = await select(
        "Select run mode:",
        ["all-continuous", "single-tick", "specific-agent"] as const,
        "all-continuous",
      );

      if (runMode === "single-tick") {
        const agentIndex = await number(
          "Which agent to run one tick?",
          0,
          0,
          agentCount - 1,
        );
        agentIndices = [agentIndex];
        singleTick = true;
      } else if (runMode === "specific-agent") {
        const agentIndex = await number(
          "Which agent to run continuously?",
          0,
          0,
          agentCount - 1,
        );
        agentIndices = [agentIndex];
      } else {
        // All agents
        for (let i = 0; i < agentCount; i++) {
          agentIndices.push(i);
        }
      }
    }

    // Get max cost
    let maxCost: number | undefined;
    if (options?.maxCost !== undefined) {
      maxCost = parseFloat(options.maxCost);
    } else if (!singleTick) {
      const setCostLimit = await confirm("Set maximum cost limit?", false);
      if (setCostLimit) {
        maxCost = await number("Maximum cost in dollars", 5.0, 0.01);
      }
    }

    // Get thinking mode
    const thinking = options?.thinking !== false
      ? (options?.thinking === undefined
          ? await confirm("Enable extended thinking?", true)
          : true)
      : false;

    console.log("\n\x1b[1mStarting run...\x1b[0m\n");

    // Fast shutdown - exit cleanly
    const fastShutdown = (reason: string) => {
      console.log(`\n\x1b[33m${reason}\x1b[0m`);

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      process.exit(0);
    };

    // Set up keyboard listener for 'q' to quit (for continuous runs)
    if (!singleTick && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", (key) => {
        const char = key.toString();
        if (char === "q" || char === "Q") {
          fastShutdown("Quit requested.");
        }
        // Also handle Ctrl+C
        if (char === "\x03") {
          fastShutdown("Interrupted.");
        }
      });

      // Display instructions
      console.log("\n\x1b[36mPress 'q' to quit\x1b[0m\n");
    }

    // Determine which agent(s) to run
    const agentIndex = agentIndices.length === 1 ? agentIndices[0] : undefined;

    // Execute the run using the library function
    const result = await runExecution({
      runName,
      agentIndex,
      singleTick,
      maxCost,
      thinking,
      onCostUpdate: (currentCost: number) => {
        if (maxCost && currentCost > maxCost) {
          console.log(`\nCost limit reached: $${currentCost.toFixed(2)}`);
          fastShutdown("Cost limit reached.");
        }
      },
    });

    if (result.isErr()) {
      return exitWithError(result);
    }

    if (singleTick) {
      console.log("\n\x1b[32m✓ Single tick completed.\x1b[0m\n");
    } else {
      console.log("\n\x1b[32m✓ Run completed.\x1b[0m\n");
    }

    // Cleanup stdin if needed
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  });

// Clean command
program
  .command("clean <run-name>")
  .description("Delete a run and all its data")
  .action(async (runName: string) => {
    // Find run
    const runRes = await RunResource.findByName(runName);
    if (runRes.isErr()) {
      return exitWithError(runRes);
    }
    const run = runRes.value;
    const runId = run.toJSON().id;

    console.log(`\n\x1b[1m=== Clean Run: ${runName} ===\x1b[0m\n`);

    const confirmed = await confirm(
      "Delete run and all data?",
      false,
    );

    if (!confirmed) {
      console.log("Aborted.");
      return;
    }

    console.log(`\nDeleting run '${runName}'...`);

    // Delete messages
    console.log("  Deleting messages...");
    db.delete(messages).where(eq(messages.run, runId)).run();

    console.log("  Deleting run...");
    await run.delete();

    console.log(`\n\x1b[32m✓ Run '${runName}' deleted.\x1b[0m\n`);
  });

program.parse();
