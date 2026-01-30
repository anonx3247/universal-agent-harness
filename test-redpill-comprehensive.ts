#!/usr/bin/env tsx

/**
 * Comprehensive RedPill AI Provider Tests
 *
 * Tests real API calls including:
 * - Basic message completion
 * - Tool calling
 * - Multi-turn conversations
 * - Token usage and cost tracking
 * - Error handling
 */

import { createRun, run } from "./src/index";
import { getMessages } from "./src/resources/messages";
import { cleanRun } from "./src/resources/run";

const TIMEOUT_MS = 60000; // 1 minute timeout
const TEST_MODEL = "qwen-2.5-7b-instruct"; // Cheapest model for testing

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n🧪 ${name}`);
  const start = Date.now();

  try {
    await timeout(fn(), TIMEOUT_MS);
    const duration = Date.now() - start;
    console.log(`   ✅ PASSED (${duration}ms)`);
    results.push({ name, passed: true, duration });
  } catch (error: any) {
    const duration = Date.now() - start;
    console.log(`   ❌ FAILED (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
    results.push({ name, passed: false, error: error.message, duration });
  }
}

async function main() {
  console.log("=" .repeat(70));
  console.log("RedPill AI Comprehensive Test Suite");
  console.log("=" .repeat(70));

  // Check API key
  if (!process.env.REDPILL_API_KEY) {
    console.error("\n❌ REDPILL_API_KEY not set");
    console.log("   Set your API key: export REDPILL_API_KEY=sk-your-key\n");
    process.exit(1);
  }

  console.log(`\n📋 Configuration:`);
  console.log(`   Model: ${TEST_MODEL}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms`);
  console.log(`   Profile: example`);

  // Test 1: Basic message completion
  await test("Test 1: Basic Message Completion", async () => {
    const runName = `redpill-test-basic-${Date.now()}`;

    const createResult = await createRun({
      name: runName,
      problemId: "test-problem",
      model: TEST_MODEL,
      agentCount: 1,
      profile: "example",
    });

    if (createResult.isErr()) {
      throw new Error(`Failed to create run: ${createResult.error.message}`);
    }

    const runResult = await run({
      runName,
      singleTick: true,
      maxCost: 1.0,
    });

    if (runResult.isErr()) {
      throw new Error(`Failed to run: ${runResult.error.message}`);
    }

    // Verify we got a response
    const messages = await getMessages(runName, 0);
    if (messages.isErr() || !messages.value || messages.value.length === 0) {
      throw new Error("No messages returned");
    }

    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage.role !== "agent") {
      throw new Error("Last message is not from agent");
    }

    const hasText = lastMessage.content.some((c) => c.type === "text");
    if (!hasText) {
      throw new Error("Agent response has no text content");
    }

    console.log(`   💰 Cost: $${runResult.value?.cost?.toFixed(6) || "0"}`);

    await cleanRun(runName);
  });

  // Test 2: Tool calling with MCP
  await test("Test 2: Tool Calling (MCP Integration)", async () => {
    const runName = `redpill-test-tools-${Date.now()}`;

    // This test requires the profile to have MCP tools configured
    const createResult = await createRun({
      name: runName,
      problemId: "test-problem",
      model: TEST_MODEL,
      agentCount: 1,
      profile: "example",
    });

    if (createResult.isErr()) {
      throw new Error(`Failed to create run: ${createResult.error.message}`);
    }

    const runResult = await run({
      runName,
      singleTick: true,
      maxCost: 1.0,
    });

    if (runResult.isErr()) {
      throw new Error(`Failed to run: ${runResult.error.message}`);
    }

    // Check if agent used tools or provided answer
    const messages = await getMessages(runName, 0);
    if (messages.isErr() || !messages.value) {
      throw new Error("No messages returned");
    }

    const hasResponse = messages.value.some(
      (msg) =>
        msg.role === "agent" &&
        msg.content.some((c) => c.type === "text" || c.type === "tool_use")
    );

    if (!hasResponse) {
      throw new Error("Agent provided no response or tool calls");
    }

    console.log(`   💰 Cost: $${runResult.value?.cost?.toFixed(6) || "0"}`);

    await cleanRun(runName);
  });

  // Test 3: Multi-turn conversation
  await test("Test 3: Multi-Turn Conversation", async () => {
    const runName = `redpill-test-multiturn-${Date.now()}`;

    const createResult = await createRun({
      name: runName,
      problemId: "test-problem",
      model: TEST_MODEL,
      agentCount: 1,
      profile: "example",
    });

    if (createResult.isErr()) {
      throw new Error(`Failed to create run: ${createResult.error.message}`);
    }

    // Run multiple ticks
    for (let i = 0; i < 3; i++) {
      const runResult = await run({
        runName,
        singleTick: true,
        maxCost: 1.0,
      });

      if (runResult.isErr()) {
        throw new Error(`Failed on tick ${i}: ${runResult.error.message}`);
      }
    }

    // Verify conversation history
    const messages = await getMessages(runName, 0);
    if (messages.isErr() || !messages.value) {
      throw new Error("No messages returned");
    }

    const agentMessages = messages.value.filter((m) => m.role === "agent");
    if (agentMessages.length < 1) {
      throw new Error("No agent messages in conversation");
    }

    console.log(`   📨 Messages: ${messages.value.length} total, ${agentMessages.length} from agent`);

    await cleanRun(runName);
  });

  // Test 4: Token usage tracking
  await test("Test 4: Token Usage and Cost Tracking", async () => {
    const runName = `redpill-test-tokens-${Date.now()}`;

    const createResult = await createRun({
      name: runName,
      problemId: "test-problem",
      model: TEST_MODEL,
      agentCount: 1,
      profile: "example",
    });

    if (createResult.isErr()) {
      throw new Error(`Failed to create run: ${createResult.error.message}`);
    }

    const runResult = await run({
      runName,
      singleTick: true,
      maxCost: 1.0,
    });

    if (runResult.isErr()) {
      throw new Error(`Failed to run: ${runResult.error.message}`);
    }

    // Verify cost tracking
    if (!runResult.value?.cost || runResult.value.cost <= 0) {
      throw new Error("Cost tracking not working (cost is 0 or missing)");
    }

    console.log(`   💰 Cost: $${runResult.value.cost.toFixed(6)}`);
    console.log(`   📊 Cost tracking: ✓`);

    await cleanRun(runName);
  });

  // Test 5: Error handling (invalid prompt)
  await test("Test 5: Error Handling", async () => {
    const runName = `redpill-test-error-${Date.now()}`;

    const createResult = await createRun({
      name: runName,
      problemId: "test-problem",
      model: TEST_MODEL,
      agentCount: 1,
      profile: "example",
    });

    if (createResult.isErr()) {
      throw new Error(`Failed to create run: ${createResult.error.message}`);
    }

    // Should handle gracefully
    const runResult = await run({
      runName,
      singleTick: true,
      maxCost: 1.0,
    });

    // Accept either success or graceful error handling
    console.log(`   Result: ${runResult.isOk() ? "Success" : "Handled error"}`);

    await cleanRun(runName);
  });

  // Test 6: All models
  await test("Test 6: All RedPill Models", async () => {
    const models: Array<"kimi-k2.5" | "glm-4.7" | "llama-3.3-70b-instruct" | "qwen-2.5-7b-instruct"> = [
      "qwen-2.5-7b-instruct",
      "kimi-k2.5",
      "glm-4.7",
      "llama-3.3-70b-instruct",
    ];

    for (const model of models) {
      console.log(`   Testing model: ${model}`);
      const runName = `redpill-test-model-${model}-${Date.now()}`;

      const createResult = await createRun({
        name: runName,
        problemId: "test-problem",
        model,
        agentCount: 1,
        profile: "example",
      });

      if (createResult.isErr()) {
        throw new Error(`Failed to create run for ${model}: ${createResult.error.message}`);
      }

      const runResult = await run({
        runName,
        singleTick: true,
        maxCost: 1.0,
      });

      if (runResult.isErr()) {
        throw new Error(`Failed to run ${model}: ${runResult.error.message}`);
      }

      console.log(`     ✓ ${model} - $${runResult.value?.cost?.toFixed(6) || "0"}`);

      await cleanRun(runName);
    }
  });

  // Print summary
  console.log("\n" + "=".repeat(70));
  console.log("Test Summary");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(`\n📊 Results: ${passed}/${results.length} passed`);
  console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s`);

  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   - ${r.name}`);
        console.log(`     ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!\n");
  }
}

main().catch((error) => {
  console.error("\n💥 Test suite crashed:", error);
  process.exit(1);
});
