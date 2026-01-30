# Universal Agent Harness

A multi-agent orchestration system with MCP (Model Context Protocol) server support. Run AI agents with configurable tools and capabilities.

## Features

- 🤖 Multi-agent orchestration
- 🔌 MCP server integration for extensible tool support
- 💾 SQLite-based experiment tracking
- 💰 Cost and token usage tracking
- 📊 Support for multiple LLM providers (Anthropic, OpenAI, Google, Mistral, Deepseek, etc.)
- 📚 Library and CLI interfaces
- 📁 Dynamic profile and problem discovery from directories

## Installation

```bash
npm install universal-agent-harness
```

## Library Usage

```typescript
import { createExperiment, runExperiment } from 'universal-agent-harness';

// Create an experiment
const experiment = await createExperiment({
  name: "solve-math-problem",
  problemId: "factorial-problem",  // References ./problems/factorial-problem/
  model: "claude-sonnet-4-5",
  agentCount: 1,
  profile: "example"
});

// Run the experiment
await runExperiment({
  experimentName: "solve-math-problem",
  singleTick: true,
  onMessage: (msg) => console.log("Agent output:", msg)
});
```

### Profiles and Problems

**Profiles** define agent behavior and are stored in `./profiles/` (configurable via `PROFILES_DIR`):
- `prompt.md` - System prompt for the agent
- `settings.json` - MCP server configuration (optional)
- Any additional files accessible via `getProfilePath(profile, relativePath)`

**Problems** are stored in `./problems/` (configurable via `PROBLEMS_DIR`):
- Each problem is a directory with a unique ID
- Must contain `problem.md` with the problem statement
- Can include additional files accessible via `getProblemPath(problemId, relativePath)`

Example structure:
```
problems/
  factorial-problem/
    problem.md
    test-cases.json
profiles/
  example/
    prompt.md
    settings.json
```

### MCP Server Configuration

Configure MCP servers in `profiles/{profile}/settings.json`:

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
      "name": "github",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true
    }
  ]
}
```

## CLI Usage

```bash
# Create an experiment
npx agent-harness create my-experiment \
  -p factorial-problem \
  -m claude-sonnet-4-5 \
  -n 1 \
  --profile example

# Run experiment (single tick)
npx agent-harness run my-experiment --tick 0

# Run experiment continuously
npx agent-harness run my-experiment

# Run specific agent
npx agent-harness run my-experiment --agent 0

# Run with cost limit
npx agent-harness run my-experiment --max-cost 5.0

# List experiments
npx agent-harness list

# Clean up experiment
npx agent-harness clean my-experiment
```

## API Reference

### `createExperiment(config)`

Create a new experiment.

**Parameters:**
- `name` (string): Unique experiment name
- `problemId` (string): Problem ID (directory name in `./problems/`)
- `model` (Model): AI model to use
- `agentCount` (number, optional): Number of agents (default: 1)
- `profile` (string, optional): Profile name (default: "example")

### `runExperiment(config)`

Run an experiment.

**Parameters:**
- `experimentName` (string): Experiment name
- `agentIndex` (number, optional): Run specific agent
- `singleTick` (boolean, optional): Run one tick only
- `maxCost` (number, optional): Maximum cost limit
- `thinking` (boolean, optional): Enable extended thinking (default: true)
- `onMessage` (function, optional): Message callback
- `onCostUpdate` (function, optional): Cost update callback

### `getExperiment(name)`

Get experiment by name.

### `listExperiments()`

List all experiments.

### `getExperimentCost(experiment)`

Get total cost for an experiment.

### `deleteExperiment(name)`

Delete an experiment and all its data.

### Profile Utilities

- `listProfiles()` - Get all available profiles
- `getProfileDir(profile)` - Get profile directory path
- `getProfilePath(profile, relativePath)` - Resolve file path within profile

### Problem Utilities

- `listProblems()` - Get all available problems
- `getProblemDir(problemId)` - Get problem directory path
- `getProblemPath(problemId, relativePath)` - Resolve file path within problem
- `getProblemContent(problemId)` - Read problem.md content

### Model Utilities

- `createLLM(model, config?)` - Create an LLM instance for a given model
- `MODELS` - Record of all available models

**Example:**
```typescript
import { createLLM } from 'universal-agent-harness';

const llm = createLLM('claude-sonnet-4-5', {
  maxTokens: 4096,
  thinking: true
});
```

### Exported Types

The library exports all core types for TypeScript users:

**Model Types:**
- `Model` - Union type of all supported models
- `Message` - Agent message structure
- `TextContent`, `ToolUse`, `ToolResult`, `Thinking` - Message content types
- `Tool` - Tool definition structure
- `TokenUsage` - Token usage tracking
- `ModelConfig` - LLM configuration options
- `LLM` - Abstract LLM base class
- `ProviderData` - Provider-specific data

**Configuration Types:**
- `MCPServerConfig` - MCP server configuration
- `ProfileConfig` - Profile configuration with MCP servers
- `Result<T>` - Success/error result type

## Supported Models

- **Anthropic**: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5
- **OpenAI**: gpt-5.2-pro, gpt-5.2, gpt-5.1, gpt-5, gpt-4.1, gpt-5-mini, etc.
- **Google**: gemini-3-pro-preview, gemini-2.5-pro, gemini-2.5-flash
- **Mistral**: mistral-large-latest, devstral-medium-latest, codestral-latest
- **Deepseek**: deepseek-chat, deepseek-reasoner
- **Moonshot AI**: kimi-k2-thinking

## Development

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Build
npm run build
```

## Database

The system uses SQLite with Drizzle ORM:

```bash
# Generate migrations
npx drizzle-kit generate

# Run migrations
npx drizzle-kit migrate
```

## License

MIT
