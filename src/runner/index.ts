import { JSONSchema7 } from "json-schema";
import {
  LLM,
  Message,
  TextContent,
  Thinking,
  Tool,
  ToolResult,
  ToolUse,
} from "@app/models";
import { RunResource } from "@app/resources/run";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withRetries, Result, err, ok } from "@app/lib/error";
import { MessageResource } from "@app/resources/messages";
import assert from "assert";
import { errorToCallToolResult, createClientFromConfig } from "@app/lib/mcp";
import { loadProfileMCPConfig } from "@app/lib/mcp-config";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { concurrentExecutor } from "@app/lib/async";
import { assertNever } from "@app/lib/assert";
import { RunConfig } from "./config";
import { createLLM } from "@app/models/provider";
import { readFileSync } from "fs";
import { getProblemContent } from "@app/lib/problems";
import { getProfilePath } from "@app/lib/profiles";

function loadPromptForProfile(profile: string): string {
  const promptPath = getProfilePath(profile, "prompt.md");
  return readFileSync(promptPath, "utf-8");
}

export class Runner {
  private run: RunResource;
  private agentIndex: number;
  private mcpClients: Client[];
  private model: LLM;

  private contextPruning: {
    lastAgentLoopStartIdx: number;
    lastAgentLoopInnerStartIdx: number;
  };
  private messages: MessageResource[]; // ordered by position asc

  private constructor(
    run: RunResource,
    agentIndex: number,
    mcpClients: Client[],
    model: LLM,
  ) {
    this.run = run;
    this.agentIndex = agentIndex;
    this.mcpClients = mcpClients;
    this.model = model;

    this.messages = [];
    this.contextPruning = {
      lastAgentLoopStartIdx: 0,
      lastAgentLoopInnerStartIdx: 0,
    };
  }

  public static async builder(
    run: RunResource,
    agentIndex: number,
    config: RunConfig,
  ): Promise<Result<Runner>> {
    const profile = run.toJSON().profile;

    const clients: Client[] = [];

    // Load and connect to configured MCP servers
    const mcpConfigResult = loadProfileMCPConfig(profile);
    if (mcpConfigResult.isErr()) {
      return mcpConfigResult;
    }

    const mcpConfigs = mcpConfigResult.value;
    if (mcpConfigs.length > 0) {
      console.log(`\x1b[36mLoading ${mcpConfigs.length} MCP server(s) for agent ${agentIndex}...\x1b[0m`);

      for (const mcpConfig of mcpConfigs) {
        const clientResult = await createClientFromConfig(mcpConfig);
        if (clientResult.isErr()) {
          console.error(
            `\x1b[33mWarning: Failed to connect to MCP server '${mcpConfig.name}': ${clientResult.error.message}\x1b[0m`,
          );
          // Continue with other servers even if one fails
          continue;
        }

        clients.push(clientResult.value);
        console.log(`\x1b[32m✓ Connected to MCP server '${mcpConfig.name}'\x1b[0m`);
      }
    }

    const model = createLLM(run.toJSON().model, {
      thinking: config.thinking,
    });

    const runner = await Runner.initialize(
      run,
      agentIndex,
      clients,
      model,
    );
    if (runner.isErr()) {
      return runner;
    }

    return ok(runner.value);
  }

  public static async initialize(
    run: RunResource,
    agentIndex: number,
    mcpClients: Client[],
    model: LLM,
  ): Promise<Result<Runner>> {
    const runner = new Runner(
      run,
      agentIndex,
      mcpClients,
      model,
    );

    const messages = await MessageResource.listMessagesByAgent(
      runner.run,
      runner.agentIndex,
    );

    runner.messages = messages;

    return ok(runner);
  }

  async tools(): Promise<Result<Tool[]>> {
    const tools: Tool[] = [];

    for (const client of this.mcpClients) {
      try {
        const ct = await client.listTools();
        for (const tool of ct.tools) {
          tools.push({
            name: `${client.getServerVersion()?.name}-${tool.name}`,
            description: tool.description,
            inputSchema: tool.inputSchema as JSONSchema7,
          });
        }
      } catch (error) {
        return err(
          "tool_error",
          `Error listing tools from client ${client.getServerVersion()?.name}`,
          error,
        );
      }
    }

    return ok(tools);
  }

  async executeTool(t: ToolUse): Promise<ToolResult> {
    for (const client of this.mcpClients) {
      try {
        const ct = await client.listTools();
        for (const tool of ct.tools) {
          if (`${client.getServerVersion()?.name}-${tool.name}` === t.name) {
            const result = await client.callTool({
              name: tool.name,
              arguments: t.input,
            });

            const toolResult: ToolResult = {
              type: "tool_result",
              toolUseId: t.id,
              toolUseName: t.name,
              content: result.content as CallToolResult["content"],
              isError: (result.isError ?? false) as boolean,
            };
            return toolResult;
          }
        }
      } catch (error) {
        return {
          type: "tool_result",
          toolUseId: t.id,
          toolUseName: t.name,
          content: errorToCallToolResult(
            err(
              "tool_execution_error",
              `Error executing tool ${t.name}`,
              error,
            ),
          ).content,
          isError: true,
        };
      }
    }

    return {
      type: "tool_result",
      toolUseId: t.id,
      toolUseName: t.name,
      content: errorToCallToolResult(
        err(
          "tool_execution_error",
          `No MCP client found to execute tool ${t.name}`,
        ),
      ).content,
      isError: true,
    };
  }

  isNewUserMessageNeeded(): boolean {
    if (this.messages.length === 0) {
      return true;
    }

    // If the role is agent it means we had no tool use in the last tick and we need a user message.
    const last = this.messages[this.messages.length - 1];
    if (last.toJSON().role === "agent") {
      return true;
    }

    return false;
  }

  async newUserMessage(): Promise<Result<MessageResource>> {
    const position =
      this.messages.length > 0
        ? this.messages[this.messages.length - 1].position() + 1
        : 0;

    const m: Message = {
      role: "user",
      content: [
        {
          type: "text",
          text: `\
<system>
This is an automated system message and there is no user available to respond. Proceed autonomously, making sure to use tools as only tools have visible effects on the system. Never stay idle and always pro-actively work on solving the problem.
</system>
`,
          provider: null,
        },
      ],
    };

    const message = await MessageResource.create(
      this.run,
      this.agentIndex,
      m,
      position,
      0, // User messages have no token usage
      0, // User messages have no cost
    );

    return ok(message);
  }

  private isAgentLoopStartMessage(message: Message): boolean {
    // A user message with only text content marks the start of an agentic loop.
    return (
      message.role === "user" && message.content.every((c) => c.type === "text")
    );
  }

  private isAgentLoopInnerStartMessage(m: Message): boolean {
    // We prune at tool_uses because it ensures the conversation is valid (since any following
    // tool_result is guaranteed to have its corresponding tool_use before it).
    return m.role === "agent" && m.content.some((c) => c.type === "tool_use");
  }

  shiftContextPruning(): Result<void> {
    /**
     * We bump lastAgentLoopInnerStartIdx whilst ensuring that the conversation is valid. This is
     * done by pruning messages before a tool_use (since any following tool_result is guaranteed to
     * have its corresponding tool_use before it).
     */
    assert(
      this.contextPruning.lastAgentLoopInnerStartIdx < this.messages.length,
      "lastLoopInnerStartIdx is out of bounds.",
    );

    let idx =
      this.contextPruning.lastAgentLoopInnerStartIdx >
        this.contextPruning.lastAgentLoopStartIdx
        ? this.contextPruning.lastAgentLoopInnerStartIdx + 1
        : /* This avoids an unneeded iteration, without this, if they were equal, the result of the
           * iteration would have been: lastAgentLoopInnerStartIdx === lastAgentLoopStartIdx + 1.
           * Which results in no change to `messages` since:
           * forall idx, messages.slice(idx) === [messages[idx], ...messages.slice(idx+1)] */
        this.contextPruning.lastAgentLoopInnerStartIdx + 2;
    let foundNewAgenticLoop = false;

    for (; idx < this.messages.length; idx++) {
      const m = this.messages[idx].toJSON();
      if (this.isAgentLoopInnerStartMessage(m)) {
        break;
      }
      if (this.isAgentLoopStartMessage(m)) {
        foundNewAgenticLoop = true;
        break;
      }
    }

    if (idx >= this.messages.length) {
      return err(
        "agent_loop_overflow_error",
        "No agentic loop start position found after last.",
      );
    }

    if (foundNewAgenticLoop) {
      this.contextPruning.lastAgentLoopStartIdx = idx;
    }
    this.contextPruning.lastAgentLoopInnerStartIdx = idx;

    return ok(undefined);
  }

  /**
   * Render past agent messages to the model handling truncation to fit the model context window as
   * needed.
   *
   * @param systemPrompt System prompt to use for the model call.
   * @param tools Tools to provide to the model.
   */
  async renderForModel(
    systemPrompt: string,
    tools: Tool[],
  ): Promise<Result<Message[]>> {
    /**
     * Invariants:
     * (1) The agent loop is always started by a user message (with only text content).
     * (2) Tool Result must be preceded by a corresponding (i.e. same tool_use_id) Tool Use.
     *
     * - If lastAgentLoopInnerStartIdx === lastAgentLoopStartIdx: we have a full agent loop. And we
     * select all messages from lastAgentLoopStartIdx (messages[lastAgentLoopInnerStartIdx]
     * verifies (1)). And since the agent loop is not pruned we also automatically verify (2).
     *
     * If lastAgentLoopInnerStartIdx > lastAgentLoopStartIdx: we prune messages *in* the agent loop.
     * We select messages from lastAgentLoopInnerStartIdx (messages[lastAgentLoopInnerStartIdx]
     * verifies (2)). BUT we also need to include the user text message at the start of the agent
     * loop (at lastAgentLoopStartIdx) to ensure (1).
     */
    let tokenCount = 0;
    do {
      // Prune messages before contextPruning.lastAgentLoopInnerStartIdx.
      let messages = [...this.messages]
        .slice(this.contextPruning.lastAgentLoopInnerStartIdx)
        .map((m) => m.toJSON());

      if (
        this.contextPruning.lastAgentLoopInnerStartIdx >
        this.contextPruning.lastAgentLoopStartIdx
      ) {
        // A valid conversation must begin with a user message. In this case we use the
        // user message at the start of the agent loop. Ensuring (1).
        const agentLoopStartUserMessage =
          this.messages[this.contextPruning.lastAgentLoopStartIdx].toJSON();
        messages = [agentLoopStartUserMessage, ...messages];
      }

      const res = await this.model.tokens(messages, systemPrompt, tools);
      if (res.isErr()) {
        console.log("Agent: " + this.agentIndex);
        console.log(messages.length);
        messages.forEach((m) => {
          console.log(m.role);
          console.log(m.content);
          console.log("----");
        });
        return res;
      }
      tokenCount = res.value;

      if (tokenCount > this.model.maxTokens()) {
        const res = this.shiftContextPruning();
        if (res.isErr()) {
          return res;
        }
      } else {
        return ok(messages);
      }
    } while (tokenCount > this.model.maxTokens());

    return err("agent_loop_overflow_error", "Unreachable");
  }

  /**
   * Logs message content during runner execution to display progress.
   */
  logContent(
    c: TextContent | ToolUse | ToolResult | Thinking,
    messageId?: number,
  ) {
    let out = `\x1b[1m\x1b[37mAgent ${this.agentIndex}\x1b[0m`; // name: bold white
    if (messageId) {
      out += ` \x1b[1m\x1b[33m#${messageId}\x1b[0m`; // message id: bold yellow if available
    }
    switch (c.type) {
      case "thinking": {
        out += ` \x1b[90m>\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[95mThinking:\x1b[0m `; // label: bold magenta/purple
        out += `\x1b[90m${c.thinking.replace(/\n/g, " ")}\x1b[0m`; // text: grey
        break;
      }
      case "text": {
        out += ` \x1b[90m>\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[38;5;208mText:\x1b[0m `; // label: bold orange (256-color)
        out += `\x1b[90m${c.text.replace(/\n/g, " ")}\x1b[0m`; // content: grey
        break;
      }
      case "tool_use": {
        out += ` \x1b[90m>\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[32mToolUse:\x1b[0m `; // label: bold green
        out += `${c.name}`;
        break;
      }
      case "tool_result": {
        out += ` \x1b[90m<\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[34mToolResult:\x1b[0m `; // label: bold blue
        out +=
          `${c.toolUseName} ` +
          `${c.isError
            ? "\x1b[1m\x1b[31m[error]\x1b[0m"
            : "\x1b[1m\x1b[32m[success]\x1b[0m"
          }`;
        break;
      }
      default:
        assertNever(c);
    }
    console.log(out);
  }

  /**
   * Advance runer by one tick (one agent call + associated tools executions).
   */
  async tick(): Promise<Result<void>> {
    const tools = await this.tools();
    if (tools.isErr()) {
      return tools;
    }

    if (this.isNewUserMessageNeeded()) {
      const newMessage = await this.newUserMessage();
      if (newMessage.isErr()) {
        return newMessage;
      }
      this.messages.push(newMessage.value);
    }

    const profile = this.run.toJSON().profile;
    const problemId = this.run.toJSON().problem_id;

    // Load problem content
    const problemResult = getProblemContent(problemId);
    if (problemResult.isErr()) {
      return problemResult;
    }

    const systemPrompt = loadPromptForProfile(profile).replace(
      "{{PROBLEM}}",
      problemResult.value,
    );

    const messagesForModel = await this.renderForModel(
      systemPrompt,
      tools.value,
    );
    if (messagesForModel.isErr()) {
      return messagesForModel;
    }

    const res = await withRetries(async () => {
      return this.model.generate(messagesForModel.value, systemPrompt, tools.value);
    })({});
    if (res.isErr()) {
      return res;
    }

    const { message, tokenUsage } = res.value;

    if (message.content.length === 0) {
      console.log(
        `WARNING: Skipping empty agent response content for agent ${this.agentIndex}`,
      );
      return ok(undefined);
    }

    const toolResults = await concurrentExecutor(
      message.content.filter((content) => content.type === "tool_use"),
      async (t: ToolUse) => {
        return await this.executeTool(t);
      },
      { concurrency: 8 },
    );

    const last = this.messages[this.messages.length - 1];

    // Calculate cost and tokens for this message
    const totalTokens = tokenUsage?.total ?? 0;
    const cost = tokenUsage ? this.model.cost([tokenUsage]) : 0;

    const agentMessage = await MessageResource.create(
      this.run,
      this.agentIndex,
      message,
      last.position() + 1,
      totalTokens,
      cost,
    );
    this.messages.push(agentMessage);

    message.content.forEach((c) => {
      this.logContent(c, agentMessage.toJSON().id);
    });

    if (toolResults.length > 0) {
      const toolResultsMessage = await MessageResource.create(
        this.run,
        this.agentIndex,
        {
          role: "user",
          content: toolResults,
        },
        last.position() + 2,
        0, // Tool results have no token usage
        0, // Tool results have no cost
      );
      this.messages.push(toolResultsMessage);

      toolResults.forEach((tr) => {
        this.logContent(tr, toolResultsMessage.toJSON().id);
        if (tr.isError) {
          console.error(tr.content);
        }
      });
    }

    return ok(undefined);
  }
}
