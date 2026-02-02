# Support Agent

A **read-only** CLI tool for loading and understanding codebases. Load any local or remote repository and ask questions about it using AI.

## Features

- 📂 **Repository Loading**: Load local directories or clone remote Git repos
- 🔒 **Read-Only Mode**: The agent cannot modify, delete, or write files
- 💾 **Session Management**: Save and resume conversations
- 📊 **Token Tracking**: Track token usage for each query
- 🤖 **Multiple AI Models**: Support for various AI providers

## Installation

```bash
bun install
```

## Usage

```bash
bun run index.ts
```

### Commands

#### Repository Commands
- `/load <path|url>` - Load a local directory or clone a Git repository
- `/status` - Show current session status (model, repo, tokens)

#### Session Commands
- `/save <name>` - Save the current session for later
- `/resume <name>` - Resume a previously saved session
- `/sessions` - List all saved sessions

#### Model Commands
- `/model` - Select an AI model/provider
- `/mode <low|medium|high>` - Set thinking depth
- `/exit` - Exit the application

### Examples

```bash
# Load a local project
/load ./my-project

# Ask questions about it
What does this project do?
What are the main dependencies?
Explain the folder structure

# Save the session
/save my-project-analysis

# Later, resume it
/resume my-project-analysis
```

## Security

The agent operates in **READ-ONLY** mode:
- ✅ Can read files and directories
- ✅ Can clone repositories (shallow clone)
- ❌ Cannot write, modify, or delete files
- ❌ Cannot execute commands in your repository

## Data Storage

Session data and cached repositories are stored in `.support-agent/`:
- `sessions.json` - Saved session metadata
- `repos/` - Cached cloned repositories

This directory is git-ignored by default.

