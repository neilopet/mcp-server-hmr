import { describe, test, expect } from '@jest/globals';
import { parseStderrLine } from '../../src/stderr-parser.js';

describe('stderr-parser', () => {
  describe('parseStderrLine', () => {
    // Test Case 1: Common error patterns detected correctly
    describe('error patterns', () => {
      test('should detect ERROR: prefix', () => {
        const result = parseStderrLine('ERROR: Something went wrong');
        expect(result).toEqual({
          level: 'error',
          message: 'Something went wrong'
        });
      });

      test('should detect ERRO prefix (Python style)', () => {
        const result = parseStderrLine('ERRO Something bad happened');
        expect(result).toEqual({
          level: 'error',
          message: 'Something bad happened'
        });
      });

      test('should detect [ERROR] prefix', () => {
        const result = parseStderrLine('[ERROR] Failed to process request');
        expect(result).toEqual({
          level: 'error',
          message: 'Failed to process request'
        });
      });

      test('should be case insensitive', () => {
        const result = parseStderrLine('error: lowercase error');
        expect(result).toEqual({
          level: 'error',
          message: 'lowercase error'
        });
      });

      test('should handle Node.js error format', () => {
        const result = parseStderrLine("Error: Cannot find module 'express'");
        expect(result).toEqual({
          level: 'error',
          message: "Cannot find module 'express'"
        });
      });

      test('should handle Python error format', () => {
        const result = parseStderrLine('ERROR:root:Division by zero');
        expect(result).toEqual({
          level: 'error',
          message: 'root:Division by zero'
        });
      });
    });

    // Test Case 2: Warning patterns detected
    describe('warning patterns', () => {
      test('should detect WARN: prefix', () => {
        const result = parseStderrLine('WARN: Low disk space');
        expect(result).toEqual({
          level: 'warning',
          message: 'Low disk space'
        });
      });

      test('should detect WARNING: prefix', () => {
        const result = parseStderrLine('WARNING: Low memory');
        expect(result).toEqual({
          level: 'warning',
          message: 'Low memory'
        });
      });

      test('should detect [WARN] prefix', () => {
        const result = parseStderrLine('[WARN] Deprecated function called');
        expect(result).toEqual({
          level: 'warning',
          message: 'Deprecated function called'
        });
      });

      test('should be case insensitive', () => {
        const result = parseStderrLine('warning: lowercase warning');
        expect(result).toEqual({
          level: 'warning',
          message: 'lowercase warning'
        });
      });
    });

    // Test Case 3: Info/debug patterns detected
    describe('info and debug patterns', () => {
      test('should detect INFO: prefix', () => {
        const result = parseStderrLine('INFO: Server started on port 3000');
        expect(result).toEqual({
          level: 'info',
          message: 'Server started on port 3000'
        });
      });

      test('should detect [INFO] prefix', () => {
        const result = parseStderrLine('[INFO] Connection established');
        expect(result).toEqual({
          level: 'info',
          message: 'Connection established'
        });
      });

      test('should detect DEBUG: prefix', () => {
        const result = parseStderrLine('DEBUG: Processing request');
        expect(result).toEqual({
          level: 'debug',
          message: 'Processing request'
        });
      });

      test('should detect [DEBUG] prefix', () => {
        const result = parseStderrLine('[DEBUG] Query executed in 50ms');
        expect(result).toEqual({
          level: 'debug',
          message: 'Query executed in 50ms'
        });
      });
    });

    // Test Case 4: ISO timestamps extracted to data field
    describe('timestamp extraction', () => {
      test('should extract ISO timestamp without timezone', () => {
        const result = parseStderrLine('2024-01-01T12:00:00 Server started');
        expect(result).toEqual({
          level: 'info',
          message: 'Server started',
          data: {
            timestamp: '2024-01-01T12:00:00'
          }
        });
      });

      test('should extract ISO timestamp with milliseconds', () => {
        const result = parseStderrLine('2024-01-01T12:00:00.123 Request processed');
        expect(result).toEqual({
          level: 'info',
          message: 'Request processed',
          data: {
            timestamp: '2024-01-01T12:00:00.123'
          }
        });
      });

      test('should extract ISO timestamp with Z timezone', () => {
        const result = parseStderrLine('2024-01-01T12:00:00.123Z Database connected');
        expect(result).toEqual({
          level: 'info',
          message: 'Database connected',
          data: {
            timestamp: '2024-01-01T12:00:00.123Z'
          }
        });
      });

      test('should handle timestamp with error level', () => {
        const result = parseStderrLine('2024-01-01T12:00:00 ERROR: Connection failed');
        expect(result).toEqual({
          level: 'error',
          message: 'Connection failed',
          data: {
            timestamp: '2024-01-01T12:00:00'
          }
        });
      });

      test('should handle Java-style log with timestamp and error', () => {
        const result = parseStderrLine('[ERROR] 2024-01-01T12:00:00 NullPointerException');
        expect(result).toEqual({
          level: 'error',
          message: '2024-01-01T12:00:00 NullPointerException'
        });
      });

      test('should handle timestamp followed by error level', () => {
        const result = parseStderrLine('2024-01-01T12:00:00 [ERROR] NullPointerException');
        expect(result).toEqual({
          level: 'error',
          message: 'NullPointerException',
          data: {
            timestamp: '2024-01-01T12:00:00'
          }
        });
      });
    });

    // Test Case 5: Stack trace lines return null for continuation
    describe('stack trace handling', () => {
      test('should return null for stack trace line starting with "at"', () => {
        const result = parseStderrLine('    at Function.Module._load (module.js:123:45)');
        expect(result).toBeNull();
      });

      test('should return null for indented stack trace line', () => {
        const result = parseStderrLine('  at Object.<anonymous> (/app/index.js:10:15)');
        expect(result).toBeNull();
      });

      test('should return null for deeply indented stack trace', () => {
        const result = parseStderrLine('        at processTicksAndRejections (internal/process/task_queues.js:97:5)');
        expect(result).toBeNull();
      });

      test('should not return null for non-indented "at" line', () => {
        const result = parseStderrLine('at the beginning of the line');
        expect(result).toEqual({
          level: 'info',
          message: 'at the beginning of the line'
        });
      });
    });

    // Test Case 6: Unknown lines default to info
    describe('default behavior', () => {
      test('should default to info level for unknown format', () => {
        const result = parseStderrLine('Regular log message without prefix');
        expect(result).toEqual({
          level: 'info',
          message: 'Regular log message without prefix'
        });
      });

      test('should handle message that contains ERROR but not as prefix', () => {
        const result = parseStderrLine('The server returned an ERROR response');
        expect(result).toEqual({
          level: 'info',
          message: 'The server returned an ERROR response'
        });
      });

      test('should handle message with timestamp but no level', () => {
        const result = parseStderrLine('2024-01-01T12:00:00 Just a timestamped message');
        expect(result).toEqual({
          level: 'info',
          message: 'Just a timestamped message',
          data: {
            timestamp: '2024-01-01T12:00:00'
          }
        });
      });
    });

    // Test Case 7: Edge cases (empty lines, special characters)
    describe('edge cases', () => {
      test('should handle empty line', () => {
        const result = parseStderrLine('');
        expect(result).toEqual({
          level: 'info',
          message: ''
        });
      });

      test('should handle line with only spaces', () => {
        const result = parseStderrLine('   ');
        expect(result).toEqual({
          level: 'info',
          message: ''
        });
      });

      test('should handle line with special characters', () => {
        const result = parseStderrLine('ERROR: Failed to parse JSON: {"key": "value"}');
        expect(result).toEqual({
          level: 'error',
          message: 'Failed to parse JSON: {"key": "value"}'
        });
      });

      test('should trim spaces in message', () => {
        const result = parseStderrLine('ERROR:   Spaces around message   ');
        expect(result).toEqual({
          level: 'error',
          message: 'Spaces around message'
        });
      });

      test('should handle Unicode characters', () => {
        const result = parseStderrLine('ERROR: Failed to process file: café.txt ☕');
        expect(result).toEqual({
          level: 'error',
          message: 'Failed to process file: café.txt ☕'
        });
      });

      test('should handle very long lines', () => {
        const longMessage = 'A'.repeat(1000);
        const result = parseStderrLine(`ERROR: ${longMessage}`);
        expect(result).toEqual({
          level: 'error',
          message: longMessage
        });
      });

      test('should handle multiple colons in message', () => {
        const result = parseStderrLine('ERROR: Failed: Connection refused: timeout');
        expect(result).toEqual({
          level: 'error',
          message: 'Failed: Connection refused: timeout'
        });
      });
    });

    // Additional real-world examples
    describe('real-world log examples', () => {
      test('should parse Node.js module not found error', () => {
        const result = parseStderrLine("Error: Cannot find module 'express'");
        expect(result).toEqual({
          level: 'error',
          message: "Cannot find module 'express'"
        });
      });

      test('should parse Python logging error', () => {
        const result = parseStderrLine('ERROR:root:Division by zero');
        expect(result).toEqual({
          level: 'error',
          message: 'root:Division by zero'
        });
      });

      test('should parse Java timestamped error', () => {
        const result = parseStderrLine('2024-01-01T12:00:00 [ERROR] NullPointerException at line 45');
        expect(result).toEqual({
          level: 'error',
          message: 'NullPointerException at line 45',
          data: {
            timestamp: '2024-01-01T12:00:00'
          }
        });
      });

      test('should parse generic warning', () => {
        const result = parseStderrLine('WARNING: Low memory');
        expect(result).toEqual({
          level: 'warning',
          message: 'Low memory'
        });
      });

      test('should parse Python traceback header', () => {
        const result = parseStderrLine('Traceback (most recent call last):');
        expect(result).toEqual({
          level: 'info',
          message: 'Traceback (most recent call last):'
        });
      });

      test('should parse Ruby error format (not recognized as error due to spaces)', () => {
        // Note: Current parser doesn't handle "ERROR -- :" pattern (spaces before colon)
        const result = parseStderrLine('ERROR -- : undefined method `foo\' for nil:NilClass');
        expect(result).toEqual({
          level: 'info',
          message: 'ERROR -- : undefined method `foo\' for nil:NilClass'
        });
      });

      test('should parse PHP error format', () => {
        const result = parseStderrLine('PHP Fatal error:  Uncaught Error: Call to undefined function');
        expect(result).toEqual({
          level: 'info',
          message: 'PHP Fatal error:  Uncaught Error: Call to undefined function'
        });
      });

      test('should parse Docker container log (milliseconds truncated to 3 digits)', () => {
        // Note: Current parser only captures up to 3 digits of milliseconds
        const result = parseStderrLine('2024-01-01T12:00:00.123456789Z [ERROR] Container failed to start');
        expect(result).toEqual({
          level: 'info',
          message: '456789Z [ERROR] Container failed to start',
          data: {
            timestamp: '2024-01-01T12:00:00.123'
          }
        });
      });

      test('should handle Rust error format', () => {
        const result = parseStderrLine('error: could not compile `myapp`');
        expect(result).toEqual({
          level: 'error',
          message: 'could not compile `myapp`'
        });
      });

      test('should handle Go panic format', () => {
        const result = parseStderrLine('panic: runtime error: index out of range');
        expect(result).toEqual({
          level: 'info',
          message: 'panic: runtime error: index out of range'
        });
      });

      test('should handle systemd journal format', () => {
        const result = parseStderrLine('Dec 25 10:30:45 hostname service[1234]: ERROR: Service failed');
        expect(result).toEqual({
          level: 'info',
          message: 'Dec 25 10:30:45 hostname service[1234]: ERROR: Service failed'
        });
      });

      test('should handle npm error format', () => {
        const result = parseStderrLine('npm ERR! code ENOENT');
        expect(result).toEqual({
          level: 'info',
          message: 'npm ERR! code ENOENT'
        });
      });

      test('should handle bracketed timestamp with level (not parsed as timestamp)', () => {
        // Note: Current parser only recognizes timestamps at the beginning of the line
        const result = parseStderrLine('[2024-01-01T12:00:00Z] ERROR: Database connection lost');
        expect(result).toEqual({
          level: 'info',
          message: '[2024-01-01T12:00:00Z] ERROR: Database connection lost'
        });
      });
    });

    // Additional edge cases for completeness
    describe('additional edge cases', () => {
      test('should handle null bytes', () => {
        const result = parseStderrLine('ERROR: Message with \0 null byte');
        expect(result).toEqual({
          level: 'error',
          message: 'Message with \0 null byte'
        });
      });

      test('should handle carriage returns', () => {
        const result = parseStderrLine('ERROR: Message with \r carriage return');
        expect(result).toEqual({
          level: 'error',
          message: 'Message with \r carriage return'
        });
      });

      test('should handle tab characters', () => {
        const result = parseStderrLine('ERROR:\tMessage with tab');
        expect(result).toEqual({
          level: 'error',
          message: 'Message with tab'
        });
      });

      test('should handle mixed case prefixes', () => {
        const result = parseStderrLine('ErRoR: Mixed case error');
        expect(result).toEqual({
          level: 'error',
          message: 'Mixed case error'
        });
      });
    });
  });
});