/**
 * CLI Command Handlers
 *
 * Handles processing of CLI commands and user input.
 */

import type { Interface as ReadlineInterface } from "readline";
import type { SupportAgent } from "../agent";
import type { CLIState, Provider, ThinkingMode, RepoContext, TokenUsage } from "../types";
import { PROVIDER_API_KEYS } from "../config";
import {
  showProviderMenu,
  showModelMenu,
  showApiKeyPrompt,
  showModeHelp,
} from "./ui";
import { parseInput } from "./utils";
import {
  loadRepository,
  readAllSourceFiles,
  saveSession,
  loadSession as loadSessionFromStore,
  listSessions,
  formatSessionInfo,
  buildRepoContext,
  formatTokenUsage,
} from "../services";

/**
 * CLI Session state
 */
export interface CLISession {
  state: CLIState;
  providers: Provider[];
  selectedProvider: Provider | null;
  filteredModels: string[];
  // New fields for repo and session management
  repoContext: RepoContext | null;
  lastTokenUsage: TokenUsage | null;
  sessionName: string | null;
}

/**
 * Creates a new CLI session
 */
export function createSession(): CLISession {
  return {
    state: "normal",
    providers: [],
    selectedProvider: null,
    filteredModels: [],
    repoContext: null,
    lastTokenUsage: null,
    sessionName: null,
  };
}

/**
 * Handles the /model command
 */
export async function handleModelCommand(
  agent: SupportAgent,
  session: CLISession,
): Promise<void> {
  console.log("Fetching available providers...");

  session.providers = await agent.getAvailableProviders();

  if (session.providers.length === 0) {
    console.log("No providers found.");
    return;
  }

  showProviderMenu(session.providers, agent);
  session.state = "selecting_provider";
}

/**
 * Handles the /mode command
 */
export async function handleModeCommand(
  agent: SupportAgent,
  args: string,
): Promise<void> {
  const validModes = ["low", "medium", "high"];

  if (!args || !validModes.includes(args)) {
    showModeHelp();
    return;
  }

  agent.setThinkingMode(args as ThinkingMode);
}

/**
 * Handles provider selection
 */
export function handleProviderSelection(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): void {
  const index = parseInt(input) - 1;

  if (isNaN(index) || index < 0 || index >= session.providers.length) {
    console.log("Invalid selection. Enter a number, 'back', or '0'.");
    return;
  }

  session.selectedProvider = session.providers[index]!;

  // Check if API key is required and missing
  if (
    agent.requiresApiKey(session.selectedProvider.id) &&
    !agent.hasApiKey(session.selectedProvider.id)
  ) {
    const envVar = agent.getApiKeyEnvVar(session.selectedProvider.id);
    if (envVar) {
      showApiKeyPrompt(session.selectedProvider.id, envVar);
      session.state = "entering_api_key";
      return;
    }
  }

  // Show models for selected provider
  showModelsForProvider(agent, session);
}

/**
 * Handles API key entry
 */
export function handleApiKeyEntry(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): void {
  if (input.length <= 10) {
    console.log("Invalid API key (too short). Try again or enter 'back'.");
    return;
  }

  // Set the API key for this session
  const envVar = agent.getApiKeyEnvVar(session.selectedProvider!.id);
  if (envVar) {
    process.env[envVar] = input;
    console.log("✓ API key set for this session.");
  }

  showModelsForProvider(agent, session);
}

/**
 * Displays models for the selected provider
 * Uses curated recommended models list for better UX
 */
function showModelsForProvider(agent: SupportAgent, session: CLISession): void {
  // Use recommended models if available, otherwise filter from available
  const recommendedModels = agent.getRecommendedModels(
    session.selectedProvider!.id,
  );

  if (recommendedModels.length > 0) {
    session.filteredModels = recommendedModels;
  } else {
    // Fallback to filtering available models
    session.filteredModels = agent.filterModels(
      session.selectedProvider!.models || {},
    );
  }

  if (session.filteredModels.length === 0) {
    console.log("No models found for this provider.");
    session.state = "normal";
    return;
  }

  showModelMenu(session.filteredModels, session.selectedProvider!.id, agent);
  session.state = "selecting_model";
}

/**
 * Handles model selection
 */
export function handleModelSelection(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): void {
  const index = parseInt(input) - 1;

  if (isNaN(index) || index < 0 || index >= session.filteredModels.length) {
    console.log("Invalid selection. Enter a number, 'back', or '0'.");
    return;
  }

  const modelId = session.filteredModels[index]!;
  const fullModelId = `${session.selectedProvider!.id}/${modelId}`;

  agent.setModel(fullModelId);
  session.state = "normal";
}

/**
 * Handles the back/cancel command
 */
export function handleBack(session: CLISession, agent: SupportAgent): void {
  if (session.state === "selecting_model") {
    // Go back to provider selection
    showProviderMenu(session.providers, agent);
    session.state = "selecting_provider";
  } else if (
    session.state === "selecting_provider" ||
    session.state === "entering_api_key"
  ) {
    console.log("Selection cancelled.");
    session.state = "normal";
  }
}

/**
 * Handles a user query
 */
export async function handleQuery(
  input: string,
  agent: SupportAgent,
  session: CLISession,
): Promise<void> {
  const { source, query } = parseInput(input);

  console.log("Thinking...");
  try {
    // Build query with repo context if available
    let contextualQuery = query;
    if (session.repoContext) {
      const repoContextStr = buildRepoContext(
        session.repoContext.name,
        session.repoContext.map,
        session.repoContext.keyFiles
      );
      contextualQuery = `${repoContextStr}\n\n## User Question\n${query}`;
    }

    const result = await agent.query(contextualQuery, source);

    // Display token usage if available
    if (session.lastTokenUsage) {
      console.log(
        `\n${formatTokenUsage(
          session.lastTokenUsage.inputTokens,
          session.lastTokenUsage.outputTokens
        )}`
      );
    }
  } catch (error) {
    console.error("\nError:", error);
  }
}

/**
 * Handles the /load command for loading repositories
 */
export async function handleLoadCommand(
  args: string,
  session: CLISession,
): Promise<void> {
  if (!args) {
    console.log("Usage: /load <path|url>");
    console.log("Examples:");
    console.log("  /load ./src");
    console.log("  /load https://github.com/user/repo");
    return;
  }

  console.log(`Loading repository: ${args}...`);

  try {
    const result = await loadRepository(args);
    const sourceFiles = await readAllSourceFiles(result.path);

    session.repoContext = {
      path: result.path,
      name: result.name,
      map: result.repoMap,
      keyFiles: sourceFiles,
    };

    console.log(`\n✓ Repository loaded: ${result.name}`);
    console.log(`  Files: ${result.fileCount}`);
    console.log(`  Path: ${result.path}`);
    console.log(`\nYou can now ask questions about this repository.`);
    console.log(`The agent is READ-ONLY and cannot modify any files.\n`);
  } catch (error) {
    console.error("Failed to load repository:", error);
  }
}

/**
 * Handles the /save command for saving sessions
 */
export async function handleSaveCommand(
  args: string,
  agent: SupportAgent,
  session: CLISession,
): Promise<void> {
  if (!args) {
    console.log("Usage: /save <session-name>");
    return;
  }

  const sessionId = agent.getCurrentSessionId();
  if (!sessionId) {
    console.log("No active session to save. Start a conversation first.");
    return;
  }

  await saveSession(
    args,
    sessionId,
    session.repoContext?.path,
    session.repoContext?.name
  );

  session.sessionName = args;
}

/**
 * Handles the /resume command for resuming sessions
 */
export async function handleResumeCommand(
  args: string,
  agent: SupportAgent,
  session: CLISession,
): Promise<void> {
  if (!args) {
    console.log("Usage: /resume <session-name>");
    console.log("Use /sessions to see available sessions.");
    return;
  }

  const savedSession = await loadSessionFromStore(args);
  if (!savedSession) {
    console.log(`Session "${args}" not found.`);
    console.log("Use /sessions to see available sessions.");
    return;
  }

  // Restore session ID in agent
  agent.setSessionId(savedSession.sessionId);
  session.sessionName = savedSession.name;

  // Restore repo context if available
  if (savedSession.repoPath) {
    console.log(`Restoring repository context: ${savedSession.repoName}...`);
    try {
      const result = await loadRepository(savedSession.repoPath);
      const sourceFiles = await readAllSourceFiles(result.path);

      session.repoContext = {
        path: result.path,
        name: result.name,
        map: result.repoMap,
        keyFiles: sourceFiles,
      };

      console.log(`✓ Repository context restored: ${result.name}`);
    } catch (error) {
      console.log(`Warning: Could not restore repo context: ${error}`);
    }
  }

  console.log(`✓ Session "${args}" resumed.`);
}

/**
 * Handles the /sessions command to list saved sessions
 */
export async function handleSessionsCommand(): Promise<void> {
  const sessions = await listSessions();

  if (sessions.length === 0) {
    console.log("No saved sessions.");
    console.log("Use /save <name> to save the current session.");
    return;
  }

  console.log("Saved sessions:");
  for (const session of sessions) {
    console.log(`  - ${formatSessionInfo(session)}`);
  }
}

/**
 * Handles the /status command to show current session info
 */
export function handleStatusCommand(
  agent: SupportAgent,
  session: CLISession,
): void {
  console.log("\n=== Current Status ===");
  console.log(`Model: ${agent.currentModel}`);
  console.log(`Thinking Mode: ${agent.currentMode}`);

  if (session.sessionName) {
    console.log(`Session: ${session.sessionName}`);
  }

  if (session.repoContext) {
    console.log(`Repository: ${session.repoContext.name}`);
    console.log(`  Path: ${session.repoContext.path}`);
  } else {
    console.log("Repository: (none loaded)");
  }

  if (session.lastTokenUsage) {
    console.log(
      `Last Token Usage: ${formatTokenUsage(
        session.lastTokenUsage.inputTokens,
        session.lastTokenUsage.outputTokens
      )}`
    );
  }

  console.log("======================\n");
}

