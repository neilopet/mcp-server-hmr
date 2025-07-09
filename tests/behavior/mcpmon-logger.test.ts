/// <reference path="./global.d.ts" />
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMCPMonLogger, MCPMonLogger } from '../../src/mcpmon-logger';

describe('MCPMonLogger', () => {
  let stdout: WritableStream<Uint8Array>;
  let writtenChunks: Uint8Array[];
  let logger: MCPMonLogger;
  let currentLevel: string;

  beforeEach(() => {
    writtenChunks = [];
    currentLevel = 'info';
    
    stdout = new WritableStream<Uint8Array>({
      write(chunk) {
        writtenChunks.push(chunk);
        return Promise.resolve();
      }
    });

    logger = createMCPMonLogger(stdout, () => currentLevel);
  });

  const getWrittenMessages = () => {
    const decoder = new TextDecoder();
    return writtenChunks.map(chunk => {
      const text = decoder.decode(chunk).trim();
      return text ? JSON.parse(text) : null;
    }).filter(Boolean);
  };

  it('should create logger using factory function', () => {
    expect(logger).toBeInstanceOf(MCPMonLogger);
  });

  it('should send info message when level is info', async () => {
    await logger.info('Test message', { foo: 'bar' });
    
    const messages = getWrittenMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'info',
        logger: 'mcpmon',
        data: {
          message: 'Test message',
          foo: 'bar'
        }
      }
    });
  });

  it('should not send debug message when level is info', async () => {
    await logger.debug('Debug message');
    
    const messages = getWrittenMessages();
    expect(messages).toHaveLength(0);
  });

  it('should send error message when level is info', async () => {
    await logger.error('Error occurred', { code: 'ERR_001' });
    
    const messages = getWrittenMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].params.level).toBe('error');
    expect(messages[0].params.data.message).toBe('Error occurred');
    expect(messages[0].params.data.code).toBe('ERR_001');
  });

  it('should respect dynamic level changes', async () => {
    // Initially info level
    await logger.debug('Debug 1');
    expect(getWrittenMessages()).toHaveLength(0);

    // Change to debug level
    currentLevel = 'debug';
    await logger.debug('Debug 2', { visible: true });
    
    const messages = getWrittenMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].params.data.message).toBe('Debug 2');
  });

  it('should handle all log levels correctly', async () => {
    currentLevel = 'debug'; // Allow all messages

    await logger.debug('Debug msg');
    await logger.info('Info msg');
    await logger.notice('Notice msg');
    await logger.warning('Warning msg');
    await logger.error('Error msg');
    await logger.critical('Critical msg');
    await logger.alert('Alert msg');
    await logger.emergency('Emergency msg');

    const messages = getWrittenMessages();
    expect(messages).toHaveLength(8);
    
    const levels = messages.map(m => m.params.level);
    expect(levels).toEqual([
      'debug',
      'info',
      'notice',
      'warning',
      'error',
      'critical',
      'alert',
      'emergency'
    ]);
  });

  it('should handle messages without additional data', async () => {
    await logger.info('Simple message');
    
    const messages = getWrittenMessages();
    expect(messages[0].params.data).toEqual({
      message: 'Simple message'
    });
  });

  it('should handle unknown client levels gracefully', async () => {
    currentLevel = 'unknown';
    
    // Should default to info level
    await logger.debug('Debug msg');
    await logger.info('Info msg');
    
    const messages = getWrittenMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].params.data.message).toBe('Info msg');
  });
});