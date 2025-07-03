import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { parseWatchAndCommand } from '../../src/cli-utils';

describe('Mixed Watch Targets', () => {
  let tempDir: string;
  
  // Helper to create test files
  const createTestFile = (filename: string, content: string = ''): void => {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
  };
  
  // Helper to create test directory
  const createTestDir = (dirname: string): void => {
    const dirPath = path.join(tempDir, dirname);
    fs.mkdirSync(dirPath, { recursive: true });
  };
  
  // Helper to get merged watch targets (simulating CLI logic)
  const getMergedWatchTargets = (args: string[]): string[] => {
    const config = parseWatchAndCommand(args);
    
    // Convert parsed watch targets to absolute paths
    const watchTargets = (config.watchTargets || []).map(target => 
      path.isAbsolute(target) ? target : path.resolve(target)
    );
    
    // Auto-detect files if needed (simulate CLI behavior)
    // In mixed mode, always add auto-detected files
    for (const arg of config.commandArgs) {
      if (!arg.startsWith('-')) {
        const ext = path.extname(arg);
        if (['.js', '.mjs', '.ts', '.py', '.rb', '.php'].includes(ext)) {
          const fullPath = path.isAbsolute(arg) ? arg : path.resolve(arg);
          if (!watchTargets.includes(fullPath)) {
            watchTargets.push(fullPath);
          }
          break;
        }
      }
    }
    
    // Remove duplicates while preserving order
    return [...new Set(watchTargets)];
  };

  beforeEach(() => {
    // Create real temporary directory
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcpmon-mixed-test-')));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should watch both explicit config.json and auto-detected server.js', () => {
    // Create test files
    createTestFile('config.json', '{"port": 3000}');
    createTestFile('server.js', 'console.log("server");');
    
    const configPath = path.join(tempDir, 'config.json');
    const serverPath = path.join(tempDir, 'server.js');
    
    // Change to temp dir for relative path testing
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Test command with explicit watch target
      const args = ['--watch', 'config.json', 'node', 'server.js'];
      const watchTargets = getMergedWatchTargets(args);
      
      // Verify both files are watched
      expect(watchTargets).toHaveLength(2);
      expect(watchTargets).toContain(configPath);
      expect(watchTargets).toContain(serverPath);
      
      // Verify order: explicit targets first
      expect(watchTargets[0]).toBe(configPath);
      expect(watchTargets[1]).toBe(serverPath);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should watch multiple directories and auto-detected python file', () => {
    // Create directory structure
    createTestDir('dir1');
    createTestDir('dir2');
    createTestFile('dir1/file1.txt', 'content1');
    createTestFile('dir2/file2.txt', 'content2');
    createTestFile('app.py', 'print("hello")');
    
    const dir1Path = path.join(tempDir, 'dir1');
    const dir2Path = path.join(tempDir, 'dir2');
    const appPath = path.join(tempDir, 'app.py');
    
    // Change to temp dir
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Test command with multiple watch targets
      const args = ['--watch', 'dir1', '--watch', 'dir2', 'python', 'app.py'];
      const watchTargets = getMergedWatchTargets(args);
      
      // Verify all three paths are watched
      expect(watchTargets).toHaveLength(3);
      expect(watchTargets).toContain(dir1Path);
      expect(watchTargets).toContain(dir2Path);
      expect(watchTargets).toContain(appPath);
      
      // Verify order: explicit directories first, then auto-detected
      expect(watchTargets[0]).toBe(dir1Path);
      expect(watchTargets[1]).toBe(dir2Path);
      expect(watchTargets[2]).toBe(appPath);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should deduplicate paths when explicit and auto-detected overlap', () => {
    // Create test files
    createTestFile('main.js', 'require("./lib");');
    createTestFile('lib.js', 'module.exports = {};');
    
    const mainPath = path.join(tempDir, 'main.js');
    const libPath = path.join(tempDir, 'lib.js');
    
    // Change to temp dir
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Explicitly watch main.js, which is also auto-detected
      const args = ['--watch', 'main.js', '--watch', 'lib.js', 'node', 'main.js'];
      const watchTargets = getMergedWatchTargets(args);
      
      // Verify no duplicates
      expect(watchTargets).toHaveLength(2);
      expect(watchTargets).toContain(mainPath);
      expect(watchTargets).toContain(libPath);
      
      // Count occurrences
      const mainCount = watchTargets.filter(t => t === mainPath).length;
      const libCount = watchTargets.filter(t => t === libPath).length;
      
      expect(mainCount).toBe(1);
      expect(libCount).toBe(1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle multiple --watch flags with proper merging', () => {
    // Create complex file structure
    createTestDir('src');
    createTestDir('config');
    createTestFile('src/index.ts', 'console.log("main");');
    createTestFile('src/utils.ts', 'export const helper = () => {};');
    createTestFile('config/app.json', '{"name": "test"}');
    createTestFile('server.ts', 'import "./src/index";');
    
    const srcPath = path.join(tempDir, 'src');
    const configPath = path.join(tempDir, 'config');
    const serverPath = path.join(tempDir, 'server.ts');
    const appJsonPath = path.join(tempDir, 'config/app.json');
    
    // Change to temp dir
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Multiple --watch flags
      const args = [
        '--watch', 'src',
        '--watch', 'config',
        '--watch', 'config/app.json', // Duplicate: already covered by config dir
        'deno', 'run', '--allow-all', 'server.ts'
      ];
      
      const watchTargets = getMergedWatchTargets(args);
      
      // Verify targets
      expect(watchTargets).toContain(srcPath);
      expect(watchTargets).toContain(configPath);
      expect(watchTargets).toContain(serverPath);
      
      // Watch list should include the specific file path too
      expect(watchTargets).toContain(appJsonPath);
      
      // All paths are included
      expect(watchTargets.length).toBe(4);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should prioritize explicit paths over auto-detected ones', () => {
    // Create test files with dependencies
    createTestDir('lib');
    createTestFile('lib/core.js', 'module.exports = { version: 1 };');
    createTestFile('lib/helper.js', 'module.exports = { help: true };');
    createTestFile('main.js', 'require("./lib/core"); require("./lib/helper");');
    
    const libPath = path.join(tempDir, 'lib');
    const mainPath = path.join(tempDir, 'main.js');
    
    // Change to temp dir
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Explicitly watch the lib directory
      const args = ['--watch', 'lib', 'node', 'main.js'];
      const watchTargets = getMergedWatchTargets(args);
      
      // Verify explicit targets come first
      expect(watchTargets[0]).toBe(libPath);
      
      // Main.js should be included but after explicit targets
      const mainIndex = watchTargets.indexOf(mainPath);
      expect(mainIndex).toBeGreaterThan(0);
      
      // Should not include individual lib files since directory is watched
      const coreIndex = watchTargets.indexOf(path.join(tempDir, 'lib/core.js'));
      const helperIndex = watchTargets.indexOf(path.join(tempDir, 'lib/helper.js'));
      expect(coreIndex).toBe(-1);
      expect(helperIndex).toBe(-1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle relative and absolute paths correctly', () => {
    // Create test files
    createTestFile('app.js', 'console.log("app");');
    createTestFile('config.json', '{}');
    
    const originalCwd = process.cwd();
    
    try {
      // Change to temp directory
      process.chdir(tempDir);
      
      // Mix relative and absolute paths
      const args = [
        '--watch', './config.json', // relative
        '--watch', path.join(tempDir, 'app.js'), // absolute
        'node', 'app.js' // relative
      ];
      
      const watchTargets = getMergedWatchTargets(args);
      
      // All paths should be absolute
      watchTargets.forEach(target => {
        expect(path.isAbsolute(target)).toBe(true);
      });
      
      // Should contain both files
      expect(watchTargets).toHaveLength(2);
      
      // Verify actual files are watched (normalized to absolute)
      const expectedConfig = path.join(tempDir, 'config.json');
      const expectedApp = path.join(tempDir, 'app.js');
      
      expect(watchTargets).toContain(expectedConfig);
      expect(watchTargets).toContain(expectedApp);
      
    } finally {
      // Restore original directory
      process.chdir(originalCwd);
    }
  });

  it('should handle non-existent explicit watch targets gracefully', () => {
    // Create only one file
    createTestFile('server.js', 'console.log("server");');
    
    const serverPath = path.join(tempDir, 'server.js');
    const nonExistentPath = path.join(tempDir, 'does-not-exist.json');
    
    // Change to temp dir
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Try to watch non-existent file
      const args = ['--watch', 'does-not-exist.json', 'node', 'server.js'];
      const watchTargets = getMergedWatchTargets(args);
      
      // Should include both paths (validation happens later)
      expect(watchTargets).toContain(nonExistentPath);
      expect(watchTargets).toContain(serverPath);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should preserve watch target order across complex scenarios', () => {
    // Create complex structure
    createTestDir('src');
    createTestDir('tests');
    createTestDir('config');
    createTestFile('src/index.js', '');
    createTestFile('tests/test.js', '');
    createTestFile('config/dev.json', '');
    createTestFile('main.js', '');
    
    const targets = [
      'config',
      'tests',
      'src/index.js',
    ];
    
    const expectedPaths = targets.map(t => path.join(tempDir, t));
    const mainPath = path.join(tempDir, 'main.js');
    
    // Change to temp dir
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    
    try {
      // Build args with multiple --watch
      const args: string[] = [];
      targets.forEach(target => {
        args.push('--watch', target);
      });
      args.push('node', 'main.js');
      
      const watchTargets = getMergedWatchTargets(args);
      
      // Verify order is preserved
      expectedPaths.forEach((expectedPath, index) => {
        expect(watchTargets[index]).toBe(expectedPath);
      });
      
      // Auto-detected main.js should be last
      expect(watchTargets[watchTargets.length - 1]).toBe(mainPath);
    } finally {
      process.chdir(originalCwd);
    }
  });
});