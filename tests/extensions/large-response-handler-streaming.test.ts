/**
 * Tests for Large Response Handler streaming functionality
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StreamingBuffer } from '../../src/extensions/large-response-handler/streaming.js';
import type { StreamingConfig } from '../../src/extensions/large-response-handler/streaming.js';
import type { ExtensionLogger } from '../../src/extensions/interfaces.js';

// Mock logger
const mockLogger: ExtensionLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('StreamingBuffer', () => {
  let buffer: StreamingBuffer;
  let progressNotifications: any[] = [];
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    progressNotifications = [];
    
    // Create buffer with default config
    buffer = new StreamingBuffer({}, mockLogger);
    
    // Set up progress handler to capture notifications
    buffer.setProgressHandler(async (notification) => {
      progressNotifications.push(notification);
    });
  });
  
  describe('Basic buffering', () => {
    it('should start and complete buffering', () => {
      const requestId = 'test-123';
      
      // Start buffering
      buffer.startBuffering(requestId, 'testMethod', 'progress-token-1');
      expect(buffer.isBuffering(requestId)).toBe(true);
      
      // Complete buffering
      const chunks = buffer.completeBuffering(requestId);
      expect(chunks).toEqual([]);
      expect(buffer.isBuffering(requestId)).toBe(false);
    });
    
    it('should accumulate chunks and track byte size', async () => {
      const requestId = 'test-456';
      buffer.startBuffering(requestId);
      
      // Add chunks
      const chunk1 = { data: [1, 2, 3] };
      const chunk2 = { data: [4, 5, 6] };
      
      await buffer.addChunk(requestId, chunk1);
      await buffer.addChunk(requestId, chunk2);
      
      // Check stats
      const stats = buffer.getBufferStats(requestId);
      expect(stats).toBeDefined();
      expect(stats!.chunks).toBe(2);
      expect(stats!.totalBytes).toBeGreaterThan(0);
      
      // Complete and verify chunks
      const chunks = buffer.completeBuffering(requestId);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual(chunk1);
      expect(chunks[1]).toEqual(chunk2);
    });
    
    it('should throw error when adding chunk to non-existent buffer', async () => {
      await expect(
        buffer.addChunk('non-existent', { data: 'test' })
      ).rejects.toThrow('No buffer found for request non-existent');
    });
  });
  
  describe('Progress notifications', () => {
    it('should send progress notifications when configured', async () => {
      const requestId = 'test-789';
      const progressToken = 'progress-123';
      
      // Create buffer with fast update interval
      buffer = new StreamingBuffer(
        { progressUpdateInterval: 10 },
        mockLogger
      );
      buffer.setProgressHandler(async (notification) => {
        progressNotifications.push(notification);
      });
      
      buffer.startBuffering(requestId, 'testMethod', progressToken);
      
      // Add multiple chunks
      await buffer.addChunk(requestId, { data: 'chunk1' });
      await new Promise(resolve => setTimeout(resolve, 20)); // Wait for interval
      await buffer.addChunk(requestId, { data: 'chunk2' });
      
      // Should have received at least one progress notification
      expect(progressNotifications.length).toBeGreaterThan(0);
      expect(progressNotifications[0]).toMatchObject({
        progressToken,
        progress: expect.any(Number),
        message: expect.stringContaining('Buffering response:')
      });
    });
    
    it('should respect progress update interval', async () => {
      const requestId = 'test-interval';
      const progressToken = 'progress-456';
      
      // Create buffer with longer interval
      buffer = new StreamingBuffer(
        { progressUpdateInterval: 100 },
        mockLogger
      );
      buffer.setProgressHandler(async (notification) => {
        progressNotifications.push(notification);
      });
      
      buffer.startBuffering(requestId, 'testMethod', progressToken);
      
      // Add chunks rapidly
      await buffer.addChunk(requestId, { data: 'chunk1' });
      await buffer.addChunk(requestId, { data: 'chunk2' });
      await buffer.addChunk(requestId, { data: 'chunk3' });
      
      // Should only have one notification due to interval
      expect(progressNotifications.length).toBe(1);
    });
    
    it('should not send notifications without progress token', async () => {
      const requestId = 'test-no-token';
      
      buffer.startBuffering(requestId, 'testMethod'); // No progress token
      
      await buffer.addChunk(requestId, { data: 'chunk1' });
      
      expect(progressNotifications.length).toBe(0);
    });
  });
  
  describe('Buffer size limits', () => {
    it('should warn when buffer size limit exceeded', async () => {
      const requestId = 'test-overflow';
      
      // Create buffer with small limit
      buffer = new StreamingBuffer(
        { maxBufferSize: 100, enableDiskFallback: true },
        mockLogger
      );
      
      buffer.startBuffering(requestId);
      
      // Add large chunk
      const largeData = 'x'.repeat(200);
      await buffer.addChunk(requestId, { data: largeData });
      
      // Should log info about switching to disk fallback
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Switching to disk fallback')
      );
    });
    
    it('should throw error when buffer limit exceeded without fallback', async () => {
      const requestId = 'test-no-fallback';
      
      // Create buffer with small limit and no fallback
      buffer = new StreamingBuffer(
        { maxBufferSize: 100, enableDiskFallback: false },
        mockLogger
      );
      
      buffer.startBuffering(requestId);
      
      // Add large chunk should throw
      const largeData = 'x'.repeat(200);
      await expect(
        buffer.addChunk(requestId, { data: largeData })
      ).rejects.toThrow('Buffer size limit exceeded');
    });
  });
  
  describe('Abandoned buffer cleanup', () => {
    it('should clean up abandoned buffers', async () => {
      // Create buffer with short timeout
      buffer = new StreamingBuffer(
        { requestTimeout: 50 },
        mockLogger
      );
      
      // Start multiple buffers
      buffer.startBuffering('req1', 'method1', 'token1');
      buffer.startBuffering('req2', 'method2', 'token2');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up abandoned buffers
      const cleaned = buffer.cleanupAbandonedBuffers();
      expect(cleaned).toBe(2);
      
      // Buffers should be gone
      expect(buffer.isBuffering('req1')).toBe(false);
      expect(buffer.isBuffering('req2')).toBe(false);
    });
    
    it('should not clean up active buffers', async () => {
      // Create buffer with reasonable timeout
      buffer = new StreamingBuffer(
        { requestTimeout: 1000 },
        mockLogger
      );
      
      buffer.startBuffering('active-req');
      
      // Add chunk to keep it active
      await buffer.addChunk('active-req', { data: 'active' });
      
      // Immediate cleanup should not remove active buffer
      const cleaned = buffer.cleanupAbandonedBuffers();
      expect(cleaned).toBe(0);
      expect(buffer.isBuffering('active-req')).toBe(true);
    });
  });
  
  describe('Format bytes helper', () => {
    it('should format bytes correctly', async () => {
      const requestId = 'test-format';
      buffer.startBuffering(requestId, 'method', 'token');
      
      // Add chunks of different sizes
      await buffer.addChunk(requestId, { data: 'small' }); // < 1KB
      
      const stats = buffer.getBufferStats(requestId);
      expect(stats).toBeDefined();
      
      // The formatted message in progress notifications should use proper units
      buffer.completeBuffering(requestId);
      
      // Test different sizes by creating new buffers
      const testSizes = [
        { size: 500, unit: 'B' },
        { size: 2048, unit: 'KB' },
        { size: 2 * 1024 * 1024, unit: 'MB' }
      ];
      
      for (const test of testSizes) {
        const id = `size-${test.size}`;
        buffer.startBuffering(id, 'method', `token-${id}`);
        
        // Create data of specific size
        const data = 'x'.repeat(test.size);
        await buffer.addChunk(id, { data });
        
        // Wait for progress notification
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Check that progress message contains the right unit
        const notification = progressNotifications.find(n => 
          n.progressToken === `token-${id}`
        );
        
        if (notification) {
          expect(notification.message).toContain(test.unit);
        }
      }
    });
  });
});

describe('StreamingBuffer Integration', () => {
  it('should handle complete streaming scenario', async () => {
    const buffer = new StreamingBuffer({
      progressUpdateInterval: 10,
      maxBufferSize: 10 * 1024 * 1024
    }, mockLogger);
    
    const progressUpdates: any[] = [];
    buffer.setProgressHandler(async (notification) => {
      progressUpdates.push(notification);
    });
    
    const requestId = 'integration-test';
    const progressToken = 'progress-integration';
    
    // Start streaming
    buffer.startBuffering(requestId, 'stream_large_data', progressToken);
    
    // Simulate streaming chunks
    const chunks = [];
    for (let i = 0; i < 5; i++) {
      const chunk = {
        data: Array(100).fill(null).map((_, j) => ({
          id: i * 100 + j,
          value: Math.random()
        })),
        isPartial: i < 4
      };
      chunks.push(chunk);
      await buffer.addChunk(requestId, chunk);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    
    // Complete buffering
    const result = buffer.completeBuffering(requestId);
    
    // Verify results
    expect(result).toHaveLength(5);
    expect(result[0].data).toHaveLength(100);
    expect(result[4].isPartial).toBe(false);
    
    // Verify progress notifications were sent
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0].progressToken).toBe(progressToken);
    expect(progressUpdates[0].progress).toBeGreaterThan(0);
    
    // Verify logging
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Completed buffering request')
    );
  });
});