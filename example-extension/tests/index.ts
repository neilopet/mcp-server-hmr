/**
 * Main test suite entry point for RequestLoggerExtension
 */

import { assertEquals, assertExists, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { RequestLoggerExtension } from '../src/index.ts';
import { RequestLoggerTestProviders } from './providers.ts';

Deno.test('RequestLoggerExtension Test Suite', async (t) => {
  await t.step('Extension Creation', async () => {
    const extension = new RequestLoggerExtension();
    assertExists(extension);
    assertEquals(extension.name, 'request-logger');
    assertEquals(extension.version, '1.0.0');
  });

  await t.step('Extension with Custom Config', async () => {
    const config = {
      maxRequests: 50,
      logLevel: 'debug' as const,
      logRequestBodies: false
    };
    
    const extension = new RequestLoggerExtension(config);
    assertExists(extension);
    
    // Test config validation
    assertThrows(() => {
      new RequestLoggerExtension({ maxRequests: -1 });
    }, Error, 'maxRequests must be greater than 0');
    
    assertThrows(() => {
      new RequestLoggerExtension({ logLevel: 'invalid' as any });
    }, Error, 'logLevel must be one of');
  });

  await t.step('MockMCPMon Integration', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    // Test extension initialization
    await extension.initialize(mockMCPMon.getContext());
    
    // Verify tools were registered
    const registeredTools = mockMCPMon.getRegisteredTools();
    assertEquals(registeredTools.length, 3);
    
    const toolNames = registeredTools.map(tool => tool.name);
    assertEquals(toolNames.sort(), [
      'clear_request_logs',
      'get_request_logs',
      'get_request_stats'
    ]);
  });

  await t.step('Hook Registration', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Verify hooks were registered
    const beforeStdinHooks = mockMCPMon.getBeforeStdinHooks();
    const afterStdoutHooks = mockMCPMon.getAfterStdoutHooks();
    
    assertEquals(beforeStdinHooks.length, 1);
    assertEquals(afterStdoutHooks.length, 1);
  });

  await t.step('Message Processing', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    const messages = RequestLoggerTestProviders.createTestMessages();
    
    // Process a request
    await mockMCPMon.processBeforeStdinForward(messages.listToolsRequest);
    
    // Process a response
    await mockMCPMon.processAfterStdoutReceive(messages.listToolsResponse);
    
    // Check that logs were captured
    const getLogsResult = await mockMCPMon.callTool('get_request_logs', {});
    assertExists(getLogsResult.content);
    
    const logsData = JSON.parse(getLogsResult.content[0].text);
    assertEquals(logsData.logs.length, 2);
  });

  await t.step('Tool Functionality', async () => {
    const mockMCPMon = RequestLoggerTestProviders.createMockMCPMon();
    const extension = new RequestLoggerExtension();
    
    await extension.initialize(mockMCPMon.getContext());
    
    // Test get_request_stats
    const statsResult = await mockMCPMon.callTool('get_request_stats', {});
    assertExists(statsResult.content);
    
    const stats = JSON.parse(statsResult.content[0].text);
    assertEquals(stats.totalRequests, 0);
    assertEquals(stats.totalResponses, 0);
    
    // Test clear_request_logs
    const clearResult = await mockMCPMon.callTool('clear_request_logs', { confirm: true });
    assertExists(clearResult.content);
    assertEquals(clearResult.content[0].text, 'Cleared 0 request log entries');
  });
});

// Export for use in other test files
export { RequestLoggerTestProviders };