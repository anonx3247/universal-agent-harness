# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Universal Agent Harness** is a simplified multi-agent orchestration system derived from msrchd. It runs one or many AI agents in isolated Docker containers, providing them with a computer tool for executing commands and reading/writing files. The key difference from msrchd is the removal of the publication/peer review system and support for connecting to arbitrary MCP servers with configurable authentication.

## Core Architecture

### Agent Execution Model

- **Tick-based execution**: Each agent runs in an independent async loop, processing one "tick" per iteration
- **Runner orchestration** (`src/runner/index.ts`): The Runner class manages agent lifecycles, message history, and tool execution
- **Isolated containers**: Each agent runs in a Docker container with its own filesystem at `/home/agent/`
- **Resource limits**: 512MB RAM, 1 vCPU per container

### Key Components

```
src/
├── agent-harness.ts      # CLI entry point (commands: create, run, clean, list, serve)
├── runner/               # Core agent execution orchestration
│   ├── index.ts          # Runner class - manages agent ticks and tool calls
│   └── config.ts         # RunConfig type definitions
├── models/               # LLM provider integrations (Anthropic, OpenAI, Gemini, Mistral, etc.)
├── tools/                # MCP tool servers
│   ├── computer.ts       # Docker container bash execution
│   └── index.ts          # Tool exports
├── computer/             # Docker container management
│   ├── index.ts          # Container creation & lifecycle
│   └── image.ts          # Docker image building
├── db/                   # SQLite database with Drizzle ORM
│   ├── index.ts          # DB connection
│   └── schema.ts         # Schema: experiments, messages
└── lib/                  # Utilities (error handling, async, fs, mcp)
```

### Database Schema

The database uses SQLite with Drizzle ORM:

- **experiments**: Stores experiment metadata (name, problem, model, agent_count, profile)
- **messages**: Stores agent conversation history with token counts and costs

**Note**: The publication system tables (publications, citations, reviews, solutions) have been removed.

### MCP Server Configuration

Agents connect to MCP servers defined in configuration. Each server can specify:
- Server command/path
- Environment variables (tokens, API keys)
- Connection method (stdio, SSE, etc.)
- Tool filtering/allowlisting

The computer tool is always provided by default via the built-in computer MCP server.

## Development Commands

### Setup
```bash
npm install                    # Install dependencies
npx drizzle-kit migrate        # Run database migrations
```

### Type Checking and Linting
```bash
npm run typecheck              # Run TypeScript type checking
npm run lint                   # Run ESLint on src/
```

### Database Operations
```bash
npx drizzle-kit generate       # Generate new migration from schema changes
npx drizzle-kit migrate        # Apply pending migrations
```

### Running the CLI
```bash
# Create an experiment
npx tsx src/agent-harness.ts create <name> -p problem.txt -n 3 -m claude-sonnet-4-5

# Run agents
npx tsx src/agent-harness.ts run <experiment> --max-cost 5.0

# Run single agent tick (for debugging)
npx tsx src/agent-harness.ts run <experiment> --tick 0

# Start web UI
npx tsx src/agent-harness.ts serve

# List experiments
npx tsx src/agent-harness.ts list

# Clean up experiment
npx tsx src/agent-harness.ts clean <experiment> -y
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

### MCP Client-Server Pairs
Each agent gets MCP servers connected via in-memory transport:
- Built-in computer server (always present)
- Additional configured MCP servers (from config)

Tool calls go through the MCP protocol:
1. Runner receives tool calls from LLM
2. Finds matching tool in MCP clients
3. Calls tool via MCP protocol
4. Returns result to LLM as user message

### Context Pruning
Messages are pruned to fit within model context windows. The Runner:
1. Keeps system prompt and recent messages
2. Drops older messages when approaching token limit
3. Never drops the most recent user/assistant exchange

### Docker Container Management
Containers are created once per agent and reused across runs:
- Data persists in Docker volumes
- Containers stopped between runs to save resources
- `--path` flag copies files to containers before running

## Critical Implementation Notes

### Removing Publication System Components
When adapting from msrchd, these components were removed:
- `src/tools/publications.ts` - All publication/review tools
- `src/resources/publication.ts`, `solutions.ts` - Publication database resources
- Database tables: publications, citations, reviews, solutions
- `/publications/` filesystem directory

### Configurable MCP Servers

The system supports connecting to external MCP servers via configuration in profile `settings.json` files.

#### Configuration Format

Create a `settings.json` file in any profile directory (e.g., `profiles/research/settings.json`):

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

#### Configuration Fields

- **name**: Server identifier (used for tool prefixing)
- **transport**: Connection type - `"stdio"` or `"sse"`
- **command**: Executable command (stdio only)
- **args**: Command arguments array (stdio only)
- **url**: Server URL (SSE only)
- **env**: Environment variables to set
- **token**: Authentication token (SSE only)
- **enabled**: Whether to load this server (default: true)

#### Environment Variable Substitution

Use `${VAR_NAME}` syntax to reference environment variables:
- `"${GITHUB_TOKEN}"` → value of `GITHUB_TOKEN` env var
- Works in: command, url, args, env values, token

#### Example Configurations

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

#### Server Loading

1. Runner reads profile's `settings.json` during initialization
2. Processes environment variable substitutions
3. Connects to each enabled server
4. Continues if individual servers fail to connect (with warning)
5. Tools from all servers become available to agent

### Agent Profiles
Profiles define agent behavior via:
- `prompt.md` - System prompt instructions
- `Dockerfile` - Optional custom container image
- `settings.json` - MCP server configurations (optional)

Default profiles: research, formal-math, security, arc-agi

## Testing Approach

To test a single agent tick:
```bash
npx tsx src/agent-harness.ts run <experiment> --tick 0
```

This runs one iteration for agent 0 and exits, useful for debugging tool calls and responses.

## Cost Tracking

Every LLM call tracks:
- Input/output tokens
- Cost (calculated from provider pricing)
- Stored in messages table

Use `--max-cost` flag to stop execution when total cost exceeds threshold.

## Supported LLM Providers

- **Anthropic**: Claude Opus 4.5, Sonnet 4.5, Haiku 4.5
- **OpenAI**: GPT-5.x series, GPT-4.1
- **Google**: Gemini 3 Pro, Gemini 2.5 Pro/Flash
- **Mistral**: Devstral, Mistral Large, Codestral
- **Moonshot AI**: Kimi K2 Thinking
- **Deepseek**: Deepseek Chat, Reasoner

Each provider implements the `LLM` interface with `complete()` method that handles streaming responses and tool calls.
