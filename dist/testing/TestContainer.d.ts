import 'reflect-metadata';
import { Container, ContainerModule } from 'inversify';
import { type ExtensionTestSuite } from './types.js';
/**
 * TestContainer - Singleton DI container for mcpmon test framework
 *
 * Manages test dependencies and enables easy test suite registration via decorators.
 * Provides centralized dependency injection for all test components.
 */
export declare class TestContainer {
    private static instance;
    private static container;
    private constructor();
    /**
     * Get singleton instance of TestContainer
     */
    static getInstance(): TestContainer;
    /**
     * Get the underlying Inversify container
     */
    static getContainer(): Container;
    /**
     * Decorator to register a test suite class
     * Makes the class injectable and binds it to ExtensionTestSuite with extension ID as name
     *
     * @param extensionId - Unique identifier for the extension being tested
     * @returns ClassDecorator function
     *
     * @example
     * ```typescript
     * @TestContainer.register('my-extension')
     * class MyExtensionTestSuite implements ExtensionTestSuite {
     *   // test implementation
     * }
     * ```
     */
    static register(extensionId: string): ClassDecorator;
    /**
     * Retrieve a specific test suite by extension ID
     *
     * @param extensionId - The extension ID to look up
     * @returns The test suite instance or undefined if not found
     */
    getTestSuite(extensionId: string): ExtensionTestSuite | undefined;
    /**
     * Get all registered test suites
     *
     * @returns Array of all registered ExtensionTestSuite instances
     */
    getAllTestSuites(): ExtensionTestSuite[];
    /**
     * Bind core test utilities to the container
     * Sets up bindings for TestHarness, MockMCPMon, TestLogger, etc.
     */
    bindTestUtilities(): void;
    /**
     * Load a ContainerModule into the test container
     * Allows modular configuration of test dependencies
     *
     * @param module - The ContainerModule to load
     *
     * @example
     * ```typescript
     * const testModule = new ContainerModule((bind) => {
     *   bind(MyService).toSelf();
     * });
     * testContainer.loadModule(testModule);
     * ```
     */
    loadModule(module: ContainerModule): void;
    /**
     * Reset the container for test isolation
     * Clears all bindings and recreates a fresh container
     *
     * Important: Call this between test runs to ensure clean state
     */
    reset(): void;
    /**
     * Get a service from the container
     *
     * @param serviceIdentifier - The service identifier (Symbol or string)
     * @returns The resolved service instance
     */
    get<T>(serviceIdentifier: symbol | string): T;
    /**
     * Check if a service is bound in the container
     *
     * @param serviceIdentifier - The service identifier to check
     * @returns True if the service is bound
     */
    isBound(serviceIdentifier: symbol | string): boolean;
    /**
     * Create a child container for isolated testing
     *
     * @returns A new child container
     */
    createChildContainer(): Container;
}
export declare const testContainer: TestContainer;
export declare const register: typeof TestContainer.register;
export declare const getTestSuite: (extensionId: string) => ExtensionTestSuite | undefined;
export declare const getAllTestSuites: () => ExtensionTestSuite[];
export declare const bindTestUtilities: () => void;
export declare const loadModule: (module: ContainerModule) => void;
export declare const reset: () => void;
declare module './TestContainer.js' {
    namespace TestContainer {
        function getAllSuites(): ExtensionTestSuite[];
        function clear(): void;
    }
}
//# sourceMappingURL=TestContainer.d.ts.map