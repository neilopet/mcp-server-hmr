/**
 * Extension Registry for mcpmon
 *
 * Manages the lifecycle of extensions, handling registration,
 * enabling/disabling, and configuration.
 */
export class ExtensionRegistry {
    extensions = new Map();
    enabled = new Set();
    config = {};
    explicitlyDisabled = new Set();
    constructor(config) {
        if (config?.enabledExtensions) {
            for (const id of config.enabledExtensions) {
                this.enabled.add(id);
            }
        }
        if (config?.extensionConfigs) {
            this.config = config.extensionConfigs;
        }
        // Store disabled extensions for later reference
        this.explicitlyDisabled = new Set(config?.disabledExtensions || []);
    }
    /**
     * Register an extension
     */
    register(extension) {
        if (this.extensions.has(extension.id)) {
            throw new Error(`Extension ${extension.id} already registered`);
        }
        this.extensions.set(extension.id, extension);
        // Auto-enable if default enabled and not explicitly disabled
        if (extension.defaultEnabled && !this.isExplicitlyDisabled(extension.id)) {
            this.enabled.add(extension.id);
        }
    }
    /**
     * Get all registered extensions
     */
    getAll() {
        return Array.from(this.extensions.values());
    }
    /**
     * Get enabled extensions
     */
    getEnabled() {
        return Array.from(this.enabled)
            .map(id => this.extensions.get(id))
            .filter((ext) => ext !== undefined);
    }
    /**
     * Get extension by ID
     */
    get(extensionId) {
        return this.extensions.get(extensionId);
    }
    /**
     * Check if extension is enabled
     */
    isEnabled(extensionId) {
        return this.enabled.has(extensionId);
    }
    /**
     * Enable/disable an extension
     */
    setEnabled(extensionId, enabled) {
        if (!this.extensions.has(extensionId)) {
            throw new Error(`Extension ${extensionId} not found`);
        }
        if (enabled) {
            this.enabled.add(extensionId);
        }
        else {
            this.enabled.delete(extensionId);
        }
    }
    /**
     * Get configuration for an extension
     */
    getConfig(extensionId) {
        return this.config[extensionId] || {};
    }
    /**
     * Set configuration for an extension
     */
    setConfig(extensionId, config) {
        this.config[extensionId] = config;
    }
    /**
     * Load built-in extensions
     */
    async loadBuiltinExtensions() {
        // List of built-in extensions
        const builtins = [
            'large-response-handler', // Re-enabled with full implementation
            // Future extensions:
            // 'metrics',
            // 'auth',
            // 'request-logger',
            // 'rate-limiter'
        ];
        for (const name of builtins) {
            try {
                // Dynamic import with fallback
                const modulePath = `./${name}/index.js`;
                const module = await import(modulePath).catch(() => null);
                if (module?.default) {
                    // Handle both class and instance exports
                    let extensionInstance;
                    if (typeof module.default === 'function' && module.default.prototype) {
                        // It's a class constructor
                        extensionInstance = new module.default();
                    }
                    else if ('id' in module.default) {
                        // It's an instance
                        extensionInstance = module.default;
                    }
                    else {
                        throw new Error(`Invalid extension export for ${name}`);
                    }
                    this.register(extensionInstance);
                    // Extension loaded: ${name}
                }
            }
            catch (error) {
                // Extension not available yet, skip silently
                if (process.env.MCPMON_DEBUG) {
                    // Failed to load extension: ${name}
                }
            }
        }
    }
    /**
     * Load external extensions from node_modules
     */
    async loadExternalExtensions() {
        // Future: Scan node_modules for mcpmon-extension-* packages
        // This would enable community extensions
    }
    /**
     * Initialize all enabled extensions
     */
    async initializeAll(context) {
        const enabled = this.getEnabled();
        for (const extension of enabled) {
            try {
                await extension.initialize({
                    ...context,
                    config: this.getConfig(extension.id)
                });
                // Extension initialized: ${extension.name}
            }
            catch (error) {
                // Failed to initialize extension: ${extension.id}
                // Disable failed extension
                this.setEnabled(extension.id, false);
            }
        }
    }
    /**
     * Shutdown all enabled extensions
     */
    async shutdownAll() {
        const enabled = this.getEnabled();
        // Shutdown in reverse order
        for (const extension of enabled.reverse()) {
            try {
                await extension.shutdown();
                // Extension shut down: ${extension.name}
            }
            catch (error) {
                // Error shutting down extension: ${extension.id}
            }
        }
    }
    /**
     * Check if extension was explicitly disabled
     */
    isExplicitlyDisabled(extensionId) {
        return this.explicitlyDisabled.has(extensionId);
    }
    /**
     * Export current configuration
     */
    exportConfig() {
        return {
            enabled: Array.from(this.enabled),
            configs: this.config
        };
    }
    /**
     * Import configuration
     */
    importConfig(config) {
        if (config.enabled) {
            this.enabled.clear();
            for (const id of config.enabled) {
                if (this.extensions.has(id)) {
                    this.enabled.add(id);
                }
            }
        }
        if (config.configs) {
            this.config = { ...this.config, ...config.configs };
        }
    }
}
