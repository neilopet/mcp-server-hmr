import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

Deno.test("Config launcher - setup preserves other servers", async () => {
  const tempDir = await Deno.makeTempDir();
  const configPath = join(tempDir, "test-config.json");

  // Create a config with multiple servers
  const originalConfig = {
    mcpServers: {
      "server-one": {
        command: "node",
        args: ["server1.js"],
        env: { API_KEY: "key1" },
      },
      "server-two": {
        command: "python",
        args: ["-m", "server2"],
        env: { TOKEN: "token2" },
      },
      "server-three": {
        command: "deno",
        args: ["run", "server3.ts"],
      },
    },
  };

  await Deno.writeTextFile(configPath, JSON.stringify(originalConfig, null, 2));

  // Run config_launcher.ts --setup server-two
  const configLauncherPath = new URL("../src/config_launcher.ts", import.meta.url).pathname;
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      configLauncherPath,
      "--setup",
      "server-two",
      "--config",
      configPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();

  // Check command succeeded
  assertEquals(code, 0, `Setup failed: ${new TextDecoder().decode(stderr)}`);

  // Read the modified config
  const modifiedConfigText = await Deno.readTextFile(configPath);
  const modifiedConfig = JSON.parse(modifiedConfigText);

  // Verify all original servers are still present
  assertExists(modifiedConfig.mcpServers["server-one"], "server-one should still exist");
  assertExists(modifiedConfig.mcpServers["server-two"], "server-two should still exist");
  assertExists(modifiedConfig.mcpServers["server-three"], "server-three should still exist");

  // Verify server-one and server-three are unchanged
  assertEquals(
    modifiedConfig.mcpServers["server-one"],
    originalConfig.mcpServers["server-one"],
    "server-one should be unchanged",
  );
  assertEquals(
    modifiedConfig.mcpServers["server-three"],
    originalConfig.mcpServers["server-three"],
    "server-three should be unchanged",
  );

  // Verify server-two is now using hot-reload
  assertEquals(
    modifiedConfig.mcpServers["server-two"].command.endsWith("/main.ts"),
    true,
    "server-two should use main.ts",
  );
  assertEquals(
    modifiedConfig.mcpServers["server-two"].args,
    ["python", "-m", "server2"],
    "server-two should have original command as args",
  );

  // Verify server-two-original exists with original config
  assertExists(
    modifiedConfig.mcpServers["server-two-original"],
    "server-two-original should exist",
  );
  assertEquals(
    modifiedConfig.mcpServers["server-two-original"],
    originalConfig.mcpServers["server-two"],
    "server-two-original should match original server-two",
  );

  // Verify no extra servers were added
  const expectedServerCount = 4; // 3 original + 1 -original
  assertEquals(
    Object.keys(modifiedConfig.mcpServers).length,
    expectedServerCount,
    `Should have exactly ${expectedServerCount} servers`,
  );

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("Config launcher - setup all preserves all servers", async () => {
  const tempDir = await Deno.makeTempDir();
  const configPath = join(tempDir, "test-config.json");

  // Create a config with stdio and HTTP servers
  const originalConfig = {
    mcpServers: {
      "stdio-server": {
        command: "node",
        args: ["server.js"],
      },
      "http-server": {
        command: "node",
        args: ["server.js", "--port", "3000"],
      },
      "another-stdio": {
        command: "python",
        args: ["server.py"],
      },
    },
  };

  await Deno.writeTextFile(configPath, JSON.stringify(originalConfig, null, 2));

  // Run config_launcher.ts --setup --all
  const configLauncherPath = new URL("../src/config_launcher.ts", import.meta.url).pathname;
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      configLauncherPath,
      "--setup",
      "--all",
      "--config",
      configPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();
  const outputText = new TextDecoder().decode(stdout);

  // Check command succeeded
  assertEquals(code, 0, `Setup failed: ${new TextDecoder().decode(stderr)}`);

  // Read the modified config
  const modifiedConfigText = await Deno.readTextFile(configPath);
  const modifiedConfig = JSON.parse(modifiedConfigText);

  // Verify HTTP server is unchanged (not stdio)
  assertEquals(
    modifiedConfig.mcpServers["http-server"],
    originalConfig.mcpServers["http-server"],
    "http-server should be unchanged",
  );

  // Verify stdio servers are converted
  assertEquals(
    modifiedConfig.mcpServers["stdio-server"].command.endsWith("/main.ts"),
    true,
    "stdio-server should use main.ts",
  );
  assertEquals(
    modifiedConfig.mcpServers["another-stdio"].command.endsWith("/main.ts"),
    true,
    "another-stdio should use main.ts",
  );

  // Verify originals exist
  assertExists(
    modifiedConfig.mcpServers["stdio-server-original"],
    "stdio-server-original should exist",
  );
  assertExists(
    modifiedConfig.mcpServers["another-stdio-original"],
    "another-stdio-original should exist",
  );

  // Verify no http-server-original (since it wasn't converted)
  assertEquals(
    modifiedConfig.mcpServers["http-server-original"],
    undefined,
    "http-server-original should not exist",
  );

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("Config launcher - list servers", async () => {
  const tempDir = await Deno.makeTempDir();
  const configPath = join(tempDir, "test-config.json");

  const config = {
    mcpServers: {
      "test-server": {
        command: "node",
        args: ["server.js"],
        env: { KEY: "value" },
      },
    },
  };

  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));

  const configLauncherPath = new URL("../src/config_launcher.ts", import.meta.url).pathname;
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-env",
      configLauncherPath,
      "--list",
      "--config",
      configPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);

  assertEquals(code, 0);
  assertEquals(output.includes("test-server"), true, "Should list test-server");
  assertEquals(output.includes("node server.js"), true, "Should show command");
  assertEquals(output.includes("KEY"), true, "Should show env vars");

  await Deno.remove(tempDir, { recursive: true });
});
