import { readdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TestContainer } from './TestContainer.js';
import type {
  TestSuite,
  TestSuiteMetadata,
  TestFilter,
  ExtensionInstance,
  ExtensionId
} from './types.js';

/**
 * Discovery system for automatically finding and loading extension test suites
 */
export class ExtensionTestDiscovery {
  private static readonly TEST_FILE_PATTERN = 'src/extensions/*/tests/index.ts';
  private static readonly logger = console;

  /**
   * Discover and register all extension test suites
   */
  static async discoverAndRegister(): Promise<void> {
    const testFiles = await this.discoverTestFiles();
    
    for (const testFile of testFiles) {
      try {
        await this.loadTestFile(testFile);
      } catch (error) {
        this.logger.error(`Failed to load test file ${testFile}:`, error);
      }
    }
  }

  /**
   * Get all registered test suites from the container
   */
  static getAllTestSuites(filter?: TestFilter): TestSuite[] {
    const allSuites = TestContainer.getAllSuites();
    
    if (!filter) {
      return allSuites;
    }

    return this.filterTestSuites(allSuites, filter);
  }

  /**
   * Load test suite for a specific extension
   */
  static async loadTestSuite(extensionPath: string): Promise<void> {
    const testFile = resolve(extensionPath, 'tests', 'index.ts');
    
    try {
      await this.loadTestFile(testFile);
    } catch (error) {
      throw new Error(`Failed to load test suite from ${extensionPath}: ${error}`);
    }
  }

  /**
   * Validate a test suite for required structure and metadata
   */
  static validateTestSuite(suite: TestSuite): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required methods
    if (typeof suite.setupTests !== 'function') {
      errors.push('Missing required method: setupTests');
    }

    if (typeof suite.teardownTests !== 'function') {
      errors.push('Missing required method: teardownTests');
    }

    // Validate metadata
    const metadataErrors = this.validateTestSuiteMetadata(suite.metadata);
    errors.push(...metadataErrors);

    // Validate extension instance if provided
    if (suite.extension && !this.isValidExtensionInstance(suite.extension)) {
      errors.push('Invalid extension instance provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Discover all test files matching the pattern
   */
  static async discoverTestFiles(basePath?: string): Promise<string[]> {
    const searchBase = basePath || process.cwd();
    const extensionsDir = resolve(searchBase, 'src', 'extensions');

    try {
      const files = await this.findTestFiles(extensionsDir);
      return files;
    } catch (error) {
      this.logger.error('Error discovering test files:', error);
      return [];
    }
  }

  /**
   * Recursively find test files in extensions directory
   */
  private static async findTestFiles(dir: string): Promise<string[]> {
    const testFiles: string[] = [];

    try {
      const entries = await readdir(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        
        try {
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            // Check if this is an extension directory with tests
            const testFile = join(fullPath, 'tests', 'index.ts');
            
            try {
              await stat(testFile);
              testFiles.push(testFile);
            } catch {
              // No test file in this extension
            }
          }
        } catch {
          // Skip entries that can't be accessed
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      this.logger.warn(`Cannot read directory ${dir}:`, error);
    }

    return testFiles;
  }

  /**
   * Get test file path for a specific extension
   */
  static getTestFilePath(extensionPath: string): string {
    return resolve(extensionPath, 'tests', 'index.ts');
  }

  /**
   * Extract extension ID from test file path
   */
  static extractExtensionId(testFilePath: string): ExtensionId | null {
    const match = testFilePath.match(/src[\/\\]extensions[\/\\]([^\/\\]+)[\/\\]tests[\/\\]index\.ts$/);
    return match ? match[1] as ExtensionId : null;
  }

  /**
   * Check if a path contains test files
   */
  static async hasTestFiles(extensionPath: string): Promise<boolean> {
    const testFile = this.getTestFilePath(extensionPath);
    
    try {
      await stat(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load a test file and trigger decorator registration
   */
  private static async loadTestFile(filePath: string): Promise<void> {
    try {
      // Convert to file URL for ES module import
      const fileUrl = pathToFileURL(filePath).href;
      
      // Dynamic import triggers @register decorators
      await import(fileUrl);
      
      this.logger.info(`Loaded test file: ${filePath}`);
    } catch (error) {
      // Log detailed error information
      const extensionId = this.extractExtensionId(filePath);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Failed to load test file for extension '${extensionId || 'unknown'}':`, {
        filePath,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  /**
   * Filter test suites based on criteria
   */
  private static filterTestSuites(suites: TestSuite[], filter: TestFilter): TestSuite[] {
    return suites.filter(suite => {
      // Filter by extension IDs
      if (filter.extensionIds && filter.extensionIds.length > 0) {
        if (!filter.extensionIds.includes(suite.metadata.extensionId)) {
          return false;
        }
      }

      // Filter by tags
      if (filter.tags && filter.tags.length > 0) {
        const suiteTags = suite.metadata.tags || [];
        const hasMatchingTag = filter.tags.some(tag => suiteTags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Filter by enabled status
      if (filter.onlyEnabled !== undefined) {
        const isEnabled = suite.metadata.enabled !== false;
        if (filter.onlyEnabled !== isEnabled) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Validate test suite metadata
   */
  private static validateTestSuiteMetadata(metadata: TestSuiteMetadata): string[] {
    const errors: string[] = [];

    // Check required fields
    if (!metadata.extensionId || typeof metadata.extensionId !== 'string') {
      errors.push('Invalid or missing extensionId in metadata');
    }

    if (!metadata.name || typeof metadata.name !== 'string') {
      errors.push('Invalid or missing name in metadata');
    }

    // Validate optional fields if present
    if (metadata.description !== undefined && typeof metadata.description !== 'string') {
      errors.push('Invalid description in metadata (must be string)');
    }

    if (metadata.version !== undefined && typeof metadata.version !== 'string') {
      errors.push('Invalid version in metadata (must be string)');
    }

    if (metadata.tags !== undefined) {
      if (!Array.isArray(metadata.tags)) {
        errors.push('Invalid tags in metadata (must be array)');
      } else if (!metadata.tags.every(tag => typeof tag === 'string')) {
        errors.push('Invalid tag in metadata (all tags must be strings)');
      }
    }

    if (metadata.timeout !== undefined && typeof metadata.timeout !== 'number') {
      errors.push('Invalid timeout in metadata (must be number)');
    }

    if (metadata.retries !== undefined && typeof metadata.retries !== 'number') {
      errors.push('Invalid retries in metadata (must be number)');
    }

    if (metadata.enabled !== undefined && typeof metadata.enabled !== 'boolean') {
      errors.push('Invalid enabled in metadata (must be boolean)');
    }

    return errors;
  }

  /**
   * Check if an object is a valid extension instance
   */
  private static isValidExtensionInstance(instance: any): instance is ExtensionInstance {
    // Basic validation - can be extended based on actual extension interface
    return (
      instance !== null &&
      typeof instance === 'object' &&
      'id' in instance &&
      typeof instance.id === 'string'
    );
  }

  /**
   * Get summary of discovered test suites
   */
  static async getDiscoverySummary(): Promise<{
    totalFiles: number;
    loadedSuites: number;
    failedLoads: number;
    extensionIds: ExtensionId[];
  }> {
    const testFiles = await this.discoverTestFiles();
    const loadedSuites = TestContainer.getAllSuites();
    const failedLoads: string[] = [];

    // Try loading each file and track failures
    for (const file of testFiles) {
      try {
        const extensionId = this.extractExtensionId(file);
        if (extensionId && !loadedSuites.some(s => s.metadata.extensionId === extensionId)) {
          await this.loadTestFile(file);
        }
      } catch {
        failedLoads.push(file);
      }
    }

    return {
      totalFiles: testFiles.length,
      loadedSuites: loadedSuites.length,
      failedLoads: failedLoads.length,
      extensionIds: loadedSuites.map(s => s.metadata.extensionId)
    };
  }

  /**
   * Clear all discovered test suites (useful for testing)
   */
  static clearAll(): void {
    TestContainer.clear();
  }
}

/**
 * Utility class for test file path operations
 */
export class TestPathUtils {
  /**
   * Resolve test file path from various inputs
   */
  static resolveTestPath(input: string): string {
    // If already a test file path, return as-is
    if (input.endsWith('/tests/index.ts')) {
      return resolve(input);
    }

    // If extension directory, append test path
    if (input.includes('/extensions/')) {
      return resolve(input, 'tests', 'index.ts');
    }

    // Assume it's an extension name
    return resolve('src', 'extensions', input, 'tests', 'index.ts');
  }

  /**
   * Get extension directory from test file path
   */
  static getExtensionDir(testFilePath: string): string {
    return dirname(dirname(resolve(testFilePath)));
  }

  /**
   * Check if a path is a valid test file path
   */
  static isTestFilePath(path: string): boolean {
    return path.endsWith('/tests/index.ts') && path.includes('/extensions/');
  }

  /**
   * Get relative test path from absolute path
   */
  static getRelativeTestPath(absolutePath: string, basePath?: string): string {
    const base = basePath || process.cwd();
    return absolutePath.replace(base + '/', '');
  }
}

/**
 * Test discovery error class
 */
export class TestDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TestDiscoveryError';
  }
}