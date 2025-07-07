/**
 * Extension Registry for mcpmon
 * 
 * Manages the lifecycle of extensions, handling registration,
 * enabling/disabling, and configuration.
 */

import type { Extension, ExtensionRegistry as IExtensionRegistry } from './interfaces.js';

export class ExtensionRegistry implements IExtensionRegistry {
  private extensions = new Map<string, Extension>();
  private enabled = new Set<string>();
  private config: Record<string, any> = {};
  private explicitlyDisabled = new Set<string>();
  
  constructor(config?: { 
    enabledExtensions?: string[];
    disabledExtensions?: string[];
    extensionConfigs?: Record<string, any>;
  }) {
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
  register(extension: Extension): void {
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
  getAll(): Extension[] {
    return Array.from(this.extensions.values());
  }
  
  /**
   * Get enabled extensions
   */
  getEnabled(): Extension[] {
    return Array.from(this.enabled)
      .map(id => this.extensions.get(id))
      .filter((ext): ext is Extension => ext !== undefined);
  }
  
  /**
   * Get extension by ID
   */
  get(extensionId: string): Extension | undefined {
    return this.extensions.get(extensionId);
  }
  
  /**
   * Check if extension is enabled
   */
  isEnabled(extensionId: string): boolean {
    return this.enabled.has(extensionId);
  }
  
  /**
   * Enable/disable an extension
   */
  setEnabled(extensionId: string, enabled: boolean): void {
    if (!this.extensions.has(extensionId)) {
      throw new Error(`Extension ${extensionId} not found`);
    }
    
    if (enabled) {
      this.enabled.add(extensionId);
    } else {
      this.enabled.delete(extensionId);
    }
  }
  
  /**
   * Get configuration for an extension
   */
  getConfig(extensionId: string): any {
    return this.config[extensionId] || {};
  }
  
  /**
   * Set configuration for an extension
   */
  setConfig(extensionId: string, config: any): void {
    this.config[extensionId] = config;
  }
  
  /**
   * Load built-in extensions
   */
  async loadBuiltinExtensions(): Promise<void> {
    // List of built-in extensions
    const builtins: string[] = [
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
        
        if (module?.default && 'id' in module.default) {
          this.register(module.default);
          console.error(`✅ Loaded extension: ${name}`);
        }
      } catch (error) {
        // Extension not available yet, skip silently
        if (process.env.MCPMON_DEBUG) {
          console.error(`⚠️  Failed to load extension ${name}:`, error);
        }
      }
    }
  }
  
  /**
   * Load external extensions from node_modules
   */
  async loadExternalExtensions(): Promise<void> {
    // Future: Scan node_modules for mcpmon-extension-* packages
    // This would enable community extensions
  }
  
  /**
   * Initialize all enabled extensions
   */
  async initializeAll(context: Omit<import('./interfaces.js').ExtensionContext, 'config'>): Promise<void> {
    const enabled = this.getEnabled();
    
    for (const extension of enabled) {
      try {
        await extension.initialize({
          ...context,
          config: this.getConfig(extension.id)
        });
        
        console.error(`🔌 Extension initialized: ${extension.name} v${extension.version}`);
      } catch (error) {
        console.error(`❌ Failed to initialize extension ${extension.id}:`, error);
        // Disable failed extension
        this.setEnabled(extension.id, false);
      }
    }
  }
  
  /**
   * Shutdown all enabled extensions
   */
  async shutdownAll(): Promise<void> {
    const enabled = this.getEnabled();
    
    // Shutdown in reverse order
    for (const extension of enabled.reverse()) {
      try {
        await extension.shutdown();
        console.error(`🔌 Extension shut down: ${extension.name}`);
      } catch (error) {
        console.error(`❌ Error shutting down extension ${extension.id}:`, error);
      }
    }
  }
  
  /**
   * Check if extension was explicitly disabled
   */
  private isExplicitlyDisabled(extensionId: string): boolean {
    return this.explicitlyDisabled.has(extensionId);
  }
  
  /**
   * Export current configuration
   */
  exportConfig(): {
    enabled: string[];
    configs: Record<string, any>;
  } {
    return {
      enabled: Array.from(this.enabled),
      configs: this.config
    };
  }
  
  /**
   * Import configuration
   */
  importConfig(config: {
    enabled?: string[];
    configs?: Record<string, any>;
  }): void {
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