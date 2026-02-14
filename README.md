# OpenCode Server + Chatbot UI

A Dockerized OpenCode Server with GitHub Copilot authentication and a custom Chatbot UI built with the OpenCode SDK. Pre-loaded with agent skills for PDF processing, Excel manipulation, MCP server building, and more.

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│                     │  HTTP   │                      │
│   Chatbot UI        │ ◄─────► │   OpenCode Server    │
│   (Express + SDK)   │  :4096  │   (opencode serve)   │
│   Port 3000         │         │   Port 4096          │
│                     │         │                      │
│   Rate-limited      │         │   GitHub Copilot     │
│   XSS-protected     │         │   Agent Skills       │
│   Modern Web UI     │         │   PDF/XLSX/MCP/...   │
└─────────────────────┘         └──────────────────────┘
        ▲                                ▲
        │ Browser                        │ Auth
        │ :3000                          │ ~/.config/opencode
        ▼                                ▼
    ┌────────┐                    ┌──────────────┐
    │  User  │                    │  Copilot API │
    └────────┘                    └──────────────┘
```

## Prerequisites

- **Docker** & **Docker Compose** installed
- **GitHub Copilot** subscription (Pro, Pro+, Business, or Enterprise)
- **OpenCode CLI** installed locally (for initial authentication)

## Quick Start

### Step 1: Authenticate with GitHub Copilot

First, install OpenCode CLI locally and login:

```bash
# Install OpenCode
curl -fsSL https://opencode.ai/install | bash

# Login with GitHub Copilot
opencode auth login
# Select "GitHub Copilot" and complete the device flow
```

This stores your auth credentials at `~/.config/opencode/`.

### Step 2: Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and configure:
# 1. Set OPENCODE_AUTH_PATH to your local auth config path
# 2. (Recommended) Set OPENCODE_SERVER_PASSWORD for security
```

### Step 3: Build & Run

```bash
# Build and start both services
docker compose up --build

# Or run in detached mode
docker compose up --build -d
```

### Step 4: Open the Chatbot

Open your browser and navigate to:

- **Chatbot UI**: [http://localhost:3000](http://localhost:3000)
- **OpenCode Server** (direct): [http://localhost:4096](http://localhost:4096)

## Project Structure

```
opencode_server/
├── docker-compose.yml            # Orchestrates both services
├── .env.example                  # Environment configuration template
│
├── server/                       # OpenCode Server
│   ├── Dockerfile                # Server Docker image
│   ├── .dockerignore             # Build context exclusions
│   ├── opencode.json             # OpenCode configuration
│   ├── entrypoint.sh             # Container startup script
│   ├── requirements.txt          # Python dependencies for skills
│   └── agents/skills/            # Pre-loaded Agent Skills
│       ├── pdf/                  # PDF processing (extract, merge, fill forms)
│       ├── xlsx/                 # Excel processing (formulas, recalculation)
│       ├── mcp-builder/          # MCP server development guide
│       └── skill-creator/        # Skill creation toolkit
│
└── chatbot-ui/                   # Custom Chatbot UI
    ├── Dockerfile                # UI Docker image
    ├── .dockerignore             # Build context exclusions
    ├── package.json              # Node.js dependencies
    ├── server.js                 # Express backend + OpenCode SDK proxy
    └── public/                   # Frontend assets
        ├── index.html            # Main HTML
        ├── styles.css            # Styles (dark/light theme)
        └── app.js                # Frontend JavaScript
```

## Pre-loaded Agent Skills

| Skill | Description | Capabilities |
|-------|-------------|-------------|
| **pdf** | PDF processing toolkit | Extract text/tables, merge/split, fill forms, convert to images |
| **xlsx** | Excel processing | Create/edit spreadsheets, formulas, recalculation via LibreOffice |
| **mcp-builder** | MCP server builder | Guide for creating MCP servers (Python/TypeScript) |
| **skill-creator** | Skill creation toolkit | Create new skills with templates and validation |

## API Endpoints (Chatbot UI Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (checks OpenCode server) |
| GET | `/api/skills` | List available skill categories |
| POST | `/api/upload` | Upload files (max 10 files, configurable size) |
| GET | `/api/files` | List uploaded & output files |
| GET | `/api/files/:category/:filename` | Download a file |
| GET | `/api/agents` | List available agents |
| POST | `/api/sessions` | Create a new chat session |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/:id/messages` | Get session messages |
| POST | `/api/sessions/:id/prompt` | Send prompt (SSE streaming) |

## Configuration

### OpenCode Server (`server/opencode.json`)

```json
{
  "$schema": "https://opencode.ai/schema.json",
  "model": "github-copilot/gpt-5.2",
  "permission": {
    "skill": { "*": "allow" },
    "file": { "read": "allow", "write": "allow" },
    "shell": "allow"
  }
}
```

> **Security Note**: The current configuration grants unrestricted file and shell access. For production multi-user deployments, consider restricting these permissions.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_AUTH_PATH` | (required) | Path to local opencode auth config directory |
| `OPENCODE_PORT` | `4096` | OpenCode server port |
| `OPENCODE_HOST` | `0.0.0.0` | OpenCode server bind address |
| `OPENCODE_SERVER_PASSWORD` | (empty) | Server access password |
| `CHATBOT_PORT` | `3000` | Chatbot UI port |
| `MAX_FILE_SIZE_MB` | `50` | Maximum file upload size in MB |

## Security Considerations

When deploying to the cloud for multi-user access:

1. **Always set `OPENCODE_SERVER_PASSWORD`** to prevent unauthorized access
2. **Use a reverse proxy** (nginx, Caddy) with HTTPS in production
3. **Consider network isolation** — only expose the chatbot-ui port, not the opencode server port
4. **Review `opencode.json` permissions** — `"shell": "allow"` lets agents execute arbitrary commands
5. **Monitor uploaded files** — the upload directory is accessible to the agent

## Windows Users

On Windows, set `OPENCODE_AUTH_PATH` in your `.env` file:

```env
OPENCODE_AUTH_PATH=C:\Users\YourName\.config\opencode
```

## Troubleshooting

### Server shows "No auth config found"

Make sure you've run `opencode auth login` locally first, then verify `OPENCODE_AUTH_PATH` in `.env` points to the correct directory.

### Cannot connect to OpenCode server

1. Check if the server is running: `docker compose logs opencode-server`
2. Verify the health check: `curl http://localhost:4096/health`
3. Ensure the Docker network is created: `docker network ls`

### Chatbot UI shows "Server Offline"

The Chatbot UI waits for the OpenCode server to be healthy before starting. Check:
1. `docker compose logs opencode-server` for server errors
2. `docker compose logs chatbot-ui` for UI errors

## Development (without Docker)

```bash
# Terminal 1: Start OpenCode server
opencode serve --port 4096 --hostname 0.0.0.0

# Terminal 2: Start Chatbot UI
cd chatbot-ui
npm install
OPENCODE_SERVER_URL=http://localhost:4096 npm run dev
```

## License

MIT
