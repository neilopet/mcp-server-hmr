/**
 * MCP Server HMR Module
 *
 * Re-exports the main HMR functionality for library usage.
 */

export { MCPProxy } from "./proxy.ts";
export type { MCPProxyConfig } from "./proxy.ts";

// Re-export interfaces that might be useful for library consumers
export type {
  FileEvent,
  FileSystem,
  ManagedProcess,
  ProcessManager,
  ProxyDependencies,
} from "./interfaces.ts";

// Re-export Deno implementations
export { DenoProcessManager } from "./deno/DenoProcessManager.ts";
export { DenoFileSystem } from "./deno/DenoFileSystem.ts";
