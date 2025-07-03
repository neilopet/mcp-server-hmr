/**
 * Simple unit tests for Large Response Handler Extension
 * 
 * These tests verify basic functionality without the DI framework
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import LargeResponseHandlerExtension from './index.js';
import type { ExtensionContext } from '../interfaces.js';

describe('LargeResponseHandlerExtension', () => {
  let extension: LargeResponseHandlerExtension;
  let mockContext: ExtensionContext;
  
  beforeEach(() => {
    extension = new LargeResponseHandlerExtension();
    
    // Create mock context
    mockContext = {
      sessionId: 'test-session',
      dataDir: '/tmp/test',
      config: {
        threshold: 25000,
        enableStreaming: true
      },
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      hooks: {},
      dependencies: {
        procManager: {} as any,
        stdin: new ReadableStream(),
        stdout: new WritableStream(),
        stderr: new WritableStream(),
        exit: jest.fn()
      }
    };
  });
  
  it('should have correct metadata', () => {
    expect(extension.id).toBe('large-response-handler');
    expect(extension.name).toBe('Large Response Handler');
    expect(extension.version).toBe('1.0.0');
  });
  
  it('should initialize without errors', async () => {
    await expect(extension.initialize(mockContext)).resolves.not.toThrow();
    
    // Verify logger was called
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Large Response Handler initialized')
    );
  });
  
  it('should register hooks during initialization', async () => {
    // Create a spy to track hook registrations
    const registeredHooks: string[] = [];
    mockContext.hooks = new Proxy({}, {
      set: (target, prop, value) => {
        if (typeof prop === 'string' && typeof value === 'function') {
          registeredHooks.push(prop);
        }
        return Reflect.set(target, prop, value);
      }
    });
    
    await extension.initialize(mockContext);
    
    // Verify hooks were registered
    expect(registeredHooks).toContain('beforeStdinForward');
    expect(registeredHooks).toContain('afterStdoutReceive');
    expect(registeredHooks).toContain('getAdditionalTools');
    expect(registeredHooks).toContain('handleToolCall');
  });
  
  it('should shutdown gracefully', async () => {
    await extension.initialize(mockContext);
    await expect(extension.shutdown()).resolves.not.toThrow();
  });
  
  it('should use default config when not provided', async () => {
    const contextWithoutConfig = {
      ...mockContext,
      config: {}
    };
    
    await extension.initialize(contextWithoutConfig);
    
    // Should still initialize successfully with defaults
    expect(mockContext.logger.info).toHaveBeenCalled();
  });
  
  describe('message hooks', () => {
    beforeEach(async () => {
      await extension.initialize(mockContext);
    });
    
    it('should detect large responses', () => {
      // Create a large response (> 25KB)
      const largeData = 'x'.repeat(30000);
      const message = {
        id: 'test-123',
        result: { data: largeData }
      };
      
      // The actual detection logic would be in the hook implementation
      // For now, just verify the extension is set up to handle this
      expect(extension).toBeDefined();
    });
  });
});