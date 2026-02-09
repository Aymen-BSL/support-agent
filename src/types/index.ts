/**
 * Type definitions for Support Agent
 */

/**
 * Thinking mode controls reasoning depth
 */
export type ThinkingMode = "low" | "medium" | "high";

/**
 * Thinking mode configuration
 */
export interface ThinkingConfig {
  reasoningEffort: "low" | "medium" | "high";
  budgetTokens: number;
}

/**
 * Provider information from OpenCode API
 */
export interface Provider {
  id: string;
  name?: string;
  models?: Record<string, ModelInfo>;
}

/**
 * Model information
 */
export interface ModelInfo {
  name?: string;
  description?: string;
}

/**
 * Parsed user input
 */
export interface ParsedInput {
  source?: string;
  query: string;
}

/**
 * CLI interaction state
 */
export type CLIState =
  | "normal"
  | "selecting_provider"
  | "selecting_model"
  | "entering_api_key"
  | "loading_repo"
  | "confirming_exit"
  | "confirming_unload";

/**
 * Token usage statistics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Result from a query including response and token usage
 */
export interface QueryResult {
  response: string;
  tokenUsage?: TokenUsage;
}

/**
 * Repository context for session
 */
export interface RepoContext {
  path: string;
  name: string;
  map: string;
}
