/**
 * End-to-end tests for RequestLoggerExtension with real MCP client simulation
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { RequestLoggerTestProviders } from './providers.ts';

Deno.test('E2E Tests - Real MCP Client Simulation', async (t) => {
  await t.step('Complete MCP Session', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      // Simulate a complete MCP session
      await simulateCompleteSession(harness);
      
      // Verify session was logged correctly
      const statsResult = await harness.callTool('get_request_stats', {});
      const stats = JSON.parse(statsResult.content[0].text);
      
      // Should have captured initialization + tool calls
      assertEquals(stats.totalRequests >= 3, true);
      assertEquals(stats.totalResponses >= 3, true);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Multi-Tool Workflow', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      // Simulate a complex workflow
      await simulateMultiToolWorkflow(harness);
      
      // Verify all tools were logged
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      
      const methods = logsData.logs
        .filter((log: any) => log.direction === 'request')
        .map((log: any) => log.method);
      
      // Should include various MCP methods
      assertEquals(methods.includes('tools/list'), true);
      assertEquals(methods.includes('tools/call'), true);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Error Recovery Simulation', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      // Simulate error scenarios and recovery
      await simulateErrorScenarios(harness);
      
      // Verify error handling
      const statsResult = await harness.callTool('get_request_stats', {});
      const stats = JSON.parse(statsResult.content[0].text);
      
      // Should have recorded errors
      assertEquals(stats.errorCount > 0, true);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Long Running Session', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness({
      maxRequests: 100
    });
    
    try {
      // Simulate a long-running session
      await simulateLongRunningSession(harness);
      
      // Verify memory management
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      
      // Should respect maxRequests limit
      assertEquals(logsData.logs.length <= 100, true);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Extension Tool Usage', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness();
    
    try {
      // Generate some logs first
      await simulateBasicOperations(harness);
      
      // Test extension tools extensively
      await testExtensionTools(harness);
      
      // Verify tool functionality
      const statsResult = await harness.callTool('get_request_stats', {});
      const stats = JSON.parse(statsResult.content[0].text);
      
      assertExists(stats.methodCounts);
      assertExists(stats.averageResponseTime);
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Configuration Scenarios', async () => {
    const configs = RequestLoggerTestProviders.createTestConfigs();
    
    for (const [configName, config] of Object.entries(configs)) {
      await t.step(`Config: ${configName}`, async () => {
        const harness = await RequestLoggerTestProviders.createTestHarness(config);
        
        try {
          await simulateBasicOperations(harness);
          
          // Verify configuration effects
          const logsResult = await harness.callTool('get_request_logs', {});
          const logsData = JSON.parse(logsResult.content[0].text);
          
          assertExists(logsData.logs);
          
          // Check specific configuration effects
          if (configName === 'minimal') {
            // Should have limited logs
            assertEquals(logsData.logs.length <= 20, true);
          } else if (configName === 'filtered') {
            // Should exclude certain patterns
            const filteredLogs = logsData.logs.filter((log: any) => 
              log.method === 'initialize' || log.method === 'ping'
            );
            assertEquals(filteredLogs.length, 0);
          }
          
        } finally {
          await harness.cleanup();
        }
      });
    }
  });
});

Deno.test('E2E Tests - Performance and Stress', async (t) => {
  await t.step('High Load Simulation', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness({
      maxRequests: 1000
    });
    
    try {
      const startTime = Date.now();
      
      // Simulate high load
      await simulateHighLoad(harness);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Verify performance
      const statsResult = await harness.callTool('get_request_stats', {});
      const stats = JSON.parse(statsResult.content[0].text);
      
      console.log(`High load test completed in ${totalTime}ms`);
      console.log(`Processed ${stats.totalRequests} requests`);
      
      // Performance assertions
      assertEquals(stats.totalRequests >= 500, true);
      assertEquals(totalTime < 30000, true); // Should complete in under 30 seconds
      
    } finally {
      await harness.cleanup();
    }
  });

  await t.step('Memory Stress Test', async () => {
    const harness = await RequestLoggerTestProviders.createTestHarness({
      maxRequests: 50 // Small limit to test memory management
    });
    
    try {
      // Generate more messages than memory can hold
      await simulateMemoryStress(harness);
      
      // Verify memory management
      const logsResult = await harness.callTool('get_request_logs', {});
      const logsData = JSON.parse(logsResult.content[0].text);
      
      // Should not exceed memory limit
      assertEquals(logsData.logs.length <= 50, true);
      
    } finally {
      await harness.cleanup();
    }
  });
});

// Helper functions for E2E test scenarios

async function simulateCompleteSession(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // Initialize
  await harness.sendMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' }
  });
  
  // List tools
  await harness.sendMessage(messages.listToolsRequest);
  await harness.receiveMessage(messages.listToolsResponse);
  
  // Call tool
  await harness.sendMessage(messages.toolCallRequest);
  await harness.receiveMessage(messages.toolCallResponse);
}

async function simulateMultiToolWorkflow(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // Multiple tool interactions
  const workflows = [
    { request: messages.listToolsRequest, response: messages.listToolsResponse },
    { request: messages.toolCallRequest, response: messages.toolCallResponse },
    { request: messages.listToolsRequest, response: messages.listToolsResponse }
  ];
  
  for (const workflow of workflows) {
    await harness.sendMessage(workflow.request);
    await harness.receiveMessage(workflow.response);
  }
}

async function simulateErrorScenarios(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // Normal request
  await harness.sendMessage(messages.listToolsRequest);
  await harness.receiveMessage(messages.listToolsResponse);
  
  // Error scenario
  await harness.sendMessage(messages.toolCallRequest);
  await harness.receiveMessage(messages.errorResponse);
}

async function simulateLongRunningSession(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // Generate many messages over time
  for (let i = 0; i < 150; i++) {
    await harness.sendMessage({
      ...messages.listToolsRequest,
      id: i + 1
    });
    
    if (i % 10 === 0) {
      // Occasional pause to simulate real usage
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

async function simulateBasicOperations(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // Basic operations
  await harness.sendMessage(messages.listToolsRequest);
  await harness.receiveMessage(messages.listToolsResponse);
  
  await harness.sendMessage(messages.toolCallRequest);
  await harness.receiveMessage(messages.toolCallResponse);
}

async function testExtensionTools(harness: any) {
  // Test all extension tools
  await harness.callTool('get_request_stats', {});
  
  await harness.callTool('get_request_logs', {
    limit: 10,
    direction: 'request'
  });
  
  await harness.callTool('get_request_logs', {
    limit: 5,
    direction: 'response'
  });
  
  await harness.callTool('clear_request_logs', { confirm: true });
}

async function simulateHighLoad(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // High volume of concurrent requests
  const promises = [];
  for (let i = 0; i < 500; i++) {
    promises.push(harness.sendMessage({
      ...messages.listToolsRequest,
      id: i + 1
    }));
    
    if (i % 50 === 0) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  
  await Promise.all(promises);
}

async function simulateMemoryStress(harness: any) {
  const messages = RequestLoggerTestProviders.createTestMessages();
  
  // Generate many messages to test memory limits
  for (let i = 0; i < 200; i++) {
    await harness.sendMessage({
      ...messages.listToolsRequest,
      id: i + 1,
      params: {
        // Large payload to test memory handling
        data: 'x'.repeat(1000)
      }
    });
  }
}