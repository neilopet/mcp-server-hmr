/**
 * Integration tests for RequestLoggerExtension using TestHarness
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { RequestLoggerTestProviders } from './providers.ts';

Deno.test('Integration Tests - TestHarness', async (t) => {
  await t.step('Basic Extension Integration', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      // Verify extension is running
      assertExists(harness);
      
      // Test basic tool availability
      const tools = await harness.listTools();
      const requestLoggerTools = tools.filter(tool => 
        tool.name.startsWith('get_request_') || 
        tool.name.startsWith('clear_request_')
      );
      
      assertEquals(requestLoggerTools.length, 3);
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Message Flow Integration', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Simulate message exchange
      await harness.sendMessage(messages.listToolsRequest);
      await harness.receiveMessage(messages.listToolsResponse);
      
      // Check that logs were captured
      const logsResult = await harness.callTool('get_request_logs', {});
      assertExists(logsResult.content);
      
      const logsData = JSON.parse(logsResult.content[0].text);
      assertEquals(logsData.logs.length, 2);
      
      // Verify request/response pair
      const request = logsData.logs.find((log: any) => log.direction === 'request');
      const response = logsData.logs.find((log: any) => log.direction === 'response');
      
      assertExists(request);
      assertExists(response);
      assertEquals(request.method, 'tools/list');
      assertEquals(request.id, response.id);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Statistics Integration', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Simulate multiple interactions
      await harness.sendMessage(messages.listToolsRequest);
      await harness.receiveMessage(messages.listToolsResponse);
      
      await harness.sendMessage(messages.toolCallRequest);
      await harness.receiveMessage(messages.toolCallResponse);
      
      // Check statistics
      const statsResult = await harness.callTool('get_request_stats', {});
      assertExists(statsResult.content);
      
      const stats = JSON.parse(statsResult.content[0].text);
      assertEquals(stats.totalRequests, 2);
      assertEquals(stats.totalResponses, 2);
      assertEquals(stats.errorCount, 0);
      assertEquals(stats.methodCounts['tools/list'], 1);
      assertEquals(stats.methodCounts['tools/call'], 1);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Error Handling Integration', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Simulate error response
      await harness.sendMessage(messages.toolCallRequest);
      await harness.receiveMessage(messages.errorResponse);
      
      // Check error was captured
      const statsResult = await harness.callTool('get_request_stats', {});
      const stats = JSON.parse(statsResult.content[0].text);
      assertEquals(stats.errorCount, 1);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Filter Integration', async () => {
    const config = {
      excludePatterns: ['tools/list']
    };
    
    const harness = await RequestLoggerTestProviders.createTestHarness(config);
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Send filtered message
      await harness.sendMessage(messages.listToolsRequest);
      await harness.receiveMessage(messages.listToolsResponse);
      
      // Send non-filtered message
      await harness.sendMessage(messages.toolCallRequest);
      await harness.receiveMessage(messages.toolCallResponse);
      
      // Check only non-filtered messages were logged
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      
      const requests = logsData.logs.filter((log: any) => log.direction === 'request');
      assertEquals(requests.length, 1);
      assertEquals(requests[0].method, 'tools/call');
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Configuration Integration', async () => {
    const config = {
      maxRequests: 2,
      logRequestBodies: false,
      logResponseBodies: false
    };
    
    const harness = await RequestLoggerTestProviders.createTestHarness(config);
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Send multiple messages to test maxRequests
      for (let i = 0; i < 3; i++) {
        await harness.sendMessage({ 
          ...messages.listToolsRequest, 
          id: i + 1 
        });
        await harness.receiveMessage({ 
          ...messages.listToolsResponse, 
          id: i + 1 
        });
      }
      
      // Check max requests limit
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      
      // Should only have 2 logs (maxRequests=2)
      assertEquals(logsData.logs.length, 2);
      
      // Check that bodies were not logged
      const requestLog = logsData.logs.find((log: any) => log.direction === 'request');
      assertEquals(requestLog.params, undefined);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Clear Logs Integration', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Add some logs
      await harness.sendMessage(messages.listToolsRequest);
      await harness.receiveMessage(messages.listToolsResponse);
      
      // Verify logs exist
      let logsResult = await harness.callTool('get_request_logs', {});
      let logsData = JSON.parse(logsResult.content[0].text);
      assertEquals(logsData.logs.length, 2);
      
      // Clear logs
      await harness.callTool('clear_request_logs', { confirm: true });
      
      // Verify logs are cleared
      logsResult = await harness.callTool('get_request_logs', {});
      logsData = JSON.parse(logsResult.content[0].text);
      assertEquals(logsData.logs.length, 0);
      
    } finally {
      await harness.cleanup();
    }
  });
});

Deno.test('Integration Tests - Performance', async (t) => {
  await t.step('High Volume Message Processing', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness({
      maxRequests: 1000
    });
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Send many messages
      const messageCount = 100;
      const startTime = Date.now();
      
      for (let i = 0; i < messageCount; i++) {
        await harness.sendMessage({ 
          ...messages.listToolsRequest, 
          id: i + 1 
        });
        await harness.receiveMessage({ 
          ...messages.listToolsResponse, 
          id: i + 1 
        });
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Check that all messages were processed
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      assertEquals(logsData.logs.length, messageCount * 2);
      
      // Performance assertion (should process 100 messages in reasonable time)
      console.log(`Processed ${messageCount * 2} messages in ${processingTime}ms`);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Memory Management', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness({
      maxRequests: 10 // Small limit to test memory management
    });
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Send more messages than the limit
      for (let i = 0; i < 20; i++) {
        await harness.sendMessage({ 
          ...messages.listToolsRequest, 
          id: i + 1 
        });
      }
      
      // Check that only maxRequests are kept
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      assertEquals(logsData.logs.length, 10);
      
    } finally {
      await harness.cleanup();
    }
  });
});

Deno.test('Integration Tests - Edge Cases', async (t) => {
  await t.step('Malformed Messages', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      // Send malformed message
      await harness.sendMessage({
        jsonrpc: '2.0',
        // Missing id and method
        params: {}
      });
      
      // Extension should handle gracefully
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      
      // Should not crash, but might not log incomplete messages
      assertExists(logsData.logs);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Concurrent Operations', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      const messages = RequestLoggerTestProviders.createTestMessages();
      
      // Send multiple concurrent messages
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(harness.sendMessage({ 
          ...messages.listToolsRequest, 
          id: i + 1 
        }));
      }
      
      await Promise.all(promises);
      
      // Check that all messages were processed
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      assertEquals(logsData.logs.length, 10);
      
    } finally {
      await harness.cleanup();
    }
  });
});