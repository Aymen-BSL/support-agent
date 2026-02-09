/**
 * Context Builder
 *
 * Builds context prompts for the AI from repository data.
 */

/**
 * Builds the initial system context for a loaded repository
 */
export function buildRepoContext(
  repoName: string,
  repoMap: string,
): string {
  const context = `# Repository Analysis: ${repoName}

You are analyzing the repository "${repoName}". Use your available tools to explore and understand the codebase.

## File Structure
\`\`\`
${repoMap}
\`\`\`

## Your Role
- You are a READ-ONLY code analysis assistant.
- Use the **read** tool to examine specific files when you need to see their contents.
- Use the **glob** tool to find files matching patterns or to explore the project structure.
- You do NOT have the ability to write, modify, or delete any files.
- If asked to make changes, explain what changes would be needed but clarify you cannot execute them.
- Answer questions about the codebase structure, dependencies, and functionality.
- When referencing files, use their relative paths from the repository root.
`;

  return context;
}

/**
 * Builds a context message for token-efficient queries
 */
export function buildQueryContext(query: string, repoContext?: string): string {
  if (!repoContext) {
    return query;
  }

  return `${repoContext}

## User Question
${query}`;
}

/**
 * Formats token usage for display
 */
export function formatTokenUsage(
  inputTokens: number,
  outputTokens: number,
  cost?: number,
): string {
  const total = inputTokens + outputTokens;
  let result = `(Tokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out, total: ${total.toLocaleString()}`;
  if (cost !== undefined && cost > 0) {
    result += ` | Cost: $${cost.toFixed(6)}`;
  }
  result += ")";
  return result;
}
