/**
 * Large Response Handler Extension for mcpmon
 *
 * Automatically detects and handles MCP tool responses that exceed configurable
 * thresholds by persisting data to disk and providing streaming support.
 */
import { StreamingBuffer } from './streaming.js';
import { mkdir, writeFile, readFile, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import duckdb from 'duckdb';
const { Database } = duckdb;
// Use MAX_MCP_OUTPUT_TOKENS env var if set, otherwise 25KB default
// Approximate 1 token ≈ 4 bytes, so default 25KB ≈ 6250 tokens
const getThresholdFromEnv = () => {
    const maxTokens = process.env.MAX_MCP_OUTPUT_TOKENS;
    if (maxTokens) {
        const tokens = parseInt(maxTokens, 10);
        if (!isNaN(tokens) && tokens > 0) {
            // Convert tokens to approximate bytes (1 token ≈ 4 bytes)
            return tokens * 4;
        }
    }
    return 25000; // 25KB default
};
const DEFAULT_CONFIG = {
    threshold: 25000, // 25KB default - will be overridden by getThresholdFromEnv() in initialize()
    dataDir: './data',
    enableDuckDB: true,
    compressionLevel: 6,
    maxStoredResponses: 100,
    retentionDays: 7,
    enableStreaming: true,
    progressUpdateInterval: 500,
    maxBufferSize: 100 * 1024 * 1024, // 100MB
    streamingTimeout: 5 * 60 * 1000, // 5 minutes
};
class LargeResponseHandlerExtension {
    id = 'large-response-handler';
    name = 'Large Response Handler';
    version = '1.0.0';
    defaultEnabled = false;
    configSchema = {
        type: 'object',
        properties: {
            threshold: {
                type: 'number',
                minimum: 1000,
                default: 25000,
                description: 'Response size threshold in bytes (or set MAX_MCP_OUTPUT_TOKENS env var)'
            },
            dataDir: {
                type: 'string',
                default: './data',
                description: 'Directory to store large responses'
            },
            enableDuckDB: {
                type: 'boolean',
                default: true,
                description: 'Enable DuckDB analysis features'
            },
            compressionLevel: {
                type: 'number',
                minimum: 0,
                maximum: 9,
                default: 6,
                description: 'Gzip compression level (0-9)'
            },
            maxStoredResponses: {
                type: 'number',
                minimum: 1,
                default: 100,
                description: 'Maximum number of stored responses'
            },
            retentionDays: {
                type: 'number',
                minimum: 1,
                default: 7,
                description: 'Number of days to retain stored responses'
            },
            enableStreaming: {
                type: 'boolean',
                default: true,
                description: 'Enable streaming support for large responses'
            },
            progressUpdateInterval: {
                type: 'number',
                minimum: 100,
                default: 500,
                description: 'Minimum milliseconds between progress updates'
            },
            maxBufferSize: {
                type: 'number',
                minimum: 1024 * 1024, // 1MB minimum
                default: 100 * 1024 * 1024, // 100MB
                description: 'Maximum bytes before disk fallback'
            },
            streamingTimeout: {
                type: 'number',
                minimum: 60 * 1000, // 1 minute minimum
                default: 5 * 60 * 1000, // 5 minutes
                description: 'Milliseconds before abandoned request cleanup'
            }
        }
    };
    /**
     * @internal
     */
    context;
    /**
     * @internal
     */
    config = DEFAULT_CONFIG;
    /**
     * @internal
     */
    streamingBuffer;
    /**
     * @internal
     */
    progressTokens = new Map(); // Track progress tokens by request ID
    async initialize(context) {
        this.context = context;
        // Calculate threshold at initialization time, not module load time
        const defaultConfigWithDynamicThreshold = {
            ...DEFAULT_CONFIG,
            threshold: getThresholdFromEnv()
        };
        this.config = { ...defaultConfigWithDynamicThreshold, ...context.config };
        // Log threshold configuration
        const envTokens = process.env.MAX_MCP_OUTPUT_TOKENS;
        if (envTokens) {
            context.logger.info(`Using MAX_MCP_OUTPUT_TOKENS=${envTokens} (threshold: ${this.config.threshold} bytes)`);
        }
        else {
            context.logger.info(`Using default threshold: ${this.config.threshold} bytes (25KB)`);
        }
        // Initialize data directory structure
        await this.ensureDataDirectory();
        // Initialize streaming buffer with configuration
        if (this.config.enableStreaming) {
            this.streamingBuffer = new StreamingBuffer({
                maxBufferSize: this.config.maxBufferSize,
                progressUpdateInterval: this.config.progressUpdateInterval,
                requestTimeout: this.config.streamingTimeout,
                enableDiskFallback: true
            }, context.logger);
            // Set up progress notification handler
            this.streamingBuffer.setProgressHandler(async (notification) => {
                // Send MCP progress notification through the proxy
                await this.sendProgressNotification(notification);
            });
        }
        // Register hooks for message interception
        context.logger.debug('Registering Large Response Handler hooks...');
        context.hooks.beforeStdinForward = this.trackProgressToken.bind(this);
        context.hooks.afterStdoutReceive = this.handleServerResponse.bind(this);
        context.hooks.getAdditionalTools = this.getAdditionalTools.bind(this);
        context.hooks.handleToolCall = this.handleToolCall.bind(this);
        // Log the tools we'll be providing
        const tools = await this.getAdditionalTools();
        context.logger.info(`Large Response Handler initialized with ${tools.length} tools:`);
        tools.forEach(tool => {
            context.logger.info(`  - ${tool.name}: ${tool.description}`);
        });
    }
    async shutdown() {
        // Clean up resources
        this.context = undefined;
        this.streamingBuffer = undefined;
    }
    /**
     * Ensure data directory structure exists
     * @internal
     */
    async ensureDataDirectory() {
        const dataDir = this.getDataDirectory();
        try {
            await mkdir(dataDir, { recursive: true });
            this.context?.logger.debug(`Data directory ensured: ${dataDir}`);
        }
        catch (error) {
            this.context?.logger.error(`Failed to create data directory: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get the full path to the data directory
     * @internal
     */
    getDataDirectory() {
        let dataDir = this.config.dataDir;
        // Handle relative paths and home directory expansion
        if (dataDir.startsWith('~')) {
            dataDir = join(homedir(), dataDir.slice(1));
        }
        else if (!dataDir.startsWith('/')) {
            dataDir = resolve(process.cwd(), dataDir);
        }
        return join(dataDir, 'lrh', 'datasets');
    }
    /**
     * Generate a unique dataset ID for a response
     * @internal
     */
    generateDatasetId(toolName, timestamp) {
        const hash = createHash('md5')
            .update(`${toolName}-${timestamp}-${Math.random()}`)
            .digest('hex')
            .substring(0, 8);
        return `dataset_${hash}`;
    }
    /**
     * Get the file paths for a dataset
     * @internal
     */
    getDatasetPaths(datasetId, timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const sessionDir = join(this.getDataDirectory(), String(year), month, day);
        return {
            dataFile: join(sessionDir, `${datasetId}.json`),
            schemaFile: join(sessionDir, `${datasetId}.schema.json`),
            duckdbFile: join(sessionDir, `${datasetId}.duckdb`),
            metadataFile: join(sessionDir, `${datasetId}.metadata.json`),
            sessionDir
        };
    }
    /**
     * Track progress tokens from incoming requests
     * @internal
     */
    async trackProgressToken(message) {
        // Check if request has a progress token
        if (message.id && message.params?._meta?.progressToken) {
            this.progressTokens.set(message.id, message.params._meta.progressToken);
            this.context?.logger.debug(`Tracked progress token ${message.params._meta.progressToken} for request ${message.id}`);
        }
        return message;
    }
    /**
     * Send MCP progress notification through the proxy
     * @internal
     */
    async sendProgressNotification(notification) {
        if (!this.context)
            return;
        // Use the injected notification service if available
        if (this.context.notificationService) {
            await this.context.notificationService.sendProgress(notification);
        }
        else {
            // Fallback warning when service is not available
            this.context.logger.warn('NotificationService not available, progress notification dropped');
        }
    }
    /**
     * Handle server responses, detecting and buffering streaming responses
     * @internal
     */
    async handleServerResponse(message) {
        // Check if this is a streaming response
        if (this.isStreamingResponse(message)) {
            const requestId = message.id;
            const progressToken = this.getProgressToken(requestId);
            // Start buffering if this is the first chunk
            if (!this.streamingBuffer?.isBuffering(requestId)) {
                this.streamingBuffer?.startBuffering(requestId, message.result?.method, progressToken);
            }
            // Add chunk to buffer
            await this.streamingBuffer?.addChunk(requestId, message.result);
            // If this is the final chunk, process the complete response
            if (this.isStreamingComplete(message)) {
                const chunks = this.streamingBuffer?.completeBuffering(requestId) || [];
                const completeResponse = this.assembleStreamedResponse(chunks);
                // Clean up progress token
                this.progressTokens.delete(requestId);
                // Apply large response handling if needed
                if (this.shouldHandleResponse(completeResponse)) {
                    return this.processLargeResponse(message, completeResponse);
                }
                // Return the assembled response
                return {
                    ...message,
                    result: completeResponse
                };
            }
            // For intermediate chunks, return as-is
            return message;
        }
        // For non-streaming responses, check if they need handling
        if (this.shouldHandleResponse(message.result)) {
            return this.processLargeResponse(message, message.result);
        }
        return message;
    }
    /**
     * Check if a message is a streaming response
     * @internal
     */
    isStreamingResponse(message) {
        return message.result?.isPartial === true ||
            message.result?.isPartial === false;
    }
    /**
     * Check if streaming is complete
     * @internal
     */
    isStreamingComplete(message) {
        return message.result?.isPartial === false;
    }
    /**
     * Get progress token for a request
     * @internal
     */
    getProgressToken(requestId) {
        return this.progressTokens.get(requestId);
    }
    /**
     * Assemble chunks into complete response
     * @internal
     */
    assembleStreamedResponse(chunks) {
        // If chunks contain partial data arrays, concatenate them
        if (chunks.length === 0)
            return null;
        const firstChunk = chunks[0];
        if (Array.isArray(firstChunk?.data)) {
            // Concatenate all data arrays
            const allData = chunks.flatMap(chunk => chunk.data || []);
            return {
                ...firstChunk,
                data: allData,
                isPartial: false
            };
        }
        // For other formats, return the last chunk as complete
        return chunks[chunks.length - 1];
    }
    /**
     * Check if response should be handled as large
     * @internal
     */
    shouldHandleResponse(response) {
        if (!response)
            return false;
        try {
            const size = Buffer.byteLength(this.safeJsonStringify(response), 'utf8');
            return size > this.config.threshold;
        }
        catch {
            // If we can't serialize it, assume it's large
            return true;
        }
    }
    /**
     * Safely stringify JSON, handling circular references
     * @internal
     */
    safeJsonStringify(obj, space) {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }
            return value;
        }, space);
    }
    /**
     * Generate JSON schema from response data
     * @internal
     */
    async generateSchema(response) {
        try {
            // Prepare sample data for schema generation
            let sampleData;
            if (Array.isArray(response)) {
                // For arrays, sample first 100 records to avoid performance issues
                sampleData = response.slice(0, 100);
                // If array is empty, return array schema
                if (sampleData.length === 0) {
                    return {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        type: 'array',
                        title: 'Response Array',
                        description: 'Empty array response'
                    };
                }
            }
            else {
                sampleData = response;
            }
            // Generate schema from data structure
            const schema = this.inferSchema(sampleData);
            this.context?.logger.debug('Generated JSON schema for response data');
            return {
                $schema: 'http://json-schema.org/draft-07/schema#',
                title: 'Response Schema',
                description: 'Auto-generated schema from response data',
                ...schema
            };
        }
        catch (error) {
            this.context?.logger.warn(`Failed to generate schema: ${error.message}`);
            // Return a basic schema as fallback
            return {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: Array.isArray(response) ? 'array' : 'object',
                title: 'Generated Schema (Fallback)',
                description: 'Basic schema generated due to analysis error'
            };
        }
    }
    /**
     * Infer JSON schema from data structure
     * @internal
     */
    inferSchema(data) {
        if (data === null) {
            return { type: 'null' };
        }
        if (Array.isArray(data)) {
            const itemSchemas = data.slice(0, 10).map(item => this.inferSchema(item));
            // If all items have the same schema, use that
            if (itemSchemas.length > 0) {
                const firstSchema = itemSchemas[0];
                const allSame = itemSchemas.every(schema => JSON.stringify(schema) === JSON.stringify(firstSchema));
                if (allSame) {
                    return {
                        type: 'array',
                        items: firstSchema
                    };
                }
            }
            return {
                type: 'array',
                items: { type: 'object' }
            };
        }
        if (typeof data === 'object') {
            const properties = {};
            const required = [];
            for (const [key, value] of Object.entries(data)) {
                properties[key] = this.inferSchema(value);
                if (value !== null && value !== undefined) {
                    required.push(key);
                }
            }
            return {
                type: 'object',
                properties,
                ...(required.length > 0 ? { required } : {})
            };
        }
        if (typeof data === 'string') {
            // Check if it looks like a date
            if (/^\d{4}-\d{2}-\d{2}/.test(data)) {
                return { type: 'string', format: 'date-time' };
            }
            return { type: 'string' };
        }
        if (typeof data === 'number') {
            return Number.isInteger(data) ? { type: 'integer' } : { type: 'number' };
        }
        if (typeof data === 'boolean') {
            return { type: 'boolean' };
        }
        return { type: 'string' };
    }
    /**
     * Create DuckDB database from JSON file
     * @internal
     */
    async createDuckDBDatabase(dataFile, datasetId) {
        const duckdbPath = dataFile.replace('.json', '.duckdb');
        try {
            this.context?.logger.info(`Creating DuckDB database: ${duckdbPath}`);
            // Create DuckDB database instance
            const db = new Database(duckdbPath);
            // Generate table name from dataset ID (ensure it's a valid SQL identifier)
            const tableName = datasetId.replace(/[^a-zA-Z0-9_]/g, '_');
            // Create table from JSON file using DuckDB's read_json_auto function
            const createTableQuery = `
        CREATE TABLE ${tableName} AS 
        SELECT * FROM read_json_auto('${dataFile}')
      `;
            await this.executeDuckDBQuery(db, createTableQuery);
            this.context?.logger.debug(`Created table ${tableName} from ${dataFile}`);
            // Get table metadata
            const rowCountQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
            const rowCountResult = await this.executeDuckDBQuery(db, rowCountQuery);
            const rowCount = rowCountResult[0]?.count || 0;
            // Get column information
            const columnsQuery = `DESCRIBE ${tableName}`;
            const columnsResult = await this.executeDuckDBQuery(db, columnsQuery);
            const columns = columnsResult.map((col) => ({
                name: col.column_name,
                type: col.column_type
            }));
            // Create indexes on common fields
            const indexes = await this.createIndexes(db, tableName, columns);
            // Generate sample queries
            const sampleQueries = this.generateSampleQueries(tableName, columns, rowCount);
            // Close database connection
            db.close();
            const databaseInfo = {
                path: duckdbPath,
                tableName,
                rowCount,
                columns,
                indexes,
                sampleQueries
            };
            this.context?.logger.info(`DuckDB database created successfully: ${tableName} (${rowCount} rows, ${columns.length} columns)`);
            return databaseInfo;
        }
        catch (error) {
            this.context?.logger.error(`Failed to create DuckDB database: ${error.message}`);
            throw new Error(`DuckDB database creation failed: ${error.message}`);
        }
    }
    /**
     * Execute DuckDB query with proper error handling
     * @internal
     */
    async executeDuckDBQuery(db, query) {
        return new Promise((resolve, reject) => {
            db.all(query, (error, result) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(result);
                }
            });
        });
    }
    /**
     * Create indexes on common fields
     * @internal
     */
    async createIndexes(db, tableName, columns) {
        const indexes = [];
        // Common field names that benefit from indexing
        const commonIndexFields = ['id', 'name', 'timestamp', 'date', 'created_at', 'updated_at', 'status'];
        for (const column of columns) {
            const columnName = column.name.toLowerCase();
            // Create index if it's a common field or looks like an ID
            if (commonIndexFields.includes(columnName) || columnName.endsWith('_id')) {
                const indexName = `idx_${tableName}_${column.name}`;
                const indexQuery = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${column.name})`;
                try {
                    await this.executeDuckDBQuery(db, indexQuery);
                    indexes.push(indexName);
                    this.context?.logger.debug(`Created index: ${indexName}`);
                }
                catch (error) {
                    this.context?.logger.warn(`Failed to create index ${indexName}: ${error.message}`);
                }
            }
        }
        return indexes;
    }
    /**
     * Generate sample queries for the dataset
     * @internal
     */
    generateSampleQueries(tableName, columns, rowCount) {
        const queries = [
            `SELECT * FROM ${tableName} LIMIT 10;`,
            `SELECT COUNT(*) as total_rows FROM ${tableName};`
        ];
        // Add column-specific queries
        const numericColumns = columns.filter(col => col.type.includes('INT') || col.type.includes('DOUBLE') || col.type.includes('FLOAT'));
        if (numericColumns.length > 0) {
            const firstNumeric = numericColumns[0].name;
            queries.push(`SELECT AVG(${firstNumeric}) as avg_${firstNumeric}, MIN(${firstNumeric}) as min_${firstNumeric}, MAX(${firstNumeric}) as max_${firstNumeric} FROM ${tableName};`);
        }
        // Add grouping query if reasonable number of rows
        if (rowCount > 10 && rowCount < 1000000) {
            const categoricalColumns = columns.filter(col => col.type.includes('VARCHAR') || col.type.includes('STRING'));
            if (categoricalColumns.length > 0) {
                const firstCategorical = categoricalColumns[0].name;
                queries.push(`SELECT ${firstCategorical}, COUNT(*) as count FROM ${tableName} GROUP BY ${firstCategorical} ORDER BY count DESC LIMIT 10;`);
            }
        }
        // Add time-based query if date columns exist
        const dateColumns = columns.filter(col => col.name.toLowerCase().includes('date') ||
            col.name.toLowerCase().includes('time') ||
            col.type.includes('TIMESTAMP'));
        if (dateColumns.length > 0) {
            const firstDate = dateColumns[0].name;
            queries.push(`SELECT DATE_TRUNC('day', ${firstDate}) as date, COUNT(*) as count FROM ${tableName} GROUP BY DATE_TRUNC('day', ${firstDate}) ORDER BY date DESC LIMIT 10;`);
        }
        return queries;
    }
    /**
     * Process large response - persist to disk and return metadata
     * @internal
     */
    async processLargeResponse(message, response) {
        try {
            const timestamp = Date.now();
            const responseSize = Buffer.byteLength(this.safeJsonStringify(response), 'utf8');
            // Extract tool name from message context
            const toolName = message.result?.method || 'unknown_tool';
            // Generate unique dataset ID
            const datasetId = this.generateDatasetId(toolName, timestamp);
            // Get file paths for this dataset
            const paths = this.getDatasetPaths(datasetId, timestamp);
            // Create session directory structure
            await mkdir(paths.sessionDir, { recursive: true });
            // Generate schema for the response data
            const schema = await this.generateSchema(response);
            // Persist JSON data to disk
            await writeFile(paths.dataFile, this.safeJsonStringify(response, 2), 'utf8');
            // Persist schema to disk
            await writeFile(paths.schemaFile, JSON.stringify(schema, null, 2), 'utf8');
            // Create metadata object
            const metadata = {
                datasetId,
                timestamp,
                toolName,
                responseSize,
                originalMessageId: message.id,
                files: {
                    dataFile: paths.dataFile,
                    schemaFile: paths.schemaFile,
                    duckdbFile: this.config.enableDuckDB ? paths.duckdbFile : null,
                    metadataFile: paths.metadataFile
                },
                schema: {
                    type: schema.type,
                    title: schema.title,
                    description: schema.description
                },
                stats: {
                    recordCount: Array.isArray(response) ? response.length : 1,
                    sizeBytes: responseSize,
                    compressionEnabled: this.config.compressionLevel > 0
                }
            };
            // Create DuckDB database if enabled
            let databaseInfo = null;
            if (this.config.enableDuckDB) {
                try {
                    databaseInfo = await this.createDuckDBDatabase(paths.dataFile, datasetId);
                    this.context?.logger.info(`DuckDB database created for dataset ${datasetId}`);
                }
                catch (error) {
                    this.context?.logger.warn(`Failed to create DuckDB database for ${datasetId}: ${error.message}`);
                }
            }
            // Persist metadata to disk
            await writeFile(paths.metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
            // Log successful persistence
            this.context?.logger.info(`Large response persisted: ${responseSize} bytes → ${datasetId} (${paths.dataFile})`);
            // Return structured metadata response instead of original message
            return {
                ...message,
                result: {
                    status: 'success_file_saved',
                    message: `Large response (${responseSize} bytes) persisted to disk`,
                    dataset: {
                        id: datasetId,
                        size: responseSize,
                        recordCount: metadata.stats.recordCount,
                        files: {
                            data: paths.dataFile,
                            schema: paths.schemaFile,
                            metadata: paths.metadataFile,
                            ...(databaseInfo ? { duckdb: databaseInfo.path } : {})
                        },
                        ...(databaseInfo ? {
                            database: {
                                path: databaseInfo.path,
                                tableName: databaseInfo.tableName,
                                rowCount: databaseInfo.rowCount,
                                columns: databaseInfo.columns,
                                indexes: databaseInfo.indexes,
                                sampleQueries: databaseInfo.sampleQueries
                            }
                        } : {})
                    },
                    availableTools: [
                        'mcpmon_analyze-with-duckdb',
                        'mcpmon_list-saved-datasets'
                    ],
                    nextSteps: [
                        `Use mcpmon_analyze-with-duckdb with datasetId "${datasetId}" to query the data`,
                        'Use mcpmon_list-saved-datasets to see all persisted datasets'
                    ]
                }
            };
        }
        catch (error) {
            this.context?.logger.error(`Failed to process large response: ${error.message}`);
            // Return error response but still preserve original message structure
            return {
                ...message,
                result: {
                    status: 'error',
                    message: `Failed to persist large response: ${error.message}`,
                    originalResponse: response
                }
            };
        }
    }
    /**
     * Provide additional MCP tools
     * @internal
     */
    async getAdditionalTools() {
        return [
            {
                name: 'mcpmon_analyze-with-duckdb',
                description: 'Analyze persisted large response data using DuckDB SQL queries',
                inputSchema: {
                    type: 'object',
                    properties: {
                        datasetId: {
                            type: 'string',
                            description: 'ID of the persisted dataset (optional - will use latest dataset if not provided)'
                        },
                        query: {
                            type: 'string',
                            description: 'SQL query to run against the dataset'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'mcpmon_list-saved-datasets',
                description: 'List all saved large response datasets',
                inputSchema: {
                    type: 'object',
                    properties: {
                        filter: {
                            type: 'object',
                            properties: {
                                date_from: {
                                    type: 'string',
                                    format: 'date',
                                    description: 'Filter datasets from this date (YYYY-MM-DD)'
                                },
                                date_to: {
                                    type: 'string',
                                    format: 'date',
                                    description: 'Filter datasets to this date (YYYY-MM-DD)'
                                },
                                tool: {
                                    type: 'string',
                                    description: 'Filter datasets by tool name'
                                }
                            }
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of datasets to return'
                        }
                    }
                }
            }
        ];
    }
    /**
     * List saved datasets with optional filtering
     * @internal
     */
    async listSavedDatasets(filter, limit) {
        try {
            const dataDir = this.getDataDirectory();
            const datasets = await this.scanDatasets(dataDir);
            // Apply filtering
            let filteredDatasets = datasets;
            if (filter) {
                filteredDatasets = datasets.filter(dataset => {
                    // Date filtering
                    if (filter.date_from || filter.date_to) {
                        const datasetDate = new Date(dataset.timestamp);
                        const fromDate = filter.date_from ? new Date(filter.date_from) : null;
                        const toDate = filter.date_to ? new Date(filter.date_to) : null;
                        if (fromDate && datasetDate < fromDate)
                            return false;
                        if (toDate && datasetDate > toDate)
                            return false;
                    }
                    // Tool filtering
                    if (filter.tool && dataset.tool !== filter.tool)
                        return false;
                    return true;
                });
            }
            // Sort by timestamp (newest first)
            filteredDatasets.sort((a, b) => b.timestamp - a.timestamp);
            // Apply limit
            if (limit && limit > 0) {
                filteredDatasets = filteredDatasets.slice(0, limit);
            }
            return {
                datasets: filteredDatasets,
                total: filteredDatasets.length,
                filtered: datasets.length !== filteredDatasets.length
            };
        }
        catch (error) {
            this.context?.logger.error(`Error listing datasets: ${error.message}`);
            return {
                error: `Failed to list datasets: ${error.message}`,
                datasets: []
            };
        }
    }
    /**
     * Recursively scan data directory for datasets
     * @internal
     */
    async scanDatasets(dataDir) {
        const datasets = [];
        try {
            // Check if data directory exists
            const dirStat = await stat(dataDir);
            if (!dirStat.isDirectory()) {
                return datasets;
            }
            // Scan year directories
            const yearDirs = await readdir(dataDir);
            for (const year of yearDirs) {
                const yearPath = join(dataDir, year);
                const yearStat = await stat(yearPath);
                if (!yearStat.isDirectory())
                    continue;
                // Scan month directories
                const monthDirs = await readdir(yearPath);
                for (const month of monthDirs) {
                    const monthPath = join(yearPath, month);
                    const monthStat = await stat(monthPath);
                    if (!monthStat.isDirectory())
                        continue;
                    // Scan day directories
                    const dayDirs = await readdir(monthPath);
                    for (const day of dayDirs) {
                        const dayPath = join(monthPath, day);
                        const dayStat = await stat(dayPath);
                        if (!dayStat.isDirectory())
                            continue;
                        // Scan files in day directory
                        const files = await readdir(dayPath);
                        const metadataFiles = files.filter(f => f.endsWith('.metadata.json'));
                        for (const metadataFile of metadataFiles) {
                            const metadataPath = join(dayPath, metadataFile);
                            const datasetId = metadataFile.replace('.metadata.json', '');
                            try {
                                const metadata = await this.readDatasetMetadata(metadataPath);
                                const dataFilePath = join(dayPath, `${datasetId}.json`);
                                // Get file size
                                let size = 0;
                                try {
                                    const dataFileStat = await stat(dataFilePath);
                                    size = dataFileStat.size;
                                }
                                catch {
                                    // Data file might not exist, use metadata size if available
                                    size = metadata.size || 0;
                                }
                                datasets.push({
                                    id: datasetId,
                                    timestamp: metadata.timestamp,
                                    tool: metadata.tool,
                                    size,
                                    recordCount: metadata.recordCount,
                                    path: dayPath
                                });
                            }
                            catch (error) {
                                this.context?.logger.warn(`Failed to read metadata for ${datasetId}: ${error.message}`);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            this.context?.logger.error(`Error scanning data directory: ${error.message}`);
        }
        return datasets;
    }
    /**
     * Read dataset metadata from metadata.json file
     * @internal
     */
    async readDatasetMetadata(metadataPath) {
        try {
            const metadataContent = await readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataContent);
            return {
                timestamp: metadata.timestamp || 0,
                tool: metadata.tool || 'unknown',
                size: metadata.size,
                recordCount: metadata.recordCount || 0,
                ...metadata
            };
        }
        catch (error) {
            throw new Error(`Failed to read metadata: ${error.message}`);
        }
    }
    /**
     * Analyze dataset using DuckDB SQL queries
     * @internal
     */
    async analyzeWithDuckDB(datasetId, query) {
        try {
            // Validate inputs
            if (!query) {
                return {
                    error: 'query is required'
                };
            }
            // Validate SQL query for safety
            const sanitizedQuery = query.trim();
            if (!this.isValidSQLQuery(sanitizedQuery)) {
                return {
                    error: 'Invalid or unsafe SQL query. Only SELECT statements are allowed.'
                };
            }
            // Find the dataset (use provided ID or latest)
            let dataset;
            if (datasetId) {
                dataset = await this.findDataset(datasetId);
                if (!dataset) {
                    return {
                        error: `Dataset '${datasetId}' not found`
                    };
                }
            }
            else {
                dataset = await this.findLatestDataset();
                if (!dataset) {
                    return {
                        error: 'No datasets found. Create a dataset first by triggering a large response.'
                    };
                }
            }
            // Get the DuckDB database path
            const duckdbPath = this.getDuckDBPath(dataset.id, dataset.timestamp);
            // Check if DuckDB file exists
            try {
                await stat(duckdbPath);
            }
            catch (error) {
                return {
                    error: `DuckDB database not found for dataset '${datasetId}'. The database may not have been created or the dataset may be corrupted.`
                };
            }
            // Execute the query
            const db = new Database(duckdbPath);
            try {
                const results = await this.executeDuckDBQuery(db, sanitizedQuery);
                return {
                    success: true,
                    datasetId: dataset.id,
                    query: sanitizedQuery,
                    results,
                    rowCount: results.length,
                    executedAt: new Date().toISOString()
                };
            }
            finally {
                db.close();
            }
        }
        catch (error) {
            this.context?.logger.error(`DuckDB query failed: ${error.message}`);
            return {
                error: `Query execution failed: ${error.message}`
            };
        }
    }
    /**
     * Validate SQL query for safety - only allow SELECT statements
     * @internal
     */
    isValidSQLQuery(query) {
        // Remove comments and normalize whitespace
        const cleanQuery = query
            .replace(/--.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .trim()
            .toLowerCase();
        // Must start with SELECT
        if (!cleanQuery.startsWith('select')) {
            return false;
        }
        // Disallow potentially dangerous operations
        const forbidden = [
            'drop', 'delete', 'update', 'insert', 'create', 'alter',
            'truncate', 'replace', 'merge', 'call', 'exec', 'execute',
            'pragma', 'attach', 'detach'
        ];
        for (const keyword of forbidden) {
            if (cleanQuery.includes(keyword)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Find dataset by ID
     * @internal
     */
    async findDataset(datasetId) {
        try {
            const dataDir = this.getDataDirectory();
            const datasets = await this.scanDatasets(dataDir);
            const dataset = datasets.find(d => d.id === datasetId);
            if (!dataset) {
                return null;
            }
            return {
                id: dataset.id,
                timestamp: dataset.timestamp,
                path: dataset.path
            };
        }
        catch (error) {
            this.context?.logger.error(`Failed to find dataset ${datasetId}: ${error.message}`);
            return null;
        }
    }
    /**
     * Find the latest dataset (most recent timestamp)
     * @internal
     */
    async findLatestDataset() {
        try {
            const dataDir = this.getDataDirectory();
            const datasets = await this.scanDatasets(dataDir);
            if (datasets.length === 0) {
                return null;
            }
            // Sort by timestamp descending (newest first)
            const sortedDatasets = datasets.sort((a, b) => b.timestamp - a.timestamp);
            const latest = sortedDatasets[0];
            return {
                id: latest.id,
                timestamp: latest.timestamp,
                path: latest.path
            };
        }
        catch (error) {
            this.context?.logger.error(`Failed to find latest dataset: ${error.message}`);
            return null;
        }
    }
    /**
     * Get DuckDB database path for a dataset
     * @internal
     */
    getDuckDBPath(datasetId, timestamp) {
        const paths = this.getDatasetPaths(datasetId, timestamp);
        return paths.duckdbFile;
    }
    /**
     * Handle tool calls for LRH-specific tools
     * @internal
     */
    async handleToolCall(toolName, args) {
        switch (toolName) {
            case 'mcpmon_analyze-with-duckdb':
                return await this.analyzeWithDuckDB(args.datasetId, args.query);
            case 'mcpmon_list-saved-datasets':
                return await this.listSavedDatasets(args.filter, args.limit);
            default:
                // Not our tool
                return null;
        }
    }
}
// Export the class as the default export
export default LargeResponseHandlerExtension;
// Also export the class as a named export for flexibility
export { LargeResponseHandlerExtension };
