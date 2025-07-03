/**
 * Type definitions for mcpmon DI test framework
 *
 * Provides interfaces and types for extension testing with dependency injection
 */
/**
 * Symbols for dependency injection
 */
export const TEST_TYPES = {
    ExtensionTestSuite: Symbol.for('ExtensionTestSuite'),
    TestHarness: Symbol.for('TestHarness'),
    MockMCPMon: Symbol.for('MockMCPMon'),
    IntegrationContext: Symbol.for('IntegrationContext'),
    E2EContext: Symbol.for('E2EContext'),
    TestLogger: Symbol.for('TestLogger'),
    MessageCapture: Symbol.for('MessageCapture'),
    ExtensionLoader: Symbol.for('ExtensionLoader'),
};
