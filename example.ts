/**
 * Example: Using Universal Agent Harness as a library
 */

import { createExperiment, runExperiment, getExperimentCost } from "./src/index";

async function main() {
  console.log("Creating experiment...");

  // Create an experiment
  const experiment = await createExperiment({
    name: "library-test",
    problem: "What is the square root of 144? Explain your reasoning.",
    model: "claude-sonnet-4-5",
    agentCount: 1,
    profile: "example"
  });

  console.log(`✓ Experiment created: ${experiment.toJSON().name}`);

  // Run the experiment for one tick
  console.log("\nRunning experiment...");
  await runExperiment({
    experimentName: "library-test",
    singleTick: true,
    thinking: true
  });

  // Get the cost
  const cost = await getExperimentCost(experiment);
  console.log(`\n✓ Experiment completed`);
  console.log(`Total cost: $${cost.toFixed(4)}`);
}

main().catch(console.error);
