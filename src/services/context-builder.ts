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
  sourceFiles?: Map<string, string>
): string {
  let context = `# Repository Analysis: ${repoName}

IMPORTANT: All source files from this repository have been loaded and are provided below.
DO NOT attempt to use any file-reading tools - all the code you need is already in this message.
Simply analyze the code provided below to answer questions.

## File Structure
\`\`\`
${repoMap}
\`\`\`

`;

  if (sourceFiles && sourceFiles.size > 0) {
    context += `## Source Files (${sourceFiles.size} files loaded)\n\n`;
    context += `The complete contents of each source file are provided below:\n\n`;

    for (const [filePath, content] of sourceFiles) {
      // Determine file extension for syntax highlighting
      const ext = filePath.split('.').pop() || '';
      const langMap: Record<string, string> = {
        'ts': 'typescript', 'tsx': 'typescript',
        'js': 'javascript', 'jsx': 'javascript',
        'py': 'python',
        'go': 'go',
        'rs': 'rust',
        'json': 'json',
        'yaml': 'yaml', 'yml': 'yaml',
        'md': 'markdown',
        'sh': 'bash',
        'sql': 'sql',
        'css': 'css',
        'html': 'html',
      };
      const lang = langMap[ext] || ext;

      context += `### File: ${filePath}\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
    }
  }

  context += `## Your Role
- You are a READ-ONLY code analysis assistant.
- All repository files are ALREADY PROVIDED above - do NOT try to read files using tools.
- You do NOT have the ability to write, modify, or delete any files.
- If asked to make changes, explain what changes would be needed but clarify you cannot execute them.
- Answer questions about the codebase structure, dependencies, and functionality.
- When referencing files, use their relative paths from the repository root.
- Base your answers ONLY on the file contents provided above.
`;

  return context;
}

/**
 * Builds a context message for token-efficient queries
 */
export function buildQueryContext(
  query: string,
  repoContext?: string
): string {
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
  outputTokens: number
): string {
  const total = inputTokens + outputTokens;
  return `(Tokens: ${inputTokens} in / ${outputTokens} out, total: ${total})`;
}
