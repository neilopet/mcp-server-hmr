// Post-install script for mcp-server-hmr
// This script runs after npm install to build the project if needed

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

async function postInstall() {
  const cliPath = resolve(projectRoot, 'dist/cli.js');
  
  try {
    // Check if dist/cli.js exists
    if (!existsSync(cliPath)) {
      console.log('📦 Building project (dist files not found)...');
      try {
        execSync('npm run build', { 
          cwd: projectRoot,
          stdio: 'inherit'
        });
        // The postbuild script will handle making it executable
      } catch (buildError) {
        console.error('❌ Build failed:', buildError.message);
        console.error('   You may need to run "npm run build" manually');
        // Don't exit with error - this is a dev dependency scenario
        return;
      }
    } else {
      // If dist exists but might not be executable, run make-executable
      console.log('🔧 Ensuring CLI is executable...');
      try {
        execSync('npm run make-executable', { 
          cwd: projectRoot,
          stdio: 'inherit'
        });
      } catch (error) {
        // Ignore chmod errors on Windows
      }
    }
  } catch (error) {
    console.error('❌ Post-install error:', error.message);
    // Don't exit with error - we don't want to break npm install
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  postInstall().catch(console.error);
}