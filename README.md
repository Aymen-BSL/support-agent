

# Delena-AI

Delena-AI is a **read-only CLI tool** for loading and exploring codebases using AI.
You can point it at local directories or remote GitHub repositories and **ask questions about the code** — either interactively or via a one-shot command suitable for automation or agent integration. ([GitHub][1])

---

## 🚀 Features

Delena-AI provides:

✔️ Load local directories or clone remote repositories
✔️ **Read-only AI exploration** — no modifications to source code ([GitHub][1])
✔️ Session management (save, resume)
✔️ Multiple AI models supported
✔️ Token counting per query
✔️ One-shot CLI mode for automation and agents
✔️ JSON output for parsing in scripts or tools ([GitHub][1])

---

## 📦 Installation

Clone the repo and install dependencies with Bun:

```bash
git clone https://github.com/support-agent-org/Delena-AI.git
cd Delena-AI
bun install
```

Create a `.env` file with your AI API key:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

---

## 💬 Usage

### 🔹 Interactive Mode

Start the interactive CLI:

```bash
bun run src/index.ts
```

Inside the interactive prompt, you can:

```
/load ./my-project
What are the tests in this repo?
Explain the architecture
```

---

### 🔹 One-Shot Mode (Agent-Friendly)

Run a single question from the shell — ideal for scripts and automation:

```bash
bun run query --repo <path|url> "Your question here"
```

---

## ⚙️ CLI Options

| Flag                  | Description                                          |               |
| --------------------- | ---------------------------------------------------- | ------------- |
| `-r, --repo <path>`   | Local directory or Git URL (required)                |               |
| `-j, --json`          | Output structured JSON                               |               |
| `-m, --model <model>` | AI model to use (default: `google/gemini-3.0-flash`) |               |
| `-q, --quiet`         | Output only the answer (suppress logs)               | ([GitHub][1]) |

---

## 📊 JSON Output Format

When using `--json`, responses are formatted for easy machine parsing:

```json
{
  "success": true,
  "answer": "This project is ...",
  "repository": "my-project",
  "model": "google/gemini-3.0-flash",
  "tokens": {
    "input": 1234,
    "output": 567,
    "total": 1801
  }
}
```

If the query fails:

````json
{
  "success": false,
  "error": "Failed to load repository"
}
``` :contentReference[oaicite:5]{index=5}

---

## 🧠 Interactive Commands

Once inside the CLI, use:

````

/load <path|url>     # Load a project
/unload              # Unload current repo
/status              # View current context and tokens
/save <name>         # Save session
/resume <name>       # Resume saved session
/sessions            # List saved sessions
/model               # Change model/provider
/mode <low|medium|high>  # Response depth
/help                # List commands
/exit                # Quit

```:contentReference[oaicite:6]{index=6}

---

## 🗄️ Session Storage

Delena-AI stores sessions and cached clones in:

```

~/.support-agent/

````

- `sessions.json`: session metadata  
- `repos/`: cached cloned repositories :contentReference[oaicite:7]{index=7}

---

## 🛡️ Read-Only Policy

Delena-AI **cannot modify code**. It can:

✔️ Read files & directories  
✔️ Clone repositories (shallow)  
✔️ Search files using glob  
✔️ Fetch external URLs  

Delena-AI **cannot**:

❌ Write, delete, or modify files  
❌ Execute system commands :contentReference[oaicite:8]{index=8}

---

## ⚙️ Configuration

Customize behavior using `opencode.json` settings. Example:

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
``` :contentReference[oaicite:9]{index=9}

---

## 📈 Supported Models & Providers

Delena-AI works with multiple AI backends and models — set via CLI or config.  
Default is `google/gemini-3.0-flash`, but you can switch to other supported models. :contentReference[oaicite:10]{index=10}

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository  
2. Create a branch (`git checkout -b feature/xyz`)  
3. Commit your changes  
4. Push to your fork  
5. Open a Pull Request

---

## 📄 License

This project is released under the **MIT License**. 


````

[1]: https://github.com/support-agent-org/Delena-AI "GitHub - support-agent-org/Delena-AI"
