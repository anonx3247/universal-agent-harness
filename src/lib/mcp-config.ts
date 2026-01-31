import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { err, ok, Result } from "./error";
import { getProfilesDir } from "./profiles";

/**
 * MCP Server Configuration
 *
 * Defines how to connect to an MCP server
 */
export type MCPServerConfig = {
  /**
   * Server name (used for tool prefixing)
   */
  name: string;

  /**
   * Transport type
   */
  transport: "stdio" | "sse";

  /**
   * For stdio: command to execute
   * For sse: URL to connect to
   */
  command?: string;
  url?: string;

  /**
   * Arguments to pass to the command (stdio only)
   */
  args?: string[];

  /**
   * Environment variables to set
   */
  env?: Record<string, string>;

  /**
   * Authentication token (for SSE)
   */
  token?: string;

  /**
   * Whether to enable this server
   */
  enabled?: boolean;
};

/**
 * Profile configuration
 */
export type ProfileConfig = {
  /**
   * MCP servers to connect to
   */
  mcpServers?: MCPServerConfig[];
};

/**
 * Load MCP server configuration from profile
 */
export function loadProfileMCPConfig(profile: string): Result<MCPServerConfig[]> {
  const configPath = join(getProfilesDir(), profile, "settings.json");

  // If no settings file, return empty array (just computer tool)
  if (!existsSync(configPath)) {
    return ok([]);
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config: ProfileConfig = JSON.parse(content);

    // Filter enabled servers
    const servers = (config.mcpServers || []).filter(
      (server) => server.enabled !== false,
    );

    // Validate each server config
    for (const server of servers) {
      if (!server.name) {
        return err(
          "invalid_config_error",
          "MCP server config missing 'name' field",
        );
      }

      if (server.transport === "stdio" && !server.command) {
        return err(
          "invalid_config_error",
          `MCP server '${server.name}' with stdio transport missing 'command' field`,
        );
      }

      if (server.transport === "sse" && !server.url) {
        return err(
          "invalid_config_error",
          `MCP server '${server.name}' with sse transport missing 'url' field`,
        );
      }
    }

    return ok(servers);
  } catch (error) {
    return err(
      "config_load_error",
      `Failed to load MCP config from ${configPath}`,
      error as Error,
    );
  }
}

/**
 * Resolve environment variable references in config
 *
 * Replaces ${ENV_VAR} with actual environment variable values
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
    return process.env[varName] || "";
  });
}

/**
 * Process MCP server config to resolve environment variables
 */
export function processMCPConfig(config: MCPServerConfig): MCPServerConfig {
  const processed: MCPServerConfig = { ...config };

  // Resolve env vars in command
  if (processed.command) {
    processed.command = resolveEnvVars(processed.command);
  }

  // Resolve env vars in URL
  if (processed.url) {
    processed.url = resolveEnvVars(processed.url);
  }

  // Resolve env vars in args
  if (processed.args) {
    processed.args = processed.args.map(resolveEnvVars);
  }

  // Resolve env vars in environment variables
  if (processed.env) {
    const resolvedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(processed.env)) {
      resolvedEnv[key] = resolveEnvVars(value);
    }
    processed.env = resolvedEnv;
  }

  // Resolve token
  if (processed.token) {
    processed.token = resolveEnvVars(processed.token);
  }

  return processed;
}
