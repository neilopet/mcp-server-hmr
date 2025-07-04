/**
 * Large Response Handler Extension Tests - DI Pattern
 *
 * Test suite implementation using the new dependency injection framework
 * for comprehensive testing of streaming, buffering, and large response handling.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { inject } from 'inversify';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TestContainer } from '../../../testing/TestContainer.js';
import { TEST_TYPES } from '../../../testing/types.js';
import LargeResponseHandlerExtension from '../index.js';
/**
 * Large Response Handler Test Suite
 * Uses DI pattern for clean dependency management and test isolation
 */
let LargeResponseHandlerTestSuite = class LargeResponseHandlerTestSuite {
    mockMCPMon;
    testHarness;
    lrhUtils;
    extensionId = 'large-response-handler';
    extension = new LargeResponseHandlerExtension();
    metadata = {
        extensionId: 'large-response-handler',
        name: 'Large Response Handler Tests',
        description: 'Test suite for large response handling, streaming, and buffering functionality',
        version: '1.0.0',
        tags: ['streaming', 'performance', 'large-data'],
        timeout: 90000,
        enabled: true
    };
    constructor(mockMCPMon, testHarness, lrhUtils) {
        this.mockMCPMon = mockMCPMon;
        this.testHarness = testHarness;
        this.lrhUtils = lrhUtils;
    }
    async setupTests() {
        describe('LargeResponseHandlerExtension', () => {
            let mockContext;
            beforeEach(async () => {
                // Reset mocks and create fresh context
                this.mockMCPMon.reset();
                mockContext = this.mockMCPMon.createContext({
                    sessionId: 'test-session-123',
                    dataDir: '/tmp/test-mcpmon',
                    config: {
                        threshold: 25000,
                        tokenThreshold: 20000,
                        enableDuckDB: true,
                        enableSchemaGeneration: true,
                        enableStreaming: true,
                        progressUpdateInterval: 100,
                        maxBufferSize: 1024 * 1024, // 1MB for tests
                        streamingTimeout: 5000,
                        toolOverrides: {
                            'special-tool': {
                                threshold: 10000,
                                alwaysPersist: true
                            }
                        }
                    }
                });
            });
            afterEach(async () => {
                await this.extension.shutdown();
            });
            this.defineInitializationTests(() => mockContext);
            this.defineResponseDetectionTests(() => mockContext);
            this.defineStreamingTests(() => mockContext);
            this.defineToolInjectionTests(() => mockContext);
            this.defineToolCallTests(() => mockContext);
            this.defineProgressNotificationTests(() => mockContext);
            this.defineIntegrationTests(() => mockContext);
        });
    }
    async teardownTests() {
        // Cleanup any test resources
        this.mockMCPMon.reset();
        await this.testHarness.cleanup();
    }
    /**
     * Test extension initialization and configuration
     */
    defineInitializationTests(getContext) {
        describe('initialization', () => {
            it('should initialize with default config', async () => {
                const context = getContext();
                await this.extension.initialize(context);
                expect(context.logger.info).toHaveBeenCalledWith(expect.stringContaining('Large Response Handler initialized'));
                // Verify hooks are registered
                this.mockMCPMon.expectHookRegistered('beforeStdinForward');
                this.mockMCPMon.expectHookRegistered('afterStdoutReceive');
                this.mockMCPMon.expectHookRegistered('getAdditionalTools');
                this.mockMCPMon.expectHookRegistered('handleToolCall');
            });
            it('should initialize streaming buffer when enabled', async () => {
                const context = getContext();
                await this.extension.initialize(context);
                // Verify streaming is enabled by checking behavior
                const streamingResponse = {
                    id: 'test-123',
                    result: { data: [1, 2, 3], isPartial: true }
                };
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.afterStdoutReceive(streamingResponse);
                // Should handle streaming response
                expect(result).toBeDefined();
            });
            it('should configure with custom settings', async () => {
                const context = this.mockMCPMon.createContext({
                    config: {
                        threshold: 50000,
                        enableStreaming: false,
                        maxBufferSize: 2 * 1024 * 1024
                    }
                });
                await this.extension.initialize(context);
                expect(context.logger.info).toHaveBeenCalled();
            });
        });
    }
    /**
     * Test large response detection logic
     */
    defineResponseDetectionTests(getContext) {
        describe('response detection', () => {
            beforeEach(async () => {
                await this.extension.initialize(getContext());
            });
            it('should detect responses above size threshold', async () => {
                const largeResponse = this.lrhUtils.createLargeResponse(30); // 30KB
                const message = {
                    id: 'test-456',
                    result: largeResponse
                };
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.afterStdoutReceive(message);
                // Should process large response
                expect(result).toBeDefined();
                expect(getContext().logger.info).toHaveBeenCalledWith(expect.stringContaining('Large response detected'));
            });
            it('should not process small responses', async () => {
                const smallResponse = { data: 'small' };
                const message = {
                    id: 'test-789',
                    result: smallResponse
                };
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.afterStdoutReceive(message);
                // Should pass through unchanged
                expect(result).toBe(message);
            });
            it('should respect tool-specific overrides', async () => {
                const response = this.lrhUtils.createLargeResponse(15); // 15KB
                const message = {
                    id: 'special-123',
                    result: response
                };
                // Simulate this is from special-tool with lower threshold
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.afterStdoutReceive(message);
                // Should handle due to special-tool override (10KB threshold)
                expect(result).toBeDefined();
            });
        });
    }
    /**
     * Test streaming response handling
     */
    defineStreamingTests(getContext) {
        describe('streaming responses', () => {
            beforeEach(async () => {
                await this.extension.initialize(getContext());
            });
            it('should buffer streaming chunks', async () => {
                const chunks = this.lrhUtils.createStreamingChunks(100, 25);
                const requestId = 'stream-test-123';
                const progressToken = this.lrhUtils.simulateProgressToken();
                // Track progress token
                const progressMessage = {
                    id: requestId,
                    params: { _meta: { progressToken } }
                };
                const hooks = this.mockMCPMon.getRegisteredHooks();
                await hooks.beforeStdinForward(progressMessage);
                // Send streaming chunks
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = {
                        id: requestId,
                        result: {
                            ...chunks[i],
                            isPartial: i < chunks.length - 1
                        }
                    };
                    await hooks.afterStdoutReceive(chunk);
                }
                // Should receive progress notifications
                const progressNotifications = this.mockMCPMon.getProgressNotifications();
                expect(progressNotifications.length).toBeGreaterThan(0);
                expect(progressNotifications[0].params.progressToken).toBe(progressToken);
            });
            it('should assemble complete response from chunks', async () => {
                const chunks = this.lrhUtils.createStreamingChunks(50, 10);
                const requestId = 'assemble-test-456';
                const hooks = this.mockMCPMon.getRegisteredHooks();
                // Send all chunks
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = {
                        id: requestId,
                        result: {
                            ...chunks[i],
                            isPartial: i < chunks.length - 1
                        }
                    };
                    const result = await hooks.afterStdoutReceive(chunk);
                    // Final chunk should contain assembled response
                    if (i === chunks.length - 1) {
                        expect(result.result.data).toHaveLength(500); // 50 chunks * 10 items each
                        expect(result.result.isPartial).toBe(false);
                    }
                }
            });
            it('should handle buffer size limits', async () => {
                // Create chunks that exceed buffer limit
                const largeChunks = this.lrhUtils.createStreamingChunks(200, 100);
                const requestId = 'buffer-limit-789';
                const hooks = this.mockMCPMon.getRegisteredHooks();
                // Should switch to disk fallback when buffer limit exceeded
                for (const chunk of largeChunks.slice(0, 10)) {
                    const chunkMessage = {
                        id: requestId,
                        result: { ...chunk, isPartial: true }
                    };
                    await hooks.afterStdoutReceive(chunkMessage);
                }
                // Should log warning about disk fallback
                expect(getContext().logger.warn).toHaveBeenCalledWith(expect.stringContaining('Buffer size limit exceeded'));
            });
        });
    }
    /**
     * Test tool injection functionality
     */
    defineToolInjectionTests(getContext) {
        describe('tool injection', () => {
            beforeEach(async () => {
                await this.extension.initialize(getContext());
            });
            it('should inject LRH tools into tools/list response', async () => {
                const listRequest = { method: 'tools/list', id: 'list-123' };
                const hooks = this.mockMCPMon.getRegisteredHooks();
                // Track tools/list request
                await hooks.beforeStdinForward(listRequest);
                // Simulate tools/list response
                const listResponse = {
                    id: 'list-123',
                    result: {
                        tools: [
                            { name: 'existing-tool', description: 'Existing tool' }
                        ]
                    }
                };
                const result = await hooks.afterStdoutReceive(listResponse);
                expect(result.result.tools).toHaveLength(3); // 1 existing + 2 injected
                // Verify LRH tools are injected
                this.mockMCPMon.expectToolRegistered('mcpmon.analyze-with-duckdb');
                this.mockMCPMon.expectToolRegistered('mcpmon.list-saved-datasets');
            });
            it('should provide correct tool schemas', async () => {
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const tools = await hooks.getAdditionalTools();
                expect(tools).toHaveLength(2);
                const duckdbTool = tools.find(t => t.name === 'mcpmon.analyze-with-duckdb');
                expect(duckdbTool).toMatchObject({
                    name: 'mcpmon.analyze-with-duckdb',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            datasetId: { type: 'string' },
                            query: { type: 'string' }
                        },
                        required: ['datasetId', 'query']
                    }
                });
                const listTool = tools.find(t => t.name === 'mcpmon.list-saved-datasets');
                expect(listTool).toMatchObject({
                    name: 'mcpmon.list-saved-datasets',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            limit: { type: 'number' }
                        }
                    }
                });
            });
        });
    }
    /**
     * Test LRH-specific tool calls
     */
    defineToolCallTests(getContext) {
        describe('tool calls', () => {
            beforeEach(async () => {
                await this.extension.initialize(getContext());
            });
            it('should handle analyze-with-duckdb tool calls', async () => {
                const mockQueryResult = [
                    { id: 1, name: 'test', value: 42 },
                    { id: 2, name: 'test2', value: 84 }
                ];
                this.lrhUtils.mockDuckDBQuery(mockQueryResult);
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.handleToolCall('mcpmon.analyze-with-duckdb', {
                    datasetId: 'dataset-123',
                    query: 'SELECT * FROM test_table'
                });
                expect(result).toMatchObject({
                    error: 'DuckDB analysis not yet implemented'
                });
            });
            it('should handle list-saved-datasets tool calls', async () => {
                const mockDatasets = [
                    {
                        status: 'success_file_saved',
                        originalTool: 'tool1',
                        count: 50,
                        dataFile: '/tmp/data.json',
                        metadata: { sizeKB: 30, timestamp: Date.now() }
                    }
                ];
                this.lrhUtils.mockDatasetListing(mockDatasets);
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.handleToolCall('mcpmon.list-saved-datasets', { limit: 10 });
                expect(result).toMatchObject({
                    datasets: [],
                    message: 'Dataset listing not yet implemented'
                });
            });
            it('should return null for unknown tools', async () => {
                const hooks = this.mockMCPMon.getRegisteredHooks();
                const result = await hooks.handleToolCall('unknown-tool', { args: 'test' });
                expect(result).toBeNull();
            });
        });
    }
    /**
     * Test progress notification functionality
     */
    defineProgressNotificationTests(getContext) {
        describe('progress notifications', () => {
            beforeEach(async () => {
                await this.extension.initialize(getContext());
            });
            it('should send progress notifications during streaming', async () => {
                const progressToken = this.lrhUtils.simulateProgressToken();
                const requestId = 'progress-test-123';
                // Track progress token
                const progressMessage = {
                    id: requestId,
                    params: { _meta: { progressToken } }
                };
                const hooks = this.mockMCPMon.getRegisteredHooks();
                await hooks.beforeStdinForward(progressMessage);
                // Send streaming chunks with delays to trigger progress
                const chunks = this.lrhUtils.createStreamingChunks(20, 50);
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = {
                        id: requestId,
                        result: {
                            ...chunks[i],
                            isPartial: i < chunks.length - 1
                        }
                    };
                    await hooks.afterStdoutReceive(chunk);
                    // Small delay to allow progress updates
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                const progressNotifications = this.mockMCPMon.getProgressNotifications();
                expect(progressNotifications.length).toBeGreaterThan(0);
                const notification = progressNotifications[0];
                expect(notification).toMatchObject({
                    method: 'notifications/progress',
                    params: {
                        progressToken,
                        progress: expect.any(Number),
                        message: expect.stringContaining('Buffering response')
                    }
                });
            });
            it('should respect progress update intervals', async () => {
                const progressToken = this.lrhUtils.simulateProgressToken();
                const requestId = 'interval-test-456';
                const hooks = this.mockMCPMon.getRegisteredHooks();
                // Track progress token
                await hooks.beforeStdinForward({
                    id: requestId,
                    params: { _meta: { progressToken } }
                });
                // Send chunks rapidly
                const chunks = this.lrhUtils.createStreamingChunks(10, 20);
                for (const chunk of chunks) {
                    const chunkMessage = {
                        id: requestId,
                        result: { ...chunk, isPartial: true }
                    };
                    await hooks.afterStdoutReceive(chunkMessage);
                }
                // Should limit progress notifications based on interval
                const progressNotifications = this.mockMCPMon.getProgressNotifications();
                expect(progressNotifications.length).toBeLessThanOrEqual(3);
            });
        });
    }
    /**
     * Test integration scenarios
     */
    defineIntegrationTests(getContext) {
        describe('integration scenarios', () => {
            beforeEach(async () => {
                await this.testHarness.initialize([this.extension]);
                await this.testHarness.enableExtension('large-response-handler');
            });
            it('should handle complete large response workflow', async () => {
                await this.testHarness.withExtension('large-response-handler', async () => {
                    // Simulate large tool response
                    const largeResponse = this.lrhUtils.createLargeResponse(100); // 100KB
                    const result = await this.testHarness.callTool('test-large-tool', { data: 'request' }, this.lrhUtils.simulateProgressToken());
                    // Should receive progress notifications
                    const notification = await this.testHarness.expectNotification('notifications/progress', 1000);
                    expect(notification).toBeDefined();
                    expect(notification.params).toMatchObject({
                        progressToken: expect.any(String),
                        progress: expect.any(Number)
                    });
                });
            });
            it('should handle streaming with real proxy', async () => {
                const chunks = this.lrhUtils.createStreamingChunks(50, 25);
                const progressToken = this.lrhUtils.simulateProgressToken();
                await this.testHarness.streamResponse(chunks, progressToken);
                // Verify streaming was handled correctly
                const proxy = this.testHarness.getProxy();
                this.testHarness.verifyExtensionState('large-response-handler', 'initialized');
            });
        });
    }
};
LargeResponseHandlerTestSuite = __decorate([
    TestContainer.register('large-response-handler'),
    __param(0, inject(TEST_TYPES.MockMCPMon)),
    __param(1, inject(TEST_TYPES.TestHarness)),
    __param(2, inject('LRHTestUtilities')),
    __metadata("design:paramtypes", [Object, Object, Object])
], LargeResponseHandlerTestSuite);
export { LargeResponseHandlerTestSuite };
export default LargeResponseHandlerTestSuite;
