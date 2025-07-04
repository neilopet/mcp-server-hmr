/**
 * MockMCPMon implementation for unit testing extensions
 *
 * Provides a fully controllable mock environment for testing mcpmon extensions
 * with realistic behavior simulation and comprehensive verification capabilities.
 */
import type { MockMCPMon, MockExtensionContext, MockContextOptions, MCPRequest, MCPResponse, MCPNotification, ProgressNotification, CapturedMessage } from './types.js';
import type { ExtensionHooks } from '../extensions/interfaces.js';
/**
 * Mock implementation of MCPMon for unit testing
 */
export declare class MockMCPMonImpl implements MockMCPMon {
    private capturedMessages;
    private registeredHooks;
    private registeredTools;
    private progressNotifications;
    private hookCalls;
    private contextInstance;
    private notificationService;
    constructor();
    /**
     * Create a mock extension context with test helpers
     */
    createContext(options?: MockContextOptions): MockExtensionContext;
    /**
     * Simulate incoming request through hook processing
     */
    simulateRequest(request: MCPRequest): Promise<MCPResponse>;
    /**
     * Simulate incoming response through hook processing
     */
    simulateResponse(response: MCPResponse): Promise<MCPResponse>;
    /**
     * Simulate notification
     */
    simulateNotification(notification: MCPNotification): Promise<void>;
    /**
     * Get all captured messages
     */
    getCapturedMessages(): CapturedMessage[];
    /**
     * Verify a hook was registered
     */
    expectHookRegistered(hookName: keyof ExtensionHooks): void;
    /**
     * Verify a tool was registered
     */
    expectToolRegistered(toolName: string): void;
    /**
     * Get all registered hooks
     */
    getRegisteredHooks(): Partial<ExtensionHooks>;
    /**
     * Get progress notifications
     */
    getProgressNotifications(): ProgressNotification[];
    /**
     * Reset all captured data
     */
    reset(): void;
    /**
     * Trigger a hook manually for testing
     */
    private triggerHook;
    /**
     * Get all calls made to a specific hook
     */
    private getHookCalls;
    /**
     * Create a hooks proxy that captures registered hooks
     */
    private createHooksProxy;
    /**
     * Create mock dependencies
     */
    private createMockDependencies;
    /**
     * Create a mock logger that captures log entries
     */
    private createMockLogger;
    /**
     * Capture a message for testing verification
     */
    private captureMessage;
}
/**
 * Factory function to create MockMCPMon instances
 */
export declare function createMockMCPMon(): MockMCPMon;
//# sourceMappingURL=MockMCPMon.d.ts.map