/**
 * Parse stderr output line to extract log level and structured data
 */
export declare function parseStderrLine(line: string): {
    level: string;
    message: string;
    data?: any;
} | null;
//# sourceMappingURL=stderr-parser.d.ts.map