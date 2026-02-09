/**
 * Model configuration
 *
 * Defines model filtering patterns and thinking mode configurations.
 */

import type { ThinkingConfig, ThinkingMode } from "../types";

/**
 * Default model to use when starting the agent
 * Can be overridden by MODEL environment variable
 * If not set (empty string), the OpenCode server will choose its default model
 */
export const DEFAULT_MODEL = process.env.MODEL || "google/gemini-3-flash";

/**
 * Default thinking mode
 */
export const DEFAULT_THINKING_MODE: ThinkingMode = "medium";

/**
 * Thinking mode configurations
 * Controls reasoning effort and token budget for each mode
 */
export const THINKING_CONFIGS: Record<ThinkingMode, ThinkingConfig> = {
  low: { reasoningEffort: "low", budgetTokens: 4000 },
  medium: { reasoningEffort: "medium", budgetTokens: 8000 },
  high: { reasoningEffort: "high", budgetTokens: 16000 },
};

/**
 * Patterns to exclude from model lists
 * These filter out embedding models, audio models, deprecated versions, etc.
 */
export const EXCLUDED_MODEL_PATTERNS: RegExp[] = [
  /embedding/i,
  /tts/i, // text-to-speech
  /audio/i,
  /live/i,
  /image/i,
  /nano/i,
  /-8b$/i, // small models like gemini-1.5-flash-8b
  /lite/i,
  /gemini-1\./i, // Gemini 1.x (deprecated)
  /gemini-2\.0/i, // Gemini 2.0 (use 2.5+)
  /-latest$/i, // -latest aliases
];

/**
 * Filters a list of model IDs based on exclusion patterns
 */
export function filterModels(models: Record<string, unknown>): string[] {
  return Object.keys(models).filter((modelId) => {
    return !EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(modelId));
  });
}
