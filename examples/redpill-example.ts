#!/usr/bin/env tsx

/**
 * Example: Using RedPill AI Provider
 *
 * This example demonstrates how to use RedPill AI models
 * with the Universal Agent Harness.
 */

import { createRun, run } from "../src/index";

async function main() {
  console.log("RedPill AI Example\n");

  // Check for API key
  if (!process.env.REDPILL_API_KEY) {
    console.error("Error: REDPILL_API_KEY not set");
    console.log("Please set your RedPill API key:");
    console.log("  export REDPILL_API_KEY=sk-your-key-here\n");
    process.exit(1);
  }

  // Example problem: Code review
  const problem = `
Review the following Python function and suggest improvements:

\`\`\`python
def calculate_total(items):
    total = 0
    for item in items:
        total = total + item['price'] * item['quantity']
    return total
\`\`\`

Consider:
1. Error handling
2. Type safety
3. Performance
4. Readability
`.trim();

  console.log("Problem:", problem);
  console.log("\n" + "=".repeat(60) + "\n");

  // Create run
  console.log("Creating run with llama-70b model...");
  const runName = `redpill-example-${Date.now()}`;

  const createResult = await createRun({
    name: runName,
    problemId: "test-problem",
    model: "llama-3.3-70b-instruct", // Try: kimi-k2.5, glm-4.7, qwen-2.5-7b-instruct
    agentCount: 1,
    profile: "example",
  });

  if (createResult.isErr()) {
    console.error("Failed to create run:", createResult.error.message);
    process.exit(1);
  }

  console.log("✓ Run created\n");

  // Run
  console.log("Running...");
  const runResult = await run({
    runName,
    singleTick: true,
    maxCost: 5.0, // Limit cost to $5
  });

  if (runResult.isErr()) {
    console.error("Failed to run:", runResult.error.message);
    process.exit(1);
  }

  console.log("✓ Run completed");
  console.log("\nResults:");
  console.log("  Cost: $" + (runResult.value?.cost?.toFixed(4) || "0.0000"));
  console.log("\n" + "=".repeat(60) + "\n");

  // Get and display the agent's response
  const { getMessages } = await import("../src/resources/messages");
  const messages = await getMessages(runName, 0);

  if (messages.isOk() && messages.value) {
    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage && lastMessage.role === "agent") {
      console.log("Agent Response:\n");
      for (const content of lastMessage.content) {
        if (content.type === "text") {
          console.log(content.text);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");

  // Clean up
  console.log("Cleaning up run...");
  const { cleanRun } = await import("../src/resources/run");
  const cleanResult = await cleanRun(runName);
  if (cleanResult.isOk()) {
    console.log("✓ Done\n");
  } else {
    console.log("⚠️  Cleanup failed:", cleanResult.error.message, "\n");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
