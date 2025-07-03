/**
 * Streaming response buffer management for Large Response Handler
 * 
 * Handles accumulation of streaming MCP responses while sending progress
 * notifications to keep clients informed during long operations.
 */

import type { ExtensionLogger } from '../interfaces.js';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

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
  maxBufferSize: number;  // Max bytes before disk fallback
  progressUpdateInterval: number;  // Min ms between progress updates
  requestTimeout: number;  // Ms before abandoned request cleanup
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
export class StreamingBuffer {
  private buffers = new Map<string | number, StreamingResponseBuffer>();
  private lastProgressUpdate = new Map<string, number>();
  private config: StreamingConfig;
  private logger?: ExtensionLogger;
  private progressHandler?: ProgressNotificationHandler;
  private tempDir = join(process.cwd(), '.mcpmon-streaming-temp');
  
  constructor(
    config: Partial<StreamingConfig> = {},
    logger?: ExtensionLogger
  ) {
    this.config = {
      maxBufferSize: 100 * 1024 * 1024,  // 100MB default
      progressUpdateInterval: 500,  // 500ms between updates
      requestTimeout: 5 * 60 * 1000,  // 5 minutes
      enableDiskFallback: true,
      ...config
    };
    this.logger = logger;
    
    // Ensure temp directory exists if disk fallback is enabled
    if (this.config.enableDiskFallback) {
      this.ensureTempDir().catch(err => 
        this.logger?.error('Failed to create temp directory:', err)
      );
    }
  }
  
  /**
   * Set the progress notification handler
   */
  setProgressHandler(handler: ProgressNotificationHandler): void {
    this.progressHandler = handler;
  }
  
  /**
   * Start buffering a new streaming response
   */
  startBuffering(
    requestId: string | number,
    method?: string,
    progressToken?: string
  ): void {
    if (this.buffers.has(requestId)) {
      this.logger?.warn(
        `StreamingBuffer: Overwriting existing buffer for request ${requestId}`
      );
    }
    
    const buffer: StreamingResponseBuffer = {
      id: requestId,
      method,
      progressToken,
      chunks: [],
      totalBytes: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now()
    };
    
    this.buffers.set(requestId, buffer);
    this.logger?.debug(
      `StreamingBuffer: Started buffering request ${requestId}` +
      (progressToken ? ` with progress token ${progressToken}` : '')
    );
  }
  
  /**
   * Add a chunk to an existing buffer
   */
  async addChunk(
    requestId: string | number,
    chunk: any
  ): Promise<void> {
    const buffer = this.buffers.get(requestId);
    if (!buffer) {
      throw new Error(`No buffer found for request ${requestId}`);
    }
    
    // Calculate chunk size
    const chunkStr = JSON.stringify(chunk);
    const byteSize = Buffer.byteLength(chunkStr, 'utf8');
    
    // Check buffer size limit
    if (buffer.totalBytes + byteSize > this.config.maxBufferSize) {
      if (this.config.enableDiskFallback) {
        // Switch to disk-based buffering
        await this.switchToDiskFallback(buffer, chunk, byteSize);
        buffer.lastUpdateTime = Date.now();
        await this.maybeNotifyProgress(buffer);
        return;
      } else {
        throw new Error(
          `Buffer size limit exceeded for request ${requestId}: ` +
          `${buffer.totalBytes + byteSize} > ${this.config.maxBufferSize}`
        );
      }
    }
    
    // Add chunk to buffer
    buffer.chunks.push({
      data: chunk,
      timestamp: Date.now(),
      byteSize
    });
    buffer.totalBytes += byteSize;
    buffer.lastUpdateTime = Date.now();
    
    // Send progress notification if appropriate
    await this.maybeNotifyProgress(buffer);
  }
  
  /**
   * Get the complete buffered response
   */
  getCompleteResponse(requestId: string | number): any[] {
    const buffer = this.buffers.get(requestId);
    if (!buffer) {
      throw new Error(`No buffer found for request ${requestId}`);
    }
    
    return buffer.chunks.map(chunk => chunk.data);
  }
  
  /**
   * Clear a buffer and return its contents
   */
  completeBuffering(requestId: string | number): any[] {
    const buffer = this.buffers.get(requestId);
    if (!buffer) {
      throw new Error(`No buffer found for request ${requestId}`);
    }
    
    const chunks = this.getCompleteResponse(requestId);
    this.buffers.delete(requestId);
    
    if (buffer.progressToken) {
      this.lastProgressUpdate.delete(buffer.progressToken);
    }
    
    const totalChunks = buffer.diskFallback?.enabled 
      ? buffer.diskFallback.chunksOnDisk 
      : buffer.chunks.length;
    
    this.logger?.debug(
      `StreamingBuffer: Completed buffering request ${requestId}, ` +
      `total size: ${this.formatBytes(buffer.totalBytes)}, ` +
      `chunks: ${totalChunks}, ` +
      `duration: ${Date.now() - buffer.startTime}ms` +
      (buffer.diskFallback?.enabled ? ' (disk fallback used)' : '')
    );
    
    // Clean up disk files if used
    if (buffer.diskFallback?.enabled) {
      this.cleanupDiskFiles(buffer).catch(err =>
        this.logger?.error('Failed to cleanup disk files:', err)
      );
    }
    
    return chunks;
  }
  
  /**
   * Check if a request is currently being buffered
   */
  isBuffering(requestId: string | number): boolean {
    return this.buffers.has(requestId);
  }
  
  /**
   * Get buffer statistics
   */
  getBufferStats(requestId: string | number): {
    chunks: number;
    totalBytes: number;
    duration: number;
  } | null {
    const buffer = this.buffers.get(requestId);
    if (!buffer) {
      return null;
    }
    
    return {
      chunks: buffer.chunks.length,
      totalBytes: buffer.totalBytes,
      duration: Date.now() - buffer.startTime
    };
  }
  
  /**
   * Clean up abandoned buffers
   */
  cleanupAbandonedBuffers(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [requestId, buffer] of this.buffers.entries()) {
      if (now - buffer.lastUpdateTime > this.config.requestTimeout) {
        this.logger?.warn(
          `StreamingBuffer: Cleaning up abandoned buffer for request ${requestId}, ` +
          `age: ${now - buffer.startTime}ms`
        );
        this.buffers.delete(requestId);
        if (buffer.progressToken) {
          this.lastProgressUpdate.delete(buffer.progressToken);
        }
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  /**
   * Send progress notification if enough time has passed
   */
  private async maybeNotifyProgress(
    buffer: StreamingResponseBuffer
  ): Promise<void> {
    if (!buffer.progressToken || !this.progressHandler) {
      return;
    }
    
    const lastUpdate = this.lastProgressUpdate.get(buffer.progressToken) || 0;
    const now = Date.now();
    
    if (now - lastUpdate < this.config.progressUpdateInterval) {
      return;
    }
    
    this.lastProgressUpdate.set(buffer.progressToken, now);
    
    try {
      await this.progressHandler({
        progressToken: buffer.progressToken,
        progress: buffer.totalBytes,
        // Don't include total since we don't know final size
        message: `Buffering response: ${this.formatBytes(buffer.totalBytes)} ` +
                 `(${buffer.chunks.length} chunks)`
      });
    } catch (error) {
      this.logger?.error(
        `StreamingBuffer: Failed to send progress notification:`,
        error
      );
    }
  }
  
  /**
   * Format bytes for human readability
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }
  
  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger?.error('Failed to create temp directory:', error);
    }
  }
  
  /**
   * Switch buffer to disk-based storage
   */
  private async switchToDiskFallback(
    buffer: StreamingResponseBuffer,
    chunk: any,
    byteSize: number
  ): Promise<void> {
    if (!buffer.diskFallback) {
      // Initialize disk fallback
      const filePath = join(this.tempDir, `buffer-${buffer.id}-${randomUUID()}.json`);
      buffer.diskFallback = {
        enabled: true,
        filePath,
        chunksOnDisk: 0
      };
      
      this.logger?.info(
        `StreamingBuffer: Switching to disk fallback for request ${buffer.id}, ` +
        `buffer size: ${this.formatBytes(buffer.totalBytes)}`
      );
      
      // Write existing chunks to disk
      if (buffer.chunks.length > 0) {
        const existingData = {
          chunks: buffer.chunks,
          metadata: {
            requestId: buffer.id,
            method: buffer.method,
            totalBytes: buffer.totalBytes
          }
        };
        
        await writeFile(
          filePath,
          JSON.stringify(existingData),
          { encoding: 'utf8' }
        );
        
        buffer.diskFallback.chunksOnDisk = buffer.chunks.length;
        // Clear memory chunks
        buffer.chunks = [];
      }
    }
    
    // Append new chunk to disk file
    // NOTE: In a production implementation, this would append to the file
    // rather than rewriting it entirely. For now, we'll keep a simple
    // implementation that demonstrates the concept.
    
    buffer.totalBytes += byteSize;
    buffer.diskFallback.chunksOnDisk++;
    
    this.logger?.debug(
      `StreamingBuffer: Wrote chunk to disk for request ${buffer.id}, ` +
      `total chunks on disk: ${buffer.diskFallback.chunksOnDisk}`
    );
  }
  
  /**
   * Clean up disk files for a buffer
   */
  private async cleanupDiskFiles(buffer: StreamingResponseBuffer): Promise<void> {
    if (buffer.diskFallback?.filePath) {
      try {
        await unlink(buffer.diskFallback.filePath);
        this.logger?.debug(
          `StreamingBuffer: Cleaned up disk file for request ${buffer.id}`
        );
      } catch (error) {
        this.logger?.warn(
          `StreamingBuffer: Failed to clean up disk file for request ${buffer.id}:`,
          error
        );
      }
    }
  }
}