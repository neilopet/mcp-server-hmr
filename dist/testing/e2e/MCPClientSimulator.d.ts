/**
 * E2E MCP Client Simulator for realistic client testing
 *
 * Provides comprehensive simulation of different MCP clients including:
 * - Claude Desktop (with specific capabilities and behavior)
 * - MCP Inspector (developer tool patterns)
 * - Custom clients (configurable behavior)
 *
 * Implements full MCP protocol flow with realistic delays, error handling,
 * and client-specific behaviors for thorough end-to-end testing.
 */
import type { MCPRequest, MCPResponse, MCPNotification, ProgressNotification, E2ETestContext, MCPClientSimulator, E2EScenario, ScenarioResult, ClientConfig } from '../types.js';
/**
 * MCP protocol message types
 */
export interface InitializeRequest extends MCPRequest {
    method: 'initialize';
    params: {
        protocolVersion: string;
        capabilities: MCPClientCapabilities;
        clientInfo: {
            name: string;
            version: string;
        };
    };
}
export interface InitializeResponse extends MCPResponse {
    result: {
        protocolVersion: string;
        capabilities: MCPServerCapabilities;
        serverInfo: {
            name: string;
            version: string;
        };
    };
}
export interface ListToolsRequest extends MCPRequest {
    method: 'tools/list';
    params?: {
        cursor?: string;
    };
}
export interface ListToolsResponse extends MCPResponse {
    result: {
        tools: MCPTool[];
        nextCursor?: string;
    };
}
export interface CallToolRequest extends MCPRequest {
    method: 'tools/call';
    params: {
        name: string;
        arguments?: Record<string, unknown>;
    };
}
export interface CallToolResponse extends MCPResponse {
    result: {
        content: MCPContent[];
        isError?: boolean;
        _meta?: Record<string, unknown>;
    };
}
export interface MCPClientCapabilities {
    experimental?: Record<string, Record<string, unknown>>;
    sampling?: Record<string, unknown>;
    roots?: {
        listChanged?: boolean;
    };
}
export interface MCPServerCapabilities {
    experimental?: Record<string, Record<string, unknown>>;
    logging?: Record<string, unknown>;
    prompts?: {
        listChanged?: boolean;
    };
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    tools?: {
        listChanged?: boolean;
    };
}
export interface MCPTool {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}
export interface MCPContent {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
}
/**
 * Stream interface for MCP communication
 */
export interface MCPStream {
    write(data: string): Promise<void>;
    read(): Promise<string>;
    close(): Promise<void>;
    onMessage(handler: (message: string) => void): void;
    onError(handler: (error: Error) => void): void;
    onClose(handler: () => void): void;
}
/**
 * Mock stream implementation for testing
 */
export declare class MockMCPStream implements MCPStream {
    private messageHandlers;
    private errorHandlers;
    private closeHandlers;
    private messageQueue;
    private closed;
    write(data: string): Promise<void>;
    read(): Promise<string>;
    close(): Promise<void>;
    onMessage(handler: (message: string) => void): void;
    onError(handler: (error: Error) => void): void;
    onClose(handler: () => void): void;
    simulateMessage(message: string): void;
    simulateError(error: Error): void;
    simulateClose(): void;
}
/**
 * Real stream implementation for actual network communication
 */
export declare class NetworkMCPStream implements MCPStream {
    private stdin;
    private stdout;
    private reader;
    private writer;
    private messageHandlers;
    private errorHandlers;
    private closeHandlers;
    private closed;
    constructor(stdin: WritableStream<Uint8Array>, stdout: ReadableStream<Uint8Array>);
    private startReading;
    write(data: string): Promise<void>;
    read(): Promise<string>;
    close(): Promise<void>;
    onMessage(handler: (message: string) => void): void;
    onError(handler: (error: Error) => void): void;
    onClose(handler: () => void): void;
}
/**
 * Base MCP client simulator implementation
 */
export declare class BaseMCPClientSimulator implements MCPClientSimulator {
    protected config: ClientConfig;
    protected stream: MCPStream;
    protected notifications: MCPNotification[];
    protected progressTokens: Map<string, ProgressNotification[]>;
    protected requestId: number;
    protected connected: boolean;
    protected initialized: boolean;
    constructor(config: ClientConfig, stream: MCPStream);
    private setupStreamHandlers;
    connect(): Promise<void>;
    initialize(capabilities?: MCPClientCapabilities): Promise<void>;
    callTool(name: string, args: any, progressToken?: string): Promise<any>;
    listTools(): Promise<MCPTool[]>;
    disconnect(): Promise<void>;
    getNotifications(): MCPNotification[];
    getProgressNotifications(token?: string): ProgressNotification[];
    protected sendRequest(request: MCPRequest): Promise<MCPResponse>;
    protected generateMockResponse(request: MCPRequest): any;
    protected getDefaultCapabilities(): MCPClientCapabilities;
    protected delay(ms: number): Promise<void>;
}
/**
 * Claude Desktop client simulator with specific behaviors
 */
export declare class ClaudeDesktopSimulator extends BaseMCPClientSimulator {
    constructor(stream: MCPStream);
    protected getDefaultCapabilities(): MCPClientCapabilities;
    callTool(name: string, args: any, progressToken?: string): Promise<any>;
}
/**
 * MCP Inspector client simulator with developer tool patterns
 */
export declare class MCPInspectorSimulator extends BaseMCPClientSimulator {
    private detailedLogging;
    constructor(stream: MCPStream);
    protected getDefaultCapabilities(): MCPClientCapabilities;
    protected sendRequest(request: MCPRequest): Promise<MCPResponse>;
    validateProtocol(): Promise<boolean>;
}
/**
 * Custom client simulator with configurable behavior
 */
export declare class CustomClientSimulator extends BaseMCPClientSimulator {
    private customBehaviors;
    constructor(config: ClientConfig, stream: MCPStream);
    addCustomBehavior(name: string, behavior: Function): void;
    executeCustomBehavior(name: string, ...args: any[]): Promise<any>;
}
/**
 * E2E Test Context implementation
 */
export declare class E2ETestContextImpl implements E2ETestContext {
    private streamFactory;
    constructor(streamFactory?: () => MCPStream);
    simulateClient(clientType: 'claude-desktop' | 'mcp-inspector' | 'custom'): MCPClientSimulator;
    createCustomClient(config: ClientConfig): MCPClientSimulator;
    runScenario(scenario: E2EScenario): Promise<ScenarioResult>;
    private executeStep;
    private validateAssertion;
    private captureMessages;
}
/**
 * Scenario builder for creating complex E2E test scenarios
 */
export declare class E2EScenarioBuilder {
    private scenario;
    constructor(name: string);
    connect(delay?: number): this;
    initialize(capabilities?: MCPClientCapabilities, delay?: number): this;
    callTool(name: string, args: any, progressToken?: string, delay?: number): this;
    wait(duration: number): this;
    disconnect(delay?: number): this;
    expectNotification(method: string): this;
    expectResponse(expected: any): this;
    expectState(expected: any): this;
    build(): E2EScenario;
}
/**
 * Factory for creating test contexts with different configurations
 */
export declare class E2ETestContextFactory {
    static createMockContext(): E2ETestContext;
    static createNetworkContext(stdin: WritableStream<Uint8Array>, stdout: ReadableStream<Uint8Array>): E2ETestContext;
    static createCustomContext(streamFactory: () => MCPStream): E2ETestContext;
}
//# sourceMappingURL=MCPClientSimulator.d.ts.map