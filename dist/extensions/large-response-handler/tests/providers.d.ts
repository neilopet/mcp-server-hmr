/**
 * Large Response Handler Test Providers
 *
 * DI container module providing LRH-specific test utilities, mocks, and helpers.
 * Includes DuckDB mock, stream simulator, and custom test data generators.
 */
import { ContainerModule } from 'inversify';
import type { MockMCPMon, ProgressNotification } from '../../../testing/types.js';
import { StreamingBuffer } from '../streaming.js';
/**
 * LRH-specific test utilities interface
 */
export interface LRHTestUtilities {
    createLargeResponse(sizeKB: number): any;
    createStreamingChunks(totalItems: number, chunkSize: number): any[];
    simulateProgressToken(): string;
    mockDuckDBQuery(result: any[]): void;
    mockDatasetListing(datasets: any[]): void;
    createMockDataset(options?: Partial<MockDatasetOptions>): MockDataset;
    formatBytes(bytes: number): string;
}
/**
 * Mock dataset options
 */
export interface MockDatasetOptions {
    id: string;
    tool: string;
    sizeKB: number;
    itemCount: number;
    timestamp: number;
    sessionId: string;
}
/**
 * Mock dataset structure
 */
export interface MockDataset {
    status: string;
    originalTool: string;
    count: number;
    dataFile: string;
    database?: {
        path: string;
        tables: Array<{
            name: string;
            rowCount: number;
            columns: Array<{
                table_name: string;
                column_name: string;
                data_type: string;
            }>;
        }>;
        sampleQueries: string[];
    };
    schemaResource?: string;
    metadata: {
        sizeKB: number;
        estimatedTokens: number;
        timestamp: number;
        sessionId: string;
    };
}
/**
 * DuckDB mock implementation for testing
 */
export interface DuckDBMock {
    executeDuckDBQuery(database: string, query: string): Promise<any[]>;
    listSavedDatasets(sessionId?: string, tool?: string): Promise<MockDataset[]>;
    mockQueryResult(query: string, result: any[]): void;
    mockDatasets(datasets: MockDataset[]): void;
    reset(): void;
}
/**
 * Stream simulator for testing streaming responses
 */
export interface StreamSimulator {
    createStreamingChunks(totalItems: number, chunkSize: number): any[];
    simulateProgressNotifications(progressToken: string, chunks: any[]): ProgressNotification[];
    createProgressToken(): string;
    createStreamingBuffer(config?: any): StreamingBuffer;
}
/**
 * LRH-specific MockMCPMon that includes streaming simulation
 */
export interface LRHMockMCPMon extends MockMCPMon {
    simulateStreamingResponse(chunks: any[], progressToken?: string): Promise<void>;
    getStreamingBuffer(): StreamingBuffer | undefined;
    enableStreamingMode(): void;
    disableStreamingMode(): void;
}
/**
 * Container module for LRH test dependencies
 */
export declare const LRHTestModule: ContainerModule;
//# sourceMappingURL=providers.d.ts.map