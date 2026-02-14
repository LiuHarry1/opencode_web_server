# OpenCode Cloud Server

把 OpenCode 运行在云端，预装 Agent Skills（PDF、Excel、MCP 等），通过 OpenCode 自带的 Web UI 供多人访问。

## Architecture

```
┌───────────────────────────────────────┐
│         OpenCode Server               │
│         (opencode serve)              │
│                                       │
│   Built-in Web UI   ◄── Browser :4096 │
│   Agent Skills (PDF/XLSX/MCP/...)     │
│   Python / Node.js / Shell runtime    │
│                                       │
│   GitHub Copilot auth (mounted)       │
└───────────────────────────────────────┘
```

## Prerequisites

- **Docker** & **Docker Compose**
- **GitHub Copilot** subscription (Pro, Pro+, Business, or Enterprise)
- **OpenCode CLI** installed locally (for initial authentication)

## Quick Start

### Step 1: Authenticate

```bash
curl -fsSL https://opencode.ai/install | bash
opencode auth login
# Select "GitHub Copilot" and complete the device flow
```

### Step 2: Configure

```bash
cp .env.example .env
# Edit .env:
#   OPENCODE_AUTH_PATH=~/.config/opencode   (your auth config path)
#   OPENCODE_SERVER_PASSWORD=your-password   (recommended)
```

### Step 3: Run

```bash
docker compose up --build -d
```

### Step 4: Open

Open [http://localhost:4096](http://localhost:4096) — OpenCode's built-in Web UI.

## Project Structure

```
.
├── docker-compose.yml            # Single-service deployment
├── .env.example                  # Configuration template
│
└── server/
    ├── Dockerfile                # Ubuntu 24.04 + Python + Node.js + OpenCode
    ├── .dockerignore
    ├── entrypoint.sh             # Startup: auth check, skill restore, launch
    ├── opencode.json             # OpenCode configuration & permissions
    ├── requirements.txt          # Python dependencies for skills
    └── agents/skills/            # Pre-loaded Agent Skills
        ├── pdf/                  # PDF: extract, merge, split, fill forms
        ├── xlsx/                 # Excel: create, edit, formulas, recalc
        ├── mcp-builder/          # MCP server development guide
        └── skill-creator/        # Skill creation toolkit
```

## Pre-loaded Skills

| Skill | Description |
|-------|-------------|
| **pdf** | Extract text/tables, merge/split, fill forms, convert to images |
| **xlsx** | Create/edit spreadsheets, formulas, recalculate via LibreOffice |
| **mcp-builder** | Guide for building MCP servers (Python/TypeScript) |
| **skill-creator** | Create new custom skills with templates |

Skills 存放在 `/workspace/.opencode/skills/`，容器启动时从 `/opt/opencode-skills/` 恢复（防止 volume mount 覆盖）。

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_AUTH_PATH` | (required) | Local opencode auth config path |
| `OPENCODE_PORT` | `4096` | Server port (also serves Web UI) |
| `OPENCODE_SERVER_PASSWORD` | (empty) | Access password |

### Permissions (`server/opencode.json`)

```json
{
  "model": "github-copilot/gpt-5.2",
  "permission": {
    "skill": { "*": "allow" },
    "file": { "read": "allow", "write": "allow" },
    "shell": "allow"
  }
}
```

> **注意**: `"shell": "allow"` 允许 Agent 执行任意命令。适合受信任的环境，生产环境请酌情限制。

## Security Considerations

- **务必设置 `OPENCODE_SERVER_PASSWORD`**
- 生产环境建议用 nginx/Caddy 反代并启用 HTTPS
- `opencode.json` 中的 `shell: allow` 允许执行任意命令，多用户场景请评估风险
- Auth 配置以只读方式挂载 (`:ro`)，Agent 无法修改

## Adding Custom Skills

在 `server/agents/skills/` 下创建新目录，包含 `SKILL.md`：

```
server/agents/skills/my-skill/
├── SKILL.md          # Required: name, description, instructions
├── scripts/          # Optional: Python/Shell scripts
└── references/       # Optional: reference docs
```

然后重新构建：

```bash
docker compose up --build -d
```

## Troubleshooting

```bash
# Check logs
docker compose logs -f opencode-server

# Verify health
curl http://localhost:4096/health

# Rebuild from scratch
docker compose down && docker compose up --build
```

## Windows

```env
OPENCODE_AUTH_PATH=C:\Users\YourName\.config\opencode
```

## License

MIT



docker build -t opencode-server .


docker run -d `
  --name opencode-server `
  -p 4096:4096 `
  -e OPENCODE_PORT=4096 `
  -e OPENCODE_HOST=0.0.0.0 `
  -v "C:\Users\Harry\.config\opencode:/root/.config/opencode:ro" `
  --restart unless-stopped `
  opencode-server


docker run -d `
  --name opencode-server `
  -p 4096:4096 `
  -e OPENCODE_PORT=4096 `
  -e OPENCODE_HOST=0.0.0.0 `
  --restart unless-stopped `
  opencode-server