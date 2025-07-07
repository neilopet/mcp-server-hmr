/**
 * Large Response Handler Extension for mcpmon
 *
 * Automatically detects and handles MCP tool responses that exceed configurable
 * thresholds by persisting data to disk and providing streaming support.
 */
import type { Extension, ExtensionContext } from '../interfaces.js';
export interface LargeResponseHandlerConfig {
    threshold: number;
    dataDir: string;
    enableDuckDB: boolean;
    compressionLevel: number;
    maxStoredResponses: number;
    retentionDays: number;
    enableStreaming?: boolean;
    progressUpdateInterval?: number;
    maxBufferSize?: number;
    streamingTimeout?: number;
}
export interface DatabaseInfo {
    path: string;
    tableName: string;
    rowCount: number;
    columns: Array<{
        name: string;
        type: string;
    }>;
    indexes: string[];
    sampleQueries: string[];
}
declare class LargeResponseHandlerExtension implements Extension {
    readonly id = "large-response-handler";
    readonly name = "Large Response Handler";
    readonly version = "1.0.0";
    readonly defaultEnabled = false;
    readonly configSchema: {
        type: string;
        properties: {
            threshold: {
                type: string;
                minimum: number;
                default: number;
                description: string;
            };
            dataDir: {
                type: string;
                default: string;
                description: string;
            };
            enableDuckDB: {
                type: string;
                default: boolean;
                description: string;
            };
            compressionLevel: {
                type: string;
                minimum: number;
                maximum: number;
                default: number;
                description: string;
            };
            maxStoredResponses: {
                type: string;
                minimum: number;
                default: number;
                description: string;
            };
            retentionDays: {
                type: string;
                minimum: number;
                default: number;
                description: string;
            };
            enableStreaming: {
                type: string;
                default: boolean;
                description: string;
            };
            progressUpdateInterval: {
                type: string;
                minimum: number;
                default: number;
                description: string;
            };
            maxBufferSize: {
                type: string;
                minimum: number;
                default: number;
                description: string;
            };
            streamingTimeout: {
                type: string;
                minimum: number;
                default: number;
                description: string;
            };
        };
    };
    /**
     * @internal
     */
    private context?;
    /**
     * @internal
     */
    private config;
    /**
     * @internal
     */
    private streamingBuffer?;
    /**
     * @internal
     */
    private progressTokens;
    initialize(context: ExtensionContext): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Ensure data directory structure exists
     * @internal
     */
    private ensureDataDirectory;
    /**
     * Get the full path to the data directory
     * @internal
     */
    private getDataDirectory;
    /**
     * Generate a unique dataset ID for a response
     * @internal
     */
    private generateDatasetId;
    /**
     * Get the file paths for a dataset
     * @internal
     */
    private getDatasetPaths;
    /**
     * Track progress tokens from incoming requests
     * @internal
     */
    private trackProgressToken;
    /**
     * Send MCP progress notification through the proxy
     * @internal
     */
    private sendProgressNotification;
    /**
     * Handle server responses, detecting and buffering streaming responses
     * @internal
     */
    private handleServerResponse;
    /**
     * Check if a message is a streaming response
     * @internal
     */
    private isStreamingResponse;
    /**
     * Check if streaming is complete
     * @internal
     */
    private isStreamingComplete;
    /**
     * Get progress token for a request
     * @internal
     */
    private getProgressToken;
    /**
     * Assemble chunks into complete response
     * @internal
     */
    private assembleStreamedResponse;
    /**
     * Check if response should be handled as large
     * @internal
     */
    private shouldHandleResponse;
    /**
     * Safely stringify JSON, handling circular references
     * @internal
     */
    private safeJsonStringify;
    /**
     * Generate JSON schema from response data
     * @internal
     */
    private generateSchema;
    /**
     * Infer JSON schema from data structure
     * @internal
     */
    private inferSchema;
    /**
     * Create DuckDB database from JSON file
     * @internal
     */
    private createDuckDBDatabase;
    /**
     * Execute DuckDB query with proper error handling
     * @internal
     */
    private executeDuckDBQuery;
    /**
     * Create indexes on common fields
     * @internal
     */
    private createIndexes;
    /**
     * Generate sample queries for the dataset
     * @internal
     */
    private generateSampleQueries;
    /**
     * Process large response - persist to disk and return metadata
     * @internal
     */
    private processLargeResponse;
    /**
     * Provide additional MCP tools
     * @internal
     */
    private getAdditionalTools;
    /**
     * List saved datasets with optional filtering
     * @internal
     */
    private listSavedDatasets;
    /**
     * Recursively scan data directory for datasets
     * @internal
     */
    private scanDatasets;
    /**
     * Read dataset metadata from metadata.json file
     * @internal
     */
    private readDatasetMetadata;
    /**
     * Analyze dataset using DuckDB SQL queries
     * @internal
     */
    private analyzeWithDuckDB;
    /**
     * Validate SQL query for safety - only allow SELECT statements
     * @internal
     */
    private isValidSQLQuery;
    /**
     * Find dataset by ID
     * @internal
     */
    private findDataset;
    /**
     * Find the latest dataset (most recent timestamp)
     * @internal
     */
    private findLatestDataset;
    /**
     * Get DuckDB database path for a dataset
     * @internal
     */
    private getDuckDBPath;
    /**
     * Handle tool calls for LRH-specific tools
     * @internal
     */
    private handleToolCall;
}
export { LargeResponseHandlerExtension };
export type { LargeResponseHandlerExtension as LargeResponseHandlerExtensionType };
declare const extensionInstance: LargeResponseHandlerExtension;
export default extensionInstance;
//# sourceMappingURL=index.d.ts.map