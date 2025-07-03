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
export default class LargeResponseHandlerExtension implements Extension {
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
    private context?;
    private config;
    private streamingBuffer?;
    private progressTokens;
    initialize(context: ExtensionContext): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Track progress tokens from incoming requests
     */
    private trackProgressToken;
    /**
     * Send MCP progress notification through the proxy
     */
    private sendProgressNotification;
    /**
     * Handle server responses, detecting and buffering streaming responses
     */
    private handleServerResponse;
    /**
     * Check if a message is a streaming response
     */
    private isStreamingResponse;
    /**
     * Check if streaming is complete
     */
    private isStreamingComplete;
    /**
     * Get progress token for a request
     */
    private getProgressToken;
    /**
     * Assemble chunks into complete response
     */
    private assembleStreamedResponse;
    /**
     * Check if response should be handled as large
     */
    private shouldHandleResponse;
    /**
     * Process large response (placeholder for actual implementation)
     */
    private processLargeResponse;
    /**
     * Provide additional MCP tools
     */
    private getAdditionalTools;
    /**
     * Handle tool calls for LRH-specific tools
     */
    private handleToolCall;
}
//# sourceMappingURL=index.d.ts.map