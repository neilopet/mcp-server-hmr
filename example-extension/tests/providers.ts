/**
 * Test providers and utilities for RequestLoggerExtension tests
 */

import { MockMCPMon, TestHarness } from 'mcpmon/testing';
import { RequestLoggerExtension } from '../src/index.ts';
import { RequestLoggerConfig } from '../src/config.ts';

export class RequestLoggerTestProviders {
  /**
   * Create a MockMCPMon instance for unit testing
   */
  static createMockMCPMon(): MockMCPMon {
    return new MockMCPMon({
      serverName: 'test-server',
      serverCommand: ['deno', 'run', 'test-server.ts'],
      extensions: []
    });
  }

  /**
   * Create a TestHarness for integration testing
   */
  static async createTestHarness(config: Partial<RequestLoggerConfig> = {}): Promise<TestHarness> {
    const extension = new RequestLoggerExtension(config);
    
    return await TestHarness.create({
      serverName: 'test-server',
      serverCommand: ['deno', 'run', 'test-server.ts'],
      extensions: [extension],
      timeoutMs: 5000
    });
  }

  /**
   * Create test MCP messages
   */
  static createTestMessages() {
    return {
      listToolsRequest: {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {}
      },
      
      listToolsResponse: {
        jsonrpc: '2.0' as const,
        id: 1,
        result: {
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            }
          ]
        }
      },
      
      toolCallRequest: {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { input: 'test' }
        }
      },
      
      toolCallResponse: {
        jsonrpc: '2.0' as const,
        id: 2,
        result: {
          content: [
            {
              type: 'text',
              text: 'Test response'
            }
          ]
        }
      },
      
      errorResponse: {
        jsonrpc: '2.0' as const,
        id: 3,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      }
    };
  }

  /**
   * Create test configuration variants
   */
  static createTestConfigs() {
    return {
      minimal: {
        maxRequests: 10,
        logLevel: 'info' as const,
        logRequestBodies: false,
        logResponseBodies: false
      },
      
      verbose: {
        maxRequests: 1000,
        logLevel: 'debug' as const,
        logRequestBodies: true,
        logResponseBodies: true,
        includeTimestamps: true,
        prettyPrint: true
      },
      
      filtered: {
        maxRequests: 100,
        logLevel: 'info' as const,
        excludePatterns: ['initialize', 'ping']
      },
      
      withFile: {
        maxRequests: 500,
        logLevel: 'info' as const,
        logFilePath: '/tmp/test-requests.log'
      }
    };
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 1000,
    intervalMs: number = 50
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  /**
   * Simulate a sequence of MCP interactions
   */
  static async simulateInteractionSequence(
    harness: TestHarness,
    interactions: Array<{
      request: any;
      response: any;
      delay?: number;
    }>
  ): Promise<void> {
    for (const interaction of interactions) {
      await harness.sendMessage(interaction.request);
      
      if (interaction.delay) {
        await new Promise(resolve => setTimeout(resolve, interaction.delay));
      }
      
      await harness.receiveMessage(interaction.response);
    }
  }
}