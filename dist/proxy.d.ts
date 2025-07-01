/**
 * MCP Proxy Class - Hot-reloadable MCP server proxy
 *
 * Provides message buffering, server lifecycle management, and hot-reload capabilities
 * for MCP (Model Context Protocol) servers. Uses dependency injection for cross-platform
 * compatibility between Deno and Node.js environments.
 */
import type { ProxyDependencies } from "./interfaces.js";
type DebouncedFunction<T extends (...args: any[]) => any> = T & {
    clear(): void;
    flush(): void;
};
export interface MCPProxyConfig {
    command: string;
    commandArgs: string[];
    entryFile: string | null;
    restartDelay: number;
    env?: Record<string, string>;
    /** Delay in ms after killing server before starting new one (default: 1000) */
    killDelay?: number;
    /** Delay in ms after starting server before declaring ready (default: 2000) */
    readyDelay?: number;
}
/**
 * MCPProxy - A hot-reloadable proxy for MCP servers
 *
 * Features:
 * - Message buffering during server restarts
 * - Initialize parameter capture and replay
 * - File watching for hot-reload
 * - Graceful server lifecycle management
 * - Cross-platform via dependency injection
 */
export declare class MCPProxy {
    private managedProcess;
    private serverPid;
    private stdinBuffer;
    private messageBuffer;
    private restarting;
    private stdinReader;
    private currentRequestId;
    private initializeParams;
    private pendingRequests;
    private stdinForwardingStarted;
    private procManager;
    private fs;
    private config;
    private stdin;
    private stdout;
    private stderr;
    private exit;
    constructor(dependencies: ProxyDependencies, config: MCPProxyConfig);
    start(): Promise<void>;
    private startServer;
    private killServer;
    private verifyProcessKilled;
    private setupStdinForwarding;
    private setupOutputForwarding;
    private sendRequest;
    private getToolsList;
    readonly restart: DebouncedFunction<() => Promise<void>>;
    private startWatcher;
    shutdown(): Promise<void>;
}
export {};
//# sourceMappingURL=proxy.d.ts.map