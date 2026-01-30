# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Universal Agent Harness** is a multi-agent orchestration system that runs AI agents with configurable MCP (Model Context Protocol) servers. It provides both a library API and CLI for creating and managing agent experiments.

## Core Architecture

### Agent Execution Model

- **Tick-based execution**: Each agent runs in an independent async loop, processing one "tick" per iteration
- **Runner orchestration** (`src/runner/index.ts`): The Runner class manages agent lifecycles, message history, and tool execution via MCP servers
- **MCP Integration**: Agents connect to configured MCP servers to access tools and capabilities

### Key Components

```
src/
├── index.ts              # Library API exports
├── agent-harness.ts      # CLI entry point (commands: create, run, clean, list)
├── runner/               # Core agent execution orchestration
│   ├── index.ts          # Runner class - manages agent ticks and tool calls
│   └── config.ts         # RunConfig type definitions
├── models/               # LLM provider integrations (Anthropic, OpenAI, Gemini, Mistral, etc.)
├── tools/                # Reserved for future tool integrations
│   └── index.ts          # Tool exports (currently empty)
├── db/                   # SQLite database with Drizzle ORM
│   ├── index.ts          # DB connection
│   └── schema.ts         # Schema: experiments, messages
└── lib/                  # Utilities (error handling, async, fs, mcp)
    ├── mcp.ts            # MCP client/server utilities
    └── mcp-config.ts     # MCP configuration loading
```

### Database Schema

The database uses SQLite with Drizzle ORM:

- **experiments**: Stores experiment metadata (name, problem, model, agent_count, profile)
- **messages**: Stores agent conversation history with token counts and costs

### MCP Server Configuration

Agents connect to MCP servers defined in `profiles/{profile}/settings.json`:

All tools are provided via configured MCP servers in the profile's `settings.json` file.

## Development Commands

### Setup
```bash
npm install                    # Install dependencies
npx drizzle-kit generate       # Generate migrations
npx drizzle-kit migrate        # Run database migrations
```

### Type Checking and Linting
```bash
npm run typecheck              # Run TypeScript type checking
npm run lint                   # Run ESLint on src/
```

### Running with tsx
The project uses tsx for development (no build needed):

```bash
# CLI usage
npx tsx src/agent-harness.ts create my-exp -p problem.txt -m claude-sonnet-4-5
npx tsx src/agent-harness.ts run my-exp --tick 0

# Library usage
npx tsx example.ts
```

## Library API

The main library exports are in `src/index.ts`:

```typescript
import { createExperiment, runExperiment } from "./src/index";

// Create experiment
const exp = await createExperiment({
  name: "test",
  problem: "Solve this problem...",
  model: "claude-sonnet-4-5",
  agentCount: 1,
  profile: "example"
});

// Run experiment
await runExperiment({
  experimentName: "test",
  singleTick: true
});
```

## CLI Usage

```bash
# Create experiment (non-interactive)
npx tsx src/agent-harness.ts create <name> -p problem.txt -m claude-sonnet-4-5 -n 1 --profile example

# Create experiment (interactive)
npx tsx src/agent-harness.ts create

# Run single tick
npx tsx src/agent-harness.ts run <experiment> --tick 0

# Run specific agent continuously
npx tsx src/agent-harness.ts run <experiment> --agent 0

# Run with cost limit
npx tsx src/agent-harness.ts run <experiment> --max-cost 5.0

# List experiments
npx tsx src/agent-harness.ts list

# Clean up
npx tsx src/agent-harness.ts clean <experiment>
```

## Key Design Patterns

### Result Type for Error Handling
The codebase uses a `Result<T>` type (success/failure) for error propagation rather than throwing exceptions:

```typescript
const result = await someOperation();
if (!result.success) {
  return result; // Propagate error
}
const data = result.data;
```

### MCP Client-Server Architecture
Each agent connects to MCP servers defined in the profile's `settings.json`:
- MCP servers can be stdio-based (spawned processes) or SSE-based (HTTP endpoints)
- Each server provides tools that become available to the agent
- Tool names are prefixed with the server name (e.g., `filesystem-read_file`)

Tool calls go through the MCP protocol:
1. Runner receives tool calls from LLM
2. Finds matching tool in configured MCP clients
3. Calls tool via MCP protocol
4. Returns result to LLM as user message

### Context Pruning
Messages are pruned to fit within model context windows. The Runner:
1. Keeps system prompt and recent messages
2. Drops older messages when approaching token limit
3. Never drops the most recent user/assistant exchange

## MCP Server Configuration

### Configuration Format

Create a `settings.json` file in any profile directory (e.g., `profiles/example/settings.json`):

```json
{
  "mcpServers": [
    {
      "name": "server-name",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-example"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      },
      "enabled": true
    }
  ]
}
```

### Configuration Fields

- **name**: Server identifier (used for tool prefixing)
- **transport**: Connection type - `"stdio"` or `"sse"`
- **command**: Executable command (stdio only)
- **args**: Command arguments array (stdio only)
- **url**: Server URL (SSE only)
- **env**: Environment variables to set
- **token**: Authentication token (SSE only)
- **enabled**: Whether to load this server (default: true)

### Environment Variable Substitution

Use `${VAR_NAME}` syntax to reference environment variables:
- `"${GITHUB_TOKEN}"` → value of `GITHUB_TOKEN` env var
- Works in: command, url, args, env values, token

### Example Configurations

**Filesystem Server (stdio)**:
```json
{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "enabled": true
}
```

**GitHub Server with Auth (stdio)**:
```json
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
```

**Custom API Server (SSE)**:
```json
{
  "name": "custom-api",
  "transport": "sse",
  "url": "https://api.example.com/mcp",
  "token": "${API_TOKEN}",
  "enabled": true
}
```

### Server Loading

1. Runner reads profile's `settings.json` during initialization
2. Processes environment variable substitutions
3. Connects to each enabled server
4. Continues if individual servers fail to connect (with warning)
5. Tools from all servers become available to agent

## Agent Profiles

Profiles define agent behavior via:
- `prompt.md` - System prompt instructions (required)
- `settings.json` - MCP server configurations (optional)

Default profile: **example**

Each profile directory lives in `profiles/{profile-name}/` and must contain at minimum a `prompt.md` file.

## Cost Tracking

Every LLM call tracks:
- Input/output tokens
- Cost (calculated from provider pricing)
- Stored in messages table

When running experiments, you can set a maximum cost limit to automatically stop execution when the threshold is exceeded.

## Supported LLM Providers

- **Anthropic**: Claude Opus 4.5, Sonnet 4.5, Haiku 4.5
- **OpenAI**: GPT-5.x series, GPT-4.1
- **Google**: Gemini 3 Pro, Gemini 2.5 Pro/Flash
- **Mistral**: Devstral, Mistral Large, Codestral
- **Moonshot AI**: Kimi K2 Thinking
- **Deepseek**: Deepseek Chat, Reasoner
- **RedPill AI**: Kimi K2.5, GLM-4, Llama 70B, Qwen 2.5 7B Instruct (TEE-protected)

Each provider implements the `LLM` interface with `complete()` method that handles streaming responses and tool calls.

### RedPill AI Setup

RedPill AI provides TEE (Trusted Execution Environment) protected access to multiple LLM models. To use RedPill models:

1. Get your API key from [RedPill AI](https://docs.redpill.ai)
2. Set the environment variable:
   ```bash
   export REDPILL_API_KEY=sk-your-api-key-here
   ```
3. Use RedPill models in your experiments:
   ```bash
   npx tsx src/agent-harness.ts create my-exp -p problem.txt -m llama-3.3-70b-instruct
   ```

Available RedPill models:
- `kimi-k2.5` - Advanced reasoning model (262K context) - $0.60/$3.00 per M tokens
- `glm-4.7` - General purpose model (128K context) - $0.85/$3.30 per M tokens
- `llama-3.3-70b-instruct` - Meta's Llama 3.3 70B (128K context) - $2.00/$2.00 per M tokens
- `qwen-2.5-7b-instruct` - TEE-native model (32K context) - $0.04/$0.10 per M tokens
