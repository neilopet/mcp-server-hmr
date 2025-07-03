/**
 * Streaming functionality tests for Large Response Handler
 * 
 * Focused tests for StreamingBuffer class and streaming response handling.
 * This file can be run independently for streaming-specific testing.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StreamingBuffer, type StreamingConfig } from '../streaming.js';
import type { ExtensionLogger } from '../../interfaces.js';

// Mock logger for testing
const createMockLogger = (): ExtensionLogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('StreamingBuffer - Unit Tests', () => {
  let buffer: StreamingBuffer;
  let mockLogger: ExtensionLogger;
  let progressNotifications: any[] = [];
  
  beforeEach(() => {
    // Reset mocks and state
    jest.clearAllMocks();
    progressNotifications = [];
    mockLogger = createMockLogger();
    
    // Create buffer with test-friendly configuration
    buffer = new StreamingBuffer({
      maxBufferSize: 1024 * 1024, // 1MB for tests
      progressUpdateInterval: 100, // Fast updates for testing
      requestTimeout: 5000, // 5 seconds for tests
      enableDiskFallback: true
    }, mockLogger);
    
    // Set up progress notification capture
    buffer.setProgressHandler(async (notification) => {
      progressNotifications.push(notification);
    });
  });
  
  describe('Basic buffering operations', () => {
    it('should start and complete buffering successfully', () => {
      const requestId = 'test-basic-001';
      
      // Start buffering
      buffer.startBuffering(requestId, 'test-method', 'progress-token-1');
      expect(buffer.isBuffering(requestId)).toBe(true);
      
      // Complete buffering
      const chunks = buffer.completeBuffering(requestId);
      expect(chunks).toEqual([]);
      expect(buffer.isBuffering(requestId)).toBe(false);
      
      // Verify logging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Started buffering request ${requestId}`)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Completed buffering request ${requestId}`)
      );
    });
    
    it('should accumulate chunks and track statistics', async () => {
      const requestId = 'test-accumulate-002';
      buffer.startBuffering(requestId);
      
      // Add test chunks
      const chunk1 = { data: Array(10).fill({ id: 1, value: 'test' }) };
      const chunk2 = { data: Array(15).fill({ id: 2, value: 'more data' }) };
      
      await buffer.addChunk(requestId, chunk1);
      await buffer.addChunk(requestId, chunk2);
      
      // Check statistics
      const stats = buffer.getBufferStats(requestId);
      expect(stats).toBeDefined();
      expect(stats!.chunks).toBe(2);
      expect(stats!.totalBytes).toBeGreaterThan(0);
      expect(stats!.duration).toBeGreaterThan(0);
      
      // Complete and verify accumulated chunks
      const result = buffer.completeBuffering(requestId);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(chunk1);
      expect(result[1]).toEqual(chunk2);
    });
    
    it('should handle progress tokens correctly', async () => {
      const requestId = 'test-progress-003';
      const progressToken = 'progress-abc-123';
      
      buffer.startBuffering(requestId, 'test-method', progressToken);
      
      // Add chunk to trigger progress notification
      await buffer.addChunk(requestId, { data: 'test chunk' });
      
      // Wait for progress notification
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(progressNotifications.length).toBeGreaterThan(0);
      expect(progressNotifications[0]).toMatchObject({
        progressToken,
        progress: expect.any(Number),
        message: expect.stringContaining('Buffering response')
      });
    });
    
    it('should handle missing buffers gracefully', async () => {
      await expect(
        buffer.addChunk('non-existent', { data: 'test' })
      ).rejects.toThrow('No buffer found for request non-existent');
      
      expect(buffer.getBufferStats('non-existent')).toBeNull();
    });
  });
  
  describe('Progress notifications', () => {
    it('should respect progress update intervals', async () => {
      const requestId = 'test-interval-004';
      const progressToken = 'progress-interval-test';
      
      // Create buffer with longer interval
      buffer = new StreamingBuffer(
        { progressUpdateInterval: 200 },
        mockLogger
      );
      buffer.setProgressHandler(async (notification) => {
        progressNotifications.push(notification);
      });
      
      buffer.startBuffering(requestId, 'test-method', progressToken);
      
      // Add chunks rapidly
      await buffer.addChunk(requestId, { data: 'chunk1' });
      await buffer.addChunk(requestId, { data: 'chunk2' });
      await buffer.addChunk(requestId, { data: 'chunk3' });
      
      // Should have limited notifications due to interval
      expect(progressNotifications.length).toBeLessThanOrEqual(2);
    });
    
    it('should not send notifications without progress token', async () => {
      const requestId = 'test-no-token-005';
      
      buffer.startBuffering(requestId, 'test-method'); // No progress token
      await buffer.addChunk(requestId, { data: 'chunk without token' });
      
      // Wait to ensure no delayed notifications
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(progressNotifications.length).toBe(0);
    });
    
    it('should format byte sizes correctly in progress messages', async () => {
      const requestId = 'test-format-006';
      const progressToken = 'progress-format-test';
      
      buffer.startBuffering(requestId, 'test-method', progressToken);
      
      // Add chunk with known size
      const data = 'x'.repeat(2048); // 2KB
      await buffer.addChunk(requestId, { data });
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(progressNotifications.length).toBeGreaterThan(0);
      const message = progressNotifications[0].message;
      expect(message).toMatch(/\d+(\.\d+)?KB/); // Should contain KB unit
    });
  });
  
  describe('Buffer size limits and disk fallback', () => {
    it('should warn when buffer size limit is exceeded', async () => {
      const requestId = 'test-overflow-007';
      
      // Create buffer with very small limit
      buffer = new StreamingBuffer(
        { 
          maxBufferSize: 100, // 100 bytes
          enableDiskFallback: true 
        },
        mockLogger
      );
      
      buffer.startBuffering(requestId);
      
      // Add chunk that exceeds limit
      const largeData = 'x'.repeat(200); // 200 bytes
      await buffer.addChunk(requestId, { data: largeData });
      
      // Should log about disk fallback
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Switching to disk fallback')
      );
    });
    
    it('should throw error when limit exceeded without fallback', async () => {
      const requestId = 'test-no-fallback-008';
      
      // Create buffer with no fallback
      buffer = new StreamingBuffer(
        { 
          maxBufferSize: 100,
          enableDiskFallback: false 
        },
        mockLogger
      );
      
      buffer.startBuffering(requestId);
      
      // Should throw when limit exceeded
      const largeData = 'x'.repeat(200);
      await expect(
        buffer.addChunk(requestId, { data: largeData })
      ).rejects.toThrow('Buffer size limit exceeded');
    });
  });
  
  describe('Abandoned buffer cleanup', () => {
    it('should clean up abandoned buffers after timeout', async () => {
      // Create buffer with short timeout
      buffer = new StreamingBuffer(
        { requestTimeout: 100 }, // 100ms timeout
        mockLogger
      );
      
      // Start multiple buffers
      buffer.startBuffering('req1', 'method1', 'token1');
      buffer.startBuffering('req2', 'method2', 'token2');
      
      expect(buffer.isBuffering('req1')).toBe(true);
      expect(buffer.isBuffering('req2')).toBe(true);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Clean up abandoned buffers
      const cleaned = buffer.cleanupAbandonedBuffers();
      expect(cleaned).toBe(2);
      
      expect(buffer.isBuffering('req1')).toBe(false);
      expect(buffer.isBuffering('req2')).toBe(false);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cleaning up abandoned buffer')
      );
    });
    
    it('should not clean up active buffers', async () => {
      buffer = new StreamingBuffer(
        { requestTimeout: 1000 }, // 1 second timeout
        mockLogger
      );
      
      buffer.startBuffering('active-req');
      
      // Keep buffer active by adding chunk
      await buffer.addChunk('active-req', { data: 'keeping active' });
      
      // Immediate cleanup should not remove active buffer
      const cleaned = buffer.cleanupAbandonedBuffers();
      expect(cleaned).toBe(0);
      expect(buffer.isBuffering('active-req')).toBe(true);
    });
  });
  
  describe('Integration scenario simulation', () => {
    it('should handle complete streaming workflow', async () => {
      const requestId = 'integration-009';
      const progressToken = 'progress-integration-test';
      const method = 'stream_large_data';
      
      // Start streaming simulation
      buffer.startBuffering(requestId, method, progressToken);
      
      // Simulate streaming chunks over time
      const totalChunks = 5;
      const chunks = [];
      
      for (let i = 0; i < totalChunks; i++) {
        const chunk = {
          data: Array(20).fill(null).map((_, j) => ({
            id: i * 20 + j,
            value: Math.random(),
            chunkIndex: i
          })),
          isPartial: i < totalChunks - 1,
          chunkIndex: i,
          totalChunks
        };
        
        chunks.push(chunk);
        await buffer.addChunk(requestId, chunk);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Complete streaming
      const result = buffer.completeBuffering(requestId);
      
      // Verify results
      expect(result).toHaveLength(totalChunks);
      expect(result[0].data).toHaveLength(20);
      expect(result[totalChunks - 1].isPartial).toBe(false);
      
      // Verify progress notifications were sent
      expect(progressNotifications.length).toBeGreaterThan(0);
      expect(progressNotifications[0].progressToken).toBe(progressToken);
      
      // Verify logging occurred
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Completed buffering request ${requestId}`)
      );
    });
    
    it('should handle concurrent streaming requests', async () => {
      const requests = [
        { id: 'concurrent-1', token: 'token-1' },
        { id: 'concurrent-2', token: 'token-2' },
        { id: 'concurrent-3', token: 'token-3' }
      ];
      
      // Start all requests
      requests.forEach(req => {
        buffer.startBuffering(req.id, 'concurrent-method', req.token);
      });
      
      // Add chunks to all requests concurrently
      const promises = requests.map(async (req, index) => {
        for (let i = 0; i < 3; i++) {
          await buffer.addChunk(req.id, {
            data: `chunk-${i}-for-${req.id}`,
            requestIndex: index,
            chunkIndex: i
          });
          
          // Stagger timing slightly
          await new Promise(resolve => setTimeout(resolve, 10 + index * 5));
        }
        
        return buffer.completeBuffering(req.id);
      });
      
      const results = await Promise.all(promises);
      
      // Verify all requests completed successfully
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toHaveLength(3);
        expect(result[0].requestIndex).toBe(index);
      });
      
      // Verify no requests are still buffering
      requests.forEach(req => {
        expect(buffer.isBuffering(req.id)).toBe(false);
      });
    });
  });
});

// Export for potential use in other test files
export { createMockLogger };