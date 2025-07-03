/**
 * Large Response Handler for mcpmon
 * 
 * Automatically detects and handles MCP tool responses that exceed configurable
 * thresholds by persisting data to disk, generating schemas, creating normalized
 * databases, and returning structured metadata instead of raw data.
 */

import { writeFile, mkdir, readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { Database } from 'duckdb';

export interface LargeResponseConfig {
  enabled: boolean;
  threshold: number;  // KB
  tokenThreshold?: number;
  dataDir?: string;
  enableDuckDB?: boolean;
  enableSchemaGeneration?: boolean;
  cacheTTL?: number;
  toolOverrides?: {
    [toolName: string]: {
      threshold?: number;
      alwaysPersist?: boolean;
      transformerPath?: string;
    };
  };
}

export interface LargeResponseMetadata {
  status: 'success_file_saved';
  originalTool: string;
  count?: number;
  dataFile: string;
  schemaResource?: string;
  database?: {
    path: string;
    tables: Array<{
      name: string;
      columns: Array<{ name: string; type: string }>;
      rowCount: number;
    }>;
    sampleQueries: string[];
  };
  metadata: {
    sizeKB: number;
    estimatedTokens: number;
    timestamp: number;
    sessionId: string;
    cacheHash?: string;
  };
}

export class LargeResponseHandler {
  private config: LargeResponseConfig;
  private sessionId: string;
  private duckdb?: typeof import('duckdb');
  private quicktype?: typeof import('quicktype-core');

  constructor(config: LargeResponseConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId || this.generateSessionId();
  }

  /**
   * Check if a response should be handled by the large response handler
   */
  async shouldHandleResponse(response: any, toolName: string): Promise<boolean> {
    if (!this.config.enabled) return false;

    const toolConfig = this.config.toolOverrides?.[toolName] || {};
    
    // Check if always persist is enabled for this tool
    if (toolConfig.alwaysPersist) return true;
    
    // Calculate size and token estimates
    const jsonString = JSON.stringify(response);
    const sizeKB = Buffer.byteLength(jsonString) / 1024;
    const estimatedTokens = jsonString.length / 4; // Rough estimate
    
    const threshold = toolConfig.threshold || this.config.threshold;
    const tokenThreshold = this.config.tokenThreshold || 20000;
    
    return sizeKB > threshold || estimatedTokens > tokenThreshold;
  }

  /**
   * Process a large response and return metadata
   */
  async processLargeResponse(
    response: any, 
    toolName: string,
    options?: {
      sessionId?: string;
      originalRequest?: any;
    }
  ): Promise<LargeResponseMetadata> {
    const sessionId = options?.sessionId || this.sessionId;
    const timestamp = Date.now();
    
    // Calculate size info
    const jsonString = JSON.stringify(response, null, 2);
    const sizeKB = Buffer.byteLength(jsonString) / 1024;
    const estimatedTokens = jsonString.length / 4;
    
    // Generate paths
    const dataDir = this.config.dataDir || '/tmp/.mcpmon';
    const sessionDir = join(dataDir, sessionId, toolName);
    const dataFile = join(sessionDir, `response-${timestamp}.json`);
    const schemaFile = join(sessionDir, `schema-${timestamp}.json`);
    const dbFile = join(sessionDir, `database-${timestamp}.duckdb`);
    const metadataFile = join(sessionDir, `metadata-${timestamp}.json`);
    
    // Ensure directory exists
    await mkdir(sessionDir, { recursive: true });
    
    // Save raw data
    await writeFile(dataFile, jsonString);
    
    // Extract data array and count
    const { data, count } = this.extractDataArray(response);
    
    // Initialize metadata
    const metadata: LargeResponseMetadata = {
      status: 'success_file_saved',
      originalTool: toolName,
      count,
      dataFile,
      metadata: {
        sizeKB,
        estimatedTokens,
        timestamp,
        sessionId,
        cacheHash: this.generateCacheHash(options?.originalRequest)
      }
    };
    
    // Generate schema if enabled
    if (this.config.enableSchemaGeneration) {
      try {
        const schema = await this.generateSchema(data);
        await writeFile(schemaFile, JSON.stringify(schema, null, 2));
        metadata.schemaResource = `mcpmon://schemas/${sessionId}/${toolName}/${timestamp}`;
      } catch (error) {
        console.error('Failed to generate schema:', error);
      }
    }
    
    // Create DuckDB database if enabled
    if (this.config.enableDuckDB && data.length > 0) {
      try {
        const dbInfo = await this.createDatabase(data, dbFile, toolName);
        metadata.database = dbInfo;
      } catch (error) {
        console.error('Failed to create database:', error);
      }
    }
    
    // Save metadata
    await writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    
    return metadata;
  }

  /**
   * Extract data array from various response formats
   */
  private extractDataArray(response: any): { data: any[]; count: number } {
    // Handle common response patterns
    if (Array.isArray(response)) {
      return { data: response, count: response.length };
    }
    
    if (response.data && Array.isArray(response.data)) {
      return { 
        data: response.data, 
        count: response.count || response.data.length 
      };
    }
    
    if (response.items && Array.isArray(response.items)) {
      return { 
        data: response.items, 
        count: response.total || response.items.length 
      };
    }
    
    if (response.results && Array.isArray(response.results)) {
      return { 
        data: response.results, 
        count: response.count || response.results.length 
      };
    }
    
    // Check for any array property
    for (const key of Object.keys(response)) {
      if (Array.isArray(response[key])) {
        return { 
          data: response[key], 
          count: response[key].length 
        };
      }
    }
    
    // Fallback: treat single object as array
    return { data: [response], count: 1 };
  }

  /**
   * Generate JSON schema from sample data
   */
  private async generateSchema(data: any[]): Promise<any> {
    if (!this.quicktype) {
      this.quicktype = await import('quicktype-core');
    }
    
    // Use first few items as samples
    const samples = data.slice(0, Math.min(5, data.length));
    const jsonInput = JSON.stringify(samples);
    
    const { InputData, JSONSchemaInput, FetchingJSONSchemaStore } = this.quicktype;
    
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());
    const inputData = new InputData();
    inputData.addInput(schemaInput);
    
    await schemaInput.addSource({
      name: 'Response',
      samples: [jsonInput]
    });
    
    const result = await this.quicktype.quicktype({
      inputData,
      lang: 'schema'
    });
    
    return JSON.parse(result.lines.join('\n'));
  }

  /**
   * Create DuckDB database with normalized tables
   */
  private async createDatabase(
    data: any[], 
    dbPath: string, 
    tableName: string
  ): Promise<LargeResponseMetadata['database']> {
    if (!this.duckdb) {
      this.duckdb = await import('duckdb');
    }
    
    return new Promise((resolve, reject) => {
      const db = new this.duckdb.Database(dbPath);
      
      db.run('INSTALL json;', (err) => {
        if (err && !err.message.includes('already loaded')) {
          reject(err);
          return;
        }
        
        db.run('LOAD json;', (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Save data to temporary JSON file for DuckDB to read
          const tempFile = dbPath.replace('.duckdb', '-temp.json');
          writeFile(tempFile, JSON.stringify(data))
            .then(() => {
              // Create main table
              const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
              const createTableQuery = `
                CREATE TABLE ${safeTableName} AS 
                SELECT * FROM read_json_auto('${tempFile}');
              `;
              
              db.run(createTableQuery, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // Get table info
                const tables: any[] = [];
                const getTableInfo = () => {
                  db.all(
                    `SELECT table_name, column_name, data_type 
                     FROM information_schema.columns 
                     WHERE table_name = '${safeTableName}'`,
                    (err, columns) => {
                      if (err) {
                        reject(err);
                        return;
                      }
                      
                      // Get row count
                      db.get(
                        `SELECT COUNT(*) as count FROM ${safeTableName}`,
                        (err, result: any) => {
                          if (err) {
                            reject(err);
                            return;
                          }
                          
                          const tableInfo = {
                            name: safeTableName,
                            columns: columns as any[],
                            rowCount: result.count
                          };
                          
                          tables.push(tableInfo);
                          
                          // Generate sample queries
                          const sampleQueries = this.generateSampleQueries(
                            safeTableName, 
                            columns as any[]
                          );
                          
                          // Close database
                          db.close((err) => {
                            if (err) {
                              reject(err);
                              return;
                            }
                            
                            // Clean up temp file
                            import('fs/promises').then(fs => 
                              fs.unlink(tempFile).catch(() => {})
                            );
                            
                            resolve({
                              path: dbPath,
                              tables,
                              sampleQueries
                            });
                          });
                        }
                      );
                    }
                  );
                };
                
                getTableInfo();
              });
            })
            .catch(reject);
        });
      });
    });
  }

  /**
   * Generate sample DuckDB queries
   */
  private generateSampleQueries(tableName: string, columns: any[]): string[] {
    const queries: string[] = [];
    
    // Basic select
    queries.push(`SELECT * FROM ${tableName} LIMIT 10;`);
    
    // Count query
    queries.push(`SELECT COUNT(*) as total_rows FROM ${tableName};`);
    
    // Find numeric columns for aggregation
    const numericColumns = columns
      .filter(col => ['INTEGER', 'DOUBLE', 'DECIMAL', 'BIGINT'].includes(col.data_type))
      .map(col => col.column_name);
    
    if (numericColumns.length > 0) {
      const numCol = numericColumns[0];
      queries.push(`SELECT AVG(${numCol}) as avg, MIN(${numCol}) as min, MAX(${numCol}) as max FROM ${tableName};`);
    }
    
    // Find string columns for grouping
    const stringColumns = columns
      .filter(col => col.data_type === 'VARCHAR')
      .map(col => col.column_name);
    
    if (stringColumns.length > 0 && numericColumns.length > 0) {
      const strCol = stringColumns[0];
      const numCol = numericColumns[0];
      queries.push(
        `SELECT ${strCol}, COUNT(*) as count, SUM(${numCol}) as total ` +
        `FROM ${tableName} GROUP BY ${strCol} ORDER BY count DESC LIMIT 10;`
      );
    }
    
    return queries;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return createHash('md5')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * Generate cache hash from request
   */
  private generateCacheHash(request: any): string {
    if (!request) return '';
    
    // Sort keys for consistent hashing
    const sortedRequest = this.sortKeys(request);
    
    return createHash('md5')
      .update(JSON.stringify(sortedRequest))
      .digest('hex');
  }

  /**
   * Sort object keys recursively
   */
  private sortKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortKeys(item));
    
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortKeys(obj[key]);
    });
    
    return sorted;
  }

  /**
   * List saved datasets
   */
  async listSavedDatasets(sessionId?: string): Promise<any[]> {
    const dataDir = this.config.dataDir || '/tmp/.mcpmon';
    const datasets: any[] = [];
    
    try {
      const sessions = sessionId ? [sessionId] : await readdir(dataDir);
      
      for (const session of sessions) {
        const sessionPath = join(dataDir, session);
        const tools = await readdir(sessionPath).catch(() => []);
        
        for (const tool of tools) {
          const toolPath = join(sessionPath, tool);
          const files = await readdir(toolPath).catch(() => []);
          
          const metadataFiles = files.filter(f => f.startsWith('metadata-'));
          
          for (const metaFile of metadataFiles) {
            try {
              const metadataPath = join(toolPath, metaFile);
              const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
              datasets.push({
                ...metadata,
                session,
                tool
              });
            } catch (error) {
              console.error(`Failed to read metadata ${metaFile}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to list datasets:', error);
    }
    
    return datasets;
  }

  /**
   * Execute DuckDB query
   */
  async executeDuckDBQuery(dbPath: string, query: string): Promise<any> {
    if (!this.duckdb) {
      this.duckdb = await import('duckdb');
    }
    
    return new Promise((resolve, reject) => {
      const db = new this.duckdb!.Database(dbPath, { mode: this.duckdb!.OPEN_READONLY });
      
      db.all(query, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        
        db.close((closeErr) => {
          if (closeErr) {
            console.error('Failed to close database:', closeErr);
          }
          resolve(result);
        });
      });
    });
  }
}