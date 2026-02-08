# OpenCode Server + Chatbot UI

A Dockerized OpenCode Server with GitHub Copilot authentication and a custom Chatbot UI built with the OpenCode SDK.

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│                     │  HTTP   │                      │
│   Chatbot UI        │ ◄─────► │   OpenCode Server    │
│   (Express + SDK)   │  :4096  │   (opencode web)     │
│   Port 3000         │         │   Port 4096          │
│                     │         │                      │
│   @opencode-ai/sdk  │         │   GitHub Copilot     │
│   Modern Web UI     │         │   Custom Agents      │
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

# (Optional) Set a server password for security
# Edit .env and set OPENCODE_SERVER_PASSWORD=your-secure-password
```

### Step 3: Build & Run

```bash
# Build and start both services
docker-compose up --build

# Or run in detached mode
docker-compose up --build -d
```

### Step 4: Open the Chatbot

Open your browser and navigate to:

- **Chatbot UI**: [http://localhost:3000](http://localhost:3000)
- **OpenCode Server** (direct): [http://localhost:4096](http://localhost:4096)

## Project Structure

```
opencode_server/
├── docker-compose.yml          # Orchestrates both services
├── .env                        # Environment configuration
│
├── server/                     # OpenCode Server
│   ├── Dockerfile              # Server Docker image
│   ├── opencode.json           # OpenCode configuration
│   ├── entrypoint.sh           # Container startup script
│   └── agents/                 # Custom Agent Skills
│       ├── coding-assistant.md # Coding assistant agent
│       └── code-reviewer.md    # Code review agent
│
└── chatbot-ui/                 # Custom Chatbot UI
    ├── Dockerfile              # UI Docker image
    ├── package.json            # Node.js dependencies
    ├── server.js               # Express backend + OpenCode SDK
    └── public/                 # Frontend assets
        ├── index.html          # Main HTML
        ├── styles.css          # Styles (dark/light theme)
        └── app.js              # Frontend JavaScript
```

## Custom Agent Skills

Add your own agent skills by creating `.md` files in `server/agents/`:

```markdown
# My Custom Agent

You are a specialized agent for...

## Instructions
1. ...
2. ...
```

Then register them in `server/opencode.json`:

```json
{
  "agent": {
    "my-custom-agent": {
      "instructions": "./agents/my-custom-agent.md"
    }
  }
}
```

Rebuild the Docker image to apply changes:

```bash
docker-compose up --build
```

## API Endpoints (Chatbot UI Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (checks OpenCode server) |
| GET | `/api/agents` | List available agents |
| POST | `/api/sessions` | Create a new chat session |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details + messages |
| POST | `/api/sessions/:id/prompt` | Send prompt (SSE streaming) |

## Configuration

### OpenCode Server (`server/opencode.json`)

```json
{
  "agent": { ... },
  "provider": {
    "custom-provider": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "..." },
      "models": { ... }
    }
  },
  "mcp": { ... }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_PORT` | `4096` | OpenCode server port |
| `OPENCODE_HOST` | `0.0.0.0` | OpenCode server bind address |
| `OPENCODE_SERVER_PASSWORD` | (empty) | Server access password |
| `PORT` | `3000` | Chatbot UI port |
| `OPENCODE_SERVER_URL` | `http://opencode-server:4096` | OpenCode server URL |

## Windows Users

On Windows, the auth config path may differ. Update `docker-compose.yml`:

```yaml
volumes:
  - C:\Users\YourName\.config\opencode:/root/.config/opencode:ro
```

## Troubleshooting

### Server shows "No auth config found"

Make sure you've run `opencode auth login` locally first, then check the volume mount path in `docker-compose.yml`.

### Cannot connect to OpenCode server

1. Check if the server is running: `docker-compose logs opencode-server`
2. Verify the health check: `curl http://localhost:4096/health`
3. Ensure the Docker network is created: `docker network ls`

### Chatbot UI shows "Server Offline"

The Chatbot UI waits for the OpenCode server to be healthy before starting. Check:
1. `docker-compose logs opencode-server` for server errors
2. `docker-compose logs chatbot-ui` for UI errors

## Development (without Docker)

```bash
# Terminal 1: Start OpenCode server
opencode web --port 4096 --hostname 0.0.0.0

# Terminal 2: Start Chatbot UI
cd chatbot-ui
npm install
OPENCODE_SERVER_URL=http://localhost:4096 npm run dev
```

## License

MIT


docker build -t opencode-server .

docker run -d --name opencode-server -p 4096:4096 -v C:\Users\Harry\.config\opencode:/root/.config/opencode:ro -e OPENCODE_PORT=4096 -e OPENCODE_HOST=0.0.0.0 opencode-server