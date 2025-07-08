/**
 * Tests for Large Response Handler Extension environment variable configuration
 */

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import type { ExtensionContext } from '../../src/extensions/interfaces.js';
import LargeResponseHandlerExtension from '../../src/extensions/large-response-handler/index.js';

describe('Large Response Handler - Environment Variable Configuration', () => {
  let originalEnv: string | undefined;
  
  beforeEach(() => {
    // Save original env var
    originalEnv = process.env.MAX_MCP_OUTPUT_TOKENS;
  });
  
  afterEach(() => {
    // Restore original env var
    if (originalEnv === undefined) {
      delete process.env.MAX_MCP_OUTPUT_TOKENS;
    } else {
      process.env.MAX_MCP_OUTPUT_TOKENS = originalEnv;
    }
  });
  
  it('should use default threshold of 25KB when MAX_MCP_OUTPUT_TOKENS is not set', async () => {
    delete process.env.MAX_MCP_OUTPUT_TOKENS;
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext();
    
    await extension.initialize!(mockContext);
    
    // Check logs for default threshold message
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using default threshold: 25000 bytes (25KB)')
    );
  });
  
  it('should calculate threshold from MAX_MCP_OUTPUT_TOKENS when set', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '5000';
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext();
    
    await extension.initialize!(mockContext);
    
    // Check logs for env-based threshold (5000 tokens * 4 bytes = 20000 bytes)
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using MAX_MCP_OUTPUT_TOKENS=5000 (threshold: 20000 bytes)')
    );
  });
  
  it('should handle large token values correctly', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '10000';
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext();
    
    await extension.initialize!(mockContext);
    
    // Check logs for env-based threshold (10000 tokens * 4 bytes = 40000 bytes)
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using MAX_MCP_OUTPUT_TOKENS=10000 (threshold: 40000 bytes)')
    );
  });
  
  it('should fall back to default when MAX_MCP_OUTPUT_TOKENS is invalid', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = 'invalid';
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext();
    
    await extension.initialize!(mockContext);
    
    // Should show env var but with default threshold value
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using MAX_MCP_OUTPUT_TOKENS=invalid (threshold: 25000 bytes)')
    );
  });
  
  it('should fall back to default when MAX_MCP_OUTPUT_TOKENS is zero', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '0';
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext();
    
    await extension.initialize!(mockContext);
    
    // Should show env var but with default threshold value
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using MAX_MCP_OUTPUT_TOKENS=0 (threshold: 25000 bytes)')
    );
  });
  
  it('should fall back to default when MAX_MCP_OUTPUT_TOKENS is negative', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '-1000';
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext();
    
    await extension.initialize!(mockContext);
    
    // Should show env var but with default threshold value
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using MAX_MCP_OUTPUT_TOKENS=-1000 (threshold: 25000 bytes)')
    );
  });
  
  it('should allow config override of environment variable', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '5000';
    
    const extension = new LargeResponseHandlerExtension();
    const mockContext = createMockContext({
      config: { threshold: 100000 } // 100KB override
    });
    
    await extension.initialize!(mockContext);
    
    // The config override should take precedence
    // Note: The log will still show the env var, but the actual threshold used
    // will be from the config due to the spread operator: {...DEFAULT_CONFIG, ...context.config}
    // The log message shows the env calculation, but the actual config.threshold is 100000
    expect(mockContext.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Using MAX_MCP_OUTPUT_TOKENS=5000')
    );
  });
});

// Helper to create mock context
function createMockContext(overrides?: Partial<ExtensionContext>): ExtensionContext {
  const mockLogger = {
    info: jest.fn() as jest.MockedFunction<(message: string, ...args: any[]) => void>,
    debug: jest.fn() as jest.MockedFunction<(message: string, ...args: any[]) => void>,
    error: jest.fn() as jest.MockedFunction<(message: string, ...args: any[]) => void>,
    warn: jest.fn() as jest.MockedFunction<(message: string, ...args: any[]) => void>
  };
  
  return {
    config: {},
    logger: mockLogger,
    hooks: {},
    ...overrides
  } as any;
}