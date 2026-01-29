import { createOpencodeClient } from "@opencode-ai/sdk/client";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { execSync } from "child_process";

export type ThinkingMode = "low" | "medium" | "high";

// Map of provider IDs to their required env variable names
export const PROVIDER_API_KEYS: Record<string, string> = {
  google: "GOOGLE_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

// Providers that don't require API keys (free via OpenCode Zen)
export const FREE_PROVIDERS = ["zai", "opencode"];

export class SupportAgent {
  private client: OpencodeClient | null = null;
  private serverProc: any | null = null;
  private currentMode: ThinkingMode = "medium";
  private currentModel: string = "google/gemini-2.5-flash"; // Default model

  // Thinking mode affects reasoning effort, not model selection
  // low = fast responses, medium = balanced, high = deep reasoning
  private thinkingConfig = {
    low: { reasoningEffort: "low", budgetTokens: 4000 },
    medium: { reasoningEffort: "medium", budgetTokens: 8000 },
    high: { reasoningEffort: "high", budgetTokens: 16000 },
  };

  // Whitelist of providers to show
  private allowedProviders = [
    // Free providers (no API key required)
    "zai", // GLM 4.7 (free)
    "opencode", // Big Pickle, Kimi, MiniMax (free)
    // Paid providers (require API key)
    "google",
    "openai",
    "deepseek",
    "xai",
    "anthropic",
    "mistral",
  ];

  // Model name patterns to exclude (embedding, audio, nano, deprecated, etc.)
  private excludedModelPatterns = [
    /embedding/i,
    /tts/i, // text-to-speech
    /audio/i,
    /live/i,
    /image/i,
    /nano/i,
    /-8b$/i, // small models like gemini-1.5-flash-8b
    /lite/i,
    /gemini-1\./i, // exclude Gemini 1.x (deprecated)
    /gemini-2\.0/i, // exclude Gemini 2.0 (use 2.5+)
    /-latest$/i, // exclude -latest aliases
  ];

  constructor() {}

  /**
   * Returns the currently active model string.
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Returns the current thinking mode.
   */
  getCurrentMode(): ThinkingMode {
    return this.currentMode;
  }

  /**
   * Checks if a provider requires an API key.
   */
  requiresApiKey(providerId: string): boolean {
    return !FREE_PROVIDERS.includes(providerId);
  }

  /**
   * Gets the environment variable name for a provider's API key.
   */
  getApiKeyEnvVar(providerId: string): string | undefined {
    return PROVIDER_API_KEYS[providerId];
  }

  /**
   * Checks if an API key is set for a provider.
   */
  hasApiKey(providerId: string): boolean {
    const envVar = PROVIDER_API_KEYS[providerId];
    return envVar ? !!process.env[envVar] : true;
  }

  /**
   * Sets the current model.
   */
  setModel(modelString: string) {
    this.currentModel = modelString;
    console.log(`Model set to: ${modelString}`);
  }

  /**
   * Filters out irrelevant models (embedding, audio, etc.)
   */
  filterModels(models: Record<string, any>): string[] {
    return Object.keys(models).filter((modelId) => {
      return !this.excludedModelPatterns.some((pattern) =>
        pattern.test(modelId),
      );
    });
  }

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
          OPENCODE_MODEL: this.currentModel,
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
      console.log(
        `Switched to ${mode} thinking mode (reasoning: ${this.thinkingConfig[mode].reasoningEffort})`,
      );
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
    const modelString = this.currentModel;
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
