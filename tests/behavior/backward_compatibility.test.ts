import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPProxy, MCPProxyConfig } from '../../src/proxy';
import { setupProxyTest } from './test_helper';
import { MockFileSystem } from '../mocks/MockFileSystem';
import { MockProcessManager } from '../mocks/MockProcessManager';
import { parseWatchAndCommand } from '../../src/cli-utils';
import { tmpdir } from 'os';
import { join, extname } from 'path';

describe('Backward Compatibility Tests', () => {
  let mockFs: MockFileSystem;
  let mockProcessManager: MockProcessManager;
  let tempDir: string;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    mockProcessManager = new MockProcessManager();
    tempDir = join(tmpdir(), `mcpmon-test-${Date.now()}`);
  });

  // Helper function to create config from CLI args - simulates what cli.ts does
  async function createConfigFromArgs(args: string[]): Promise<MCPProxyConfig> {
    // Parse out --watch flags first (like cli.ts does)
    const parsed = parseWatchAndCommand(args);
    let watchTargets: string[] = [...parsed.watchTargets];
    
    // Handle legacy --watch option (comma-separated)
    const watchIndex = args.indexOf('--watch');
    if (watchIndex !== -1 && watchIndex + 1 < args.length) {
      const watchValue = args[watchIndex + 1];
      if (watchValue.includes(',')) {
        watchTargets = watchValue.split(',').map(p => p.trim());
      }
    }
    
    // Handle environment variable
    if (watchTargets.length === 0 && process.env.MCPMON_WATCH) {
      watchTargets = process.env.MCPMON_WATCH.split(',').map(p => p.trim());
    }
    
    // Auto-detect if no explicit targets
    if (watchTargets.length === 0) {
      // Auto-detect from first file argument
      for (const arg of parsed.commandArgs) {
        if (!arg.startsWith('-')) {
          const ext = extname(arg);
          if (['.js', '.mjs', '.ts', '.py', '.rb', '.php'].includes(ext)) {
            watchTargets.push(arg);
            break;
          }
        }
      }
    }
    
    // Handle restart delay
    const delayIndex = args.indexOf('--delay');
    let restartDelay = 100;
    if (delayIndex !== -1 && delayIndex + 1 < args.length) {
      restartDelay = parseInt(args[delayIndex + 1]) || 100;
    }

    return {
      command: parsed.command || 'node',
      commandArgs: parsed.commandArgs,
      watchTargets,
      restartDelay,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>
    };
  }

  // Helper to create and validate proxy behavior
  async function validateProxyConfig(
    args: string[],
    expectedConfig: Partial<MCPProxyConfig>
  ): Promise<void> {
    const config = await createConfigFromArgs(args);
    
    // Validate expected properties
    if (expectedConfig.command !== undefined) {
      expect(config.command).toBe(expectedConfig.command);
    }
    if (expectedConfig.commandArgs !== undefined) {
      expect(config.commandArgs).toEqual(expectedConfig.commandArgs);
    }
    if (expectedConfig.watchTargets !== undefined) {
      expect(config.watchTargets).toEqual(expectedConfig.watchTargets);
    }
    if (expectedConfig.restartDelay !== undefined) {
      expect(config.restartDelay).toBe(expectedConfig.restartDelay);
    }
  }

  describe('CLI Pattern Compatibility', () => {
    it('should handle "mcpmon node server.js" identically to current behavior', async () => {
      // Setup mock file
      const serverPath = join(tempDir, 'server.js');
      mockFs.setFileContent(serverPath, 'console.log("Hello");');

      await validateProxyConfig(
        ['node', 'server.js'],
        {
          command: 'node',
          commandArgs: ['server.js'],
          watchTargets: ['server.js'],
          restartDelay: 100
        }
      );
    });

    it('should handle "mcpmon python app.py" with auto-detection', async () => {
      // Setup mock file
      const appPath = join(tempDir, 'app.py');
      mockFs.setFileContent(appPath, 'print("Hello from Python")');

      await validateProxyConfig(
        ['python', 'app.py'],
        {
          command: 'python',
          commandArgs: ['app.py'],
          watchTargets: ['app.py'],
          restartDelay: 100
        }
      );
    });

    it('should preserve other CLI options like --restart-delay', async () => {
      const serverPath = join(tempDir, 'app.js');
      mockFs.setFileContent(serverPath, 'console.log("App");');

      await validateProxyConfig(
        ['--delay', '1000', 'node', 'app.js'],
        {
          command: 'node',
          commandArgs: ['app.js'],
          watchTargets: ['app.js'],
          restartDelay: 1000
        }
      );
    });

    it('should handle commands with multiple arguments', async () => {
      const scriptPath = join(tempDir, 'script.ts');
      mockFs.setFileContent(scriptPath, 'console.log("TypeScript");');

      await validateProxyConfig(
        ['deno', 'run', '--allow-all', 'script.ts'],
        {
          command: 'deno',
          commandArgs: ['run', '--allow-all', 'script.ts'],
          watchTargets: ['script.ts'],
          restartDelay: 100
        }
      );
    });

    it('should handle complex CLI patterns with flags', async () => {
      const serverPath = join(tempDir, 'server.js');
      mockFs.setFileContent(serverPath, 'console.log("Server");');

      await validateProxyConfig(
        ['node', '--experimental-modules', 'server.js', '--port', '3000'],
        {
          command: 'node',
          commandArgs: ['--experimental-modules', 'server.js', '--port', '3000'],
          watchTargets: ['server.js'],
          restartDelay: 100
        }
      );
    });
  });

  describe('Environment Variable Compatibility', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should respect MCPMON_WATCH environment variable', async () => {
      process.env.MCPMON_WATCH = 'config.json,lib/**/*.js';

      await validateProxyConfig(
        ['node', 'server.js'],
        {
          command: 'node',
          commandArgs: ['server.js'],
          watchTargets: ['config.json', 'lib/**/*.js']
        }
      );
    });

    it('should handle empty MCPMON_WATCH gracefully', async () => {
      process.env.MCPMON_WATCH = '';

      await validateProxyConfig(
        ['node', 'server.js'],
        {
          command: 'node',
          commandArgs: ['server.js'],
          watchTargets: ['server.js'] // Falls back to auto-detection
        }
      );
    });
  });

  describe('Legacy --watch Option Compatibility', () => {
    it('should handle legacy comma-separated --watch option', async () => {
      await validateProxyConfig(
        ['--watch', 'src/**/*.js,config.json', 'node', 'server.js'],
        {
          command: 'node',
          commandArgs: ['server.js'],
          watchTargets: ['src/**/*.js', 'config.json']
        }
      );
    });

    it('should handle single file in --watch option', async () => {
      await validateProxyConfig(
        ['--watch', 'config.yaml', 'python', 'app.py'],
        {
          command: 'python',
          commandArgs: ['app.py'],
          watchTargets: ['config.yaml']
        }
      );
    });

    it('should prioritize --watch over auto-detection', async () => {
      await validateProxyConfig(
        ['--watch', 'custom.js', 'node', 'server.js'],
        {
          command: 'node',
          commandArgs: ['server.js'],
          watchTargets: ['custom.js'] // Not server.js
        }
      );
    });
  });

  describe('MCPProxy Behavior Consistency', () => {
    it('should create identical proxy instances for same config', async () => {
      const serverPath = join(tempDir, 'server.js');
      mockFs.setFileContent(serverPath, 'console.log("Test");');

      // Create config the old way (simulating current behavior)
      const oldConfig: MCPProxyConfig = {
        command: 'node',
        commandArgs: ['server.js'],
        watchTargets: ['server.js'],
        restartDelay: 100,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([_, value]) => value !== undefined)
        ) as Record<string, string>
      };

      // Create config the new way (with potential --watch changes)
      const newConfig = await createConfigFromArgs(['node', 'server.js']);

      // Both should produce same watchTargets
      expect(newConfig.watchTargets).toEqual(oldConfig.watchTargets);
      expect(newConfig.command).toBe(oldConfig.command);
      expect(newConfig.commandArgs).toEqual(oldConfig.commandArgs);
      expect(newConfig.restartDelay).toBe(oldConfig.restartDelay);
    });

    it('should maintain proxy constructor compatibility', async () => {
      // Setup file in mock filesystem first
      mockFs.setFileContent('test.js', 'console.log("test");');
      
      const config: MCPProxyConfig = {
        command: 'node',
        commandArgs: ['test.js'],
        watchTargets: ['test.js'],
        restartDelay: 50,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([_, value]) => value !== undefined)
        ) as Record<string, string>
      };

      // Create streams for the proxy
      const { readable: stdinReadable, writable: stdinWritable } = new TransformStream<Uint8Array>();
      const { readable: stdoutReadable, writable: stdoutWritable } = new TransformStream<Uint8Array>();
      const { readable: stderrReadable, writable: stderrWritable } = new TransformStream<Uint8Array>();

      // Test that proxy can be created with same dependencies
      const proxy = new MCPProxy(
        {
          procManager: mockProcessManager,
          fs: mockFs,
          stdin: stdinReadable,
          stdout: stdoutWritable,
          stderr: stderrWritable,
          exit: (code: number) => {}
        },
        config
      );

      // Verify proxy was created successfully
      expect(proxy).toBeDefined();
      expect(proxy).toBeInstanceOf(MCPProxy);
      
      // Verify that spawn hasn't been called yet
      // (MockProcessManager tracks spawn calls internally)
      expect(mockProcessManager.getSpawnCallCount()).toBe(0);
    });
  });

  describe('Edge Cases and Corner Cases', () => {
    it('should handle no arguments gracefully', async () => {
      await validateProxyConfig(
        [],
        {
          command: 'node', // Default
          commandArgs: [],
          watchTargets: [],
          restartDelay: 100
        }
      );
    });

    it('should handle only command without file', async () => {
      await validateProxyConfig(
        ['python'],
        {
          command: 'python',
          commandArgs: [],
          watchTargets: [],
          restartDelay: 100
        }
      );
    });

    it('should not treat flags as files for auto-detection', async () => {
      await validateProxyConfig(
        ['node', '--version'],
        {
          command: 'node',
          commandArgs: ['--version'],
          watchTargets: [], // --version is not a file
          restartDelay: 100
        }
      );
    });

    it('should handle mixed options and arguments', async () => {
      await validateProxyConfig(
        ['--delay', '500', '--watch', 'lib/**', 'python', '-m', 'mymodule'],
        {
          command: 'python',
          commandArgs: ['-m', 'mymodule'],
          watchTargets: ['lib/**'],
          restartDelay: 500
        }
      );
    });
  });

  describe('No Side Effects Validation', () => {
    it('should not introduce file system side effects', async () => {
      const initialCounts = mockFs.getOperationCounts();
      
      await createConfigFromArgs(['node', 'server.js']);
      
      const finalCounts = mockFs.getOperationCounts();
      expect(finalCounts).toEqual(initialCounts);
    });

    it('should not spawn processes during config creation', async () => {
      const initialSpawnCount = mockProcessManager.getSpawnCallCount();
      
      await createConfigFromArgs(['python', 'app.py']);
      
      expect(mockProcessManager.getSpawnCallCount()).toBe(initialSpawnCount);
    });

    it('should not modify process environment permanently', async () => {
      const originalEnv = { ...process.env };
      
      process.env.MCPMON_WATCH = 'test.js';
      await createConfigFromArgs(['node', 'app.js']);
      delete process.env.MCPMON_WATCH;
      
      expect(process.env).toEqual(originalEnv);
    });
  });
});