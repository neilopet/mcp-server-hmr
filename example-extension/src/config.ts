/**
 * Configuration schema for RequestLoggerExtension
 */

export interface RequestLoggerConfig {
  /** Maximum number of requests to keep in memory */
  maxRequests: number;
  
  /** Whether to log request bodies */
  logRequestBodies: boolean;
  
  /** Whether to log response bodies */
  logResponseBodies: boolean;
  
  /** Log level (debug, info, warn, error) */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  /** File path to write logs to (optional) */
  logFilePath?: string;
  
  /** Request patterns to exclude from logging */
  excludePatterns: string[];
  
  /** Whether to include timestamps in logs */
  includeTimestamps: boolean;
  
  /** Whether to pretty-print JSON in logs */
  prettyPrint: boolean;
}

export const defaultConfig: RequestLoggerConfig = {
  maxRequests: 1000,
  logRequestBodies: true,
  logResponseBodies: true,
  logLevel: 'info',
  excludePatterns: [],
  includeTimestamps: true,
  prettyPrint: true,
};

export function validateConfig(config: Partial<RequestLoggerConfig>): RequestLoggerConfig {
  const validatedConfig = { ...defaultConfig, ...config };
  
  if (validatedConfig.maxRequests <= 0) {
    throw new Error('maxRequests must be greater than 0');
  }
  
  if (!['debug', 'info', 'warn', 'error'].includes(validatedConfig.logLevel)) {
    throw new Error('logLevel must be one of: debug, info, warn, error');
  }
  
  return validatedConfig;
}