/**
 * One-Shot CLI Mode
 *
 * Non-interactive CLI for loading a repository and asking a single question.
 * Designed for agent-friendly consumption.
 *
 * Usage:
 *   bun run src/one-shot.ts --repo ./path/to/repo "What does this project do?"
 *   bun run src/one-shot.ts --repo https://github.com/user/repo --json "Explain the architecture"
 */

import "dotenv/config";
import { program } from "commander";

import { SupportAgent } from "./agent";
import { loadRepository, buildRepoContext } from "./services";

interface OneShotOptions {
  repo: string;
  json?: boolean;
  model?: string;
  quiet?: boolean;
}

interface OneShotResult {
  success: boolean;
  answer?: string;
  repository?: string;
  model?: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  error?: string;
}

/**
 * Log a message only if not in quiet mode
 */
function log(message: string, quiet: boolean): void {
  if (!quiet) {
    console.error(message);
  }
}

/**
 * Output the result in the appropriate format
 */
function outputResult(result: OneShotResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success && result.answer) {
      console.log(result.answer);
    } else if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  }
}

/**
 * Main one-shot query function
 */
async function runOneShot(question: string, options: OneShotOptions): Promise<void> {
  const { repo, json = false, model, quiet = false } = options;

  try {
    // Initialize the agent
    log("Initializing agent...", quiet);
    const agent = new SupportAgent();
    
    // Set custom model if provided
    if (model) {
      agent.setModel(model);
    }

    // Load the repository
    log(`Loading repository: ${repo}...`, quiet);
    const result = await loadRepository(repo);

    log(`Repository loaded: ${result.name} (${result.fileCount} files)`, quiet);

    // Set the repository path for OpenCode to use as working directory
    agent.setRepositoryPath(result.path);
    
    await agent.start();

    // Build context and query
    const repoContext = buildRepoContext(result.name, result.repoMap);
    const contextualQuery = `${repoContext}\n\n## User Question\n${question}`;

    // Run the query
    log("Processing query...", quiet);

    const queryResult = await agent.query(contextualQuery);

    // Clean up
    await agent.stop();

    // Output result
    const response: OneShotResult = {
      success: true,
      answer: queryResult.response.trim(),
      repository: result.name,
      model: agent.currentModel,
    };

    if (queryResult.tokenUsage) {
      response.tokens = {
        input: queryResult.tokenUsage.inputTokens,
        output: queryResult.tokenUsage.outputTokens,
        total: queryResult.tokenUsage.totalTokens,
      };
    }

    outputResult(response, json);
    
    // Force exit after output (workaround for hanging event stream)
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: OneShotResult = {
      success: false,
      error: errorMessage,
    };

    outputResult(response, json);
    
    if (!json) {
      process.exit(1);
    }
  }
}

// Configure CLI
program
  .name("support-agent-query")
  .description("Query a repository with a single question (agent-friendly output)")
  .argument("<question>", "The question to ask about the repository")
  .requiredOption("-r, --repo <path>", "Path or URL to the repository")
  .option("-j, --json", "Output structured JSON response")
  .option("-m, --model <model>", "Model to use (e.g., google/gemini-2.0-flash)")
  .option("-q, --quiet", "Suppress progress messages, only output the answer")
  .action(runOneShot);

// Run
program.parse();
