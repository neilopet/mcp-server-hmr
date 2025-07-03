import 'reflect-metadata';
import { Container, injectable, inject, ContainerModule } from 'inversify';
import { TEST_TYPES, type ExtensionTestSuite } from './types.js';

/**
 * TestContainer - Singleton DI container for mcpmon test framework
 * 
 * Manages test dependencies and enables easy test suite registration via decorators.
 * Provides centralized dependency injection for all test components.
 */
export class TestContainer {
  private static instance: TestContainer;
  private static container: Container;

  private constructor() {
    TestContainer.container = new Container({
      defaultScope: 'Singleton',
      skipBaseClassChecks: true
    });
  }

  /**
   * Get singleton instance of TestContainer
   */
  static getInstance(): TestContainer {
    if (!TestContainer.instance) {
      TestContainer.instance = new TestContainer();
    }
    return TestContainer.instance;
  }

  /**
   * Get the underlying Inversify container
   */
  static getContainer(): Container {
    TestContainer.getInstance();
    return TestContainer.container;
  }

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
  static register(extensionId: string): ClassDecorator {
    return function (target: any): any {
      // Make the class injectable
      injectable()(target);
      
      // Bind to ExtensionTestSuite with extension ID as name
      const container = TestContainer.getContainer();
      container.bind<ExtensionTestSuite>(TEST_TYPES.ExtensionTestSuite)
        .to(target)
        .whenTargetNamed(extensionId);
      
      return target;
    };
  }

  /**
   * Retrieve a specific test suite by extension ID
   * 
   * @param extensionId - The extension ID to look up
   * @returns The test suite instance or undefined if not found
   */
  getTestSuite(extensionId: string): ExtensionTestSuite | undefined {
    try {
      return TestContainer.container.getNamed<ExtensionTestSuite>(
        TEST_TYPES.ExtensionTestSuite,
        extensionId
      );
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get all registered test suites
   * 
   * @returns Array of all registered ExtensionTestSuite instances
   */
  getAllTestSuites(): ExtensionTestSuite[] {
    try {
      return TestContainer.container.getAll<ExtensionTestSuite>(TEST_TYPES.ExtensionTestSuite);
    } catch (error) {
      return [];
    }
  }

  /**
   * Bind core test utilities to the container
   * Sets up bindings for TestHarness, MockMCPMon, TestLogger, etc.
   */
  bindTestUtilities(): void {
    const container = TestContainer.container;

    // Check if utilities are already bound to prevent rebinding
    if (container.isBound(TEST_TYPES.TestHarness)) {
      return;
    }

    // Note: Actual utility implementations would be imported and bound here
    // This is a placeholder showing the binding structure
    
    // Example bindings (implementations would come from other modules):
    // container.bind(TEST_TYPES.TestHarness).to(TestHarnessImpl);
    // container.bind(TEST_TYPES.MockMCPMon).to(MockMCPMonImpl);
    // container.bind(TEST_TYPES.TestLogger).to(TestLoggerImpl);
    // container.bind(TEST_TYPES.MessageCapture).to(MessageCaptureImpl);
    // container.bind(TEST_TYPES.ExtensionLoader).to(ExtensionLoaderImpl);
    // container.bind(TEST_TYPES.IntegrationContext).to(IntegrationContextImpl);
    // container.bind(TEST_TYPES.E2EContext).to(E2EContextImpl);
  }

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
  loadModule(module: ContainerModule): void {
    TestContainer.container.load(module);
  }

  /**
   * Reset the container for test isolation
   * Clears all bindings and recreates a fresh container
   * 
   * Important: Call this between test runs to ensure clean state
   */
  reset(): void {
    TestContainer.container.unbindAll();
    TestContainer.container = new Container({
      defaultScope: 'Singleton',
      skipBaseClassChecks: true
    });
  }

  /**
   * Get a service from the container
   * 
   * @param serviceIdentifier - The service identifier (Symbol or string)
   * @returns The resolved service instance
   */
  get<T>(serviceIdentifier: symbol | string): T {
    return TestContainer.container.get<T>(serviceIdentifier);
  }

  /**
   * Check if a service is bound in the container
   * 
   * @param serviceIdentifier - The service identifier to check
   * @returns True if the service is bound
   */
  isBound(serviceIdentifier: symbol | string): boolean {
    return TestContainer.container.isBound(serviceIdentifier);
  }

  /**
   * Create a child container for isolated testing
   * 
   * @returns A new child container
   */
  createChildContainer(): Container {
    return TestContainer.container.createChild();
  }
}

// Export singleton instance
export const testContainer = TestContainer.getInstance();

// Export convenience methods
export const register = TestContainer.register;
export const getTestSuite = (extensionId: string) => testContainer.getTestSuite(extensionId);
export const getAllTestSuites = () => testContainer.getAllTestSuites();
export const bindTestUtilities = () => testContainer.bindTestUtilities();
export const loadModule = (module: ContainerModule) => testContainer.loadModule(module);
export const reset = () => testContainer.reset();

// Add static methods to TestContainer class for discovery compatibility
declare module './TestContainer.js' {
  namespace TestContainer {
    function getAllSuites(): ExtensionTestSuite[];
    function clear(): void;
  }
}

// Static methods for discovery compatibility
(TestContainer as any).getAllSuites = () => testContainer.getAllTestSuites();
(TestContainer as any).clear = () => testContainer.reset();