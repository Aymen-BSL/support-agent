/**
 * Support Agent
 *
 * Main agent class that manages AI interactions via OpenCode.
 */

import { createOpencodeClient } from "@opencode-ai/sdk/client";
import type { OpencodeClient } from "@opencode-ai/sdk";

import type { ThinkingMode, Provider, QueryResult, TokenUsage } from "../types";
import {
  ALLOWED_PROVIDERS,
  requiresApiKey,
  getApiKeyEnvVar,
  hasApiKey,
  getRecommendedModels,
  isModelFree,
  DEFAULT_MODEL,
  DEFAULT_THINKING_MODE,
  THINKING_CONFIGS,
  filterModels,
} from "../config";
import { spawnServer, stopServer } from "./server";

/**
 * SupportAgent manages AI model interactions
 */
export class SupportAgent {
  private client: OpencodeClient | null = null;
  private serverProc: ReturnType<typeof Bun.spawn> | null = null;
  private currentSessionId: string | null = null;
  private repositoryPath: string | null = null;

  private _currentModel: string = DEFAULT_MODEL;
  private _currentMode: ThinkingMode = DEFAULT_THINKING_MODE;

  // ─────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────

  /** Returns the currently active model string */
  get currentModel(): string {
    return this._currentModel;
  }

  /** Returns the current thinking mode */
  get currentMode(): ThinkingMode {
    return this._currentMode;
  }

  // ─────────────────────────────────────────────────────────────────
  // Provider & Model Utilities (delegated to config)
  // ─────────────────────────────────────────────────────────────────

  requiresApiKey = requiresApiKey;
  getApiKeyEnvVar = getApiKeyEnvVar;
  hasApiKey = hasApiKey;
  filterModels = filterModels;
  getRecommendedModels = getRecommendedModels;
  isModelFree = isModelFree;

  // ─────────────────────────────────────────────────────────────────
  // Model Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Sets the current model
   */
  setModel(modelString: string): void {
    this._currentModel = modelString;
    console.log(`Model set to: ${modelString}`);
  }

  /**
   * Sets the thinking mode
   */
  setThinkingMode(mode: ThinkingMode): void {
    this._currentMode = mode;
    const config = THINKING_CONFIGS[mode];
    console.log(
      `Switched to ${mode} thinking mode (reasoning: ${config.reasoningEffort})`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Sets the session ID (for resuming saved sessions)
   */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Sets the repository path for the OpenCode server
   */
  setRepositoryPath(path: string): void {
    this.repositoryPath = path;
  }

  /**
   * Gets the current repository path
   */
  getRepositoryPath(): string | null {
    return this.repositoryPath;
  }

  // ─────────────────────────────────────────────────────────────────
  // Provider Discovery
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns a list of available providers and their models
   */
  async getAvailableProviders(): Promise<Provider[]> {
    if (!this.client) {
      throw new Error("Agent not started");
    }

    const response = await this.client.provider.list();
    if (!response.data) {
      return [];
    }

    const allProviders = response.data.all || [];

    // Filter to allowed providers and sort by preference order
    return allProviders
      .filter((p: Provider) => ALLOWED_PROVIDERS.includes(p.id))
      .sort(
        (a: Provider, b: Provider) =>
          ALLOWED_PROVIDERS.indexOf(a.id) - ALLOWED_PROVIDERS.indexOf(b.id),
      );
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  /**
   * Starts the OpenCode server and initializes the client
   * The server runs in the support-agent directory, but the client's 'directory'
   * parameter tells OpenCode which repository to work with.
   */
  async start(): Promise<void> {
    const { process, url } = await spawnServer(this._currentModel);
    this.serverProc = process;

    this.client = createOpencodeClient({
      baseUrl: url,
      directory: this.repositoryPath || undefined,
    });

    // console.log("Support Agent initialized.");
  }

  /**
   * Stops the server and cleans up resources
   */
  async stop(): Promise<void> {
    await stopServer(this.serverProc);
    this.serverProc = null;
    this.client = null;
    this.currentSessionId = null;
    // Note: We keep repositoryPath so it can be reused on restart
  }

  /**
   * Restarts the server (needed after setting new API keys)
   * This ensures the server picks up new environment variables
   */
  async restart(): Promise<void> {
    console.log("Restarting server to apply new configuration...");
    await this.stop();
    await this.start();
    console.log("Server restarted successfully.");
  }

  // ─────────────────────────────────────────────────────────────────
  // Query Processing
  // ─────────────────────────────────────────────────────────────────

  /**
   * Creates a promise that rejects after a timeout
   */
  private timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timed out after ${ms / 1000}s`));
      }, ms);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Processes a user query and returns the AI response with token usage
   * Uses event-based streaming for proper response handling
   */
  async query(input: string, source?: string): Promise<QueryResult> {
    if (!this.client) {
      throw new Error("Agent not started");
    }

    // Build the full query
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
    const [providerID, modelID] = this._currentModel.split("/");

    // Subscribe to events first
    const events = await this.client.event.subscribe();

    // Collect response text from events
    let responseText = "";
    let sessionCompleted = false;
    let sessionError: string | null = null;
    let tokenUsage: TokenUsage | undefined;
    const currentSessionId = this.currentSessionId;

    // Send the prompt asynchronously
    await this.client.session.promptAsync({
      path: { id: this.currentSessionId },
      body: {
        model: { providerID: providerID!, modelID: modelID! },
        parts: [{ type: "text" as const, text: fullQuery }],
      },
    });

    // Set up timeout
    const timeout = setTimeout(() => {
      sessionError = "Request timed out after 60s";
      sessionCompleted = true;
    }, 60000);

    // Start response on new line
    let hasStartedPrinting = false;

    try {
      // Listen for events
      for await (const event of events.stream) {
        // Only process events for our session
        const props = event.properties as any;

        if (
          props?.sessionID !== currentSessionId &&
          props?.info?.sessionID !== currentSessionId
        ) {
          // Skip events for other sessions
          if (
            event.type !== "message.part.updated" &&
            event.type !== "session.idle" &&
            event.type !== "message.updated"
          ) {
            continue;
          }
        }

        switch (event.type) {
          case "message.part.updated":
            // Handle streaming text updates
            if (
              props?.part?.type === "text" &&
              props?.part?.sessionID === currentSessionId
            ) {
              // Use delta if available, otherwise use full text
              if (props.delta) {
                if (!hasStartedPrinting) {
                  process.stdout.write("\n"); // Start on new line
                  hasStartedPrinting = true;
                }
                responseText += props.delta;
                process.stdout.write(props.delta); // Stream to console
              } else if (props.part.text && responseText === "") {
                responseText = props.part.text;
              }
            }
            break;

          case "message.updated":
            // Capture token usage from assistant message completion
            // Structure: props.info.tokens and props.info.cost
            if (
              props?.info?.role === "assistant" &&
              props?.info?.sessionID === currentSessionId &&
              props?.info?.tokens
            ) {
              const tokens = props.info.tokens;
              tokenUsage = {
                inputTokens: tokens.input || tokens.prompt || 0,
                outputTokens: tokens.output || tokens.completion || 0,
                totalTokens:
                  tokens.total || (tokens.input || 0) + (tokens.output || 0),
              };
              // Also capture cost if available
              if (props.info.cost) {
                (tokenUsage as any).cost = props.info.cost;
              }
            }
            break;

          case "session.idle":
            // Session has completed processing
            if (props?.sessionID === currentSessionId) {
              sessionCompleted = true;
            }
            break;

          case "session.error":
            // Handle errors
            if (props?.sessionID === currentSessionId || !props?.sessionID) {
              sessionError =
                props?.error?.data?.message || "Unknown error occurred";
              sessionCompleted = true;
            }
            break;
        }

        if (sessionCompleted) break;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (sessionError) {
      throw new Error(sessionError);
    }

    return {
      response: responseText || "(No response received)",
      tokenUsage,
    };
  }
}

export default SupportAgent;
