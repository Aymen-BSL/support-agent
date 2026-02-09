/**
 * CLI Runner
 *
 * Main CLI application loop.
 */

import "dotenv/config";
import { createInterface } from "readline";

import { SupportAgent } from "../agent";
import { showWelcome } from "./ui";
import {
  createSession,
  handleModelCommand,
  handleModeCommand,
  handleProviderSelection,
  handleApiKeyEntry,
  handleModelSelection,
  handleBack,
  handleQuery,
  handleLoadCommand,
  handleSaveCommand,
  handleResumeCommand,
  handleSessionsCommand,
  handleStatusCommand,
  handleExitCommand,
  handleExitConfirmation,
  handleUnloadCommand,
  handleUnloadConfirmation,
  handleSaveExitCommand,
} from "./commands";

/**
 * Runs the CLI application
 */
export async function runCLI(): Promise<void> {
  // Initialize agent
  const agent = new SupportAgent();
  await agent.start();

  // Create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "support-agent> ",
  });

  // Show welcome message
  showWelcome(agent);
  rl.prompt();

  // Initialize session state
  const session = createSession();

  // Handle input
  rl.on("line", async (line) => {
    const input = line.trim();

    // Handle back/cancel in any selection state
    if (input.toLowerCase() === "back" || input === "0") {
      if (session.state !== "normal") {
        handleBack(session, agent);
        rl.prompt();
        return;
      }
    }

    // Handle state-specific input
    switch (session.state) {
      case "selecting_provider":
        handleProviderSelection(input, agent, session);
        rl.prompt();
        return;

      case "entering_api_key":
        await handleApiKeyEntry(input, agent, session);
        rl.prompt();
        return;

      case "selecting_model":
        handleModelSelection(input, agent, session);
        rl.prompt();
        return;

      case "confirming_exit":
        const { shouldExit, shouldSave } = handleExitConfirmation(
          input,
          session,
        );
        if (shouldExit) {
          rl.close();
          return;
        }
        if (shouldSave) {
          console.log("Enter a name for this session:");
          // Stay in normal mode, they can use /save <name>
        }
        rl.prompt();
        return;

      case "confirming_unload":
        handleUnloadConfirmation(input, session);
        rl.prompt();
        return;
    }

    // Normal state - handle commands
    if (input.startsWith("/exit") || input.startsWith("/quit")) {
      const { shouldExit } = handleExitCommand(session);
      if (shouldExit) {
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    if (input.startsWith("/model") || input.startsWith("/models")) {
      try {
        await handleModelCommand(agent, session);
      } catch (e) {
        console.error("Failed to list models:", e);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith("/mode")) {
      const args = input.split(" ")[1] || "";
      await handleModeCommand(agent, args);
      rl.prompt();
      return;
    }

    if (input.startsWith("/load")) {
      const args = input.slice(5).trim();
      await handleLoadCommand(args, agent, session);
      rl.prompt();
      return;
    }

    if (input.startsWith("/saveexit")) {
      const args = input.slice(9).trim();
      await handleSaveExitCommand(args, agent, session);
      rl.prompt();
      return;
    }

    if (input.startsWith("/save")) {
      const args = input.slice(5).trim();
      await handleSaveCommand(args, agent, session);
      rl.prompt();
      return;
    }

    if (input.startsWith("/resume")) {
      const args = input.slice(7).trim();
      await handleResumeCommand(args, agent, session);
      rl.prompt();
      return;
    }

    if (input.startsWith("/sessions")) {
      await handleSessionsCommand();
      rl.prompt();
      return;
    }

    if (input.startsWith("/status")) {
      handleStatusCommand(agent, session);
      rl.prompt();
      return;
    }

    if (input.startsWith("/unload")) {
      handleUnloadCommand(session);
      rl.prompt();
      return;
    }

    if (input.startsWith("/help")) {
      showWelcome(agent);
      rl.prompt();
      return;
    }

    // Empty input
    if (input === "") {
      rl.prompt();
      return;
    }

    // Unknown command
    if (input.startsWith("/")) {
      console.log("Unknown command. Type /help for available commands.");
      rl.prompt();
      return;
    }

    // Handle as query
    await handleQuery(input, agent, session);
    rl.prompt();
  });

  // Handle close
  rl.on("close", async () => {
    console.log("\nGoodbye!");
    await agent.stop();
    process.exit(0);
  });
}

export default runCLI;
