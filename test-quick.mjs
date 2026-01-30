#!/usr/bin/env node
/**
 * Quick test of the library functionality
 * Run with: npx tsx test-quick.mjs
 */

import { createExperiment, runExperiment, getExperimentCost, listProfiles } from './src/index.ts';

console.log('🚀 Testing Universal Agent Harness Library\n');

// Test profile discovery
console.log('📁 Available profiles:');
const profiles = listProfiles();
if (profiles.isOk()) {
  console.log('  ', profiles.value.join(', '));
} else {
  console.error('Error:', profiles.error);
  process.exit(1);
}

console.log('\n✅ Library is ready to use!\n');
console.log('Example usage:');
console.log(`
import { createExperiment, runExperiment } from './src/index.ts';

const exp = await createExperiment({
  name: "my-experiment",
  problem: "Your problem here",
  model: "claude-sonnet-4-5",
  agentCount: 1,
  profile: "example"
});

await runExperiment({
  experimentName: "my-experiment",
  singleTick: true
});
`);
