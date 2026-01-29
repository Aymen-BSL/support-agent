import "dotenv/config";
import { createInterface } from "readline";
import { SupportAgent, type ThinkingMode } from "./agent";
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
  console.log("Available Commands:");
  console.log(
    "  /model or /models        - List and select available AI models",
  );
  console.log("  /mode [low|medium|high]  - Set thinking mode (complexity)");
  console.log("  /exit                    - Exit the application");
  console.log("-----------------------------------");
  console.log("Usage: [source] query");
  console.log(
    "Example: https://github.com/example/repo How do I install this?",
  );

  rl.prompt();

  // Interaction state
  let state: "normal" | "selecting_provider" | "selecting_model" = "normal";
  let availableProviders: any[] = [];
  let selectedProvider: any = null;

  rl.on("line", async (line) => {
    const input = line.trim();

    // Handle Provider Selection State
    if (state === "selecting_provider") {
      const index = parseInt(input) - 1;
      if (isNaN(index) || index < 0 || index >= availableProviders.length) {
        console.log("Invalid selection. Entering normal mode.");
        state = "normal";
        rl.prompt();
        return;
      }
      selectedProvider = availableProviders[index];
      console.log(`Selected Provider: ${selectedProvider.id}`);
      console.log("Available Models:");

      const models = Object.keys(selectedProvider.models || {});
      if (models.length === 0) {
        console.log("No models found for this provider. Entering normal mode.");
        state = "normal";
      } else {
        models.forEach((m, i) => console.log(`${i + 1}. ${m}`));
        console.log("Select a model number:");
        state = "selecting_model";
      }
      rl.prompt();
      return;
    }

    // Handle Model Selection State
    if (state === "selecting_model") {
      const models = Object.keys(selectedProvider.models || {});
      const index = parseInt(input) - 1;
      if (isNaN(index) || index < 0 || index >= models.length) {
        console.log("Invalid selection. Entering normal mode.");
        state = "normal";
        rl.prompt();
        return;
      }
      const modelId = models[index];
      const fullModelId = `${selectedProvider.id}/${modelId}`; // Construct proper ID (provider/model or just modelId depending on how provider expects it, usually provider/model for global config)

      // However, Opencode 3.0 approach might be provider/model.
      // Let's assume provider/model format for setModel.
      await agent.setModel(fullModelId);
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

        console.log("Select a provider:");
        availableProviders.forEach((p, i) => console.log(`${i + 1}. ${p.id}`));
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
        console.log("Invalid mode. Use low, medium, or high.");
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
