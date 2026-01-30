#!/usr/bin/env node

import { Command } from "commander";
import { readFileContent } from "./lib/fs";
import { Err, err, SrchdError } from "./lib/error";
import { ExperimentResource } from "./resources/experiment";
import { Runner } from "./runner";
import { isArrayOf, isString, removeNulls } from "./lib/utils";
import { buildComputerImage } from "./computer/image";
import { computerId, Computer } from "./computer";
import { Model, isModel, MODELS } from "./models/provider";
import { MessageResource } from "./resources/messages";
import { db } from "./db";
import { messages } from "./db/schema";
import { eq } from "drizzle-orm";
import { spawn } from "child_process";
import { select, confirm, number, prompt } from "./lib/prompts";
import { existsSync } from "fs";

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

// Create command - interactive mode
program
  .command("create [name]")
  .description("Create a new experiment (interactive)")
  .action(async (name?: string) => {
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

    // Get problem file
    let problemPath = await prompt("Problem file path: ");
    while (!existsSync(problemPath)) {
      console.log(`Error: File '${problemPath}' not found.`);
      problemPath = await prompt("Problem file path: ");
    }

    const problem = await readFileContent(problemPath);
    if (problem.isErr()) {
      return exitWithError(problem);
    }

    console.log(`\nProblem loaded (${problem.value.length} characters)`);

    // Select model
    const modelChoices = Object.keys(MODELS) as Model[];
    const model = await select(
      "Select AI model:",
      modelChoices,
      "claude-sonnet-4-5",
    );

    // Get agent count
    const agentCount = await number(
      "Number of agents",
      1,
      1,
      100,
    );

    // Select profile
    const validProfiles = ["research", "formal-math", "security", "arc-agi"] as const;
    const profile = await select(
      "Select agent profile:",
      validProfiles,
      "research",
    );

    // Create experiment
    const experiment = await ExperimentResource.create({
      name,
      problem: problem.value,
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


// Run command - interactive mode
program
  .command("run <experiment>")
  .description("Run agents in an experiment (interactive)")
  .action(async (experimentName: string) => {
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

    // Ask run mode
    const runMode = await select(
      "Select run mode:",
      ["all-continuous", "single-tick", "specific-agent"] as const,
      "all-continuous",
    );

    let agentIndices: number[] = [];
    let singleTick = false;

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

    // Ask for max cost
    const setCostLimit = await confirm("Set maximum cost limit?", false);
    let maxCost: number | undefined;
    if (setCostLimit) {
      maxCost = await number("Maximum cost in dollars", 5.0, 0.01);
    }

    // Ask for thinking mode
    const thinking = await confirm("Enable extended thinking?", true);

    // Ask to copy files
    const copyFiles = await confirm("Copy files to agent containers?", false);
    let filePaths: string[] = [];
    if (copyFiles) {
      console.log("Enter file/directory paths (one per line, empty line to finish):");
      while (true) {
        const path = await prompt("  Path: ");
        if (!path) break;
        if (!existsSync(path)) {
          console.log(`  Warning: Path '${path}' not found.`);
          const stillAdd = await confirm("  Add anyway?", false);
          if (!stillAdd) continue;
        }
        filePaths.push(path);
      }
    }

    console.log("\n\x1b[1mStarting experiment...\x1b[0m\n");

    // Build Docker image
    console.log(`Building Docker image for ${expData.profile} profile...`);
    const buildRes = await buildComputerImage(expData.profile);
    if (buildRes.isErr()) {
      return exitWithError(buildRes);
    }
    console.log("Docker image built successfully.");

    // Ensure computers are created
    const imageName = `agent-computer:${expData.profile}`;
    for (const agentIndex of agentIndices) {
      const computerRes = await Computer.ensure(
        computerId(experiment, agentIndex),
        imageName,
      );
      if (computerRes.isErr()) {
        return exitWithError(computerRes);
      }
    }

    // Copy files if specified
    if (filePaths.length > 0) {
      console.log(`Copying ${filePaths.length} file(s) to containers...`);
      for (const agentIndex of agentIndices) {
        for (const pathStr of filePaths) {
          const res = await Computer.copyToComputer(
            computerId(experiment, agentIndex),
            pathStr,
          );
          if (res.isErr()) {
            return exitWithError(res);
          }
        }
      }
      console.log("Files copied successfully.");
    }

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
      builders.map((res) => {
        if (res.isOk()) {
          return res.value;
        }
        return null;
      }),
    );

    // Run single tick if specified
    if (singleTick) {
      console.log(`\nRunning single tick for agent ${agentIndices[0]}...\n`);
      const tickResults = await Promise.all(runners.map((r) => r.tick()));
      for (const tick of tickResults) {
        if (tick.isErr()) {
          return exitWithError(tick);
        }
      }
      // Stop containers after single tick
      await Computer.stopByExperiment(experimentName);
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

    // Fast shutdown - spawn background process to stop containers and exit immediately
    const fastShutdown = (reason: string) => {
      console.log(`\n\x1b[33m${reason}\x1b[0m`);
      console.log("Stopping containers in background...");

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      // Spawn detached process to stop containers in background
      const child = spawn(
        process.execPath,
        [
          "-e",
          `require("${__dirname}/computer").Computer.stopByExperiment("${experimentName}").then(() => process.exit(0))`,
        ],
        {
          detached: true,
          stdio: "ignore",
          cwd: process.cwd(),
          env: process.env,
        },
      );
      child.unref();

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
    console.log("\n\x1b[36mPress 'q' to quit (containers will be stopped in background, data preserved)\x1b[0m\n");

    // For continuous running, start each agent in its own independent loop
    const runnerPromises = runners.map(async (runner) => {
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

    const cleanMode = await select(
      "What to clean?",
      ["everything", "containers-only"] as const,
      "everything",
    );

    const confirmed = await confirm(
      cleanMode === "everything"
        ? "Delete experiment and all data (including containers)?"
        : "Delete only Docker containers (keep database)?",
      false,
    );

    if (!confirmed) {
      console.log("Aborted.");
      return;
    }

    if (cleanMode === "containers-only") {
      console.log(`\nDeleting Docker containers for '${experimentName}'...`);
      const terminateRes = await Computer.terminateByExperiment(experimentName);
      if (terminateRes.isErr()) {
        return exitWithError(terminateRes);
      }
      console.log(`\x1b[32m✓ Deleted ${terminateRes.value} container(s).\x1b[0m\n`);
      return;
    }

    console.log(`\nDeleting experiment '${experimentName}'...`);

    // Delete Docker containers first
    console.log("  Deleting Docker containers...");
    const terminateRes = await Computer.terminateByExperiment(experimentName);
    if (terminateRes.isOk()) {
      console.log(`    Deleted ${terminateRes.value} container(s).`);
    }

    // Delete messages
    console.log("  Deleting messages...");
    db.delete(messages).where(eq(messages.experiment, expId)).run();

    console.log("  Deleting experiment...");
    await experiment.delete();

    console.log(`\n\x1b[32m✓ Experiment '${experimentName}' deleted.\x1b[0m\n`);
  });

program.parse();
