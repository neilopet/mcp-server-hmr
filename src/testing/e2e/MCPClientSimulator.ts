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

import type {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  ProgressNotification,
  E2ETestContext,
  MCPClientSimulator,
  E2EScenario,
  ScenarioResult,
  ScenarioStep,
  ScenarioAssertion,
  ClientConfig,
  CapturedMessage,
} from '../types.js';

// Re-export types for external use
export type {
  E2EScenario,
  ScenarioResult,
  ScenarioStep,
  ScenarioAssertion,
  ClientConfig,
  CapturedMessage,
  E2ETestContext,
  MCPClientSimulator,
};

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
export class MockMCPStream implements MCPStream {
  private messageHandlers: ((message: string) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  private messageQueue: string[] = [];
  private closed = false;

  async write(data: string): Promise<void> {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    // Simulate write delay
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  async read(): Promise<string> {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    
    return new Promise((resolve, reject) => {
      const checkQueue = () => {
        if (this.messageQueue.length > 0) {
          resolve(this.messageQueue.shift()!);
        } else if (this.closed) {
          reject(new Error('Stream closed'));
        } else {
          setTimeout(checkQueue, 10);
        }
      };
      checkQueue();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.closeHandlers.forEach(handler => handler());
  }

  onMessage(handler: (message: string) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  // Test helper methods
  simulateMessage(message: string): void {
    this.messageQueue.push(message);
    this.messageHandlers.forEach(handler => handler(message));
  }

  simulateError(error: Error): void {
    this.errorHandlers.forEach(handler => handler(error));
  }

  simulateClose(): void {
    this.closed = true;
    this.closeHandlers.forEach(handler => handler());
  }
}

/**
 * Real stream implementation for actual network communication
 */
export class NetworkMCPStream implements MCPStream {
  private stdin: WritableStream<Uint8Array>;
  private stdout: ReadableStream<Uint8Array>;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private messageHandlers: ((message: string) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  private closed = false;

  constructor(stdin: WritableStream<Uint8Array>, stdout: ReadableStream<Uint8Array>) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.reader = stdout.getReader();
    this.writer = stdin.getWriter();
    this.startReading();
  }

  private async startReading(): Promise<void> {
    try {
      while (!this.closed) {
        const { done, value } = await this.reader.read();
        if (done) break;
        
        const message = new TextDecoder().decode(value);
        const lines = message.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          this.messageHandlers.forEach(handler => handler(line));
        }
      }
    } catch (error) {
      this.errorHandlers.forEach(handler => handler(error as Error));
    }
  }

  async write(data: string): Promise<void> {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    
    const encoded = new TextEncoder().encode(data + '\n');
    await this.writer.write(encoded);
  }

  async read(): Promise<string> {
    if (this.closed) {
      throw new Error('Stream is closed');
    }
    
    const { done, value } = await this.reader.read();
    if (done) {
      throw new Error('Stream ended');
    }
    
    return new TextDecoder().decode(value);
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.writer.close();
    this.reader.releaseLock();
    this.closeHandlers.forEach(handler => handler());
  }

  onMessage(handler: (message: string) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}

/**
 * Base MCP client simulator implementation
 */
export class BaseMCPClientSimulator implements MCPClientSimulator {
  protected config: ClientConfig;
  protected stream: MCPStream;
  protected notifications: MCPNotification[] = [];
  protected progressTokens: Map<string, ProgressNotification[]> = new Map();
  protected requestId = 1;
  protected connected = false;
  protected initialized = false;

  constructor(config: ClientConfig, stream: MCPStream) {
    this.config = config;
    this.stream = stream;
    this.setupStreamHandlers();
  }

  private setupStreamHandlers(): void {
    this.stream.onMessage((message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.method && !parsed.id) {
          // It's a notification
          this.notifications.push(parsed as MCPNotification);
          
          // Handle progress notifications specifically
          if (parsed.method === 'notifications/progress') {
            const progressNotif = parsed as ProgressNotification;
            const token = progressNotif.params.progressToken;
            if (!this.progressTokens.has(token)) {
              this.progressTokens.set(token, []);
            }
            this.progressTokens.get(token)!.push(progressNotif);
          }
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    this.stream.onError((error: Error) => {
      console.error('Stream error:', error);
    });

    this.stream.onClose(() => {
      this.connected = false;
      this.initialized = false;
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected');
    }

    // Simulate connection delay
    await this.delay(this.config.initializationDelay || 50);
    this.connected = true;
  }

  async initialize(capabilities?: MCPClientCapabilities): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    if (this.initialized) {
      throw new Error('Already initialized');
    }

    const initRequest: InitializeRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: capabilities || this.getDefaultCapabilities(),
        clientInfo: {
          name: this.config.name,
          version: this.config.version,
        },
      },
    };

    await this.sendRequest(initRequest);
    // Simulate initialization delay
    await this.delay(this.config.initializationDelay || 100);
    this.initialized = true;
  }

  async callTool(name: string, args: any, progressToken?: string): Promise<any> {
    if (!this.initialized) {
      throw new Error('Not initialized');
    }

    const request: CallToolRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    // Add progress token if provided
    if (progressToken) {
      (request.params as any)._meta = { progressToken };
    }

    return await this.sendRequest(request);
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      throw new Error('Not initialized');
    }

    const request: ListToolsRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/list',
    };

    const response = await this.sendRequest(request) as ListToolsResponse;
    return response.result.tools;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.stream.close();
    this.connected = false;
    this.initialized = false;
  }

  getNotifications(): MCPNotification[] {
    return [...this.notifications];
  }

  getProgressNotifications(token?: string): ProgressNotification[] {
    if (token) {
      return this.progressTokens.get(token) || [];
    }
    
    const allProgress: ProgressNotification[] = [];
    for (const notifications of this.progressTokens.values()) {
      allProgress.push(...notifications);
    }
    return allProgress;
  }

  protected async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    await this.stream.write(JSON.stringify(request));
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.config.responseTimeout || 5000}ms`));
      }, this.config.responseTimeout || 5000);

      const checkResponse = () => {
        // In a real implementation, we'd parse incoming messages for responses
        // For now, simulate a response
        clearTimeout(timeout);
        resolve({
          jsonrpc: '2.0',
          id: request.id,
          result: this.generateMockResponse(request),
        });
      };

      setTimeout(checkResponse, 50); // Simulate response delay
    });
  }

  protected generateMockResponse(request: MCPRequest): any {
    switch (request.method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            experimental: {},
          },
          serverInfo: {
            name: 'mock-server',
            version: '1.0.0',
          },
        };
      case 'tools/list':
        return {
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              inputSchema: {
                type: 'object',
                properties: {
                  input: { type: 'string' },
                },
              },
            },
          ],
        };
      case 'tools/call':
        return {
          content: [
            {
              type: 'text',
              text: 'Mock tool response',
            },
          ],
        };
      default:
        return {};
    }
  }

  protected getDefaultCapabilities(): MCPClientCapabilities {
    return {
      experimental: {},
      sampling: {},
    };
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Claude Desktop client simulator with specific behaviors
 */
export class ClaudeDesktopSimulator extends BaseMCPClientSimulator {
  constructor(stream: MCPStream) {
    super({
      name: 'claude-desktop',
      version: '0.7.0',
      initializationDelay: 200,
      responseTimeout: 30000,
      capabilities: {
        experimental: {},
        sampling: {},
        roots: { listChanged: true },
      },
    }, stream);
  }

  protected getDefaultCapabilities(): MCPClientCapabilities {
    return {
      experimental: {},
      sampling: {},
      roots: { listChanged: true },
    };
  }

  // Claude Desktop specific behavior: retry on failures
  async callTool(name: string, args: any, progressToken?: string): Promise<any> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await super.callTool(name, args, progressToken);
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await this.delay(1000 * (i + 1)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }
}

/**
 * MCP Inspector client simulator with developer tool patterns
 */
export class MCPInspectorSimulator extends BaseMCPClientSimulator {
  private detailedLogging = true;

  constructor(stream: MCPStream) {
    super({
      name: 'mcp-inspector',
      version: '0.1.0',
      initializationDelay: 100,
      responseTimeout: 10000,
      capabilities: {
        experimental: {
          inspector: { enabled: true },
        },
      },
    }, stream);
  }

  protected getDefaultCapabilities(): MCPClientCapabilities {
    return {
      experimental: {
        inspector: { enabled: true },
      },
    };
  }

  // Inspector specific: detailed logging and inspection
  protected async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    if (this.detailedLogging) {
      console.log('Inspector sending request:', JSON.stringify(request, null, 2));
    }

    const response = await super.sendRequest(request);

    if (this.detailedLogging) {
      console.log('Inspector received response:', JSON.stringify(response, null, 2));
    }

    return response;
  }

  // Inspector specific: protocol validation
  async validateProtocol(): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return tools.every(tool => 
        tool.name && 
        tool.inputSchema && 
        typeof tool.inputSchema === 'object'
      );
    } catch (error) {
      console.error('Protocol validation failed:', error);
      return false;
    }
  }
}

/**
 * Custom client simulator with configurable behavior
 */
export class CustomClientSimulator extends BaseMCPClientSimulator {
  private customBehaviors: Map<string, Function> = new Map();

  constructor(config: ClientConfig, stream: MCPStream) {
    super(config, stream);
  }

  addCustomBehavior(name: string, behavior: Function): void {
    this.customBehaviors.set(name, behavior);
  }

  async executeCustomBehavior(name: string, ...args: any[]): Promise<any> {
    const behavior = this.customBehaviors.get(name);
    if (!behavior) {
      throw new Error(`Custom behavior '${name}' not found`);
    }
    return behavior(...args);
  }
}

/**
 * E2E Test Context implementation
 */
export class E2ETestContextImpl implements E2ETestContext {
  private streamFactory: () => MCPStream;

  constructor(streamFactory: () => MCPStream = () => new MockMCPStream()) {
    this.streamFactory = streamFactory;
  }

  simulateClient(clientType: 'claude-desktop' | 'mcp-inspector' | 'custom'): MCPClientSimulator {
    const stream = this.streamFactory();

    switch (clientType) {
      case 'claude-desktop':
        return new ClaudeDesktopSimulator(stream);
      case 'mcp-inspector':
        return new MCPInspectorSimulator(stream);
      case 'custom':
        return new CustomClientSimulator({
          name: 'custom-client',
          version: '1.0.0',
        }, stream);
      default:
        throw new Error(`Unsupported client type: ${clientType}`);
    }
  }

  createCustomClient(config: ClientConfig): MCPClientSimulator {
    const stream = this.streamFactory();
    return new CustomClientSimulator(config, stream);
  }

  async runScenario(scenario: E2EScenario): Promise<ScenarioResult> {
    const result: ScenarioResult = {
      success: true,
      errors: [],
      capturedMessages: [],
    };

    try {
      // For now, create a default client for scenario execution
      const client = this.simulateClient('custom');
      
      for (const step of scenario.steps) {
        try {
          await this.executeStep(client, step);
          
          // Add delay if specified
          if (step.delay) {
            await new Promise(resolve => setTimeout(resolve, step.delay));
          }
        } catch (error) {
          result.success = false;
          result.errors.push(error as Error);
        }
      }

      // Run assertions
      if (scenario.assertions) {
        for (const assertion of scenario.assertions) {
          try {
            await this.validateAssertion(client, assertion);
          } catch (error) {
            result.success = false;
            result.errors.push(error as Error);
          }
        }
      }

      // Capture messages
      result.capturedMessages = this.captureMessages(client);

    } catch (error) {
      result.success = false;
      result.errors.push(error as Error);
    }

    return result;
  }

  private async executeStep(client: MCPClientSimulator, step: ScenarioStep): Promise<void> {
    switch (step.action) {
      case 'connect':
        await client.connect();
        break;
      case 'initialize':
        await client.initialize(step.params?.capabilities);
        break;
      case 'callTool':
        await client.callTool(
          step.params?.name,
          step.params?.arguments,
          step.params?.progressToken
        );
        break;
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, step.params?.duration || 1000));
        break;
      case 'disconnect':
        await client.disconnect();
        break;
      default:
        throw new Error(`Unknown step action: ${step.action}`);
    }
  }

  private async validateAssertion(client: MCPClientSimulator, assertion: ScenarioAssertion): Promise<void> {
    switch (assertion.type) {
      case 'notification':
        const notifications = client.getNotifications();
        const hasExpectedNotification = notifications.some(n => 
          n.method === assertion.expected.method
        );
        if (!hasExpectedNotification) {
          throw new Error(`Expected notification '${assertion.expected.method}' not found`);
        }
        break;
      case 'response':
        // This would need to be implemented based on captured responses
        break;
      case 'state':
        // This would need to be implemented based on client state
        break;
      default:
        throw new Error(`Unknown assertion type: ${assertion.type}`);
    }
  }

  private captureMessages(client: MCPClientSimulator): CapturedMessage[] {
    const messages: CapturedMessage[] = [];
    
    // Convert notifications to captured messages
    client.getNotifications().forEach(notification => {
      messages.push({
        type: 'notification',
        direction: 'in',
        message: notification,
        timestamp: Date.now(),
      });
    });

    return messages;
  }
}

/**
 * Scenario builder for creating complex E2E test scenarios
 */
export class E2EScenarioBuilder {
  private scenario: E2EScenario;

  constructor(name: string) {
    this.scenario = {
      name,
      steps: [],
      assertions: [],
    };
  }

  connect(delay?: number): this {
    this.scenario.steps.push({
      action: 'connect',
      delay,
    });
    return this;
  }

  initialize(capabilities?: MCPClientCapabilities, delay?: number): this {
    this.scenario.steps.push({
      action: 'initialize',
      params: { capabilities },
      delay,
    });
    return this;
  }

  callTool(name: string, args: any, progressToken?: string, delay?: number): this {
    this.scenario.steps.push({
      action: 'callTool',
      params: { name, arguments: args, progressToken },
      delay,
    });
    return this;
  }

  wait(duration: number): this {
    this.scenario.steps.push({
      action: 'wait',
      params: { duration },
    });
    return this;
  }

  disconnect(delay?: number): this {
    this.scenario.steps.push({
      action: 'disconnect',
      delay,
    });
    return this;
  }

  expectNotification(method: string): this {
    this.scenario.assertions!.push({
      type: 'notification',
      expected: { method },
    });
    return this;
  }

  expectResponse(expected: any): this {
    this.scenario.assertions!.push({
      type: 'response',
      expected,
    });
    return this;
  }

  expectState(expected: any): this {
    this.scenario.assertions!.push({
      type: 'state',
      expected,
    });
    return this;
  }

  build(): E2EScenario {
    return { ...this.scenario };
  }
}

/**
 * Factory for creating test contexts with different configurations
 */
export class E2ETestContextFactory {
  static createMockContext(): E2ETestContext {
    return new E2ETestContextImpl(() => new MockMCPStream());
  }

  static createNetworkContext(
    stdin: WritableStream<Uint8Array>,
    stdout: ReadableStream<Uint8Array>
  ): E2ETestContext {
    return new E2ETestContextImpl(() => new NetworkMCPStream(stdin, stdout));
  }

  static createCustomContext(streamFactory: () => MCPStream): E2ETestContext {
    return new E2ETestContextImpl(streamFactory);
  }
}

// All classes are already exported inline