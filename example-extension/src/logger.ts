/**
 * Logging utilities for RequestLoggerExtension
 */

import { RequestLoggerConfig } from './config.ts';

export interface RequestLogEntry {
  id: string;
  timestamp: Date;
  direction: 'request' | 'response';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  processingTime?: number;
}

export interface RequestStats {
  totalRequests: number;
  totalResponses: number;
  averageResponseTime: number;
  errorCount: number;
  methodCounts: Record<string, number>;
}

export class RequestLogger {
  private logs: RequestLogEntry[] = [];
  private requestStartTimes: Map<string, number> = new Map();
  private logFile?: string;

  constructor(private config: RequestLoggerConfig) {
    this.logFile = config.logFilePath;
  }

  logRequest(id: string, method: string, params?: any): void {
    if (this.shouldExclude(method)) {
      return;
    }

    const entry: RequestLogEntry = {
      id,
      timestamp: new Date(),
      direction: 'request',
      method,
      params: this.config.logRequestBodies ? params : undefined,
    };

    this.addLogEntry(entry);
    this.requestStartTimes.set(id, Date.now());
  }

  logResponse(id: string, result?: any, error?: any): void {
    const startTime = this.requestStartTimes.get(id);
    const processingTime = startTime ? Date.now() - startTime : undefined;
    
    const entry: RequestLogEntry = {
      id,
      timestamp: new Date(),
      direction: 'response',
      result: this.config.logResponseBodies ? result : undefined,
      error: this.config.logResponseBodies ? error : undefined,
      processingTime,
    };

    this.addLogEntry(entry);
    this.requestStartTimes.delete(id);
  }

  private shouldExclude(method: string): boolean {
    return this.config.excludePatterns.some(pattern => 
      new RegExp(pattern).test(method)
    );
  }

  private addLogEntry(entry: RequestLogEntry): void {
    this.logs.push(entry);
    
    // Maintain max size
    if (this.logs.length > this.config.maxRequests) {
      this.logs.shift();
    }

    // Log to console
    this.logToConsole(entry);
    
    // Log to file if configured
    if (this.logFile) {
      this.logToFile(entry);
    }
  }

  private logToConsole(entry: RequestLogEntry): void {
    const timestamp = this.config.includeTimestamps 
      ? entry.timestamp.toISOString() 
      : '';
    
    const direction = entry.direction === 'request' ? '→' : '←';
    const method = entry.method || 'response';
    
    let message = `${timestamp} ${direction} ${method}`;
    
    if (entry.processingTime) {
      message += ` (${entry.processingTime}ms)`;
    }

    if (this.config.prettyPrint && (entry.params || entry.result)) {
      const data = entry.params || entry.result;
      message += '\n' + JSON.stringify(data, null, 2);
    }

    if (entry.error) {
      console.error(message, entry.error);
    } else {
      console.log(message);
    }
  }

  private logToFile(entry: RequestLogEntry): void {
    // In a real implementation, this would write to the file
    // For this example, we'll just simulate it
    const logLine = JSON.stringify(entry) + '\n';
    // await Deno.writeTextFile(this.logFile!, logLine, { append: true });
  }

  getLogs(): RequestLogEntry[] {
    return [...this.logs];
  }

  getStats(): RequestStats {
    const requests = this.logs.filter(l => l.direction === 'request');
    const responses = this.logs.filter(l => l.direction === 'response');
    
    const responseTimes = responses
      .filter(r => r.processingTime)
      .map(r => r.processingTime!);
    
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const errorCount = responses.filter(r => r.error).length;
    
    const methodCounts: Record<string, number> = {};
    requests.forEach(req => {
      if (req.method) {
        methodCounts[req.method] = (methodCounts[req.method] || 0) + 1;
      }
    });

    return {
      totalRequests: requests.length,
      totalResponses: responses.length,
      averageResponseTime: Math.round(averageResponseTime),
      errorCount,
      methodCounts,
    };
  }

  clear(): void {
    this.logs = [];
    this.requestStartTimes.clear();
  }
}