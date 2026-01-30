import { createLLM } from "./src/models/provider";
import { isRedPillModel } from "./src/models/redpill";

// Test model validation
console.log("Testing RedPill model validation...");
console.log("Is 'kimi-k2.5' a RedPill model?", isRedPillModel("kimi-k2.5")); // should be true
console.log("Is 'glm-4.7' a RedPill model?", isRedPillModel("glm-4.7")); // should be true
console.log("Is 'llama-3.3-70b-instruct' a RedPill model?", isRedPillModel("llama-3.3-70b-instruct")); // should be true
console.log("Is 'qwen-2.5-7b-instruct' a RedPill model?", isRedPillModel("qwen-2.5-7b-instruct")); // should be true
console.log("Is 'gpt-4' a RedPill model?", isRedPillModel("gpt-4")); // should be false

// Test LLM creation
console.log("\nTesting LLM creation...");
try {
  const llm = createLLM("kimi-k2.5", { maxTokens: 4096 });
  console.log("✓ Successfully created LLM for kimi-k2.5");
  console.log("  Max tokens:", llm.maxTokens());

  const llm2 = createLLM("glm-4.7");
  console.log("✓ Successfully created LLM for glm-4.7");
  console.log("  Max tokens:", llm2.maxTokens());

  const llm3 = createLLM("llama-3.3-70b-instruct");
  console.log("✓ Successfully created LLM for llama-3.3-70b-instruct");
  console.log("  Max tokens:", llm3.maxTokens());

  const llm4 = createLLM("qwen-2.5-7b-instruct");
  console.log("✓ Successfully created LLM for qwen-2.5-7b-instruct");
  console.log("  Max tokens:", llm4.maxTokens());

  // Test cost calculation
  console.log("\nTesting cost calculation...");
  const tokenUsage = {
    total: 1000,
    input: 800,
    output: 200,
    cached: 100,
    thinking: 0,
  };
  const cost = llm.cost([tokenUsage]);
  console.log("✓ Cost for token usage:", cost);

  console.log("\n✅ All tests passed!");
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
