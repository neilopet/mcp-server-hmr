/**
 * Type definitions for mcpmon DI test framework
 * 
 * Provides interfaces and types for extension testing with dependency injection
 */

import type { Extension, ExtensionContext, ExtensionHooks } from '../extensions/interfaces.js';
import type { MCPProxy } from '../proxy.js';

// Re-export extension types
export type { Extension, ExtensionContext, ExtensionHooks };

/**
 * Symbols for dependency injection
 */
export const TEST_TYPES = {
  ExtensionTestSuite: Symbol.for('ExtensionTestSuite'),
  TestHarness: Symbol.for('TestHarness'),
  MockMCPMon: Symbol.for('MockMCPMon'),
  IntegrationContext: Symbol.for('IntegrationContext'),
  E2EContext: Symbol.for('E2EContext'),
  TestLogger: Symbol.for('TestLogger'),
  MessageCapture: Symbol.for('MessageCapture'),
  ExtensionLoader: Symbol.for('ExtensionLoader'),
} as const;

/**
 * Base interface for extension test suites
 */
export interface ExtensionTestSuite {
  /** Unique identifier for the extension being tested */
  readonly extensionId: string;
  
  /** Extension instance being tested */
  readonly extension?: Extension;
  
  /** Test suite metadata */
  readonly metadata: TestSuiteMetadata;
  
  /** Set up test suite - called once before all tests */
  setupTests(): void | Promise<void>;
  
  /** Tear down test suite - called once after all tests */
  teardownTests(): void | Promise<void>;
}

/**
 * MCP message types for testing
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface ProgressNotification extends MCPNotification {
  method: 'notifications/progress';
  params: {
    progressToken: string;
    progress: number;
    total?: number;
    message?: string;
  };
}

/**
 * Mock MCPMon for unit testing extensions
 */
export interface MockMCPMon {
  /** Create a mock extension context */
  createContext(options?: MockContextOptions): MockExtensionContext;
  
  /** Simulate incoming request */
  simulateRequest(request: MCPRequest): Promise<MCPResponse>;
  
  /** Simulate incoming response */
  simulateResponse(response: MCPResponse): Promise<MCPResponse>;
  
  /** Simulate notification */
  simulateNotification(notification: MCPNotification): Promise<void>;
  
  /** Get captured messages */
  getCapturedMessages(): CapturedMessage[];
  
  /** Verify hook was registered */
  expectHookRegistered(hookName: keyof ExtensionHooks): void;
  
  /** Verify tool was registered */
  expectToolRegistered(toolName: string): void;
  
  /** Get all registered hooks */
  getRegisteredHooks(): Partial<ExtensionHooks>;
  
  /** Get progress notifications */
  getProgressNotifications(): ProgressNotification[];
  
  /** Reset all captured data */
  reset(): void;
}

/**
 * Options for creating mock context
 */
export interface MockContextOptions {
  sessionId?: string;
  dataDir?: string;
  config?: any;
  dependencies?: Partial<MockDependencies>;
}

/**
 * Mock dependencies for testing
 */
export interface MockDependencies {
  stdout: WritableStream<Uint8Array>;
  stderr: WritableStream<Uint8Array>;
  stdin: ReadableStream<Uint8Array>;
}

/**
 * Mock extension context for unit tests
 */
export interface MockExtensionContext extends ExtensionContext {
  /** Test-specific helpers */
  testHelpers: {
    triggerHook(hookName: keyof ExtensionHooks, ...args: any[]): Promise<any>;
    getHookCalls(hookName: keyof ExtensionHooks): any[];
  };
}

/**
 * Test harness for integration testing
 */
export interface TestHarness {
  /** Initialize harness with extensions */
  initialize(extensions: Extension[]): Promise<void>;
  
  /** Enable specific extension */
  enableExtension(extensionId: string): Promise<void>;
  
  /** Disable specific extension */
  disableExtension(extensionId: string): Promise<void>;
  
  /** Run test with extension enabled */
  withExtension<T>(extensionId: string, test: () => Promise<T>): Promise<T>;
  
  /** Send MCP request through proxy */
  sendRequest(request: MCPRequest): Promise<MCPResponse>;
  
  /** Wait for and capture notification */
  expectNotification(method: string, timeout?: number): Promise<MCPNotification>;
  
  /** Simulate tool call */
  callTool(toolName: string, args: any, progressToken?: string): Promise<any>;
  
  /** Simulate streaming response */
  streamResponse(chunks: any[], progressToken?: string): Promise<void>;
  
  /** Get proxy instance */
  getProxy(): MCPProxy;
  
  /** Verify extension state */
  verifyExtensionState(extensionId: string, state: 'initialized' | 'shutdown'): void;
  
  /** Clean up harness */
  cleanup(): Promise<void>;
}

/**
 * Message capture for testing
 */
export interface CapturedMessage {
  type: 'request' | 'response' | 'notification';
  direction: 'in' | 'out';
  message: any;
  timestamp: number;
}

/**
 * Test logger interface
 */
export interface TestLogger {
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]): void;
  getLogs(): LogEntry[];
  clear(): void;
}

export interface LogEntry {
  level: string;
  message: string;
  args: any[];
  timestamp: number;
}

/**
 * E2E test context for client simulation
 */
export interface E2ETestContext {
  /** Simulate specific MCP client */
  simulateClient(clientType: 'claude-desktop' | 'mcp-inspector' | 'custom'): MCPClientSimulator;
  
  /** Create custom client simulator */
  createCustomClient(config: ClientConfig): MCPClientSimulator;
  
  /** Run full e2e scenario */
  runScenario(scenario: E2EScenario): Promise<ScenarioResult>;
}

/**
 * MCP client simulator for e2e tests
 */
export interface MCPClientSimulator {
  /** Connect to proxy */
  connect(): Promise<void>;
  
  /** Send initialization */
  initialize(capabilities?: any): Promise<void>;
  
  /** Call tool */
  callTool(name: string, args: any, progressToken?: string): Promise<any>;
  
  /** List tools */
  listTools(): Promise<any[]>;
  
  /** Disconnect */
  disconnect(): Promise<void>;
  
  /** Get received notifications */
  getNotifications(): MCPNotification[];
}

/**
 * E2E scenario definition
 */
export interface E2EScenario {
  name: string;
  steps: ScenarioStep[];
  assertions?: ScenarioAssertion[];
}

export interface ScenarioStep {
  action: 'connect' | 'initialize' | 'callTool' | 'wait' | 'disconnect';
  params?: any;
  delay?: number;
}

export interface ScenarioAssertion {
  type: 'notification' | 'response' | 'state';
  expected: any;
}

export interface ScenarioResult {
  success: boolean;
  errors: Error[];
  capturedMessages: CapturedMessage[];
}

/**
 * Client configuration for simulation
 */
export interface ClientConfig {
  name: string;
  version: string;
  capabilities?: any;
  initializationDelay?: number;
  responseTimeout?: number;
}


/**
 * Test suite decorator options
 */
export interface TestSuiteOptions {
  /** Tags for test categorization */
  tags?: string[];
  
  /** Custom timeout for all tests in suite */
  timeout?: number;
  
  /** Skip condition */
  skipIf?: () => boolean;
  
  /** Run tests in parallel */
  parallel?: boolean;
}

/**
 * Extension test loader interface
 */
export interface ExtensionTestLoader {
  /** Load test suite for extension */
  loadTestSuite(extensionPath: string): Promise<ExtensionTestSuite | null>;
  
  /** Discover all extension test suites */
  discoverTestSuites(baseDir: string): Promise<ExtensionTestSuite[]>;
  
  /** Validate test suite */
  validateTestSuite(suite: ExtensionTestSuite): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Alias for ExtensionTestSuite to match discovery imports
 */
export type TestSuite = ExtensionTestSuite;

/**
 * Test suite metadata for discovery
 */
export interface TestSuiteMetadata {
  extensionId: ExtensionId;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  timeout?: number;
  retries?: number;
  enabled?: boolean;
}

/**
 * Extension ID type
 */
export type ExtensionId = string;

/**
 * Extension instance type
 */
export interface ExtensionInstance {
  id: string;
  [key: string]: any;
}

/**
 * Test filter options for discovery
 */
export interface TestFilter {
  extensionIds?: ExtensionId[];
  tags?: string[];
  onlyEnabled?: boolean;
}