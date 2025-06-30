/**
 * MCP Server HMR Module
 *
 * Re-exports the main HMR functionality for library usage.
 */

export { MCPProxy } from "./main.ts";

// Re-export types that might be useful for library consumers
export interface MCPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPProxyConfig {
  serverCommand: string;
  serverArgs: string;
  watchFile?: string;
  logLevel?: string;
  restartDelay?: number;
}
