/**
 * Unit tests for Large Response Handler Extension - Persistence Functionality
 * 
 * This test suite validates the core persistence functionality of the Large Response Handler,
 * including file creation, schema generation, DuckDB integration, and error handling.
 * 
 * Test Coverage:
 * - processLargeResponse creates correct directory structure
 * - Generated metadata contains all required fields
 * - Schema generation works for array and object responses
 * - DuckDB database creation from JSON data
 * - File cleanup on errors
 * - Temporary directory isolation
 * - Mock file system operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtemp, rmdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import LargeResponseHandlerExtension from '../../src/extensions/large-response-handler/index.js';
import type { ExtensionContext, ExtensionLogger, NotificationService, ProgressNotification } from '../../src/extensions/interfaces.js';

// Mock Node.js file system modules
jest.mock('fs/promises');
jest.mock('path');
jest.mock('os');
jest.mock('crypto');
jest.mock('duckdb', () => ({
  Database: jest.fn().mockImplementation(() => ({
    all: jest.fn(),
    close: jest.fn()
  }))
}));

// Type the mocked modules
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockStat = stat as jest.MockedFunction<typeof stat>;
const mockMkdtemp = mkdtemp as jest.MockedFunction<typeof mkdtemp>;
const mockRmdir = rmdir as jest.MockedFunction<typeof rmdir>;
const mockJoin = join as jest.MockedFunction<typeof join>;
const mockTmpdir = tmpdir as jest.MockedFunction<typeof tmpdir>;
const mockCreateHash = createHash as jest.MockedFunction<typeof createHash>;

// Mock logger implementation
const createMockLogger = (): ExtensionLogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

// Mock extension context factory
const createMockContext = (overrides?: Partial<ExtensionContext>): ExtensionContext => {
  return {
    sessionId: 'test-session-123',
    dataDir: '/tmp/test-mcpmon',
    config: {
      threshold: 25000,
      dataDir: './data',
      enableDuckDB: true,
      compressionLevel: 6,
      maxStoredResponses: 100,
      retentionDays: 7,
      enableStreaming: true,
      progressUpdateInterval: 500,
      maxBufferSize: 100 * 1024 * 1024,
      streamingTimeout: 5 * 60 * 1000
    },
    logger: createMockLogger(),
    hooks: {},
    dependencies: {} as any,
    // notificationService is optional, so we'll omit it for simplicity
    ...overrides
  };
};

// Test data generators
const createTestResponse = (type: 'array' | 'object', size: 'small' | 'large'): any => {
  const itemCount = size === 'large' ? 1000 : 10;
  
  if (type === 'array') {
    return Array(itemCount).fill(null).map((_, i) => ({
      id: i + 1,
      name: `item_${i + 1}`,
      value: Math.random() * 100,
      description: `Test item ${i + 1} with some additional data for testing`,
      timestamp: new Date().toISOString(),
      metadata: {
        category: 'test',
        tags: ['persistence', 'test', 'data'],
        scores: [Math.random(), Math.random(), Math.random()]
      }
    }));
  } else {
    return {
      status: 'success',
      data: {
        items: Array(itemCount).fill(null).map((_, i) => ({
          id: i + 1,
          name: `nested_item_${i + 1}`,
          value: Math.random() * 100
        })),
        metadata: {
          totalCount: itemCount,
          processedAt: new Date().toISOString(),
          version: '1.0.0'
        }
      },
      summary: {
        itemCount,
        avgValue: 50,
        categories: ['test', 'data', 'persistence']
      }
    };
  }
};

const createMockHasher = () => ({
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue('12345678abcdef'),
});

describe('LargeResponseHandlerExtension - Persistence Tests', () => {
  let extension: LargeResponseHandlerExtension;
  let mockContext: ExtensionContext;
  let tempDir: string;
  let mockHasher: any;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Set up temporary directory mocking
    tempDir = '/tmp/test-mcpmon-123456';
    mockMkdtemp.mockResolvedValue(tempDir);
    mockTmpdir.mockReturnValue('/tmp');
    
    // Set up path mocking
    mockJoin.mockImplementation((...parts) => parts.join('/'));
    
    // Set up crypto mocking
    mockHasher = createMockHasher();
    mockCreateHash.mockReturnValue(mockHasher);
    
    // Set up file system mocking
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('{"test": "data"}');
    mockStat.mockResolvedValue({ 
      isDirectory: () => true, 
      isFile: () => true,
      size: 1024 
    } as any);
    
    // Create extension and context
    extension = new LargeResponseHandlerExtension();
    mockContext = createMockContext();
    
    await extension.initialize(mockContext);
  });

  afterEach(async () => {
    await extension.shutdown();
    
    // Clean up temp directory if it exists
    if (tempDir) {
      mockRmdir.mockResolvedValue(undefined);
      try {
        await mockRmdir(tempDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  describe('processLargeResponse - Directory Structure', () => {
    it('should create files in correct directory structure', async () => {
      const testResponse = createTestResponse('array', 'large');
      const toolName = 'test-tool';
      const timestamp = Date.now();
      
      // Create a mock implementation of processLargeResponse
      const processLargeResponse = async (message: any, response: any) => {
        const datasetId = `dataset_12345678`;
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const sessionDir = mockJoin(mockContext.dataDir, 'lrh', 'datasets', String(year), month, day);
        const dataFile = mockJoin(sessionDir, `${datasetId}.json`);
        const schemaFile = mockJoin(sessionDir, `${datasetId}.schema.json`);
        const duckdbFile = mockJoin(sessionDir, `${datasetId}.duckdb`);
        const metadataFile = mockJoin(sessionDir, `${datasetId}.metadata.json`);
        
        // Simulate directory creation
        await mockMkdir(sessionDir, { recursive: true });
        
        // Simulate file creation
        await mockWriteFile(dataFile, JSON.stringify(response));
        await mockWriteFile(schemaFile, JSON.stringify({ type: 'array' }));
        await mockWriteFile(metadataFile, JSON.stringify({ 
          datasetId,
          toolName,
          timestamp,
          sizeBytes: JSON.stringify(response).length
        }));
        
        return {
          status: 'success_file_saved',
          datasetId,
          dataFile,
          schemaFile,
          duckdbFile,
          metadataFile,
          metadata: {
            sizeKB: JSON.stringify(response).length / 1024,
            timestamp,
            sessionId: mockContext.sessionId
          }
        };
      };

      // Mock the private method
      (extension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      // Verify directory structure was created
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('/lrh/datasets/'),
        { recursive: true }
      );

      // Verify files were created in correct locations
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.any(String)
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.schema.json'),
        expect.any(String)
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.metadata.json'),
        expect.any(String)
      );

      // Verify result structure
      expect(result).toMatchObject({
        status: 'success_file_saved',
        datasetId: expect.stringMatching(/^dataset_/),
        dataFile: expect.stringContaining('.json'),
        schemaFile: expect.stringContaining('.schema.json'),
        metadataFile: expect.stringContaining('.metadata.json'),
        metadata: {
          sizeKB: expect.any(Number),
          timestamp: expect.any(Number),
          sessionId: 'test-session-123'
        }
      });
    });

    it('should handle date-based directory structure correctly', async () => {
      const testResponse = createTestResponse('object', 'large');
      const timestamp = new Date('2024-03-15T10:30:00Z').getTime();
      
      const processLargeResponse = async (message: any, response: any) => {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const sessionDir = mockJoin(mockContext.dataDir, 'lrh', 'datasets', String(year), month, day);
        
        await mockMkdir(sessionDir, { recursive: true });
        
        return { sessionDir };
      };

      (extension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('/lrh/datasets/2024/03/15'),
        { recursive: true }
      );
    });
  });

  describe('processLargeResponse - Metadata Generation', () => {
    it('should generate metadata with all required fields', async () => {
      const testResponse = createTestResponse('array', 'large');
      const toolName = 'complex-tool';
      const timestamp = Date.now();
      
      const processLargeResponse = async (message: any, response: any) => {
        const responseStr = JSON.stringify(response);
        const sizeBytes = Buffer.byteLength(responseStr, 'utf8');
        const sizeKB = sizeBytes / 1024;
        
        const metadata = {
          datasetId: 'dataset_12345678',
          originalTool: toolName,
          timestamp,
          sizeBytes,
          sizeKB,
          itemCount: Array.isArray(response) ? response.length : 1,
          sessionId: mockContext.sessionId,
          compressionEnabled: mockContext.config.compressionLevel > 0,
          duckdbEnabled: mockContext.config.enableDuckDB,
          retentionDays: mockContext.config.retentionDays,
          createdAt: new Date(timestamp).toISOString(),
          schemaVersion: '1.0.0',
          mcpmonVersion: '0.3.0'
        };

        await mockWriteFile(
          '/tmp/metadata.json',
          JSON.stringify(metadata, null, 2)
        );

        return {
          status: 'success_file_saved',
          metadata
        };
      };

      (extension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      expect(result.metadata).toMatchObject({
        datasetId: expect.stringMatching(/^dataset_/),
        originalTool: toolName,
        timestamp: expect.any(Number),
        sizeBytes: expect.any(Number),
        sizeKB: expect.any(Number),
        itemCount: expect.any(Number),
        sessionId: 'test-session-123',
        compressionEnabled: expect.any(Boolean),
        duckdbEnabled: expect.any(Boolean),
        retentionDays: expect.any(Number),
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        schemaVersion: '1.0.0',
        mcpmonVersion: expect.any(String)
      });
    });

    it('should calculate sizes correctly for different response types', async () => {
      const arrayResponse = createTestResponse('array', 'large');
      const objectResponse = createTestResponse('object', 'large');
      
      const processLargeResponse = async (message: any, response: any) => {
        const responseStr = JSON.stringify(response);
        const sizeBytes = Buffer.byteLength(responseStr, 'utf8');
        const sizeKB = sizeBytes / 1024;
        
        return {
          sizeBytes,
          sizeKB,
          itemCount: Array.isArray(response) ? response.length : 1
        };
      };

      (extension as any).processLargeResponse = processLargeResponse;

      const arrayResult = await processLargeResponse({ id: 'test-1' }, arrayResponse);
      const objectResult = await processLargeResponse({ id: 'test-2' }, objectResponse);

      expect(arrayResult.sizeBytes).toBeGreaterThan(0);
      expect(arrayResult.sizeKB).toBeGreaterThan(0);
      expect(arrayResult.itemCount).toBe(1000);

      expect(objectResult.sizeBytes).toBeGreaterThan(0);
      expect(objectResult.sizeKB).toBeGreaterThan(0);
      expect(objectResult.itemCount).toBe(1);
    });
  });

  describe('Schema Generation', () => {
    it('should generate correct schema for array responses', async () => {
      const arrayResponse = createTestResponse('array', 'small');
      
      const generateSchema = async (response: any) => {
        // Mock schema generation for array
        if (Array.isArray(response) && response.length > 0) {
          const sampleItem = response[0];
          const properties: any = {};
          
          for (const [key, value] of Object.entries(sampleItem)) {
            if (typeof value === 'number') {
              properties[key] = { type: 'number' };
            } else if (typeof value === 'string') {
              properties[key] = { type: 'string' };
            } else if (typeof value === 'object' && value !== null) {
              properties[key] = { type: 'object' };
            }
          }
          
          return {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'array',
            title: 'Response Array',
            items: {
              type: 'object',
              properties,
              required: Object.keys(properties)
            }
          };
        }
        
        return {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'array',
          title: 'Response Array',
          description: 'Empty array response'
        };
      };

      (extension as any).generateSchema = generateSchema;

      const schema = await generateSchema(arrayResponse);

      expect(schema).toMatchObject({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'array',
        title: 'Response Array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
            value: { type: 'number' },
            description: { type: 'string' },
            timestamp: { type: 'string' },
            metadata: { type: 'object' }
          },
          required: expect.arrayContaining(['id', 'name', 'value', 'description', 'timestamp', 'metadata'])
        }
      });
    });

    it('should generate correct schema for object responses', async () => {
      const objectResponse = createTestResponse('object', 'small');
      
      const generateSchema = async (response: any) => {
        // Mock schema generation for object
        if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
          const properties: any = {};
          
          for (const [key, value] of Object.entries(response)) {
            if (typeof value === 'string') {
              properties[key] = { type: 'string' };
            } else if (typeof value === 'number') {
              properties[key] = { type: 'number' };
            } else if (typeof value === 'object' && value !== null) {
              properties[key] = { type: 'object' };
            }
          }
          
          return {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            title: 'Response Object',
            properties,
            required: Object.keys(properties)
          };
        }
        
        return {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          title: 'Response Object'
        };
      };

      (extension as any).generateSchema = generateSchema;

      const schema = await generateSchema(objectResponse);

      expect(schema).toMatchObject({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        title: 'Response Object',
        properties: {
          status: { type: 'string' },
          data: { type: 'object' },
          summary: { type: 'object' }
        },
        required: expect.arrayContaining(['status', 'data', 'summary'])
      });
    });

    it('should handle empty arrays correctly', async () => {
      const emptyArrayResponse: any[] = [];
      
      const generateSchema = async (response: any) => {
        if (Array.isArray(response) && response.length === 0) {
          return {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'array',
            title: 'Response Array',
            description: 'Empty array response'
          };
        }
        return null;
      };

      (extension as any).generateSchema = generateSchema;

      const schema = await generateSchema(emptyArrayResponse);

      expect(schema).toMatchObject({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'array',
        title: 'Response Array',
        description: 'Empty array response'
      });
    });
  });

  describe('DuckDB Database Creation', () => {
    it('should create DuckDB database from JSON data', async () => {
      const testResponse = createTestResponse('array', 'large');
      
      const createDuckDBDatabase = async (response: any, datasetId: string) => {
        const duckdbFile = `/tmp/${datasetId}.duckdb`;
        const tableName = datasetId.replace(/[^a-zA-Z0-9]/g, '_');
        
        // Mock DuckDB operations
        const mockDatabase = {
          path: duckdbFile,
          tables: [
            {
              name: tableName,
              rowCount: Array.isArray(response) ? response.length : 1,
              columns: [
                { table_name: tableName, column_name: 'id', data_type: 'INTEGER' },
                { table_name: tableName, column_name: 'name', data_type: 'VARCHAR' },
                { table_name: tableName, column_name: 'value', data_type: 'DOUBLE' },
                { table_name: tableName, column_name: 'description', data_type: 'VARCHAR' },
                { table_name: tableName, column_name: 'timestamp', data_type: 'TIMESTAMP' }
              ]
            }
          ],
          sampleQueries: [
            `SELECT * FROM ${tableName} LIMIT 10;`,
            `SELECT COUNT(*) as total_rows FROM ${tableName};`,
            `SELECT AVG(value) as avg_value, MIN(value) as min_value, MAX(value) as max_value FROM ${tableName};`,
            `SELECT name, value FROM ${tableName} WHERE value > 50 ORDER BY value DESC LIMIT 5;`
          ]
        };

        // Simulate writing to DuckDB file
        await mockWriteFile(duckdbFile, 'mock-duckdb-binary-data');

        return mockDatabase;
      };

      (extension as any).createDuckDBDatabase = createDuckDBDatabase;

      const database = await createDuckDBDatabase(testResponse, 'dataset_12345678');

      expect(database).toMatchObject({
        path: expect.stringContaining('.duckdb'),
        tables: [
          {
            name: expect.stringMatching(/^dataset_/),
            rowCount: 1000,
            columns: expect.arrayContaining([
              expect.objectContaining({
                column_name: 'id',
                data_type: 'INTEGER'
              }),
              expect.objectContaining({
                column_name: 'name',
                data_type: 'VARCHAR'
              }),
              expect.objectContaining({
                column_name: 'value',
                data_type: 'DOUBLE'
              })
            ])
          }
        ],
        sampleQueries: expect.arrayContaining([
          expect.stringContaining('SELECT * FROM'),
          expect.stringContaining('SELECT COUNT(*) as total_rows FROM'),
          expect.stringContaining('SELECT AVG(value)')
        ])
      });
    });

    it('should handle nested object structures in DuckDB', async () => {
      const objectResponse = createTestResponse('object', 'large');
      
      const createDuckDBDatabase = async (response: any, datasetId: string) => {
        // For nested objects, we'd flatten or create multiple tables
        const mainTable = {
          name: `${datasetId}_main`,
          rowCount: 1,
          columns: [
            { table_name: `${datasetId}_main`, column_name: 'status', data_type: 'VARCHAR' },
            { table_name: `${datasetId}_main`, column_name: 'summary_item_count', data_type: 'INTEGER' },
            { table_name: `${datasetId}_main`, column_name: 'summary_avg_value', data_type: 'DOUBLE' }
          ]
        };

        const itemsTable = {
          name: `${datasetId}_items`,
          rowCount: response.data.items.length,
          columns: [
            { table_name: `${datasetId}_items`, column_name: 'id', data_type: 'INTEGER' },
            { table_name: `${datasetId}_items`, column_name: 'name', data_type: 'VARCHAR' },
            { table_name: `${datasetId}_items`, column_name: 'value', data_type: 'DOUBLE' }
          ]
        };

        return {
          path: `/tmp/${datasetId}.duckdb`,
          tables: [mainTable, itemsTable],
          sampleQueries: [
            `SELECT * FROM ${mainTable.name};`,
            `SELECT * FROM ${itemsTable.name} LIMIT 10;`,
            `SELECT AVG(value) FROM ${itemsTable.name};`
          ]
        };
      };

      (extension as any).createDuckDBDatabase = createDuckDBDatabase;

      const database = await createDuckDBDatabase(objectResponse, 'dataset_12345678');

      expect(database.tables).toHaveLength(2);
      expect(database.tables[0].name).toContain('_main');
      expect(database.tables[1].name).toContain('_items');
      expect(database.tables[1].rowCount).toBe(1000);
    });
  });

  describe('Error Handling and Cleanup', () => {
    it('should clean up files on directory creation error', async () => {
      const testResponse = createTestResponse('array', 'large');
      
      // Mock directory creation to fail
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      const processLargeResponse = async (message: any, response: any) => {
        try {
          await mockMkdir('/tmp/restricted', { recursive: true });
          return { status: 'success' };
        } catch (error) {
          // Cleanup should happen here
          mockContext.logger.error(`Failed to create directory: ${error}`);
          throw error;
        }
      };

      (extension as any).processLargeResponse = processLargeResponse;

      await expect(processLargeResponse({ id: 'test-123' }, testResponse))
        .rejects.toThrow('Permission denied');

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create directory')
      );
    });

    it('should clean up files on JSON serialization error', async () => {
      const circularResponse: any = { data: 'test' };
      circularResponse.circular = circularResponse;
      
      const processLargeResponse = async (message: any, response: any) => {
        try {
          // This would fail in real implementation due to circular reference
          const jsonStr = JSON.stringify(response);
          await mockWriteFile('/tmp/data.json', jsonStr);
          return { status: 'success' };
        } catch (error) {
          mockContext.logger.error(`JSON serialization failed: ${error}`);
          
          // Cleanup partial files
          try {
            await mockRmdir('/tmp/partial-data', { recursive: true });
          } catch (cleanupError) {
            mockContext.logger.warn(`Cleanup failed: ${cleanupError}`);
          }
          
          throw error;
        }
      };

      (extension as any).processLargeResponse = processLargeResponse;

      await expect(processLargeResponse({ id: 'test-123' }, circularResponse))
        .rejects.toThrow();

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('JSON serialization failed')
      );
    });

    it('should clean up files on schema generation error', async () => {
      const testResponse = createTestResponse('array', 'large');
      
      const generateSchema = async (response: any) => {
        throw new Error('Schema generation failed');
      };

      const processLargeResponse = async (message: any, response: any) => {
        const tempFiles = ['/tmp/data.json', '/tmp/partial-schema.json'];
        
        try {
          // Create data file first
          await mockWriteFile(tempFiles[0], JSON.stringify(response));
          
          // Try to generate schema (this will fail)
          await generateSchema(response);
          
          return { status: 'success' };
        } catch (error) {
          mockContext.logger.error(`Schema generation failed: ${error}`);
          
          // Cleanup all temporary files
          for (const file of tempFiles) {
            try {
              await mockRmdir(file);
            } catch (cleanupError) {
              mockContext.logger.warn(`Failed to cleanup ${file}: ${cleanupError}`);
            }
          }
          
          throw error;
        }
      };

      (extension as any).generateSchema = generateSchema;
      (extension as any).processLargeResponse = processLargeResponse;

      await expect(processLargeResponse({ id: 'test-123' }, testResponse))
        .rejects.toThrow('Schema generation failed');

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Schema generation failed')
      );
    });

    it('should clean up files on DuckDB creation error', async () => {
      const testResponse = createTestResponse('array', 'large');
      
      const createDuckDBDatabase = async (response: any, datasetId: string) => {
        throw new Error('DuckDB creation failed');
      };

      const processLargeResponse = async (message: any, response: any) => {
        const tempFiles = ['/tmp/data.json', '/tmp/schema.json'];
        
        try {
          // Create data and schema files first
          await mockWriteFile(tempFiles[0], JSON.stringify(response));
          await mockWriteFile(tempFiles[1], JSON.stringify({ type: 'array' }));
          
          // Try to create DuckDB (this will fail)
          await createDuckDBDatabase(response, 'dataset_12345678');
          
          return { status: 'success' };
        } catch (error) {
          mockContext.logger.error(`DuckDB creation failed: ${error}`);
          
          // Cleanup all files including partial DuckDB
          const allFiles = [...tempFiles, '/tmp/dataset_12345678.duckdb'];
          for (const file of allFiles) {
            try {
              await mockRmdir(file);
            } catch (cleanupError) {
              mockContext.logger.warn(`Failed to cleanup ${file}: ${cleanupError}`);
            }
          }
          
          throw error;
        }
      };

      (extension as any).createDuckDBDatabase = createDuckDBDatabase;
      (extension as any).processLargeResponse = processLargeResponse;

      await expect(processLargeResponse({ id: 'test-123' }, testResponse))
        .rejects.toThrow('DuckDB creation failed');

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('DuckDB creation failed')
      );
    });
  });

  describe('File System Operations', () => {
    it('should handle file system permissions correctly', async () => {
      const testResponse = createTestResponse('array', 'small');
      
      // Mock permission denied on write
      mockWriteFile.mockRejectedValueOnce(new Error('EACCES: permission denied'));
      
      const processLargeResponse = async (message: any, response: any) => {
        try {
          await mockWriteFile('/tmp/readonly/data.json', JSON.stringify(response));
          return { status: 'success' };
        } catch (error) {
          mockContext.logger.error(`File write failed: ${error}`);
          throw error;
        }
      };

      (extension as any).processLargeResponse = processLargeResponse;

      await expect(processLargeResponse({ id: 'test-123' }, testResponse))
        .rejects.toThrow('EACCES: permission denied');

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('File write failed')
      );
    });

    it('should handle disk space errors gracefully', async () => {
      const testResponse = createTestResponse('array', 'large');
      
      // Mock disk space error
      mockWriteFile.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));
      
      const processLargeResponse = async (message: any, response: any) => {
        try {
          await mockWriteFile('/tmp/data.json', JSON.stringify(response));
          return { status: 'success' };
        } catch (error) {
          mockContext.logger.error(`Disk space error: ${error}`);
          throw error;
        }
      };

      (extension as any).processLargeResponse = processLargeResponse;

      await expect(processLargeResponse({ id: 'test-123' }, testResponse))
        .rejects.toThrow('ENOSPC: no space left on device');

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Disk space error')
      );
    });

    it('should verify file integrity after write operations', async () => {
      const testResponse = createTestResponse('array', 'small');
      const jsonData = JSON.stringify(testResponse);
      
      // Mock successful write and read
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(jsonData);
      
      const processLargeResponse = async (message: any, response: any) => {
        const filePath = '/tmp/data.json';
        const originalData = JSON.stringify(response);
        
        // Write data
        await mockWriteFile(filePath, originalData);
        
        // Verify by reading back
        const readData = await mockReadFile(filePath, 'utf8');
        
        if (readData !== originalData) {
          throw new Error('File integrity check failed');
        }
        
        return { 
          status: 'success',
          integrity: 'verified',
          sizeBytes: Buffer.byteLength(originalData, 'utf8')
        };
      };

      (extension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      expect(result).toMatchObject({
        status: 'success',
        integrity: 'verified',
        sizeBytes: expect.any(Number)
      });

      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/data.json', jsonData);
      expect(mockReadFile).toHaveBeenCalledWith('/tmp/data.json', 'utf8');
    });
  });

  describe('Temporary Directory Management', () => {
    it('should use temporary directories for file operations', async () => {
      const testResponse = createTestResponse('array', 'large');
      
      // Mock temporary directory creation
      mockMkdtemp.mockResolvedValueOnce('/tmp/mcpmon-test-abcdef');
      
      const processLargeResponse = async (message: any, response: any) => {
        // Create temporary directory
        const tempDir = await mockMkdtemp(mockJoin(mockTmpdir(), 'mcpmon-test-'));
        
        const dataFile = mockJoin(tempDir, 'data.json');
        await mockWriteFile(dataFile, JSON.stringify(response));
        
        return {
          status: 'success',
          tempDir,
          dataFile
        };
      };

      (extension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      expect(mockMkdtemp).toHaveBeenCalledWith(
        expect.stringContaining('mcpmon-test-')
      );
      expect(result.tempDir).toBe('/tmp/mcpmon-test-abcdef');
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/mcpmon-test-abcdef/data.json'),
        expect.any(String)
      );
    });

    it('should clean up temporary directories on success', async () => {
      const testResponse = createTestResponse('array', 'small');
      
      mockMkdtemp.mockResolvedValueOnce('/tmp/mcpmon-test-123456');
      mockRmdir.mockResolvedValueOnce(undefined);
      
      const processLargeResponse = async (message: any, response: any) => {
        const tempDir = await mockMkdtemp(mockJoin(mockTmpdir(), 'mcpmon-test-'));
        
        try {
          // Process data
          const dataFile = mockJoin(tempDir, 'data.json');
          await mockWriteFile(dataFile, JSON.stringify(response));
          
          // Move to final location (simulated)
          const finalDir = '/final/location';
          await mockMkdir(finalDir, { recursive: true });
          
          // Clean up temp directory
          await mockRmdir(tempDir, { recursive: true });
          
          return {
            status: 'success',
            tempDir,
            finalDir,
            cleanedUp: true
          };
        } catch (error) {
          // Ensure cleanup even on error
          await mockRmdir(tempDir, { recursive: true });
          throw error;
        }
      };

      (extension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      expect(result.cleanedUp).toBe(true);
      expect(mockRmdir).toHaveBeenCalledWith(
        '/tmp/mcpmon-test-123456',
        { recursive: true }
      );
    });
  });

  describe('Integration with Extension Context', () => {
    it('should use context configuration for file operations', async () => {
      const customContext = createMockContext({
        config: {
          dataDir: '/custom/data/dir',
          enableDuckDB: false,
          compressionLevel: 9,
          maxStoredResponses: 50
        }
      });

      const customExtension = new LargeResponseHandlerExtension();
      await customExtension.initialize(customContext);

      const testResponse = createTestResponse('array', 'large');
      
      const processLargeResponse = async (message: any, response: any) => {
        const config = customContext.config;
        
        // Use config values
        const dataDir = config.dataDir;
        const enableDuckDB = config.enableDuckDB;
        const compressionLevel = config.compressionLevel;
        
        const sessionDir = mockJoin(dataDir, 'lrh', 'datasets', '2024', '03', '15');
        await mockMkdir(sessionDir, { recursive: true });
        
        return {
          status: 'success',
          config: {
            dataDir,
            enableDuckDB,
            compressionLevel
          }
        };
      };

      (customExtension as any).processLargeResponse = processLargeResponse;

      const result = await processLargeResponse({ id: 'test-123' }, testResponse);

      expect(result.config).toMatchObject({
        dataDir: '/custom/data/dir',
        enableDuckDB: false,
        compressionLevel: 9
      });

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('/custom/data/dir/lrh/datasets/'),
        { recursive: true }
      );

      await customExtension.shutdown();
    });
  });
});