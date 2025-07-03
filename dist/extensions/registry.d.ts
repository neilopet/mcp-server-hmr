/**
 * Extension Registry for mcpmon
 *
 * Manages the lifecycle of extensions, handling registration,
 * enabling/disabling, and configuration.
 */
import type { Extension, ExtensionRegistry as IExtensionRegistry } from './interfaces.js';
export declare class ExtensionRegistry implements IExtensionRegistry {
    private extensions;
    private enabled;
    private config;
    private explicitlyDisabled;
    constructor(config?: {
        enabledExtensions?: string[];
        disabledExtensions?: string[];
        extensionConfigs?: Record<string, any>;
    });
    /**
     * Register an extension
     */
    register(extension: Extension): void;
    /**
     * Get all registered extensions
     */
    getAll(): Extension[];
    /**
     * Get enabled extensions
     */
    getEnabled(): Extension[];
    /**
     * Get extension by ID
     */
    get(extensionId: string): Extension | undefined;
    /**
     * Check if extension is enabled
     */
    isEnabled(extensionId: string): boolean;
    /**
     * Enable/disable an extension
     */
    setEnabled(extensionId: string, enabled: boolean): void;
    /**
     * Get configuration for an extension
     */
    getConfig(extensionId: string): any;
    /**
     * Set configuration for an extension
     */
    setConfig(extensionId: string, config: any): void;
    /**
     * Load built-in extensions
     */
    loadBuiltinExtensions(): Promise<void>;
    /**
     * Load external extensions from node_modules
     */
    loadExternalExtensions(): Promise<void>;
    /**
     * Initialize all enabled extensions
     */
    initializeAll(context: Omit<import('./interfaces.js').ExtensionContext, 'config'>): Promise<void>;
    /**
     * Shutdown all enabled extensions
     */
    shutdownAll(): Promise<void>;
    /**
     * Check if extension was explicitly disabled
     */
    private isExplicitlyDisabled;
    /**
     * Export current configuration
     */
    exportConfig(): {
        enabled: string[];
        configs: Record<string, any>;
    };
    /**
     * Import configuration
     */
    importConfig(config: {
        enabled?: string[];
        configs?: Record<string, any>;
    }): void;
}
//# sourceMappingURL=registry.d.ts.map