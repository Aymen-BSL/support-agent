# Support Agent

A **read-only** CLI tool for loading and understanding codebases. Load any local or remote repository and ask questions about it using AI — interactively or via a single command for agent integration.

## Features

- 📂 **Repository Loading**: Load local directories or clone remote Git repos
- 🔒 **Read-Only Mode**: The agent cannot modify, delete, or write files
- 💾 **Session Management**: Save and resume conversations
- 📊 **Token Tracking**: Monitor token usage for each query
- 🤖 **Multiple AI Models**: Support for various AI providers
- ⚡ **One-Shot CLI Mode**: Non-interactive queries for automation and agent integration

---

## Installation

```bash
bun install
```

Set your API key in a `.env` file:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

---

## Usage

### Interactive Mode

Start the interactive CLI for conversational code exploration:

```bash
bun run src/index.ts
```

### One-Shot Mode (Agent-Friendly)

Run a single query without interactive prompts — perfect for automation, scripts, or integration with other AI agents:

```bash
bun run query --repo <path|url> "Your question here"
```

#### Options

| Flag | Description |
|------|-------------|
| `-r, --repo <path>` | **Required.** Local path or Git URL to repository |
| `-j, --json` | Output structured JSON response |
| `-m, --model <model>` | Specify model (default: `google/gemini-3.0-flash`) |
| `-q, --quiet` | Suppress progress messages, output only the answer |

#### Examples

```bash
# Basic query
bun run query --repo ./my-project "What does this project do?"

# JSON output for parsing
bun run query --repo . --json "List all entry points"

# Query a remote repository
bun run query --repo https://github.com/user/repo "Explain the architecture"

# Quiet mode (no progress logs)
bun run query --repo ./src --quiet "What is the main function?"
```

#### JSON Output Format

When using `--json`, the response is structured for easy parsing:

```json
{
  "success": true,
  "answer": "This project is a CLI-based AI assistant...",
  "repository": "my-project",
  "model": "google/gemini-2.0-flash",
  "tokens": {
    "input": 5432,
    "output": 892,
    "total": 6324
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Failed to load repository: path not found"
}
```

---

## Interactive Commands

### Repository Commands

| Command | Description |
|---------|-------------|
| `/load <path\|url>` | Load a local directory or clone a Git repository |
| `/unload` | Unload the current repository |
| `/status` | Show current session status (model, repo, tokens) |

### Session Commands

| Command | Description |
|---------|-------------|
| `/save <name>` | Save the current session for later |
| `/resume <name>` | Resume a previously saved session |
| `/sessions` | List all saved sessions |
| `/saveexit <name>` | Save session and unload repository |

### Model Commands

| Command | Description |
|---------|-------------|
| `/model` | Select an AI model/provider interactively |
| `/mode <low\|medium\|high>` | Set thinking depth for responses |

### General Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/exit` | Exit the application |

---

## Example Workflow

```bash
# Start interactive mode
bun run src/index.ts

# Load a project
/load ./my-project

# Ask questions
What does this project do?
What are the main dependencies?
Explain the folder structure

# Save the session
/save my-project-analysis

# Exit
/exit

# Later, resume it
bun run src/index.ts
/resume my-project-analysis
```

---

## Security

The agent operates in **READ-ONLY** mode:

| Capability | Status |
|------------|--------|
| Read files and directories | ✅ Allowed |
| Clone repositories (shallow clone) | ✅ Allowed |
| Use glob to search for files | ✅ Allowed |
| Fetch external URLs | ✅ Allowed |
| Write, modify, or delete files | ❌ Blocked |
| Execute shell commands | ❌ Blocked |

---

## Data Storage

Session data and cached repositories are stored in `~/.support-agent/`:

| Path | Contents |
|------|----------|
| `sessions.json` | Saved session metadata |
| `repos/` | Cached cloned repositories |

---

## Configuration

The agent is configured via `opencode.json`. Key settings:

```json
{
  "agent": {
    "support": {
      "model": "google/gemini-3-pro-preview",
      "tools": {
        "read": true,
        "glob": true,
        "fetch": true,
        "write": false,
        "bash": false
      }
    }
  }
}
```

---

## License

MIT
