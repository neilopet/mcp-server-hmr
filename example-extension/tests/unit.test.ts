/**
 * Unit tests for RequestLoggerExtension using MockMCPMon
 */

import { assertEquals, assertExists, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { RequestLoggerExtension } from '../src/index.ts';
import { RequestLogger } from '../src/logger.ts';
import { validateConfig, defaultConfig } from '../src/config.ts';
import { RequestLoggerTestProviders } from './providers.ts';

Deno.test('Unit Tests - Configuration', async (t) => {
  await t.step('Default Configuration', () => {
    const extension = new RequestLoggerExtension();
    assertExists(extension);
    assertEquals(extension.name, 'request-logger');
  });

  await t.step('Custom Configuration', () => {
    const config = {
      maxRequests: 100,
      logLevel: 'debug' as const,
      excludePatterns: ['ping', 'heartbeat']
    };
    
    const extension = new RequestLoggerExtension(config);
    assertExists(extension);
  });

  await t.step('Configuration Validation', () => {
    // Valid config
    const validConfig = validateConfig({
      maxRequests: 50,
      logLevel: 'info'
    });
    assertEquals(validConfig.maxRequests, 50);
    assertEquals(validConfig.logLevel, 'info');
    
    // Invalid maxRequests
    assertThrows(() => {
      validateConfig({ maxRequests: -1 });
    }, Error, 'maxRequests must be greater than 0');
    
    // Invalid logLevel
    assertThrows(() => {
      validateConfig({ logLevel: 'invalid' as any });
    }, Error, 'logLevel must be one of');
  });

  await t.step('Default Config Merge', () => {
    const config = validateConfig({ maxRequests: 200 });
    assertEquals(config.maxRequests, 200);
    assertEquals(config.logLevel, defaultConfig.logLevel);
    assertEquals(config.includeTimestamps, defaultConfig.includeTimestamps);
  });
});

Deno.test('Unit Tests - RequestLogger', async (t) => {
  await t.step('Basic Logging', () => {
    const logger = new RequestLogger(defaultConfig);
    
    logger.logRequest('req1', 'tools/list', { param: 'value' });
    logger.logResponse('req1', { result: 'success' });
    
    const logs = logger.getLogs();
    assertEquals(logs.length, 2);
    assertEquals(logs[0].direction, 'request');
    assertEquals(logs[1].direction, 'response');
  });

  await t.step('Request Statistics', () => {
    const logger = new RequestLogger(defaultConfig);
    
    logger.logRequest('req1', 'tools/list');
    logger.logResponse('req1', { result: 'success' });
    
    logger.logRequest('req2', 'tools/call');
    logger.logResponse('req2', undefined, { error: 'failed' });
    
    const stats = logger.getStats();
    assertEquals(stats.totalRequests, 2);
    assertEquals(stats.totalResponses, 2);
    assertEquals(stats.errorCount, 1);
    assertEquals(stats.methodCounts['tools/list'], 1);
    assertEquals(stats.methodCounts['tools/call'], 1);
  });

  await t.step('Max Requests Limit', () => {
    const config = { ...defaultConfig, maxRequests: 3 };
    const logger = new RequestLogger(config);
    
    // Add more logs than the limit
    for (let i = 0; i < 5; i++) {
      logger.logRequest(`req${i}`, 'test');
    }
    
    const logs = logger.getLogs();
    assertEquals(logs.length, 3); // Should maintain limit
  });

  await t.step('Exclude Patterns', () => {
    const config = { ...defaultConfig, excludePatterns: ['ping', 'heartbeat'] };
    const logger = new RequestLogger(config);
    
    logger.logRequest('req1', 'ping');
    logger.logRequest('req2', 'tools/list');
    logger.logRequest('req3', 'heartbeat');
    
    const logs = logger.getLogs();
    assertEquals(logs.length, 1); // Only tools/list should be logged
    assertEquals(logs[0].method, 'tools/list');
  });

  await t.step('Processing Time Tracking', () => {
    const logger = new RequestLogger(defaultConfig);
    
    logger.logRequest('req1', 'tools/list');
    
    // Simulate some processing time
    setTimeout(() => {
      logger.logResponse('req1', { result: 'success' });
    }, 10);
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const logs = logger.getLogs();
    const response = logs.find(l => l.direction === 'response');
    assertExists(response);
    assertExists(response.processingTime);
  });

  await t.step('Clear Logs', () => {
    const logger = new RequestLogger(defaultConfig);
    
    logger.logRequest('req1', 'test');
    logger.logResponse('req1', { result: 'success' });
    
    assertEquals(logger.getLogs().length, 2);
    
    logger.clear();
    assertEquals(logger.getLogs().length, 0);
  });
});

Deno.test('Unit Tests - Extension with MockMCPMon', async (t) => {
  await t.step('Extension Initialization', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Verify tools registration
    const tools = mockMCPMon.getRegisteredTools();
    assertEquals(tools.length, 3);
    
    const toolNames = tools.map(t => t.name).sort();
    assertEquals(toolNames, [
      'clear_request_logs',
      'get_request_logs', 
      'get_request_stats'
    ]);
  });

  await t.step('Hook Registration', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Verify hooks
    assertEquals(mockMCPMon.getBeforeStdinHooks().length, 1);
    assertEquals(mockMCPMon.getAfterStdoutHooks().length, 1);
  });

  await t.step('Message Processing', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    const messages = RequestLoggerTestProviders.createTestMessages();
    
    // Process request
    const processedRequest = await mockMCPMon.processBeforeStdinForward(
      messages.listToolsRequest
    );
    assertEquals(processedRequest, messages.listToolsRequest);
    
    // Process response
    const processedResponse = await mockMCPMon.processAfterStdoutReceive(
      messages.listToolsResponse
    );
    assertEquals(processedResponse, messages.listToolsResponse);
  });

  await t.step('Tool Calls', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Test get_request_stats
    const statsResult = await mockMCPMon.callTool('get_request_stats', {});
    assertExists(statsResult.content);
    
    const stats = JSON.parse(statsResult.content[0].text);
    assertEquals(stats.totalRequests, 0);
    assertEquals(stats.totalResponses, 0);
    
    // Test get_request_logs with filters
    const logsResult = await mockMCPMon.callTool('get_request_logs', {
      limit: 10,
      direction: 'request'
    });
    assertExists(logsResult.content);
    
    const logsData = JSON.parse(logsResult.content[0].text);
    assertEquals(logsData.filters.limit, 10);
    assertEquals(logsData.filters.direction, 'request');
  });

  await t.step('Clear Logs Tool', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Test without confirmation
    const noConfirmResult = await mockMCPMon.callTool('clear_request_logs', {});
    assertEquals(
      noConfirmResult.content[0].text,
      'Please set confirm=true to clear request logs'
    );
    
    // Test with confirmation
    const confirmResult = await mockMCPMon.callTool('clear_request_logs', { 
      confirm: true 
    });
    assertEquals(
      confirmResult.content[0].text,
      'Cleared 0 request log entries'
    );
  });
});

Deno.test('Unit Tests - Error Handling', async (t) => {
  await t.step('Invalid Configuration', () => {
    assertThrows(() => {
      new RequestLoggerExtension({ maxRequests: 0 });
    }, Error);
    
    assertThrows(() => {
      new RequestLoggerExtension({ logLevel: 'invalid' as any });
    }, Error);
  });

  await t.step('Tool Error Handling', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Test invalid tool parameters
    const result = await mockMCPMon.callTool('get_request_logs', {
      limit: 'invalid'
    });
    
    // Should handle gracefully
    assertExists(result.content);
  });
});