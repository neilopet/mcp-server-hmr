/**
 * Test registration for Large Response Handler Extension
 *
 * This file registers the LRH test suite with the DI framework and sets up
 * all necessary dependencies for testing.
 */
import { testContainer, loadModule } from '../../../testing/TestContainer.js';
import { LRHTestModule } from './providers.js';
import './index.js'; // Import to trigger decorator registration
/**
 * Register LRH test dependencies and utilities
 */
export function registerLRHTests() {
    // Load the LRH-specific test module
    loadModule(LRHTestModule);
    // Verify the test suite is registered
    const testSuite = testContainer.getTestSuite('large-response-handler');
    if (!testSuite) {
        throw new Error('Large Response Handler test suite not registered');
    }
    console.log('Large Response Handler tests registered successfully');
}
/**
 * Run LRH tests with DI framework
 */
export async function runLRHTests() {
    try {
        registerLRHTests();
        const testSuite = testContainer.getTestSuite('large-response-handler');
        if (!testSuite) {
            throw new Error('Test suite not found');
        }
        console.log(`Running tests for extension: ${testSuite.extensionId}`);
        // Set up tests
        await testSuite.setupTests();
        console.log('LRH tests setup completed');
    }
    catch (error) {
        console.error('Failed to run LRH tests:', error);
        throw error;
    }
}
// Auto-register when this module is imported
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    registerLRHTests();
}
export default registerLRHTests;
