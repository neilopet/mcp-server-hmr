#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Setup script for MCP Server Watch
 * Configures PATH to include watch command globally
 */

import { resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/mod.ts";

const HOME = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
const SHELL = Deno.env.get("SHELL") || "";
const PROJECT_DIR = resolve(new URL("..", import.meta.url).pathname);

console.log("🚀 MCP Server Watch Setup");
console.log("=====================\n");

// Detect shell
function detectShell(): { name: string; configFile: string } {
  const shellPath = SHELL.toLowerCase();

  if (shellPath.includes("zsh")) {
    return { name: "zsh", configFile: ".zshrc" };
  } else if (shellPath.includes("bash")) {
    // Check for .bash_profile vs .bashrc
    const profilePath = resolve(HOME, ".bash_profile");
    const rcPath = resolve(HOME, ".bashrc");

    if (Deno.build.os === "darwin" && existsSync(profilePath)) {
      return { name: "bash", configFile: ".bash_profile" };
    }
    return { name: "bash", configFile: ".bashrc" };
  } else if (shellPath.includes("fish")) {
    return { name: "fish", configFile: ".config/fish/config.fish" };
  }

  // Default to bash
  return { name: "bash", configFile: ".bashrc" };
}

// Setup PATH
async function setupPath() {
  const shell = detectShell();
  const configPath = resolve(HOME, shell.configFile);

  console.log(`📁 Project directory: ${PROJECT_DIR}`);
  console.log(`🐚 Detected shell: ${shell.name}`);
  console.log(`📝 Config file: ${configPath}`);

  // Check if watch command already exists in PATH
  const currentPath = Deno.env.get("PATH") || "";
  if (currentPath.includes(PROJECT_DIR)) {
    console.log("\n✅ Project directory already in PATH!");
    return;
  }

  // Prepare PATH export line
  const pathExport = shell.name === "fish"
    ? `\n# MCP Server Watch\nset -gx PATH $PATH "${PROJECT_DIR}"\n`
    : `\n# MCP Server Watch\nexport PATH="$PATH:${PROJECT_DIR}"\n`;

  try {
    // Check if config file exists
    if (!existsSync(configPath)) {
      await Deno.writeTextFile(configPath, pathExport);
      console.log(`\n✅ Created ${shell.configFile} and added to PATH`);
    } else {
      // Check if already added
      const content = await Deno.readTextFile(configPath);
      if (content.includes("MCP Server Watch") || content.includes("MCP Server HMR")) {
        console.log("\n✅ MCP Server Watch already configured in PATH!");
        return;
      }

      // Append to existing file
      await Deno.writeTextFile(configPath, pathExport, { append: true });
      console.log(`\n✅ Added MCP Server Watch to PATH in ${shell.configFile}`);
    }

    console.log("\n🔄 To apply changes, run:");
    console.log(`   source ~/${shell.configFile}`);
    console.log("\n📋 Or restart your terminal");
  } catch (error) {
    console.error(`\n❌ Failed to update ${shell.configFile}: ${error.message}`);
    console.error("\n💡 You can manually add this line to your shell config:");
    console.error(pathExport.trim());
  }
}

// Create global command symlinks
async function createCommands() {
  console.log("\n🔗 Setting up commands...");

  // Ensure scripts are executable
  const scripts = ["watch", "src/main.ts", "src/config_launcher.ts"];

  for (const script of scripts) {
    const scriptPath = resolve(PROJECT_DIR, script);
    if (existsSync(scriptPath)) {
      try {
        await Deno.chmod(scriptPath, 0o755);
        console.log(`   ✅ Made ${script} executable`);
      } catch (error) {
        console.error(`   ❌ Failed to chmod ${script}: ${error.message}`);
      }
    }
  }
}

// Main setup
async function main() {
  await createCommands();
  await setupPath();

  const watchPath = resolve(PROJECT_DIR, "watch");

  console.log("\n🎉 Setup complete!");
  console.log("\n📍 Full path to watch command:");
  console.log(`   ${watchPath}`);
  console.log("\nYou can now use:");
  console.log("   watch --help");
  console.log("   watch --list");
  console.log("   watch --server <name>");
  console.log("   watch --setup <name>");
  console.log("\n💡 When configuring MCP clients manually, use the full path above.");
}

// Run setup
if (import.meta.main) {
  main();
}
