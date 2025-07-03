/**
 * MCPMonTestHarness - Integration test harness for real mcpmon proxy
 *
 * Provides controlled testing environment for integration tests with real MCPProxy
 * infrastructure while maintaining isolation and deterministic behavior.
 */
import type { TestHarness, MCPRequest, MCPResponse, MCPNotification } from './types.js';
import type { Extension } from '../extensions/interfaces.js';
import { MCPProxy } from '../proxy.js';
/**
 * Real MCPMon proxy test harness for integration testing
 */
export declare class MCPMonTestHarness implements TestHarness {
    private proxy;
    private procManager;
    private fs;
    private stdin;
    private stdout;
    private stderr;
    private extensionRegistry;
    private config;
    private requestIdCounter;
    private pendingRequests;
    private notificationWaiters;
    private progressTokens;
    private capturedNotifications;
    private shuttingDown;
    private outputMonitoringActive;
    constructor();
    /**
     * Initialize harness with extensions
     */
    initialize(extensions: Extension[]): Promise<void>;
    /**
     * Enable specific extension
     */
    enableExtension(extensionId: string): Promise<void>;
    /**
     * Disable specific extension
     */
    disableExtension(extensionId: string): Promise<void>;
    /**
     * Run test with extension enabled
     */
    withExtension<T>(extensionId: string, test: () => Promise<T>): Promise<T>;
    /**
     * Send MCP request through proxy
     */
    sendRequest(request: MCPRequest): Promise<MCPResponse>;
    /**
     * Wait for and capture notification
     */
    expectNotification(method: string, timeout?: number): Promise<MCPNotification>;
    /**
     * Simulate tool call
     */
    callTool(toolName: string, args: any, progressToken?: string): Promise<any>;
    /**
     * Simulate streaming response
     */
    streamResponse(chunks: any[], progressToken?: string): Promise<void>;
    /**
     * Get proxy instance
     */
    getProxy(): MCPProxy;
    /**
     * Verify extension state
     */
    verifyExtensionState(extensionId: string, state: 'initialized' | 'shutdown'): void;
    /**
     * Clean up harness
     */
    cleanup(): Promise<void>;
    /**
     * Create mock extension registry
     */
    private createMockExtensionRegistry;
    /**
     * Create extension context
     */
    private createExtensionContext;
    /**
     * Start monitoring proxy output for responses and notifications
     */
    private startOutputMonitoring;
    /**
     * Handle incoming response
     */
    private handleResponse;
    /**
     * Handle incoming notification
     */
    private handleNotification;
    /**
     * Wait for proxy to be ready
     */
    private waitForProxyReady;
}
//# sourceMappingURL=MCPMonTestHarness.d.ts.map