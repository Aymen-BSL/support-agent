/**
 * Provider configuration
 *
 * Defines which AI providers are available and their API key requirements.
 */

/**
 * Map of provider IDs to their required environment variable names
 * These must match what OpenCode/underlying AI SDKs expect
 * Note: "opencode" is NOT in this list because it has truly free models
 */
export const PROVIDER_API_KEYS: Record<string, string> = {
  // Google uses GOOGLE_GENERATIVE_AI_API_KEY (or GOOGLE_API_KEY as fallback)
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/**
 * Free models available through the connected OpenCode server
 * These are available through the firmware provider (no API key required)
 */
export const FREE_MODELS = [
  "firmware/gpt-5-nano",
  "firmware/gpt-5-mini",
  "firmware/claude-haiku-4-5",
  "firmware/gemini-3-flash-preview",
];

/**
 * Ordered whitelist of providers to display
 * firmware provider has free models (no API key required)
 */
export const ALLOWED_PROVIDERS = [
  "firmware", // Has free models (no API key required)
  "privatemode-ai", // Local custom models
  "moonshotai-cn", // Moonshot/Kimi models
  "nova", // Amazon Nova models
  "google",
  "openai",
  "deepseek",
  "xai",
  "anthropic",
  "mistral",
];

/**
 * Recommended models for each provider
 * Only show curated, high-quality models
 */
export const RECOMMENDED_MODELS: Record<string, string[]> = {
  firmware: [
    "gpt-5-nano", // FREE
    "gpt-5-mini", // FREE
    "claude-haiku-4-5", // FREE
    "gemini-3-flash-preview", // FREE
    "gemini-2.5-flash", // FREE
    "claude-sonnet-4-5", // FREE
  ],
  "privatemode-ai": [
    "gpt-oss-120b",
    "gemma-3-27b",
    "qwen3-coder-30b-a3b",
  ],
  "moonshotai-cn": [
    "kimi-k2.5",
    "kimi-k2-thinking",
  ],
  nova: [
    "nova-2-pro-v1",
    "nova-2-lite-v1",
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  anthropic: ["claude-sonnet-4", "claude-opus-4"],
  deepseek: ["deepseek-r1", "deepseek-v3"],
  xai: ["grok-3", "grok-code"],
  mistral: ["mistral-large"],
};

/**
 * Checks if a provider requires an API key
 * firmware, privatemode-ai don't require an API key
 */
export function requiresApiKey(providerId: string): boolean {
  // These providers have free/local models that don't require an API key
  if (providerId === "firmware" || providerId === "privatemode-ai") {
    return false;
  }
  return providerId in PROVIDER_API_KEYS;
}

/**
 * Gets the environment variable name for a provider's API key
 */
export function getApiKeyEnvVar(providerId: string): string | undefined {
  return PROVIDER_API_KEYS[providerId];
}

/**
 * Checks if an API key is set for a provider
 */
export function hasApiKey(providerId: string): boolean {
  // firmware and privatemode-ai free/local models don't need an API key
  if (providerId === "firmware" || providerId === "privatemode-ai") {
    return true; // Always "has" key since none is needed
  }
  const envVar = PROVIDER_API_KEYS[providerId];
  return envVar ? !!process.env[envVar] : false;
}

/**
 * Checks if a model is free (no API key or billing required)
 */
export function isModelFree(modelId: string): boolean {
  return FREE_MODELS.includes(modelId);
}

/**
 * Gets the recommended models for a provider
 */
export function getRecommendedModels(providerId: string): string[] {
  return RECOMMENDED_MODELS[providerId] || [];
}
