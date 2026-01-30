#!/usr/bin/env node

import { Command } from "commander";
import { readFileContent } from "./lib/fs";
import { Err, SrchdError } from "./lib/error";
import { ExperimentResource } from "./resources/experiment";
import { Runner } from "./runner";
import { removeNulls } from "./lib/utils";
import { Model, MODELS } from "./models/provider";
import { MessageResource } from "./resources/messages";
import { db } from "./db";
import { messages } from "./db/schema";
import { eq } from "drizzle-orm";
import { select, confirm, number, prompt } from "./lib/prompts";
import { existsSync } from "fs";
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
  .description("Create a new experiment")
  .option("-p, --problem <id>", "Problem ID (directory name in problems/)")
  .option("-m, --model <model>", "AI model to use", "claude-sonnet-4-5")
  .option("-n, --agents <count>", "Number of agents", "1")
  .option("--profile <profile>", "Agent profile (defaults to 'example' or first available)")
  .action(async (name?: string, options?: any) => {
    console.log("\n\x1b[1m=== Create New Experiment ===\x1b[0m\n");

    // Get experiment name
    if (!name) {
      name = await prompt("Experiment name: ");
      if (!name) {
        console.log("Error: Experiment name is required.");
        process.exit(1);
      }
    }

    // Check if experiment already exists
    const existing = await ExperimentResource.findByName(name);
    if (existing.isOk()) {
      console.log(`Error: Experiment '${name}' already exists.`);
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
        availableProblems as any,
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
        validProfiles as any,
        defaultProfile,
      );
    }

    // Create experiment
    const experiment = await ExperimentResource.create({
      name,
      problem_id: problemId,
      model,
      agent_count: agentCount,
      profile,
    });

    const e = experiment.toJSON();
    console.log(`\n\x1b[32m✓ Experiment created successfully!\x1b[0m`);
    console.log(`\n  Name:    ${e.name}`);
    console.log(`  Model:   ${e.model}`);
    console.log(`  Agents:  ${e.agent_count}`);
    console.log(`  Profile: ${e.profile}`);
    console.log(`\nRun with: npx tsx src/agent-harness.ts run ${e.name}\n`);
  });

// List command
program
  .command("list")
  .description("List all experiments")
  .action(async () => {
    const experiments = await ExperimentResource.all();

    if (experiments.length === 0) {
      console.log("No experiments found.");
      return;
    }

    console.log(`\n\x1b[1mExperiments (${experiments.length}):\x1b[0m\n`);
    for (const exp of experiments) {
      const e = exp.toJSON();
      const cost = await MessageResource.totalCostForExperiment(exp);
      const tokens = await MessageResource.totalTokensForExperiment(exp);

      console.log(`  \x1b[1m${e.name}\x1b[0m`);
      console.log(`    Model:   ${e.model}`);
      console.log(`    Agents:  ${e.agent_count}`);
      console.log(`    Profile: ${e.profile}`);
      console.log(`    Cost:    $${cost.toFixed(4)} (${tokens.toLocaleString()} tokens)`);
      console.log();
    }
  });


// Run command
program
  .command("run <experiment>")
  .description("Run agents in an experiment")
  .option("--tick <agent>", "Run single tick for specific agent (0-indexed)")
  .option("--agent <index>", "Run specific agent continuously (0-indexed)")
  .option("--max-cost <amount>", "Maximum cost limit in dollars")
  .option("--no-thinking", "Disable extended thinking")
  .action(async (experimentName: string, options?: any) => {
    // Find experiment
    const experimentRes = await ExperimentResource.findByName(experimentName);
    if (experimentRes.isErr()) {
      return exitWithError(experimentRes);
    }
    const experiment = experimentRes.value;
    const expData = experiment.toJSON();
    const agentCount = expData.agent_count;

    console.log(`\n\x1b[1m=== Run Experiment: ${experimentName} ===\x1b[0m\n`);
    console.log(`  Model:   ${expData.model}`);
    console.log(`  Agents:  ${agentCount}`);
    console.log(`  Profile: ${expData.profile}`);

    const cost = await MessageResource.totalCostForExperiment(experiment);
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

    console.log("\n\x1b[1mStarting experiment...\x1b[0m\n");

    // Build runners for all agents
    const builders = await Promise.all(
      agentIndices.map((agentIndex) =>
        Runner.builder(experiment, agentIndex, {
          thinking,
        }),
      ),
    );
    for (const res of builders) {
      if (res.isErr()) {
        return exitWithError(res);
      }
    }
    const runners = removeNulls(
      builders.map((res: any) => {
        if (res.isOk()) {
          return res.value;
        }
        return null;
      }),
    );

    // Run single tick if specified
    if (singleTick) {
      console.log(`\nRunning single tick for agent ${agentIndices[0]}...\n`);
      const tickResults = await Promise.all(runners.map((r: any) => r.tick()));
      for (const tick of tickResults) {
        if (tick.isErr()) {
          return exitWithError(tick);
        }
      }
      console.log("\n\x1b[32m✓ Single tick completed.\x1b[0m\n");
      return;
    }

    // Check every 20 ticks except when near the max value
    const shouldCheck = (
      tickCount: number,
      lastVal: number,
      maxVal: number,
    ): boolean => (lastVal / maxVal) < 0.95 ? tickCount % 20 === 0 : true;

    let tickCount = 0;
    let lastCost = await MessageResource.totalCostForExperiment(experiment);

    // Fast shutdown - exit cleanly
    const fastShutdown = (reason: string) => {
      console.log(`\n\x1b[33m${reason}\x1b[0m`);

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      process.exit(0);
    };

    // Set up keyboard listener for 'q' to quit
    if (process.stdin.isTTY) {
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
    }

    // Display instructions
    console.log("\n\x1b[36mPress 'q' to quit\x1b[0m\n");

    // For continuous running, start each agent in its own independent loop
    const runnerPromises = runners.map(async (runner: any) => {
      while (true) {
        if (maxCost && shouldCheck(tickCount, lastCost, maxCost)) {
          lastCost = await MessageResource.totalCostForExperiment(experiment);
          if (lastCost > maxCost) {
            console.log(`\nCost limit reached: $${lastCost.toFixed(2)}`);
            fastShutdown("Cost limit reached.");
            return;
          }
        }

        const tick = await runner.tick();
        tickCount++;
        if (tick.isErr()) {
          // eslint-disable-next-line
          throw tick;
        }
      }
    });

    // Wait for agents to finish or stop
    try {
      await Promise.all(runnerPromises);
    } catch (error) {
      fastShutdown("Error occurred.");
      return exitWithError(error as any);
    }
  });

// Clean command
program
  .command("clean <experiment>")
  .description("Delete an experiment and all its data")
  .action(async (experimentName: string) => {
    // Find experiment
    const experimentRes = await ExperimentResource.findByName(experimentName);
    if (experimentRes.isErr()) {
      return exitWithError(experimentRes);
    }
    const experiment = experimentRes.value;
    const expId = experiment.toJSON().id;

    console.log(`\n\x1b[1m=== Clean Experiment: ${experimentName} ===\x1b[0m\n`);

    const confirmed = await confirm(
      "Delete experiment and all data?",
      false,
    );

    if (!confirmed) {
      console.log("Aborted.");
      return;
    }

    console.log(`\nDeleting experiment '${experimentName}'...`);

    // Delete messages
    console.log("  Deleting messages...");
    db.delete(messages).where(eq(messages.experiment, expId)).run();

    console.log("  Deleting experiment...");
    await experiment.delete();

    console.log(`\n\x1b[32m✓ Experiment '${experimentName}' deleted.\x1b[0m\n`);
  });

program.parse();
