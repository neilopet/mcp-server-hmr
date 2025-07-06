/**
 * Mock MCP Server for Testing
 *
 * Provides a configurable mock implementation of an MCP server that can be used
 * in integration tests to simulate server responses, streaming behaviors, and
 * error conditions without requiring a real MCP server process.
 */
import type { MCPRequest } from './types.js';
/**
 * Context provided to request handlers
 */
export interface RequestContext {
    /** The request ID from the original JSON-RPC request */
    requestId: string | number;
    /** Progress token if provided in request metadata */
    progressToken?: string;
    /** The request method (e.g., 'tools/call', 'tools/list') */
    method: string;
    /** Full request object for advanced use cases */
    request: MCPRequest;
}
/**
 * Handler function for tool calls
 */
export type ToolCallHandler = (args: any, context: RequestContext) => Promise<any>;
/**
 * Handler function for general requests
 */
export type RequestHandler = (params: any, context: RequestContext) => Promise<any>;
/**
 * Configuration for streaming response behavior
 */
export interface StreamingConfig {
    /** Delay between chunks in milliseconds */
    chunkDelay?: number;
    /** Whether to send progress notifications */
    sendProgress?: boolean;
    /** Progress update interval in milliseconds */
    progressInterval?: number;
}
/**
 * Mock MCP Server interface
 *
 * Provides methods to configure server behavior and handle requests.
 */
export interface MockMCPServer {
    /**
     * Register a handler for specific tool calls
     * @param toolName The name of the tool to handle
     * @param handler Function to handle the tool call
     */
    onToolCall(toolName: string, handler: ToolCallHandler): void;
    /**
     * Register a handler for specific request methods
     * @param method The method name to handle (e.g., 'tools/list')
     * @param handler Function to handle the request
     */
    onRequest(method: string, handler: RequestHandler): void;
    /**
     * Send a streaming response with multiple chunks
     * @param chunks Array of data chunks to send
     * @param progressToken Optional progress token for notifications
     * @param config Optional streaming configuration
     */
    streamResponse(chunks: any[], progressToken?: string, config?: StreamingConfig): Promise<void>;
    /**
     * Send a simple response
     * @param response The response data to send
     */
    sendResponse(response: any): Promise<void>;
    /**
     * Send an error response
     * @param error The error to send
     */
    sendError(error: {
        code: number;
        message: string;
        data?: any;
    }): Promise<void>;
    /**
     * Connect the mock server to input/output streams
     * @param stdin Readable stream for incoming requests
     * @param stdout Writable stream for outgoing responses
     */
    connect(stdin: ReadableStream<Uint8Array>, stdout: WritableStream<Uint8Array>): void;
    /**
     * Disconnect and clean up resources
     */
    disconnect(): void;
    /**
     * Reset all handlers and state
     */
    reset(): void;
    /**
     * Check if the server is currently connected
     */
    isConnected(): boolean;
}
/**
 * Error types for MCP operations
 */
export declare class MCPError extends Error {
    code: number;
    data?: any | undefined;
    constructor(code: number, message: string, data?: any | undefined);
}
/**
 * Common MCP error codes
 */
export declare const MCPErrorCodes: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    readonly TOOL_NOT_FOUND: -1;
    readonly TOOL_EXECUTION_ERROR: -2;
};
/**
 * MockMCPServer implementation
 *
 * Simulates an MCP server for testing purposes by handling requests
 * and generating appropriate responses.
 */
export declare class MockMCPServerImpl implements MockMCPServer {
    private toolHandlers;
    private requestHandlers;
    private stdin?;
    private stdout?;
    private reader?;
    private writer?;
    private connected;
    private currentRequestId;
    constructor();
    /**
     * Set up default handlers for common MCP requests
     */
    private setupDefaultHandlers;
    onToolCall(toolName: string, handler: ToolCallHandler): void;
    onRequest(method: string, handler: RequestHandler): void;
    streamResponse(chunks: any[], progressToken?: string, config?: StreamingConfig): Promise<void>;
    sendResponse(response: any): Promise<void>;
    sendError(error: {
        code: number;
        message: string;
        data?: any;
    }): Promise<void>;
    connect(stdin: ReadableStream<Uint8Array>, stdout: WritableStream<Uint8Array>): void;
    disconnect(): void;
    reset(): void;
    isConnected(): boolean;
    /**
     * Start listening for incoming requests
     */
    private startListening;
    /**
     * Handle incoming JSON-RPC message
     */
    private handleIncomingMessage;
    /**
     * Parse incoming request
     */
    private parseRequest;
    /**
     * Route request to appropriate handler
     */
    private routeRequest;
    /**
     * Format successful response
     */
    private formatResponse;
    /**
     * Format error response
     */
    private formatError;
    /**
     * Send progress notification
     */
    private sendProgressNotification;
    /**
     * Write message to stdout
     */
    private writeMessage;
}
/**
 * Factory function to create MockMCPServer
 */
export declare function createMockMCPServer(): MockMCPServer;
//# sourceMappingURL=MockMCPServer.d.ts.map