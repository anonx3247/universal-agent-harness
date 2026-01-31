import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SrchdError, Err, Result, err, ok } from "./error";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "./mcp-config";
import { processMCPConfig } from "./mcp-config";

export async function createClientServerPair(
  server: McpServer,
): Promise<[Client, McpServer]> {
  const client = new Client({
    // @ts-ignore use private _serverInfo
    name: server.server._serverInfo.name,
    // @ts-ignore use private _serverInfo
    version: server.server._serverInfo.version,
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return [client, server];
}

/**
 * Create MCP client from configuration
 */
export async function createClientFromConfig(
  config: MCPServerConfig,
): Promise<Result<Client>> {
  try {
    const processed = processMCPConfig(config);

    const client = new Client({
      name: processed.name,
      version: "1.0.0",
    });

    if (processed.transport === "stdio") {
      if (!processed.command) {
        return err(
          "mcp_config_error",
          `MCP server '${processed.name}' missing command for stdio transport`,
        );
      }

      const transport = new StdioClientTransport({
        command: processed.command,
        args: processed.args || [],
        env: {
          ...process.env as Record<string, string>,
          ...processed.env,
        },
      });

      await client.connect(transport);
      return ok(client);
    } else if (processed.transport === "sse") {
      if (!processed.url) {
        return err(
          "mcp_config_error",
          `MCP server '${processed.name}' missing URL for SSE transport`,
        );
      }

      const headers: Record<string, string> = {};
      if (processed.token) {
        headers["Authorization"] = `Bearer ${processed.token}`;
      }

      const transport = new SSEClientTransport(
        new URL(processed.url),
        headers,
      );

      await client.connect(transport);
      return ok(client);
    } else {
      return err(
        "mcp_config_error",
        `Unsupported transport type: ${(processed as any).transport}`,
      );
    }
  } catch (error) {
    return err(
      "mcp_connection_error",
      `Failed to connect to MCP server '${config.name}'`,
      error as Error,
    );
  }
}

export function errorToCallToolResult(error: Err<SrchdError>): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `Error [${error.error.code}]: ${error.error.message}` +
          (error.error.cause ? ` (cause: ${error.error.cause?.message})` : ""),
      },
    ],
  };
}

export function stringEdit({
  content,
  oldStr,
  newStr,
  expectedReplacements = 1,
}: {
  content: string;
  oldStr: string;
  newStr: string;
  expectedReplacements?: number;
}): Result<string> {
  // Count occurrences of old_string
  const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const matches = content.match(regex);
  const occurrences = matches ? matches.length : 0;

  // console.log("----------------------------");
  // console.log(content);
  // console.log("----------------------------");
  // console.log(oldStr);
  // console.log("----------------------------");
  // console.log(newStr);
  // console.log("----------------------------");

  if (occurrences === 0) {
    return err(
      "string_edit_error",
      `String to replace not found in content to edit`,
    );
  }

  if (occurrences !== expectedReplacements) {
    return err(
      "string_edit_error",
      `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences`,
    );
  }

  return ok(content.replace(regex, newStr));
}

export const STRING_EDIT_INSTRUCTIONS = `\
**Requirements**:
- \`old_str\` NEEDS TO contain the precise literal content for substituation (preserving all spacing, formatting, line breaks, etc).
- \`new_str\` NEEDS TO contain the precise literal content that will substitute \`old_str\` (maintaining all spacing, formatting, line breaks, etc). Verify the output maintains proper syntax and follows best practices.
- DO NOT apply escaping to \`old_str\` or \`new_str\`, as this violates the literal text requirement.
- \`old_str\` NEEDS TO provide unique identification for the specific instance to replace. Include surrounding textual context BEFORE and AFTER the target content.

**Batch replacements**:
Define \`expected_replacements\` (optional, defaults to 1) when the change is meant to impact more than one occurrence. If there is a mismatch the tool will error.`;
