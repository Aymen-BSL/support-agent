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

/**
 * SupportAgent manages AI model interactions
 */
export class SupportAgent {
  private client: OpencodeClient | null = null;
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
   * Starts the OpenCode client and connects to the existing OpenCode server
   * The server URL is read from the OPENCODE_URL environment variable.
   */
  async start(): Promise<void> {
    const serverUrl = process.env.OPENCODE_URL;
    if (!serverUrl) {
      throw new Error("OPENCODE_URL environment variable is not set");
    }

    this.client = createOpencodeClient({
      baseUrl: serverUrl,
      directory: this.repositoryPath || undefined,
    });

    // console.log("Support Agent initialized.");
  }

  /**
   * Cleans up client resources
   */
  async stop(): Promise<void> {
    this.client = null;
    this.currentSessionId = null;
    // Note: We keep repositoryPath so it can be reused on restart
  }

  /**
   * Restarts the client (needed after setting new API keys)
   * This reconnects to the OpenCode server which should pick up new environment variables
   */
  async restart(): Promise<void> {
    console.log("Restarting client to apply new configuration...");
    await this.stop();
    await this.start();
    console.log("Client restarted successfully.");
  }

  // ─────────────────────────────────────────────────────────────────
  // Query Processing
  // ─────────────────────────────────────────────────────────────────

  /**
   * Creates an async iterable of events filtered by session ID
   * Automatically stops when the session becomes idle
   */
  private async sessionEvents(
    sessionID: string,
    client: OpencodeClient,
  ): Promise<AsyncIterable<any>> {
    // Subscribe to OpenCode event stream
    const subscription = await client.event.subscribe();

    // Generator that filters events by sessionID
    async function* gen() {
      for await (const event of subscription.stream) {
        const props = event.properties as any;
        
        // Only yield events for this session
        if (props && "sessionID" in props && props.sessionID !== sessionID)
          continue;
        
        // Check if session is idle BEFORE yielding
        const isIdle = event.type === "session.idle" && props?.sessionID === sessionID;
        
        yield event;
        
        // After yielding the idle event, stop immediately
        if (isIdle) {
          break; // Break from the for-await loop
        }
      }
    }
    return gen();
  }

  /**
   * Extracts the final answer text from collected events
   * Links message parts to their parent messages to determine role
   */
  private extractAnswerFromEvents(events: any[]): string {
    // First pass: build a map of messageID -> role
    const messageRoles = new Map<string, string>();
    for (const event of events) {
      if (event.type === "message.updated") {
        const info = (event.properties as any)?.info;
        if (info?.id && info?.role) {
          messageRoles.set(info.id, info.role);
        }
      }
    }

    // Second pass: extract text from parts that belong to assistant messages
    const partIds: string[] = [];
    const partText = new Map<string, string>();

    for (const event of events) {
      if (event.type !== "message.part.updated") continue;
      const part: any = (event.properties as any).part;
      if (!part || part.type !== "text") continue;

      // Get the role from the message this part belongs to
      const messageRole = part.messageID ? messageRoles.get(part.messageID) : undefined;

      // Only include assistant messages
      if (messageRole !== "assistant") continue;

      if (!partIds.includes(part.id)) partIds.push(part.id);
      partText.set(part.id, String(part.text ?? ""));
    }

    return partIds
      .map((id) => partText.get(id) ?? "")
      .join("")
      .trim();
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
      const result = await this.client.session.create({
        query: {
          directory: this.repositoryPath || undefined,
        },
        body: {
          config: {
            agent: {
              build: { disable: true },
              explore: { disable: true },
              general: { disable: true },
              plan: { disable: true },
              supportAgent: {
                prompt: "You are a support agent for analyzing codebases. Use the REPL tool to read files and process data. The REPL provides read-only functions: main.read({filePath}), main.glob(pattern), main.grep(pattern), and main.list(). Use these REPL functions to explore code, never use bash, write, edit, or other modification tools.",
                description: "Read-only codebase analysis agent using REPL",
                mode: "primary",
                tools: {
                  // Disable all write/modify tools
                  bash: false,
                  write: false,
                  edit: false,
                  apply_patch: false,
                  delete: false,
                  codesearch: false,
                  websearch: false,
                  webfetch: false,
                  skill: false,
                  task: false,
                  mcp: false,
                  path: false,
                  // Disable direct read tools (REPL provides its own)
                  read: false,
                  grep: false,
                  glob: false,
                  list: false,
                  // Enable todo tools
                  todowrite: true,
                  todoread: true,
                  // Enable REPL (provides sandboxed read access)
                  repl: true,
                },
                permission: {
                  "*": "deny",
                  repl: "allow",
                  todowrite: "allow",
                  todoread: "allow",
                },
              },
            },
            experimental: {
              repl: {
                ws_url: "ws://localhost:9733",
                // In REPL, exclude write tools
                exclude_tools: [
                  "bash",
                  "write",
                  "edit",
                  "apply_patch",
                  "delete",
                  "webfetch",
                  "websearch",
                  "codesearch",
                  "task",
                  "question",
                  "skill",
                  "batch",
                  "plan*",
                  "lsp",
                  "mcp",
                  "todo*",
                ],
                timeout: 60000,
              },
            },
          },
        } as any, // Type system doesn't have full config schema yet
      });
      if (!result.data) {
        throw new Error("Failed to create session");
      }
      this.currentSessionId = result.data.id;
    }

    // Get filtered event stream for this session
    const eventStream = await this.sessionEvents(
      this.currentSessionId,
      this.client,
    );

    // Build prompt body
    // If MODEL env var is set, parse and pass it; otherwise let server choose default
    const promptBody: any = {
      parts: [{ type: "text" as const, text: fullQuery }],
    };

    if (this._currentModel) {
      const [providerID, modelID] = this._currentModel.split("/");
      if (providerID && modelID) {
        promptBody.model = { providerID, modelID };
      }
    }

    // Fire the prompt (non-blocking, like the reference implementation)
    void this.client.session
      .prompt({
        path: { id: this.currentSessionId },
        body: promptBody,
      })
      .catch((error: unknown) => {
        // Errors will surface through session.error events
      });

     // Collect all events and extract the answer
    let sessionError: string | null = null;
    let tokenUsage: TokenUsage | undefined;
    const collectedEvents: any[] = [];

    try {
      for await (const event of eventStream) {
        const props = event.properties as any;
        collectedEvents.push(event);

        // Check for idle - break immediately after processing this event
        const isIdle = event.type === "session.idle" && props?.sessionID === this.currentSessionId;

        switch (event.type) {
          case "message.updated":
            // Capture token usage from assistant message completion
            if (props?.info?.role === "assistant" && props?.info?.tokens) {
              const tokens = props.info.tokens;
              tokenUsage = {
                inputTokens: tokens.input || tokens.prompt || 0,
                outputTokens: tokens.output || tokens.completion || 0,
                totalTokens:
                  tokens.total || (tokens.input || 0) + (tokens.output || 0),
              };
              if (props.info.cost) {
                (tokenUsage as any).cost = props.info.cost;
              }
            }
            break;

          case "session.error":
            sessionError =
              props?.error?.data?.message ||
              props?.error?.name ||
              "Unknown error occurred";
            break;
        }
        
        // After processing idle event, stop the loop
        if (isIdle) {
          break;
        }
      }
    } catch (error) {
      sessionError = error instanceof Error ? error.message : String(error);
    }

    if (sessionError) {
      throw new Error(sessionError);
    }

    // Extract the final answer from collected events
    const responseText = this.extractAnswerFromEvents(collectedEvents);

    return {
      response: responseText || "(No response received)",
      tokenUsage,
    };
  }
}

export default SupportAgent;
