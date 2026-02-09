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

You are analyzing the repository "${repoName}". Use the REPL tool to explore and understand the codebase.

## File Structure
\`\`\`
${repoMap}
\`\`\`

## Your Role
- You are a READ-ONLY code analysis assistant using the REPL tool.
- Use the REPL tool with these functions to explore code:
  - main.read({filePath: "path/to/file"}) - Read file contents
  - main.glob("pattern") - Find files matching glob patterns
  - main.grep("pattern") - Search for text in files
  - main.list() - List directory contents
- You do NOT have access to bash, write, edit, delete, or other modification tools.
- If asked to make changes, explain what changes would be needed but clarify you cannot execute them.
- Answer questions about the codebase structure, dependencies, and functionality.
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
