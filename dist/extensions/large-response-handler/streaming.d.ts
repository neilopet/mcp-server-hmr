/**
 * Streaming response buffer management for Large Response Handler
 *
 * Handles accumulation of streaming MCP responses while sending progress
 * notifications to keep clients informed during long operations.
 */
import type { ExtensionLogger } from '../interfaces.js';
/**
 * Represents a single chunk of a streaming response
 */
export interface StreamingChunk {
    data: any;
    timestamp: number;
    byteSize: number;
}
/**
 * Manages streaming response accumulation and lifecycle
 */
export interface StreamingResponseBuffer {
    id: string | number;
    method?: string;
    progressToken?: string;
    chunks: StreamingChunk[];
    totalBytes: number;
    startTime: number;
    lastUpdateTime: number;
    diskFallback?: {
        enabled: boolean;
        filePath?: string;
        chunksOnDisk: number;
    };
}
/**
 * Configuration for streaming buffer behavior
 */
export interface StreamingConfig {
    maxBufferSize: number;
    progressUpdateInterval: number;
    requestTimeout: number;
    enableDiskFallback: boolean;
}
/**
 * Progress notification callback
 */
export type ProgressNotificationHandler = (notification: {
    progressToken: string;
    progress: number;
    total?: number;
    message?: string;
}) => Promise<void>;
/**
 * Manages buffering of streaming responses with progress tracking
 */
export declare class StreamingBuffer {
    private buffers;
    private lastProgressUpdate;
    private config;
    private logger?;
    private progressHandler?;
    private tempDir;
    private bufferLimitWarned;
    constructor(config?: Partial<StreamingConfig>, logger?: ExtensionLogger);
    /**
     * Set the progress notification handler
     */
    setProgressHandler(handler: ProgressNotificationHandler): void;
    /**
     * Start buffering a new streaming response
     */
    startBuffering(requestId: string | number, method?: string, progressToken?: string): void;
    /**
     * Add a chunk to an existing buffer
     */
    addChunk(requestId: string | number, chunk: any): Promise<void>;
    /**
     * Get the complete buffered response
     */
    getCompleteResponse(requestId: string | number): any[];
    /**
     * Clear a buffer and return its contents
     */
    completeBuffering(requestId: string | number): any[];
    /**
     * Check if a request is currently being buffered
     */
    isBuffering(requestId: string | number): boolean;
    /**
     * Get buffer statistics
     */
    getBufferStats(requestId: string | number): {
        chunks: number;
        totalBytes: number;
        duration: number;
    } | null;
    /**
     * Clean up abandoned buffers
     */
    cleanupAbandonedBuffers(): number;
    /**
     * Send progress notification if enough time has passed
     */
    private maybeNotifyProgress;
    /**
     * Format bytes for human readability
     */
    private formatBytes;
    /**
     * Ensure temp directory exists
     */
    private ensureTempDir;
    /**
     * Switch buffer to disk-based storage
     */
    private switchToDiskFallback;
    /**
     * Clean up disk files for a buffer
     */
    private cleanupDiskFiles;
}
//# sourceMappingURL=streaming.d.ts.map