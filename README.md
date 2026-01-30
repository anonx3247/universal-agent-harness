# Universal Agent Harness

A flexible multi-agent orchestration system that runs AI agents in isolated Docker containers with access to tools via the Model Context Protocol (MCP).

## Overview

Universal Agent Harness orchestrates one or many AI agents to solve problems. Each agent runs in an isolated Docker container with access to:
- A computer tool for executing bash commands and managing files
- Configurable MCP servers for additional capabilities
- Independent message history and cost tracking

This is a simplified version of [msrchd](https://github.com/anonx3247/msrchd), removing the publication/peer review system while keeping the core agent orchestration and adding support for arbitrary MCP server connections.

## Key Features

- **Multi-agent orchestration**: Run multiple AI agents concurrently
- **Isolated execution**: Each agent runs in a Docker container with full filesystem access
- **Computer tool**: Built-in bash execution, file management, and background job control
- **MCP server support**: Connect to any number of MCP servers (planned)
- **Cost tracking**: Track token usage and costs per experiment
- **Multiple LLM providers**: Support for Anthropic, OpenAI, Google, Mistral, Moonshot, Deepseek

## Requirements

- **Node.js** v24+ required
  - On macOS with Homebrew: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`
- **Docker** for agent container environments
- **API Keys** for AI providers (at least one):
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_API_KEY`
  - `MISTRAL_API_KEY`
  - `MOONSHOT_API_KEY`
  - `DEEPSEEK_API_KEY`

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/universal-agent-harness.git
cd universal-agent-harness
```

2. Install dependencies:
```bash
npm install
```

3. Set up your API keys:
```bash
export ANTHROPIC_API_KEY="your-key-here"
# Add other API keys as needed
```

4. Initialize the database:
```bash
npx drizzle-kit migrate
```

## Quick Start

### 1. Create an Experiment (Interactive)

```bash
npx tsx src/agent-harness.ts create
```

The CLI will interactively prompt you for:
- Experiment name
- Problem file path
- AI model selection
- Number of agents
- Agent profile

You can also provide the name directly: `create my-experiment`

### 2. Run the Experiment (Interactive)

```bash
npx tsx src/agent-harness.ts run my-experiment
```

The CLI will interactively prompt you for:
- Run mode (all agents, single tick, specific agent)
- Cost limit
- Extended thinking mode
- Files to copy to containers

### 3. View Experiments

```bash
npx tsx src/agent-harness.ts list
```

This shows all experiments with their status, cost, and token usage.

## CLI Commands

All commands are **interactive** - they will prompt you for required information.

### Experiment Management

```bash
# Create experiment (interactive prompts)
npx tsx src/agent-harness.ts create [name]

# List all experiments with stats
npx tsx src/agent-harness.ts list
```

### Running Agents

```bash
# Run experiment (interactive prompts)
npx tsx src/agent-harness.ts run <experiment>
```

You'll be prompted to select:
- **Run mode**: all agents continuous, single tick, or specific agent
- **Cost limit**: optional maximum spending
- **Thinking mode**: enable/disable extended thinking
- **Files to copy**: optional files/directories to copy to containers

**While running**: Press `q` to quit immediately
- Exits instantly (no waiting for current ticks)
- Stops Docker containers in background
- Data preserved in volumes for resuming later

### Cleanup

```bash
# Clean experiment (interactive prompts)
npx tsx src/agent-harness.ts clean <experiment>
```

Choose to delete:
- **Everything**: experiment data + Docker containers
- **Containers only**: keep database, remove containers

## Development

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

### Database Migrations
```bash
# Generate new migration
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

## Supported Models

- **Anthropic**: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5
- **OpenAI**: gpt-5.1, gpt-5.1-codex, gpt-5, gpt-5-codex, gpt-5-mini, gpt-5-nano, gpt-4.1
- **Google**: gemini-3-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
- **Mistral**: devstral-medium-latest, mistral-large-latest, mistral-small-latest, codestral-latest
- **Moonshot AI**: kimi-k2-thinking
- **Deepseek**: deepseek-chat, deepseek-reasoner

## Tools Available to Agents

Agents have access to:

- **Computer tool**: Execute bash commands, read/write files in isolated Docker container at `/home/agent/`
  - `execute`: Run bash commands with optional timeout
  - `read_file`: Read file contents
  - `write_file`: Write or append to files
  - `list_files`: Directory listings
  - `list_jobs`: Check background job status

- **Additional MCP servers** (configurable): Connect to any MCP server via configuration

## Project Structure

```
src/
├── agent-harness.ts      # CLI entry point
├── runner/               # Agent execution orchestration
├── models/               # LLM provider integrations
├── tools/                # MCP tool servers (computer)
├── resources/            # Database resource abstractions
├── computer/             # Docker container management
├── db/                   # Database schema and connection
└── lib/                  # Utilities and helpers

profiles/                 # Agent profiles (prompts, Dockerfiles)
├── research/
├── formal-math/
├── security/
└── arc-agi/
```

## MCP Server Configuration

Agents can connect to additional MCP servers by configuring them in profile `settings.json` files.

### Configuration Example

Create `profiles/research/settings.json`:

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
      "enabled": false
    }
  ]
}
```

### Configuration Fields

- **name**: Server identifier (used for tool naming)
- **transport**: `"stdio"` (command-based) or `"sse"` (HTTP-based)
- **command**: Executable command (stdio only)
- **args**: Command arguments (stdio only)
- **url**: Server URL (SSE only)
- **env**: Environment variables
- **token**: Auth token (SSE only)
- **enabled**: Whether to load this server

### Environment Variables

Use `${VAR_NAME}` to reference environment variables:

```json
{
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
  },
  "token": "${API_TOKEN}"
}
```

Set the environment variables before running:
```bash
export GITHUB_TOKEN="your-token-here"
npx tsx src/agent-harness.ts run my-experiment
```

### Available MCP Servers

Many MCP servers are available via npm:
- `@modelcontextprotocol/server-filesystem` - File system access
- `@modelcontextprotocol/server-github` - GitHub API
- `@modelcontextprotocol/server-brave-search` - Web search
- `@modelcontextprotocol/server-postgres` - PostgreSQL database
- And many more at https://github.com/modelcontextprotocol/servers

See `profiles/research/settings.json.example` for more examples.

## License

MIT

## Credits

Derived from [msrchd](https://github.com/anonx3247/msrchd), reimagined as a universal agent orchestration platform.
