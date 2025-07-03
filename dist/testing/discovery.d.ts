import type { TestSuite, TestFilter, ExtensionId } from './types.js';
/**
 * Discovery system for automatically finding and loading extension test suites
 */
export declare class ExtensionTestDiscovery {
    private static readonly TEST_FILE_PATTERN;
    private static readonly logger;
    /**
     * Discover and register all extension test suites
     */
    static discoverAndRegister(): Promise<void>;
    /**
     * Get all registered test suites from the container
     */
    static getAllTestSuites(filter?: TestFilter): TestSuite[];
    /**
     * Load test suite for a specific extension
     */
    static loadTestSuite(extensionPath: string): Promise<void>;
    /**
     * Validate a test suite for required structure and metadata
     */
    static validateTestSuite(suite: TestSuite): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Discover all test files matching the pattern
     */
    static discoverTestFiles(basePath?: string): Promise<string[]>;
    /**
     * Recursively find test files in extensions directory
     */
    private static findTestFiles;
    /**
     * Get test file path for a specific extension
     */
    static getTestFilePath(extensionPath: string): string;
    /**
     * Extract extension ID from test file path
     */
    static extractExtensionId(testFilePath: string): ExtensionId | null;
    /**
     * Check if a path contains test files
     */
    static hasTestFiles(extensionPath: string): Promise<boolean>;
    /**
     * Load a test file and trigger decorator registration
     */
    private static loadTestFile;
    /**
     * Filter test suites based on criteria
     */
    private static filterTestSuites;
    /**
     * Validate test suite metadata
     */
    private static validateTestSuiteMetadata;
    /**
     * Check if an object is a valid extension instance
     */
    private static isValidExtensionInstance;
    /**
     * Get summary of discovered test suites
     */
    static getDiscoverySummary(): Promise<{
        totalFiles: number;
        loadedSuites: number;
        failedLoads: number;
        extensionIds: ExtensionId[];
    }>;
    /**
     * Clear all discovered test suites (useful for testing)
     */
    static clearAll(): void;
}
/**
 * Utility class for test file path operations
 */
export declare class TestPathUtils {
    /**
     * Resolve test file path from various inputs
     */
    static resolveTestPath(input: string): string;
    /**
     * Get extension directory from test file path
     */
    static getExtensionDir(testFilePath: string): string;
    /**
     * Check if a path is a valid test file path
     */
    static isTestFilePath(path: string): boolean;
    /**
     * Get relative test path from absolute path
     */
    static getRelativeTestPath(absolutePath: string, basePath?: string): string;
}
/**
 * Test discovery error class
 */
export declare class TestDiscoveryError extends Error {
    readonly filePath?: string | undefined;
    readonly cause?: Error | undefined;
    constructor(message: string, filePath?: string | undefined, cause?: Error | undefined);
}
//# sourceMappingURL=discovery.d.ts.map