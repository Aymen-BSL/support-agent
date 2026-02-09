/**
 * OpenCode Server Management
 *
 * Handles spawning and managing the OpenCode server process.
 */

import { execSync } from "child_process";

const SERVER_PORT = 4096;
const SERVER_HOST = "127.0.0.1";
const STARTUP_TIMEOUT = 10000; // 10 seconds

/**
 * Kills any process using the specified port (Windows PowerShell)
 */
export function killPort(port: number): void {
  try {
    const command = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`;
    execSync(`powershell -Command "${command}"`, { stdio: "ignore" });
  } catch {
    // Ignore errors if no process found
  }
}

/**
 * Server spawn result
 */
export interface ServerSpawnResult {
  process: ReturnType<typeof Bun.spawn>;
  url: string;
}

/**
 * Spawns the OpenCode server and waits for it to be ready
 * 
 * Note: The server runs in the support-agent directory (where opencode.json is located).
 * The repository path is passed to the client via the 'directory' parameter, not via cwd.
 */
export async function spawnServer(
  initialModel: string,
): Promise<ServerSpawnResult> {
  // Kill any existing process on the port
  killPort(SERVER_PORT);
  await new Promise((r) => setTimeout(r, 1000));

  // console.log("Starting OpenCode server via Bun...");

  const opencodePath = "node_modules/.bin/opencode";

  const proc = Bun.spawn(
    [
      opencodePath,
      "serve",
      `--port=${SERVER_PORT}`,
      `--hostname=${SERVER_HOST}`,
    ],
    {
      env: {
        ...process.env,
        OPENCODE_MODEL: initialModel,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // Read stdout to detect when server is ready
  let buffer = "";
  let serverUrl = "";

  const stdoutReader = proc.stdout.getReader();
  const decoder = new TextDecoder();

  // Background reader to prevent buffer blocking
  (async () => {
    try {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        buffer += chunk;

        if (!serverUrl && buffer.includes("opencode server listening on")) {
          const match = buffer.match(/on\s+(https?:\/\/[^\s]+)/);
          if (match) {
            serverUrl = match[1]!;
            // console.log(`Server started at ${serverUrl}`);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  })();

  // Drain stderr to prevent blocking
  if (proc.stderr) {
    const stderrReader = proc.stderr.getReader();
    (async () => {
      try {
        while (true) {
          const { done } = await stderrReader.read();
          if (done) break;
        }
      } catch {
        // Ignore read errors
      }
    })();
  }

  // Wait for server URL to be detected
  const startTime = Date.now();
  while (!serverUrl) {
    if (Date.now() - startTime > STARTUP_TIMEOUT) {
      throw new Error("Timeout waiting for server to start");
    }
    if (proc.exitCode !== null) {
      throw new Error(`Server failed to start (exit code: ${proc.exitCode})`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return { process: proc, url: serverUrl };
}

/**
 * Stops the server process gracefully
 */
export async function stopServer(
  proc: ReturnType<typeof Bun.spawn> | null,
): Promise<void> {
  if (proc) {
    proc.kill();
    await new Promise((r) => setTimeout(r, 1000));
  }
}
