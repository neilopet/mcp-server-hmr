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
    /** @deprecated Use watchTargets instead. Single file/directory to watch */
    entryFile?: string | null;
    /** Array of files, directories, packages, or other resources to monitor */
    watchTargets?: string[];
    restartDelay: number;
    env?: Record<string, string>;
    /** Delay in ms after killing server before starting new one (default: 1000) */
    killDelay?: number;
    /** Delay in ms after starting server before declaring ready (default: 2000) */
    readyDelay?: number;
    /** Extension-specific configurations for custom functionality */
    extensions?: Record<string, any>;
    /** Base directory for extension data storage */
    dataDir?: string;
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
    private containerId;
    private stdinBuffer;
    private messageBuffer;
    private restarting;
    private stdinReader;
    private currentRequestId;
    private initializeParams;
    private pendingRequests;
    private stdinForwardingStarted;
    private killTimeout?;
    private fileWatcher?;
    private shutdownRequested;
    private startPromise?;
    private monitoringTimeout?;
    private errorRetryTimeout?;
    private pendingToolsListRequests;
    private sessionId;
    private procManager;
    private changeSource;
    private config;
    private stdin;
    private stdout;
    private stderr;
    private exit;
    private extensionRegistry?;
    private extensionHooks;
    constructor(dependencies: ProxyDependencies, config: MCPProxyConfig);
    /**
     * Auto-detect files to watch from command and arguments
     * Used as fallback when no explicit watchTargets are provided
     */
    private autoDetectWatchTargets;
    /**
     * Normalize config to handle backward compatibility between entryFile and watchTargets
     */
    private normalizeConfig;
    /**
     * Create an adapter that converts FileSystem to ChangeSource interface
     */
    private createFileSystemAdapter;
    /**
     * Check if the proxy and server are currently running
     */
    isRunning(): boolean;
    /**
     * Initialize extensions with context
     */
    private initializeExtensions;
    start(): Promise<void>;
    private startServer;
    private killServer;
    private stopDockerContainer;
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