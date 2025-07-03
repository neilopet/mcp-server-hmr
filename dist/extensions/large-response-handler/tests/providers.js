/**
 * Large Response Handler Test Providers
 *
 * DI container module providing LRH-specific test utilities, mocks, and helpers.
 * Includes DuckDB mock, stream simulator, and custom test data generators.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { ContainerModule, injectable } from 'inversify';
import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { StreamingBuffer } from '../streaming.js';
/**
 * Implementation of LRH test utilities
 */
let LRHTestUtilitiesImpl = class LRHTestUtilitiesImpl {
    duckDBMock = new Map();
    mockDatasets = [];
    createLargeResponse(sizeKB) {
        // Create response that approximates the target size
        const itemSize = 50; // Approximate bytes per item
        const itemCount = Math.floor((sizeKB * 1024) / itemSize);
        return {
            data: Array(itemCount).fill(null).map((_, i) => ({
                id: i + 1,
                name: `item_${i + 1}`,
                value: Math.random() * 100,
                description: `This is test item number ${i + 1} with some additional text to reach target size`,
                timestamp: Date.now(),
                metadata: {
                    category: `category_${i % 10}`,
                    tags: [`tag_${i % 5}`, `tag_${(i + 1) % 5}`],
                    score: Math.random()
                }
            })),
            metadata: {
                totalItems: itemCount,
                approximateSizeKB: sizeKB,
                generated: true
            }
        };
    }
    createStreamingChunks(totalItems, chunkSize) {
        const chunks = [];
        let itemIndex = 0;
        while (itemIndex < totalItems) {
            const remainingItems = totalItems - itemIndex;
            const currentChunkSize = Math.min(chunkSize, remainingItems);
            const chunkData = Array(currentChunkSize).fill(null).map((_, i) => ({
                id: itemIndex + i + 1,
                name: `streaming_item_${itemIndex + i + 1}`,
                value: Math.random() * 100,
                chunkIndex: chunks.length,
                itemInChunk: i
            }));
            chunks.push({
                data: chunkData,
                chunkIndex: chunks.length,
                totalChunks: Math.ceil(totalItems / chunkSize),
                isPartial: itemIndex + currentChunkSize < totalItems
            });
            itemIndex += currentChunkSize;
        }
        return chunks;
    }
    simulateProgressToken() {
        return `progress-${randomUUID()}`;
    }
    mockDuckDBQuery(result) {
        // Store mock result for later retrieval
        this.duckDBMock.set('default', result);
    }
    mockDatasetListing(datasets) {
        this.mockDatasets = datasets;
    }
    createMockDataset(options) {
        const opts = {
            id: randomUUID(),
            tool: 'test-tool',
            sizeKB: 25,
            itemCount: 100,
            timestamp: Date.now(),
            sessionId: 'test-session',
            ...options
        };
        return {
            status: 'success_file_saved',
            originalTool: opts.tool,
            count: opts.itemCount,
            dataFile: `/tmp/test-mcpmon/${opts.sessionId}/${opts.tool}/response-${opts.id}.json`,
            database: {
                path: `/tmp/test-mcpmon/${opts.sessionId}/${opts.tool}/database-${opts.id}.duckdb`,
                tables: [{
                        name: opts.tool.replace(/-/g, '_'),
                        rowCount: opts.itemCount,
                        columns: [
                            { table_name: opts.tool.replace(/-/g, '_'), column_name: 'id', data_type: 'INTEGER' },
                            { table_name: opts.tool.replace(/-/g, '_'), column_name: 'name', data_type: 'VARCHAR' },
                            { table_name: opts.tool.replace(/-/g, '_'), column_name: 'value', data_type: 'DOUBLE' }
                        ]
                    }],
                sampleQueries: [
                    `SELECT * FROM ${opts.tool.replace(/-/g, '_')} LIMIT 10;`,
                    `SELECT COUNT(*) as total_rows FROM ${opts.tool.replace(/-/g, '_')};`,
                    `SELECT AVG(value) as avg_value FROM ${opts.tool.replace(/-/g, '_')};`
                ]
            },
            schemaResource: `mcpmon://schemas/${opts.sessionId}/${opts.tool}/${opts.id}`,
            metadata: {
                sizeKB: opts.sizeKB,
                estimatedTokens: opts.sizeKB * 4, // Rough approximation
                timestamp: opts.timestamp,
                sessionId: opts.sessionId
            }
        };
    }
    formatBytes(bytes) {
        if (bytes < 1024)
            return `${bytes}B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)}KB`;
        if (bytes < 1024 * 1024 * 1024)
            return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
    }
};
LRHTestUtilitiesImpl = __decorate([
    injectable()
], LRHTestUtilitiesImpl);
/**
 * DuckDB mock implementation
 */
let DuckDBMockImpl = class DuckDBMockImpl {
    queryResults = new Map();
    datasets = [];
    async executeDuckDBQuery(database, query) {
        // Simple mock implementation
        const result = this.queryResults.get(query) || this.queryResults.get('default') || [];
        return Promise.resolve(result);
    }
    async listSavedDatasets(sessionId, tool) {
        let filtered = this.datasets;
        if (sessionId) {
            filtered = filtered.filter(d => d.metadata.sessionId === sessionId);
        }
        if (tool) {
            filtered = filtered.filter(d => d.originalTool === tool);
        }
        return Promise.resolve(filtered);
    }
    mockQueryResult(query, result) {
        this.queryResults.set(query, result);
    }
    mockDatasets(datasets) {
        this.datasets = datasets;
    }
    reset() {
        this.queryResults.clear();
        this.datasets = [];
    }
};
DuckDBMockImpl = __decorate([
    injectable()
], DuckDBMockImpl);
/**
 * Stream simulator implementation
 */
let StreamSimulatorImpl = class StreamSimulatorImpl {
    createStreamingChunks(totalItems, chunkSize) {
        const utils = new LRHTestUtilitiesImpl();
        return utils.createStreamingChunks(totalItems, chunkSize);
    }
    simulateProgressNotifications(progressToken, chunks) {
        const notifications = [];
        let totalBytes = 0;
        chunks.forEach((chunk, index) => {
            const chunkBytes = Buffer.byteLength(JSON.stringify(chunk), 'utf8');
            totalBytes += chunkBytes;
            notifications.push({
                jsonrpc: '2.0',
                method: 'notifications/progress',
                params: {
                    progressToken,
                    progress: totalBytes,
                    message: `Buffering response: ${this.formatBytes(totalBytes)} (${index + 1} chunks)`
                }
            });
        });
        return notifications;
    }
    createProgressToken() {
        return `progress-${randomUUID()}`;
    }
    createStreamingBuffer(config) {
        const defaultConfig = {
            maxBufferSize: 1024 * 1024, // 1MB for tests
            progressUpdateInterval: 100,
            requestTimeout: 5000,
            enableDiskFallback: true
        };
        return new StreamingBuffer({ ...defaultConfig, ...config });
    }
    formatBytes(bytes) {
        if (bytes < 1024)
            return `${bytes}B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
};
StreamSimulatorImpl = __decorate([
    injectable()
], StreamSimulatorImpl);
/**
 * LRH-specific MockMCPMon implementation
 */
let LRHMockMCPMonImpl = class LRHMockMCPMonImpl {
    capturedMessages = [];
    registeredHooks = {};
    progressNotifications = [];
    streamingBuffer;
    streamingMode = false;
    createContext(options) {
        const mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };
        const context = {
            sessionId: options?.sessionId || 'test-session',
            dataDir: options?.dataDir || '/tmp/test-mcpmon',
            config: options?.config || {},
            logger: mockLogger,
            hooks: {},
            dependencies: options?.dependencies || {},
            testHelpers: {
                triggerHook: async (hookName, ...args) => {
                    const hook = this.registeredHooks[hookName];
                    return hook ? await hook(...args) : undefined;
                },
                getHookCalls: (hookName) => {
                    // Return mock call history
                    return [];
                }
            }
        };
        return context;
    }
    async simulateRequest(request) {
        this.capturedMessages.push({
            type: 'request',
            direction: 'in',
            message: request,
            timestamp: Date.now()
        });
        // Simulate response
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: { status: 'simulated' }
        };
    }
    async simulateResponse(response) {
        this.capturedMessages.push({
            type: 'response',
            direction: 'out',
            message: response,
            timestamp: Date.now()
        });
        return response;
    }
    async simulateNotification(notification) {
        if (notification.method === 'notifications/progress') {
            this.progressNotifications.push(notification);
        }
        this.capturedMessages.push({
            type: 'notification',
            direction: 'out',
            message: notification,
            timestamp: Date.now()
        });
    }
    async simulateStreamingResponse(chunks, progressToken) {
        if (!this.streamingMode) {
            this.enableStreamingMode();
        }
        for (let i = 0; i < chunks.length; i++) {
            const chunk = {
                ...chunks[i],
                isPartial: i < chunks.length - 1
            };
            await this.simulateResponse({
                jsonrpc: '2.0',
                id: `streaming-${Date.now()}`,
                result: chunk
            });
            if (progressToken) {
                await this.simulateNotification({
                    jsonrpc: '2.0',
                    method: 'notifications/progress',
                    params: {
                        progressToken,
                        progress: (i + 1) / chunks.length * 100,
                        message: `Processing chunk ${i + 1}/${chunks.length}`
                    }
                });
            }
            // Simulate streaming delay
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    getCapturedMessages() {
        return [...this.capturedMessages];
    }
    expectHookRegistered(hookName) {
        if (!this.registeredHooks[hookName]) {
            throw new Error(`Expected hook '${String(hookName)}' to be registered`);
        }
    }
    expectToolRegistered(toolName) {
        // Check if tool was registered via getAdditionalTools hook
        const hook = this.registeredHooks.getAdditionalTools;
        if (!hook) {
            throw new Error('getAdditionalTools hook not registered');
        }
        // This would need to be implemented based on actual hook behavior
        // For now, we'll assume tools are registered if the hook exists
    }
    getRegisteredHooks() {
        return { ...this.registeredHooks };
    }
    getProgressNotifications() {
        return [...this.progressNotifications];
    }
    getStreamingBuffer() {
        return this.streamingBuffer;
    }
    enableStreamingMode() {
        this.streamingMode = true;
        if (!this.streamingBuffer) {
            this.streamingBuffer = new StreamSimulatorImpl().createStreamingBuffer();
        }
    }
    disableStreamingMode() {
        this.streamingMode = false;
        this.streamingBuffer = undefined;
    }
    reset() {
        this.capturedMessages = [];
        this.registeredHooks = {};
        this.progressNotifications = [];
        this.streamingBuffer = undefined;
        this.streamingMode = false;
    }
};
LRHMockMCPMonImpl = __decorate([
    injectable()
], LRHMockMCPMonImpl);
/**
 * Container module for LRH test dependencies
 */
export const LRHTestModule = new ContainerModule((bind) => {
    // Bind LRH-specific utilities
    bind('LRHTestUtilities').to(LRHTestUtilitiesImpl).inSingletonScope();
    // Bind DuckDB mock
    bind('DuckDBMock').to(DuckDBMockImpl).inSingletonScope();
    // Bind stream simulator
    bind('StreamSimulator').to(StreamSimulatorImpl).inSingletonScope();
    // Bind LRH-specific MockMCPMon
    bind('LRHMockMCPMon').to(LRHMockMCPMonImpl).inSingletonScope();
    // Also bind as regular MockMCPMon for compatibility
    bind('MockMCPMon').toService('LRHMockMCPMon');
});
// Types and interfaces are already exported inline
