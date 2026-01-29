import "dotenv/config";
import { createInterface } from "readline";
import { SupportAgent, type ThinkingMode, PROVIDER_API_KEYS } from "./agent";
import { parseInput } from "./utils";

async function main() {
  const agent = new SupportAgent();
  await agent.start();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "support-agent> ",
  });

  console.log("Welcome to Support Agent!");
  console.log("-----------------------------------");
  console.log(`Current Model: ${agent.getCurrentModel()}`);
  console.log(`Thinking Mode: ${agent.getCurrentMode()}`);
  console.log("-----------------------------------");
  console.log("Available Commands:");
  console.log(
    "  /model or /models        - List and select available AI models",
  );
  console.log(
    "  /mode [low|medium|high]  - Set thinking mode (reasoning depth)",
  );
  console.log("  /exit                    - Exit the application");
  console.log("-----------------------------------");
  console.log("Usage: [source] query");
  console.log(
    "Example: https://github.com/example/repo How do I install this?",
  );

  rl.prompt();

  // Interaction state
  type State =
    | "normal"
    | "selecting_provider"
    | "selecting_model"
    | "entering_api_key";
  let state: State = "normal";
  let availableProviders: any[] = [];
  let selectedProvider: any = null;
  let filteredModels: string[] = [];

  // Helper to prompt for input
  const askQuestion = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  rl.on("line", async (line) => {
    const input = line.trim();

    // Handle "back" command in any selection state
    if (input.toLowerCase() === "back" || input === "0") {
      if (state === "selecting_model") {
        // Go back to provider selection
        console.log("\nSelect a provider (enter 'back' or '0' to cancel):");
        availableProviders.forEach((p, i) => {
          const freeLabel = agent.requiresApiKey(p.id)
            ? ""
            : " (FREE - no API key)";
          console.log(`${i + 1}. ${p.id}${freeLabel}`);
        });
        state = "selecting_provider";
        rl.prompt();
        return;
      } else if (
        state === "selecting_provider" ||
        state === "entering_api_key"
      ) {
        // Cancel and go back to normal mode
        console.log("Selection cancelled.");
        state = "normal";
        rl.prompt();
        return;
      }
    }

    // Handle Provider Selection State
    if (state === "selecting_provider") {
      const index = parseInt(input) - 1;
      if (isNaN(index) || index < 0 || index >= availableProviders.length) {
        console.log(
          "Invalid selection. Enter a number, 'back', or '0' to cancel.",
        );
        rl.prompt();
        return;
      }
      selectedProvider = availableProviders[index];

      // Check if provider needs API key and if it's set
      if (
        agent.requiresApiKey(selectedProvider.id) &&
        !agent.hasApiKey(selectedProvider.id)
      ) {
        const envVar = agent.getApiKeyEnvVar(selectedProvider.id);
        console.log(`\n⚠️  ${selectedProvider.id} requires an API key.`);
        console.log(`   Environment variable ${envVar} is not set.`);
        console.log(`\nOptions:`);
        console.log(`   1. Add ${envVar}=your_key to your .env file`);
        console.log(
          `   2. Enter your API key now (will be used for this session only)`,
        );
        console.log(`   3. Enter 'back' to choose a different provider`);
        console.log(`\nEnter your API key (or 'back' to go back):`);
        state = "entering_api_key";
        rl.prompt();
        return;
      }

      console.log(`Selected Provider: ${selectedProvider.id}`);
      console.log("Available Models (enter 'back' or '0' to go back):");

      filteredModels = agent.filterModels(selectedProvider.models || {});
      if (filteredModels.length === 0) {
        console.log("No models found for this provider.");
        state = "normal";
      } else {
        filteredModels.forEach((m, i) => console.log(`${i + 1}. ${m}`));
        console.log("\nSelect a model number:");
        state = "selecting_model";
      }
      rl.prompt();
      return;
    }

    // Handle API Key Entry State
    if (state === "entering_api_key") {
      if (input.length > 10) {
        // Assume it's an API key
        const envVar = agent.getApiKeyEnvVar(selectedProvider.id);
        if (envVar) {
          process.env[envVar] = input;
          console.log(`✓ API key set for this session.`);
        }

        // Now show models
        console.log(`\nSelected Provider: ${selectedProvider.id}`);
        console.log("Available Models (enter 'back' or '0' to go back):");

        filteredModels = agent.filterModels(selectedProvider.models || {});
        if (filteredModels.length === 0) {
          console.log("No models found for this provider.");
          state = "normal";
        } else {
          filteredModels.forEach((m, i) => console.log(`${i + 1}. ${m}`));
          console.log("\nSelect a model number:");
          state = "selecting_model";
        }
      } else {
        console.log(
          "Invalid API key (too short). Enter a valid key or 'back' to go back.",
        );
      }
      rl.prompt();
      return;
    }

    // Handle Model Selection State
    if (state === "selecting_model") {
      const index = parseInt(input) - 1;
      if (isNaN(index) || index < 0 || index >= filteredModels.length) {
        console.log(
          "Invalid selection. Enter a number, 'back', or '0' to go back.",
        );
        rl.prompt();
        return;
      }
      const modelId = filteredModels[index];
      const fullModelId = `${selectedProvider.id}/${modelId}`;

      agent.setModel(fullModelId);
      state = "normal";
      rl.prompt();
      return;
    }

    // Normal State
    if (input.startsWith("/exit")) {
      rl.close();
      return;
    }

    if (input.startsWith("/model") || input.startsWith("/models")) {
      try {
        console.log("Fetching available providers...");
        availableProviders = await agent.getAvailableModels();
        if (availableProviders.length === 0) {
          console.log("No providers found.");
          rl.prompt();
          return;
        }

        console.log("\nSelect a provider (enter 'back' or '0' to cancel):");
        availableProviders.forEach((p, i) => {
          const freeLabel = agent.requiresApiKey(p.id)
            ? ""
            : " (FREE - no API key)";
          console.log(`${i + 1}. ${p.id}${freeLabel}`);
        });
        state = "selecting_provider";
      } catch (e) {
        console.error("Failed to list models:", e);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith("/mode")) {
      const parts = input.split(" ");
      if (
        parts.length !== 2 ||
        !["low", "medium", "high"].includes(parts[1]!)
      ) {
        console.log("Invalid mode. Use: /mode low | /mode medium | /mode high");
        console.log("  low    - Fast responses, less reasoning");
        console.log("  medium - Balanced (default)");
        console.log("  high   - Deep reasoning, slower");
        rl.prompt();
        return;
      }
      await agent.setThinkingMode(parts[1]! as ThinkingMode);
      rl.prompt();
      return;
    }

    if (input.trim() === "") {
      rl.prompt();
      return;
    }

    const { source, query } = parseInput(input);
    try {
      console.log("Thinking...");
      const response = await agent.query(query, source);
      console.log("\n" + response + "\n");
    } catch (error) {
      console.error("Error:", error);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    console.log("Goodbye!");
    await agent.stop();
    process.exit(0);
  });
}

main();
