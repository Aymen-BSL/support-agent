import { createOpencodeClient } from "@opencode-ai/sdk/client";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { execSync } from "child_process";

export type ThinkingMode = "low" | "medium" | "high";

export class SupportAgent {
  private client: OpencodeClient | null = null;
  private serverProc: any | null = null;
  private currentMode: ThinkingMode = "medium";

  // Model configurations for different modes
  private models = {
    low: "google/gemini-2.5-flash",
    medium: "google/gemini-3-flash-preview",
    high: "google/gemini-3-pro-preview",
  };

  // Whitelist of providers to show
  private allowedProviders = [
    "google",
    "openai",
    "zai", // GLM-4.7
    "deepseek", // DeepSeek R1/V3
    "xai", // Grok
    "alibaba", // Qwen
    "mistral", // Mistral Large
    "llama", // Meta Llama
  ];

  constructor() {}

  /**
   * Returns a list of available providers and their models.
   */
  async getAvailableModels() {
    if (!this.client) {
      throw new Error("Agent not started");
    }
    const response = await this.client.provider.list();
    if (!response.data) {
      return [];
    }

    // Filter and sort providers
    const allProviders = response.data.all || [];
    const filtered = allProviders.filter((p: any) =>
      this.allowedProviders.includes(p.id),
    );

    // Sort according to the whitelist order
    return filtered.sort((a: any, b: any) => {
      return (
        this.allowedProviders.indexOf(a.id) -
        this.allowedProviders.indexOf(b.id)
      );
    });
  }

  /**
   * Sets the model explicitly, overriding the mode-based default.
   */
  async setModel(modelString: string) {
    // Allow raw string for now, could validate against available models
    // Hack: Update "medium" mode to use this model temporarily so query() uses it
    // A better way would be to have a separate currentModel property that overrides modes
    this.models[this.currentMode] = modelString;
    console.log(`Model set to: ${modelString}`);
  }

  private killPort(port: number) {
    try {
      const command = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`;
      execSync(`powershell -Command "${command}"`, { stdio: "ignore" });
    } catch (e) {
      // Ignore errors if no process found
    }
  }

  async start() {
    this.killPort(4096);
    // Wait a bit after killing
    await new Promise((r) => setTimeout(r, 1000));

    console.log("Starting OpenCode server via Bun...");

    // Determine path to OpenCode executable in node_modules
    const opencodePath = "node_modules/.bin/opencode";

    // Manual spawn using Bun
    const proc = Bun.spawn(
      [opencodePath, "serve", "--port=4096", "--hostname=127.0.0.1"],
      {
        env: {
          ...process.env,
          // Explicitly disable any config content passed via ENV to avoid huge payloads
          OPENCODE_CONFIG_CONTENT: "{}",
          // Use Google model initially
          OPENCODE_MODEL: this.models[this.currentMode],
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.serverProc = proc;

    // Wait for server to be ready by reading stdout
    let buffer = "";
    let serverUrl = "";

    // Start a background loop to keep reading stdout so the buffer doesn't fill up and block the server
    const stdoutReader = proc.stdout.getReader();
    const decoder = new TextDecoder();

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
              console.log(`Server started at ${serverUrl}`);
            }
          }
        }
      } catch (e) {}
    })();

    // Also drain stderr to prevent blocking
    const stderrReader = proc.stderr.getReader();
    (async () => {
      try {
        while (true) {
          const { done } = await stderrReader.read();
          if (done) break;
        }
      } catch (e) {}
    })();

    // Loop to wait for serverUrl to be populated by the background reader
    const startTime = Date.now();
    while (!serverUrl) {
      if (Date.now() - startTime > 10000) {
        throw new Error("Timeout waiting for server to start");
      }
      if (proc.exitCode !== null) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Server failed to start. Stderr: ${stderr}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!serverUrl) {
      // If loop finished without URL, process exited
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Server failed to start. Stderr: ${stderr}`);
    }

    // Connect client
    this.client = createOpencodeClient({
      baseUrl: serverUrl,
    });

    console.log("Support Agent initialized.");
  }

  /**
   * Sets the thinking mode and updates the model.
   */
  async setThinkingMode(mode: ThinkingMode) {
    this.currentMode = mode;
    if (this.client) {
      // Dynamic model switching if supported by SDK, otherwise we might need to restart connection
      // For now assuming we can pass config per request or update global config
      // Verify SDK capabilities in 'opencode' docs if this fails.
      // Assuming re-initialization or config update logic here.
      console.log(`Switched to ${mode} mode (${this.models[mode]})`);
    }
  }

  /**
   * Processes a user query.
   */
  private currentSessionId: string | null = null;

  /**
   * Processes a user query.
   */
  async query(input: string, source?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Agent not started");
    }

    let fullQuery = input;
    if (source) {
      fullQuery = `Using the source '${source}', please answer: ${input}`;
    }

    // Ensure we have a session
    if (!this.currentSessionId) {
      const result = await this.client.session.create();
      if (!result.data) {
        throw new Error("Failed to create session");
      }
      this.currentSessionId = result.data.id;
    }

    // Parse model string "provider/model"
    const modelString = this.models[this.currentMode];
    const [providerID, modelID] = modelString.split("/");

    const payload = {
      path: { id: this.currentSessionId },
      body: {
        model: { providerID: providerID!, modelID: modelID! },
        parts: [{ type: "text" as const, text: fullQuery }],
      },
    };

    try {
      // Send prompt to the session
      const response = await this.client.session.prompt(payload);

      if (!response.data || !response.data.parts) {
        throw new Error("Failed to get response");
      }

      // Extract text from parts
      return response.data.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");
    } catch (error) {
      console.error("Error inside query:", error);
      throw error;
    }
  }

  async stop() {
    if (this.serverProc) {
      this.serverProc.kill();
      // Wait for server to shut down to release port
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
