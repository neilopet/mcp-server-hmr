/**
 * Extension system interfaces for mcpmon
 *
 * Defines the contract for creating isolated, pluggable extensions
 * that can enhance mcpmon's functionality without modifying core code.
 */
import type { ProxyDependencies } from '../interfaces.js';
/**
 * Base interface for all mcpmon extensions
 */
export interface Extension {
    /** Unique identifier for the extension */
    readonly id: string;
    /** Human-readable name */
    readonly name: string;
    /** Version of the extension */
    readonly version: string;
    /** Whether the extension is enabled by default */
    readonly defaultEnabled: boolean;
    /** Configuration schema for the extension */
    readonly configSchema?: any;
    /** Initialize the extension */
    initialize(context: ExtensionContext): Promise<void>;
    /** Cleanup when extension is disabled or proxy shuts down */
    shutdown(): Promise<void>;
}
/**
 * Context provided to extensions during initialization
 */
export interface ExtensionContext {
    /** Original dependencies */
    dependencies: ProxyDependencies;
    /** Extension-specific configuration */
    config: any;
    /** Register hooks into proxy lifecycle */
    hooks: ExtensionHooks;
    /** Extension data directory */
    dataDir: string;
    /** Logger for the extension */
    logger: ExtensionLogger;
    /** Session ID for this proxy instance */
    sessionId: string;
}
/**
 * Hooks that extensions can register
 */
export interface ExtensionHooks {
    /** Called before forwarding stdin message to server */
    beforeStdinForward?: MessageHook;
    /** Called after receiving stdout message from server */
    afterStdoutReceive?: MessageHook;
    /** Called before proxy restart */
    beforeRestart?: () => Promise<void>;
    /** Called after server started */
    afterServerStart?: () => Promise<void>;
    /** Called when proxy is shutting down */
    onShutdown?: () => Promise<void>;
    /** Called to inject additional tools */
    getAdditionalTools?: () => Promise<ToolDefinition[]>;
    /** Called to handle custom tool calls */
    handleToolCall?: (toolName: string, args: any) => Promise<any | null>;
}
/**
 * Message hook for intercepting/modifying messages
 *
 * @param message - The JSON-RPC message
 * @returns Modified message, null to block, or original message unchanged
 */
export type MessageHook = (message: any) => Promise<any | null>;
/**
 * Logger interface for extensions
 */
export interface ExtensionLogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}
/**
 * Tool definition for MCP tools injected by extensions
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
        additionalProperties?: boolean;
    };
}
/**
 * Registry for managing extensions
 */
export interface ExtensionRegistry {
    /** Register an extension */
    register(extension: Extension): void;
    /** Get all registered extensions */
    getAll(): Extension[];
    /** Get enabled extensions */
    getEnabled(): Extension[];
    /** Enable/disable an extension */
    setEnabled(extensionId: string, enabled: boolean): void;
    /** Get extension by ID */
    get(extensionId: string): Extension | undefined;
    /** Check if extension is enabled */
    isEnabled(extensionId: string): boolean;
    /** Initialize all enabled extensions */
    initializeAll(context: Omit<ExtensionContext, 'config'>): Promise<void>;
    /** Shutdown all enabled extensions */
    shutdownAll(): Promise<void>;
    /** Load built-in extensions */
    loadBuiltinExtensions(): Promise<void>;
}
/**
 * Extension metadata for discovery
 */
export interface ExtensionMetadata {
    id: string;
    name: string;
    version: string;
    description: string;
    author?: string;
    homepage?: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}
//# sourceMappingURL=interfaces.d.ts.map