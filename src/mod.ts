/**
 * MCP Hot-Reload Proxy Module
 * 
 * Re-exports the main proxy functionality for library usage.
 */

export { MCPProxy } from "./main.ts";

// Re-export types that might be useful for library consumers
export interface MCPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface MCPProxyConfig {
  serverCommand: string;
  serverArgs: string;
  watchFile?: string;
  logLevel?: string;
  restartDelay?: number;
}