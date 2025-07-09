/**
 * MCP Proxy Class - Hot-reloadable MCP server proxy
 *
 * Provides message buffering, server lifecycle management, and hot-reload capabilities
 * for MCP (Model Context Protocol) servers. Uses dependency injection for cross-platform
 * compatibility between Deno and Node.js environments.
 */

import type {
  ChangeSource,
  ChangeEvent,
  ChangeEventType,
  FileSystem,
  FileEvent,
  ManagedProcess,
  ProcessManager,
  ProxyDependencies,
} from "./interfaces.js";
import type { ExtensionRegistry, ExtensionContext, ExtensionHooks } from "./extensions/interfaces.js";
import { randomUUID } from 'crypto';
import { createMCPMonLogger, type MCPMonLogger } from './mcpmon-logger.js';
import { parseStderrLine } from './stderr-parser.js';

// Simple debounce implementation for Node.js
type DebouncedFunction<T extends (...args: any[]) => any> = T & {
  clear(): void;
  flush(): void;
};

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): DebouncedFunction<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  let latestArgs: Parameters<T>;

  const debouncedFn = ((...args: Parameters<T>) => {
    latestArgs = args;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...latestArgs);
    }, delay);
    timeoutId.unref();
  }) as DebouncedFunction<T>;

  debouncedFn.clear = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  debouncedFn.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      fn(...latestArgs);
    }
  };

  return debouncedFn;
}

interface Message {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPProxyConfig {
  command: string;
  commandArgs: string[];
  /** @deprecated Use watchTargets instead. Single file/directory to watch */
  entryFile?: string | null;
  /** Array of files, directories, packages, or other resources to monitor */
  watchTargets?: string[];
  restartDelay: number;
  env?: Record<string, string>;
  /** Delay in ms after killing server before starting new one (default: 1000) */
  killDelay?: number;
  /** Delay in ms after starting server before declaring ready (default: 2000) */
  readyDelay?: number;
  /** Extension-specific configurations for custom functionality */
  extensions?: Record<string, any>;
  /** Base directory for extension data storage */
  dataDir?: string;
}

/**
 * MCPProxy - A hot-reloadable proxy for MCP servers
 *
 * Features:
 * - Message buffering during server restarts
 * - Initialize parameter capture and replay
 * - File watching for hot-reload
 * - Graceful server lifecycle management
 * - Cross-platform via dependency injection
 */
export class MCPProxy {
  private managedProcess: ManagedProcess | null = null;
  private serverPid: number | null = null;
  private containerId?: string;
  private stdinBuffer: Uint8Array[] = [];
  private messageBuffer: Message[] = [];
  private restarting = false;
  private stdinReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private currentRequestId = 1;
  private initializeParams: unknown = null;
  private pendingRequests = new Map<
    number,
    {
      resolve: (response: Message) => void;
      reject: (error: Error) => void;
      timeoutId?: NodeJS.Timeout;
    }
  >();
  private stdinForwardingStarted = false;
  private killTimeout?: NodeJS.Timeout;
  private fileWatcher?: AsyncIterable<ChangeEvent>;
  private shutdownRequested = false;
  private startPromise?: Promise<void>;
  private monitoringTimeout?: NodeJS.Timeout;
  private errorRetryTimeout?: NodeJS.Timeout;
  private pendingToolsListRequests = new Map<string | number, boolean>(); // Track tools/list requests that need injection
  private sessionId: string = randomUUID();
  private clientLogLevel: string = 'info';
  private serverSupportsLogging: boolean = false;
  private logLevelRequestId: number | string | null = null;
  private initializeRequestId: number | string | null = null;

  // Dependency injection
  private procManager: ProcessManager;
  private changeSource: ChangeSource;
  private config: MCPProxyConfig;
  private stdin: ReadableStream<Uint8Array>;
  private stdout: WritableStream<Uint8Array>;
  private stderr: WritableStream<Uint8Array>;
  private exit: (code: number) => void;
  private extensionRegistry?: ExtensionRegistry;
  private extensionHooks: ExtensionHooks = {};
  private logger: MCPMonLogger;

  constructor(dependencies: ProxyDependencies, config: MCPProxyConfig) {
    this.procManager = dependencies.procManager;

    // Support both new ChangeSource and legacy FileSystem interfaces
    if (dependencies.changeSource) {
      this.changeSource = dependencies.changeSource;
    } else if (dependencies.fs) {
      // Create adapter from FileSystem to ChangeSource
      this.changeSource = this.createFileSystemAdapter(dependencies.fs);
    } else {
      throw new Error("Either changeSource or fs must be provided in ProxyDependencies");
    }

    this.stdin = dependencies.stdin;
    this.stdout = dependencies.stdout;
    this.stderr = dependencies.stderr;
    this.exit = dependencies.exit;
    this.config = this.normalizeConfig(config);
    this.extensionRegistry = dependencies.extensionRegistry;
    
    // Create MCP logger instance
    this.logger = createMCPMonLogger(this.stdout, () => this.clientLogLevel);

    // Initialize restart function with config
    this.restart = debounce(async () => {
      this.logger.info("File change detected, restarting server...");
      this.restarting = true;

      // Kill the old server completely
      await this.killServer();

      // Wait a moment to ensure process is fully terminated
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, this.config.killDelay || 1000);
        timeout.unref();
      });

      // Start new server
      try {
        await this.startServer();
      } catch (error) {
        this.logger.error(`Failed to start server during restart: ${error}`);
        this.restarting = false;
        return; // Exit restart function if we can't start server
      }

      // Wait for server to be ready
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, this.config.readyDelay || 2000);
        timeout.unref();
      });

      // Get updated tools list
      const tools = await this.getToolsList();

      // Send tool change notification
      const notification: Message = {
        jsonrpc: "2.0",
        method: "notifications/tools/list_changed",
        params: {
          tools: tools,
        },
      };

      try {
        const writer = this.stdout.getWriter();
        await writer.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
        writer.releaseLock();
        this.logger.debug(`Sent tool change notification with ${tools.length} tools`);
      } catch (error) {
        this.logger.error("Failed to send notification:", { error });
      }

      this.restarting = false;
      this.logger.info("Server restart complete");
    }, this.config.restartDelay);
  }

  /**
   * Auto-detect files to watch from command and arguments
   * Used as fallback when no explicit watchTargets are provided
   */
  private autoDetectWatchTargets(command: string, commandArgs: string[]): string[] {
    const watchTargets: string[] = [];
    
    // Look for the first file argument that looks like a script
    for (const arg of commandArgs) {
      // Skip flags
      if (arg.startsWith("-")) continue;

      // Check for common script extensions
      const scriptExtensions = [".js", ".mjs", ".ts", ".py", ".rb", ".php"];
      const hasScriptExtension = scriptExtensions.some(ext => arg.endsWith(ext));
      
      if (hasScriptExtension) {
        watchTargets.push(arg);
        break; // Only auto-detect the first script file for now
      }
    }
    
    return watchTargets;
  }

  /**
   * Normalize config to handle backward compatibility between entryFile and watchTargets
   */
  private normalizeConfig(config: MCPProxyConfig): MCPProxyConfig {
    const normalized = { ...config };

    // Handle backward compatibility: entryFile -> watchTargets
    if (!normalized.watchTargets && normalized.entryFile) {
      normalized.watchTargets = [normalized.entryFile];
    }

    // Auto-detect files to watch if no explicit targets provided
    // This supports library usage where users create MCPProxy directly
    if (!normalized.watchTargets || normalized.watchTargets.length === 0) {
      const autoDetected = this.autoDetectWatchTargets(normalized.command, normalized.commandArgs);
      normalized.watchTargets = autoDetected;
    }

    // Ensure we have an array (can be empty for non-file-based monitoring)
    if (!normalized.watchTargets) {
      normalized.watchTargets = [];
    }

    return normalized;
  }

  /**
   * Create an adapter that converts FileSystem to ChangeSource interface
   */
  private createFileSystemAdapter(fs: FileSystem): ChangeSource {
    return {
      async *watch(paths: string[]): AsyncIterable<ChangeEvent> {
        for await (const fileEvent of fs.watch(paths)) {
          // Convert FileEvent to ChangeEvent
          const changeEvent: ChangeEvent = {
            type: fileEvent.type as ChangeEventType,
            path: fileEvent.path,
          };
          yield changeEvent;
        }
      },
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      exists: fs.exists.bind(fs),
      copyFile: fs.copyFile.bind(fs),
    };
  }

  /**
   * Check if the proxy and server are currently running
   */
  isRunning(): boolean {
    return this.managedProcess !== null && this.serverPid !== null && !this.restarting;
  }

  /**
   * Initialize extensions with context
   */
  private async initializeExtensions(): Promise<void> {
    if (!this.extensionRegistry) return;

    try {
      this.logger.debug("Initializing extensions...");
      
      // Create extension context
      const context: Omit<ExtensionContext, 'config'> = {
        sessionId: `mcpmon-${Date.now()}`,
        dataDir: this.config.dataDir || `${process.cwd()}/mcpmon-data`,
        logger: {
          info: (message: string) => this.logger.info(message, { source: 'extension' }),
          debug: (message: string) => this.logger.debug(message, { source: 'extension' }),
          error: (message: string) => this.logger.error(message, { source: 'extension' }),
          warn: (message: string) => this.logger.warning(message, { source: 'extension' })
        },
        hooks: this.extensionHooks,
        dependencies: {
          procManager: this.procManager,
          changeSource: this.changeSource,
          stdin: this.stdin,
          stdout: this.stdout,
          stderr: this.stderr,
          exit: this.exit
        }
      };

      // Initialize all enabled extensions
      await this.extensionRegistry.initializeAll(context);
      
      // Log which hooks were registered
      this.logger.info("Extensions initialized");
      this.logger.debug("Registered extension hooks:");
      if (this.extensionHooks.getAdditionalTools) this.logger.debug("  - getAdditionalTools ✓");
      if (this.extensionHooks.handleToolCall) this.logger.debug("  - handleToolCall ✓");
      if (this.extensionHooks.beforeStdinForward) this.logger.debug("  - beforeStdinForward ✓");
      if (this.extensionHooks.afterStdoutReceive) this.logger.debug("  - afterStdoutReceive ✓");
    } catch (error) {
      this.logger.error(`Failed to initialize extensions: ${error}`);
      // Continue without extensions rather than failing completely
    }
  }

  async start() {
    // Initialize extensions if registry is available
    if (this.extensionRegistry) {
      await this.initializeExtensions();
    }

    // Start initial server
    try {
      await this.startServer();
    } catch (error) {
      this.logger.error(`Failed to start initial server: ${error}`);
      // Continue with setup even if initial server fails
      // Watcher can trigger restart later
    }

    // Setup continuous stdin forwarding
    this.setupStdinForwarding();

    // Start watcher if we have targets to monitor
    if (this.config.watchTargets && this.config.watchTargets.length > 0) {
      this.startWatcher();
    }

    // Keep proxy running - don't exit when server exits during hot-reload
    // The proxy manages the server lifecycle, not the other way around
    while (!this.shutdownRequested) {
      if (this.managedProcess && !this.restarting) {
        try {
          const status = await this.managedProcess.status;
          if (!this.restarting) {
            this.logger.warning(`Server exited unexpectedly with code: ${status.code}`);
            this.logger.info(`Restarting server...`);
            try {
              await this.startServer();
            } catch (error) {
              this.logger.error(`Failed to restart server: ${error}`);
            }
          }
        } catch (error) {
          if (!this.restarting) {
            this.logger.error(`Server process error: ${error}`);
            await new Promise((resolve) => {
              this.errorRetryTimeout = setTimeout(resolve, 1000);
              this.errorRetryTimeout.unref();
            });
            try {
              await this.startServer();
            } catch (startError) {
              this.logger.error(`Failed to restart server after error: ${startError}`);
            }
          }
        }
      }
      if (!this.shutdownRequested) {
        await new Promise((resolve) => {
          this.monitoringTimeout = setTimeout(resolve, 100);
          this.monitoringTimeout.unref();
        });
      }
    }
  }

  private async startServer() {
    // Create a display-safe version of the command with masked env vars
    const safeCommand = this.getSafeCommandDisplay();
    this.logger.info(`Starting MCP server: ${safeCommand}`);

    try {
      // Check if this is a Docker run command and inject labels + detached mode
      let commandArgs = [...this.config.commandArgs];
      let isDockerRun = false;
      
      if (this.config.command === 'docker' && commandArgs.includes('run')) {
        isDockerRun = true;
        const runIndex = commandArgs.indexOf('run');
        if (runIndex !== -1) {
          // Insert labels after 'run' but before other flags (NO -d flag to preserve stdio)
          const dockerFlags = [
            '--label', 'mcpmon.managed=true',
            '--label', `mcpmon.session=${this.sessionId}`,
            '--label', `mcpmon.pid=${process.pid}`,
            '--label', `mcpmon.started=${Date.now()}`
          ];
          
          // Insert Docker flags at the correct position (after 'run')
          commandArgs.splice(runIndex + 1, 0, ...dockerFlags);
          
          this.logger.debug(`Injecting Docker labels for session ${this.sessionId}`);
        }
      }

      this.managedProcess = this.procManager.spawn(this.config.command, commandArgs, {
        env: this.config.env || {}, // Use config env or empty object
      });

      this.serverPid = this.managedProcess.pid || null;
      
      // For Docker containers, query container ID after startup (preserves stdio)
      if (isDockerRun) {
        try {
          // Wait a moment for container to start, then query docker ps
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Query for the latest container with our session label
          const queryProcess = this.procManager.spawn('docker', [
            'ps', '-q', '--latest',
            '--filter', `label=mcpmon.session=${this.sessionId}`
          ], {});
          
          const reader = queryProcess.stdout.getReader();
          const decoder = new TextDecoder();
          let containerIdOutput = '';
          
          // Read container ID from query
          const { value } = await reader.read();
          if (value) {
            containerIdOutput = decoder.decode(value);
            this.containerId = containerIdOutput.trim();
            if (this.containerId) {
              this.logger.debug(`Captured Docker container ID: ${this.containerId}`);
            } else {
              this.logger.warning(`No container ID found for session ${this.sessionId}`);
            }
          }
          reader.releaseLock();
          await queryProcess.status;
        } catch (error) {
          this.logger.warning(`Failed to query container ID: ${error}`);
          // Continue without container ID - not fatal
        }
      }
      
      this.logger.info(`Server started with PID: ${this.serverPid}`);
    } catch (error) {
      this.logger.error(`Failed to spawn server process: ${error}`);
      this.managedProcess = null;
      this.serverPid = null;
      throw error; // Re-throw so caller can handle
    }

    // Setup output forwarding
    this.setupOutputForwarding();

    // Replay buffered messages
    if (this.messageBuffer.length > 0) {
      this.logger.debug(`Replaying ${this.messageBuffer.length} buffered messages...`);
      const writer = this.managedProcess.stdin.getWriter();

      for (const msg of this.messageBuffer) {
        const data = new TextEncoder().encode(JSON.stringify(msg) + "\n");
        await writer.write(data);
      }

      writer.releaseLock();
      this.messageBuffer = [];
    }
  }

  private async killServer() {
    if (!this.managedProcess || !this.serverPid) return;

    this.logger.info(`Killing server process ${this.serverPid}...`);

    try {
      // Check if this is a Docker process
      const isDocker = this.config.command === 'docker' && 
                      this.config.commandArgs[0] === 'run';
      
      if (isDocker) {
        // For Docker, we need to stop the container, not just the docker run process
        await this.stopDockerContainer();
      }

      // First try SIGTERM
      this.managedProcess.kill("SIGTERM");

      // Wait up to 5 seconds for graceful shutdown
      this.killTimeout = setTimeout(() => {
        this.logger.warning("Server didn't exit gracefully, sending SIGKILL...");
        this.managedProcess?.kill("SIGKILL");
      }, 5000);
      this.killTimeout.unref();

      await this.managedProcess.status;
      clearTimeout(this.killTimeout);
      this.killTimeout = undefined;

      // Verify process is actually dead
      await this.verifyProcessKilled(this.serverPid);

      this.logger.info(`Server process ${this.serverPid} terminated`);
    } catch (error) {
      this.logger.error(`Error killing server: ${error}`);
    }

    this.managedProcess = null;
    this.serverPid = null;
    this.containerId = undefined;
  }

  private async stopDockerContainer() {
    // Check if we have a tracked container ID (will be set by DOCKERFIX-1)
    if (!this.containerId) {
      this.logger.warning("No container ID tracked for this mcpmon instance, skipping container stop");
      return;
    }

    const containerId = this.containerId; // Save for consistent logging
    this.logger.info(`Stopping Docker container ${containerId}...`);

    try {
      // First try graceful stop with 10-second timeout
      this.logger.debug(`Attempting graceful stop with 10s timeout for container ${containerId}`);
      const stopProcess = this.procManager.spawn('docker', [
        'stop', '-t', '10', containerId
      ], {});
      
      await stopProcess.status;
      this.logger.info(`Successfully stopped Docker container ${containerId}`);
      
      // Clear the container ID after successful stop
      this.containerId = undefined;
    } catch (stopError) {
      this.logger.warning(`Graceful stop failed for container ${containerId}: ${stopError}`);
      
      // Fallback to force kill if stop fails
      try {
        this.logger.info(`Force killing container ${containerId}...`);
        const killProcess = this.procManager.spawn('docker', [
          'kill', containerId
        ], {});
        
        await killProcess.status;
        this.logger.info(`Force killed Docker container ${containerId}`);
        
        // Clear the container ID after force kill
        this.containerId = undefined;
      } catch (killError) {
        this.logger.error(`Failed to kill container ${containerId}: ${killError}`);
        this.logger.warning("Container may still be running - manual cleanup may be required");
        
        // Still clear the container ID to avoid trying to stop it again
        this.containerId = undefined;
      }
    }
  }

  private async verifyProcessKilled(pid: number) {
    // Try to check if process still exists
    try {
      // On Unix systems, sending signal 0 checks if process exists
      process.kill(pid, 0);
      // If we get here, process still exists
      this.logger.warning(`Process ${pid} still running, forcing kill...`);
      process.kill(pid, "SIGKILL");
    } catch {
      // Process doesn't exist, which is what we want
    }
  }

  private setupStdinForwarding() {
    if (this.stdinForwardingStarted) {
      return; // Already started, don't start again
    }
    this.stdinForwardingStarted = true;

    (async () => {
      const reader = this.stdin.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete JSON-RPC messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                let message: Message = JSON.parse(line);

                // Apply beforeStdinForward hook if available
                if (this.extensionHooks.beforeStdinForward) {
                  try {
                    message = await this.extensionHooks.beforeStdinForward(message);
                  } catch (hookError) {
                    this.logger.error("Extension hook error (beforeStdinForward):", { error: hookError });
                    // Continue with original message if hook fails
                  }
                }

                // Capture initialize params for replay
                if (message.method === "initialize") {
                  this.initializeParams = message.params;
                  this.initializeRequestId = message.id || null;
                  this.logger.debug("Captured initialize params for replay");
                }

                // Handle logging/setLevel requests
                if (message.method === "logging/setLevel") {
                  this.logger.debug("Intercepting logging/setLevel request");
                  
                  const level = (message.params as any)?.level;
                  if (level) {
                    this.setLogLevel(level);
                    this.logLevelRequestId = message.id || null;
                    
                    if (this.serverSupportsLogging) {
                      // Forward to server if it supports logging
                      this.logger.debug(`Forwarding logging/setLevel to server`);
                      // Normal forwarding will happen below
                    } else {
                      // Synthesize success response if server doesn't support logging
                      this.logger.debug(`Synthesizing logging/setLevel response (server doesn't support logging)`);
                      const response: Message = {
                        jsonrpc: "2.0",
                        id: message.id,
                        result: {}
                      };
                      const writer = this.stdout.getWriter();
                      await writer.write(new TextEncoder().encode(JSON.stringify(response) + "\n"));
                      writer.releaseLock();
                      continue; // Skip forwarding to server
                    }
                  }
                }

                // Check if this is a tools/list request that needs extension tools injected
                if (message.method === "tools/list") {
                  this.logger.debug("Intercepting tools/list request from client");
                  
                  // Forward to server first to get base tools
                  if (this.managedProcess) {
                    const writer = this.managedProcess.stdin.getWriter();
                    await writer.write(new TextEncoder().encode(JSON.stringify(message) + "\n"));
                    writer.releaseLock();
                    
                    // Store that we need to inject tools into this response
                    if (message.id) {
                      this.pendingToolsListRequests.set(message.id, true);
                      this.logger.debug(`Marked request ${message.id} for tool injection`);
                    }
                  }
                  continue; // Skip normal forwarding since we already forwarded
                }

                // Check if this is a tool call that should be handled by extensions
                if (message.method === "tools/call" && this.extensionHooks.handleToolCall) {
                  const toolName = (message.params as any)?.name;
                  this.logger.debug(`Received tools/call request for: ${toolName}`);
                  if (toolName && toolName.startsWith("mcpmon_")) {
                    this.logger.debug(`Extension tool call detected: ${toolName}`);
                    try {
                      const result = await this.extensionHooks.handleToolCall(toolName, (message.params as any)?.arguments || {});
                      if (result !== null) {
                        this.logger.debug(`Extension handled tool call: ${toolName}`);
                        // Send response directly back to client
                        const response: Message = {
                          jsonrpc: "2.0",
                          id: message.id,
                          result
                        };
                        const writer = this.stdout.getWriter();
                        await writer.write(new TextEncoder().encode(JSON.stringify(response) + "\n"));
                        writer.releaseLock();
                        continue; // Don't forward to server
                      }
                    } catch (error) {
                      this.logger.error(`Extension tool error for ${toolName}: ${error}`);
                      // Send error response
                      const errorResponse: Message = {
                        jsonrpc: "2.0",
                        id: message.id,
                        error: {
                          code: -32603,
                          message: `Extension tool error: ${error}`,
                          data: { toolName }
                        }
                      };
                      const writer = this.stdout.getWriter();
                      await writer.write(new TextEncoder().encode(JSON.stringify(errorResponse) + "\n"));
                      writer.releaseLock();
                      continue; // Don't forward to server
                    }
                  }
                }

                // During restart, buffer all messages
                if (this.restarting) {
                  this.messageBuffer.push(message);
                  this.logger.debug(
                    `Buffered message during restart: ${
                      message.method || `response ${message.id}`
                    }`
                  );
                } else if (this.managedProcess) {
                  // Forward to server
                  const writer = this.managedProcess.stdin.getWriter();
                  await writer.write(new TextEncoder().encode(JSON.stringify(message) + "\n"));
                  writer.releaseLock();
                }
              } catch (e) {
                this.logger.error("Failed to parse message:", { error: e });
              }
            }
          }
        }
      } catch (error) {
        this.logger.error("Stdin forwarding error:", { error });
      }
    })();
  }

  private setupOutputForwarding() {
    if (!this.managedProcess) return;

    // Forward stdout
    (async () => {
      const reader = this.managedProcess!.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Parse messages first to allow hook modifications
          const text = decoder.decode(value, { stream: true });
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                let message: Message = JSON.parse(line);
                let modifiedMessage = message;
                
                // Check if this is a tools/list response that needs extension tools injected
                if (message.id && this.pendingToolsListRequests.has(message.id)) {
                  this.logger.debug(`Processing tools/list response for request ${message.id}`);
                  this.pendingToolsListRequests.delete(message.id);
                  
                  // Get extension tools
                  if (this.extensionHooks.getAdditionalTools && message.result) {
                    try {
                      const extensionTools = await this.extensionHooks.getAdditionalTools();
                      this.logger.debug(`Extension provided ${extensionTools.length} tools`);
                      
                      // Log tool details for debugging
                      extensionTools.forEach(tool => {
                        this.logger.debug(`  - ${tool.name}: ${tool.description}`);
                        // Validate tool schema
                        if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
                          this.logger.warning(`  Tool ${tool.name} has invalid inputSchema`);
                        }
                      });
                      
                      // Merge extension tools with server tools
                      const serverTools = (message.result as { tools?: unknown[] })?.tools || [];
                      const mergedTools = [...serverTools, ...extensionTools];
                      
                      modifiedMessage = {
                        ...message,
                        result: {
                          ...(message.result as object),
                          tools: mergedTools
                        }
                      };
                      
                      this.logger.debug(`Injected ${extensionTools.length} extension tools into response (total: ${mergedTools.length})`);
                      
                      // Log the final JSON for debugging (truncated)
                      const responseText = JSON.stringify(modifiedMessage);
                      if (responseText.length > 500) {
                        this.logger.debug(`Response (truncated): ${responseText.substring(0, 500)}...`);
                      } else {
                        this.logger.debug(`Response: ${responseText}`);
                      }
                    } catch (error) {
                      this.logger.error(`Failed to inject extension tools: ${error}`);
                    }
                  }
                }
                
                // Check if this is an initialize response that needs capability injection
                if (message.id && message.id === this.initializeRequestId && message.result && (message.result as any).protocolVersion) {
                  this.logger.debug("Intercepting initialize response for capability injection");
                  
                  try {
                    // Deep clone the response to avoid mutations
                    const result = JSON.parse(JSON.stringify(message.result)) as any;
                    
                    // Ensure capabilities object exists
                    if (!result.capabilities) {
                      result.capabilities = {};
                    }
                    
                    // Inject tools.listChanged capability
                    if (!result.capabilities.tools) {
                      result.capabilities.tools = {};
                    }
                    if (result.capabilities.tools.listChanged !== true) {
                      result.capabilities.tools.listChanged = true;
                      this.logger.debug("Injected tools.listChanged capability");
                    }
                    
                    // Inject logging capability
                    if (!result.capabilities.logging) {
                      result.capabilities.logging = {};
                      this.logger.debug("Injected logging capability");
                    }
                    
                    // Check if server supports logging
                    this.serverSupportsLogging = !!result.capabilities.logging;
                    
                    modifiedMessage = {
                      ...message,
                      result
                    };
                    
                    this.logger.debug(`Modified initialize response with injected capabilities`);
                  } catch (error) {
                    this.logger.error(`Failed to inject capabilities: ${error}`);
                    // Continue with original message if injection fails
                  }
                }
                
                // Apply afterStdoutReceive hook if available
                if (this.extensionHooks.afterStdoutReceive) {
                  try {
                    modifiedMessage = await this.extensionHooks.afterStdoutReceive(modifiedMessage);
                  } catch (hookError) {
                    this.logger.error("Extension hook error (afterStdoutReceive):", { error: hookError });
                    // Continue with original message if hook fails
                    modifiedMessage = message;
                  }
                }
                
                // Forward the modified message to stdout
                const writer = this.stdout.getWriter();
                const modifiedText = JSON.stringify(modifiedMessage) + "\n";
                await writer.write(new TextEncoder().encode(modifiedText));
                writer.releaseLock();
                
                // Handle pending requests
                if (modifiedMessage.id && this.pendingRequests.has(modifiedMessage.id)) {
                  const pending = this.pendingRequests.get(modifiedMessage.id)!;
                  clearTimeout(pending.timeoutId);
                  this.pendingRequests.delete(modifiedMessage.id);
                  pending.resolve(modifiedMessage);
                }
              } catch {
                // Not JSON, forward as-is
                const writer = this.stdout.getWriter();
                await writer.write(new TextEncoder().encode(line + "\n"));
                writer.releaseLock();
              }
            }
          }
        }
      } catch (error) {
        if (!this.restarting) {
          this.logger.error("Stdout forwarding error:", { error });
        }
      }
    })();

    // Transform and forward stderr
    (async () => {
      const reader = this.managedProcess!.stderr.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Parse stderr messages line by line like stdout
          const text = decoder.decode(value, { stream: true });
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              const parsed = parseStderrLine(line);
              if (parsed && this.shouldForwardLog(parsed.level)) {
                // Convert to MCP log notification
                const notification = {
                  jsonrpc: "2.0",
                  method: "notifications/message",
                  params: {
                    level: parsed.level,
                    logger: "server",
                    data: {
                      message: parsed.message,
                      ...parsed.data
                    }
                  }
                };

                // Send as MCP notification via stdout
                const writer = this.stdout.getWriter();
                await writer.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
                writer.releaseLock();
              }
            }
          }

          // Also preserve original stderr forwarding for non-MCP content
          const stderrWriter = this.stderr.getWriter();
          await stderrWriter.write(value);
          stderrWriter.releaseLock();
        }
      } catch (error) {
        if (!this.restarting) {
          this.logger.error("Stderr forwarding error:", { error });
        }
      }
    })();
  }

  private sendRequest(method: string, params?: unknown): Promise<Message> {
    const id = this.currentRequestId++;
    const request: Message = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Request timeout" } });
        }
      }, 5000);
      timeoutId.unref();

      this.pendingRequests.set(id, { resolve, reject, timeoutId });

      if (this.managedProcess) {
        const writer = this.managedProcess.stdin.getWriter();
        writer
          .write(new TextEncoder().encode(JSON.stringify(request) + "\n"))
          .then(() => writer.releaseLock())
          .catch((error) => {
            const pending = this.pendingRequests.get(id);
            if (pending) {
              clearTimeout(pending.timeoutId);
              this.pendingRequests.delete(id);
              resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: error.toString() } });
            }
          });
      } else {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(id);
          resolve({ jsonrpc: "2.0", id, error: { code: -32603, message: "Server not running" } });
        }
      }
    });
  }

  private async getToolsList(): Promise<unknown[]> {
    if (!this.managedProcess) return [];

    try {
      this.logger.debug("Fetching tools list from server...");

      // First ensure server is initialized
      if (this.initializeParams) {
        this.logger.debug("Sending initialize request to new server...");
        const initResponse = await this.sendRequest("initialize", this.initializeParams);
        if (initResponse.error) {
          this.logger.error("Failed to initialize server:", { error: initResponse.error });
          this.logger.info("Server may need environment variables. Check your .env file");
          return [];
        }
        this.logger.info("Server initialized successfully");
        
        // Replay logging/setLevel if client had set one
        if (this.clientLogLevel !== 'info' && this.serverSupportsLogging) {
          this.logger.debug(`Replaying logging/setLevel with level: ${this.clientLogLevel}`);
          const logResponse = await this.sendRequest("logging/setLevel", { level: this.clientLogLevel });
          if (logResponse.error) {
            this.logger.warning("Failed to replay logging/setLevel:", { error: logResponse.error });
          } else {
            this.logger.info("Logging level restored on new server");
          }
        }
      } else {
        this.logger.warning("No initialize params captured from original connection");
      }

      // Get tools list
      this.logger.debug("Requesting tools list...");
      const response = await this.sendRequest("tools/list", {});

      if (response.error) {
        this.logger.error("Failed to get tools list:", { error: response.error });
        return [];
      }

      let tools = (response.result as { tools?: unknown[] })?.tools || [];
      
      // Add extension tools if available
      if (this.extensionHooks.getAdditionalTools) {
        try {
          const additionalTools = await this.extensionHooks.getAdditionalTools();
          tools = [...tools, ...additionalTools];
          this.logger.debug(`Added ${additionalTools.length} extension tools`);
        } catch (error) {
          this.logger.error(`Error getting extension tools: ${error}`);
        }
      }
      
      this.logger.info(`Found ${tools.length} tools total`);

      // Log tool names for debugging
      if (tools.length > 0) {
        const toolNames = tools.map((t: unknown) => (t as { name: string }).name).join(", ");
        this.logger.debug(`Tools: ${toolNames}`);
      }

      return tools;
    } catch (error) {
      this.logger.error("Error getting tools list:", { error });
      return [];
    }
  }

  readonly restart: DebouncedFunction<() => Promise<void>>;

  /**
   * Sets the client's desired log level
   */
  private setLogLevel(level: string): void {
    const validLevels = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
    if (validLevels.includes(level)) {
      this.clientLogLevel = level;
      this.logger.debug(`Client log level set to: ${level}`);
    } else {
      this.logger.warning(`Invalid log level: ${level}. Valid levels are: ${validLevels.join(', ')}`);
    }
  }

  /**
   * Create a display-safe version of the command with environment variables masked
   */
  private getSafeCommandDisplay(): string {
    const command = this.config.command;
    const args = this.config.commandArgs.map(arg => {
      // Mask potential environment variable values (KEY=VALUE format)
      if (arg.includes('=')) {
        const [key, ...valueParts] = arg.split('=');
        // Common env var patterns to mask
        const sensitiveKeys = ['token', 'key', 'secret', 'password', 'auth', 'api', 'credential'];
        const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s));
        if (isSensitive) {
          return `${key}=***`;
        }
        // For other env vars, show first 2 chars if value is long
        const value = valueParts.join('=');
        if (value.length > 8) {
          return `${key}=${value.substring(0, 2)}***`;
        }
      }
      return arg;
    });
    
    return `${command} ${args.join(' ')}`;
  }

  /**
   * Determines if a log message should be forwarded based on severity
   */
  private shouldForwardLog(level: string): boolean {
    const severityOrder = {
      'emergency': 0,
      'alert': 1,
      'critical': 2,
      'error': 3,
      'warning': 4,
      'notice': 5,
      'info': 6,
      'debug': 7
    };

    const logSeverity = severityOrder[level as keyof typeof severityOrder];
    const clientSeverity = severityOrder[this.clientLogLevel as keyof typeof severityOrder];

    // If either severity is undefined, default to forwarding
    if (logSeverity === undefined || clientSeverity === undefined) {
      return true;
    }

    // Forward if log level is at or above (numerically less than or equal) the client level
    return logSeverity <= clientSeverity;
  }

  private async startWatcher() {
    if (!this.config.watchTargets || this.config.watchTargets.length === 0) return;

    try {
      // For file-based targets, verify they exist by attempting to read them
      for (const target of this.config.watchTargets) {
        try {
          await this.changeSource.readFile(target);
        } catch (error) {
          // Log warning but continue - some targets might not be files (e.g., packages)
          this.logger.warning(`Could not verify target: ${target} (${error})`);
        }
      }

      const targets = this.config.watchTargets.join(", ");
      this.logger.info(`Watching ${targets} for changes`);

      this.fileWatcher = this.changeSource.watch(this.config.watchTargets);
      for await (const event of this.fileWatcher) {
        // Check if shutdown was requested
        if (this.shutdownRequested) {
          break;
        }
        // Handle both old FileEvent types and new ChangeEvent types
        if (["modify", "remove", "version_update", "dependency_change"].includes(event.type)) {
          this.logger.debug(`${event.type}: ${event.path}`);
          this.restart();
        }
      }
    } catch (error) {
      this.logger.error(`Failed to watch file: ${error}`);
    }
  }

  async shutdown() {
    this.logger.info("Shutting down proxy...");
    this.restarting = true;
    this.shutdownRequested = true;

    // Clear any pending restart
    this.restart.clear();

    // Shutdown extensions
    if (this.extensionRegistry) {
      try {
        await this.extensionRegistry.shutdownAll();
      } catch (error) {
        this.logger.error("Error shutting down extensions:", { error });
      }
    }

    // Clear monitoring timeouts
    if (this.monitoringTimeout) {
      clearTimeout(this.monitoringTimeout);
      this.monitoringTimeout = undefined;
    }
    if (this.errorRetryTimeout) {
      clearTimeout(this.errorRetryTimeout);
      this.errorRetryTimeout = undefined;
    }

    // Clear all pending request timeouts
    for (const [id, request] of this.pendingRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error("Proxy shutting down"));
    }
    this.pendingRequests.clear();

    // Clear kill timeout if exists
    if (this.killTimeout) {
      clearTimeout(this.killTimeout);
      this.killTimeout = undefined;
    }

    // Kill the server
    await this.killServer();

    // Note: Process exit is handled by the caller (main.ts or test runner)
  }
}
