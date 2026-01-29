export interface ParsedInput {
  source?: string;
  query: string;
}

/**
 * Parses the user input to extract the source (in brackets) and the query.
 * Format: [source] query
 */
export function parseInput(input: string): ParsedInput {
  const sourceMatch = input.match(/^\[(.*?)\]\s*(.*)$/);
  if (sourceMatch && sourceMatch.length >= 3) {
    return {
      source: sourceMatch[1]!.trim(),
      query: sourceMatch[2]!.trim(),
    };
  }
  return {
    query: input.trim(),
  };
}
