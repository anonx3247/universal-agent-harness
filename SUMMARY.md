# Universal Agent Harness - Summary of Changes

## Completed Work

### 1. Removed Computer Tool and Docker Dependencies ✅
- Deleted `src/tools/computer.ts`, `src/computer/`, and `src/lib/image.ts`
- Removed all Dockerfiles from profile directories
- Removed Docker container management from CLI and Runner
- System now focuses purely on MCP server integration

### 2. Created Library API ✅
- Added `src/index.ts` with programmatic interface
- Exported functions:
  - `createExperiment()` - Create new experiments
  - `runExperiment()` - Run experiments with callbacks
  - `getExperiment()`, `listExperiments()` - Query experiments
  - `getExperimentCost()`, `getExperimentTokens()` - Get metrics
  - `deleteExperiment()` - Clean up experiments

### 3. Enhanced CLI ✅
- Added command-line options for non-interactive use:
  ```bash
  # Create experiment
  npx tsx src/agent-harness.ts create <name> -p problem.txt -m model -n count --profile name
  
  # Run with options
  npx tsx src/agent-harness.ts run <experiment> --tick 0  # single tick
  npx tsx src/agent-harness.ts run <experiment> --agent 0 # specific agent
  npx tsx src/agent-harness.ts run <experiment> --max-cost 5.0
  ```
- Kept interactive prompts as fallback for convenience

### 4. Simplified Profiles ✅
- Removed: `formal-math`, `security`, `arc-agi`
- Renamed: `research` → `example`
- Updated prompt to be general-purpose (no Docker/computer tool references)

### 5. Dynamic Profile Loading ✅
- Created `src/lib/profiles.ts` for profile management
- Profiles auto-discovered by reading directory
- Configurable via `PROFILES_DIR` environment variable
- Validates profiles (must contain `prompt.md`)
- Defaults to `example` or first alphabetically

### 6. Updated Documentation ✅
- Comprehensive README with library and CLI examples
- Updated CLAUDE.md with new architecture
- Documented MCP server configuration
- Added usage examples

## Library Usage Example

```typescript
import { createExperiment, runExperiment } from 'universal-agent-harness';

// Create an experiment
const experiment = await createExperiment({
  name: "solve-problem",
  problem: "Calculate the factorial of 10",
  model: "claude-sonnet-4-5",
  agentCount: 1,
  profile: "example"
});

// Run it
await runExperiment({
  experimentName: "solve-problem",
  singleTick: true,
  onMessage: (msg) => console.log("Agent:", msg)
});
```

## CLI Usage Examples

```bash
# Create experiment (non-interactive)
npx tsx src/agent-harness.ts create my-exp \
  -p problem.txt \
  -m claude-sonnet-4-5 \
  -n 1 \
  --profile example

# Create experiment (interactive)
npx tsx src/agent-harness.ts create

# Run single tick
npx tsx src/agent-harness.ts run my-exp --tick 0

# Run with cost limit
npx tsx src/agent-harness.ts run my-exp --max-cost 5.0

# List all experiments
npx tsx src/agent-harness.ts list

# Clean up
npx tsx src/agent-harness.ts clean my-exp
```

## MCP Server Configuration

Configure in `profiles/{profile}/settings.json`:

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "enabled": true
    },
    {
      "name": "memory",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "enabled": true
    }
  ]
}
```

## Environment Variables

- `PROFILES_DIR` - Custom profiles directory path (default: `./profiles`)
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_AI_API_KEY` - Google AI API key
- Other provider-specific keys

## Testing

Successfully tested:
- ✅ MCP server integration (memory server)
- ✅ Dynamic profile loading
- ✅ CLI with non-interactive options
- ✅ Experiment creation and execution
- ✅ Cost tracking
- ✅ Single tick and continuous modes

## Next Steps

To use this as a library:

1. Install dependencies: `npm install`
2. Run migrations: `npx drizzle-kit migrate`
3. Set API keys in environment
4. Import and use the library functions

To use the CLI:

```bash
# Run directly with tsx (development)
npx tsx src/agent-harness.ts <command>

# Or build and use as a package (production)
npm run build
npx agent-harness <command>
```

## Architecture

The system is now a pure MCP orchestration harness:
- No Docker/container dependencies
- Clean separation between library and CLI
- Flexible profile system
- Extensible via MCP servers
- Cost and token tracking
- Multi-agent support
- Multiple LLM providers
