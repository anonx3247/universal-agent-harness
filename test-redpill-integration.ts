#!/usr/bin/env tsx

import { createRun, run } from "./src/index";

async function testRedPillIntegration() {
  console.log("Testing RedPill AI Provider Integration\n");

  // Check for API key
  if (!process.env.REDPILL_API_KEY) {
    console.log("⚠️  REDPILL_API_KEY not found in environment");
    console.log("   Set REDPILL_API_KEY to run full integration test");
    console.log("   Example: export REDPILL_API_KEY=sk-your-key-here\n");
    process.exit(0);
  }

  console.log("✓ REDPILL_API_KEY found");

  // Test run creation
  console.log("\n1. Creating run with RedPill model...");
  const runName = `redpill-test-${Date.now()}`;

  const createResult = await createRun({
    name: runName,
    problemId: "tool-test",
    model: "kimi-k2.5", // Kimi supports tools
    agentCount: 1,
    profile: "example",
  });

  if (createResult.isErr()) {
    console.error("❌ Failed to create run:", createResult.error.message);
    process.exit(1);
  }

  console.log("✓ Run created:", runName);

  // Test running
  console.log("\n2. Running (single tick)...");
  const runResult = await run({
    runName,
    singleTick: true,
    maxCost: 1.0, // Limit cost to $1
  });

  if (runResult.isErr()) {
    console.error("❌ Failed to run:", runResult.error.message);
    process.exit(1);
  }

  console.log("✓ Run completed successfully");
  console.log("\n3. Results:");
  if (runResult.isOk() && runResult.value) {
    console.log(`   Total cost: $${runResult.value.cost.toFixed(6)}`);
  } else {
    console.log("   Total cost: N/A");
  }

  // Clean up
  console.log("\n4. Cleaning up...");
  const { cleanRun } = await import("./src/resources/run");
  const cleanResult = await cleanRun(runName);
  if (cleanResult.isErr()) {
    console.log("⚠️  Could not clean up:", cleanResult.error.message);
  } else {
    console.log("✓ Run cleaned up");
  }

  console.log("\n✅ Integration test passed!");
}

testRedPillIntegration().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
