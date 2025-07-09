/**
 * Parse stderr output line to extract log level and structured data
 */
export function parseStderrLine(line) {
    // Trim the line for consistent matching
    const trimmedLine = line.trim();
    // Check for stack trace continuation lines
    if (line.startsWith(' ') && trimmedLine.startsWith('at ')) {
        return null; // Indicates this is a continuation line
    }
    // Initialize result object
    let level = 'info'; // Default level
    let message = trimmedLine;
    const data = {};
    // Pattern 1: ERROR patterns
    if (/^(ERROR:|ERRO\b|\[ERROR\])/i.test(trimmedLine)) {
        level = 'error';
        message = trimmedLine.replace(/^(ERROR:|ERRO\b|\[ERROR\])\s*/i, '');
    }
    // Pattern 2: WARN/WARNING patterns
    else if (/^(WARN:|WARNING:|\[WARN\])/i.test(trimmedLine)) {
        level = 'warning';
        message = trimmedLine.replace(/^(WARN:|WARNING:|\[WARN\])\s*/i, '');
    }
    // Pattern 3: INFO patterns
    else if (/^(INFO:|\[INFO\])/i.test(trimmedLine)) {
        level = 'info';
        message = trimmedLine.replace(/^(INFO:|\[INFO\])\s*/i, '');
    }
    // Pattern 4: DEBUG patterns
    else if (/^(DEBUG:|\[DEBUG\])/i.test(trimmedLine)) {
        level = 'debug';
        message = trimmedLine.replace(/^(DEBUG:|\[DEBUG\])\s*/i, '');
    }
    // Pattern 5: Check for ISO timestamp at the beginning
    const timestampMatch = trimmedLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)\s*/);
    if (timestampMatch) {
        data.timestamp = timestampMatch[1];
        // Remove timestamp from the beginning of the line for further processing
        const lineWithoutTimestamp = trimmedLine.substring(timestampMatch[0].length);
        // Re-check for log level patterns after timestamp
        if (/^(ERROR:|ERRO\b|\[ERROR\])/i.test(lineWithoutTimestamp)) {
            level = 'error';
            message = lineWithoutTimestamp.replace(/^(ERROR:|ERRO\b|\[ERROR\])\s*/i, '');
        }
        else if (/^(WARN:|WARNING:|\[WARN\])/i.test(lineWithoutTimestamp)) {
            level = 'warning';
            message = lineWithoutTimestamp.replace(/^(WARN:|WARNING:|\[WARN\])\s*/i, '');
        }
        else if (/^(INFO:|\[INFO\])/i.test(lineWithoutTimestamp)) {
            level = 'info';
            message = lineWithoutTimestamp.replace(/^(INFO:|\[INFO\])\s*/i, '');
        }
        else if (/^(DEBUG:|\[DEBUG\])/i.test(lineWithoutTimestamp)) {
            level = 'debug';
            message = lineWithoutTimestamp.replace(/^(DEBUG:|\[DEBUG\])\s*/i, '');
        }
        else {
            message = lineWithoutTimestamp;
        }
    }
    // Build result object
    const result = {
        level,
        message
    };
    // Only add data if it has properties
    if (Object.keys(data).length > 0) {
        result.data = data;
    }
    return result;
}
