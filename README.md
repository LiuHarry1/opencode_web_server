# OpenCode Cloud Server

把 OpenCode 运行在 Docker 容器里，预装 Agent Skills（PDF、Excel、MCP 等），通过 OpenCode 自带的 Web UI 供多人访问。

**零挂载设计** — 不需要挂载任何宿主机文件，所有依赖和配置都内置在镜像中。

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
│   Auth: via COPILOT_TOKEN env var     │
│   每个用户独立会话，互不可见           │
└───────────────────────────────────────┘
```

## Features

- **零挂载部署** — 无需挂载任何文件，Docker image 自包含一切
- **多人共用** — 通过 Web UI 访问，每人有独立的对话会话
- **会话隔离** — 每个用户的对话历史互不可见
- **预装 Skills** — PDF、Excel、MCP 开发、Skill 创建等能力
- **密码保护** — 可设置访问密码，控制谁能使用

## Prerequisites

- **Docker** & **Docker Compose**
- **GitHub Copilot** subscription (Pro, Pro+, Business, or Enterprise)
- **OpenCode CLI** installed locally (仅用于首次获取 token)

## Quick Start

### Step 1: Get Copilot Token

在本地机器上运行（仅需一次）：

```bash
curl -fsSL https://opencode.ai/install | bash
opencode auth login
# Select "GitHub Copilot" and complete the device flow
```

登录成功后，查看 token：

```bash
cat ~/.config/opencode/auth.json
```

### Step 2: Configure

```bash
cp .env.example .env
```

编辑 `.env`：

```env
COPILOT_TOKEN=your-copilot-token-here
OPENCODE_SERVER_PASSWORD=set-a-strong-password
OPENCODE_PORT=4096
```

### Step 3: Build & Run

```bash
docker compose up --build -d
```

### Step 4: Open

打开 [http://localhost:4096](http://localhost:4096) — OpenCode 的 Web UI。

把这个地址分享给团队成员，每个人打开后都是独立的会话。

## 直接用 docker run

如果不想用 docker compose，也可以直接运行：

```bash
# Build
docker build -t opencode-server .

# Run
docker run -d \
  --name opencode-server \
  -p 4096:4096 \
  -e OPENCODE_PORT=4096 \
  -e OPENCODE_HOST=0.0.0.0 \
  -e COPILOT_TOKEN=your-token \
  -e OPENCODE_SERVER_PASSWORD=your-password \
  --restart unless-stopped \
  opencode-server
```

## Project Structure

```
.
├── Dockerfile                    # Docker 镜像构建
├── docker-compose.yml            # Docker Compose 部署
├── .env.example                  # 环境变量模板
├── opencode.json                 # OpenCode 配置（本地开发用）
├── requirements.txt              # Python 依赖
│
├── config/
│   ├── docker/
│   │   ├── opencode.json         # OpenCode 配置（Docker 路径）
│   │   └── entrypoint.sh        # 容器入口脚本
│   └── local/
│       └── start.sh             # 本地开发启动脚本
│
├── data/                         # 工作区数据文件
│
└── .opencode/
    ├── skills/                   # 预装 Agent Skills
    │   ├── pdf/                  # PDF: extract, merge, split, fill forms
    │   ├── xlsx/                 # Excel: create, edit, formulas, recalc
    │   ├── mcp-builder/          # MCP server development guide
    │   └── skill-creator/        # Skill creation toolkit
    ├── mcp-servers/              # MCP 服务器
    ├── lsp/                      # LSP 语言服务器
    └── plugins/                  # 插件
```

## Pre-loaded Skills

| Skill | Description |
|-------|-------------|
| **pdf** | Extract text/tables, merge/split, fill forms, convert to images |
| **xlsx** | Create/edit spreadsheets, formulas, recalculate via LibreOffice |
| **mcp-builder** | Guide for building MCP servers (Python/TypeScript) |
| **skill-creator** | Create new custom skills with templates |

Skills 在构建时已经内置到镜像的 `/workspace/.opencode/skills/` 目录中。

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_TOKEN` | (required) | GitHub Copilot auth token |
| `OPENCODE_PORT` | `4096` | Server port (also serves Web UI) |
| `OPENCODE_SERVER_PASSWORD` | (empty) | Access password (strongly recommended) |

### Permissions (`opencode.json`)

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

## Multi-User & History Isolation

- 每个浏览器连接到 Web UI 时，OpenCode 会创建独立的会话
- 不同用户之间的对话历史互不可见
- 所有用户共享相同的 workspace 文件系统（`/workspace/data/`）
- 如果用户 A 生成了文件，用户 B 可能在文件系统中看到，但对话内容是隔离的

## Security Considerations

- **务必设置 `OPENCODE_SERVER_PASSWORD`** — 否则任何人都能使用
- 生产环境建议用 nginx/Caddy 反代并启用 HTTPS
- `opencode.json` 中的 `shell: allow` 允许执行任意命令，多用户场景请评估风险
- `COPILOT_TOKEN` 是敏感信息，不要提交到代码仓库

## Local Development

无需 Docker，直接在本地运行：

```bash
# 1. 激活 Python 环境
conda activate llm_ft

# 2. 启动本地服务
bash config/local/start.sh
```

根目录的 `opencode.json` 是本地开发配置，使用本地路径。
Docker 容器内使用 `config/docker/opencode.json`，路径指向容器内的 `/opt/venv/bin/python` 和 `/workspace/`。

## Adding Custom Skills

在 `.opencode/skills/` 下创建新目录，包含 `SKILL.md`：

```
.opencode/skills/my-skill/
├── SKILL.md          # Required: name, description, instructions
├── scripts/          # Optional: Python/Shell scripts
└── references/       # Optional: reference docs
```

然后重新构建：

```bash
docker compose up --build -d
```

## Troubleshooting

### Docker build: "failed to fetch anonymous token" / "i/o timeout"

Docker 无法访问 Docker Hub 来拉取 `ubuntu:24.04`。

**1. 使用 Docker daemon registry mirror（推荐）**

Docker Desktop → **Settings** → **Docker Engine** → 添加 mirror：

```json
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}
```

**2. 使用替代 base image**

```bash
docker build \
  --build-arg BASE_IMAGE=mcr.microsoft.com/devcontainers/base:ubuntu-24.04 \
  -t opencode-server .
```

### General

```bash
# Check logs
docker compose logs -f opencode-server

# Verify health
curl http://localhost:4096/health

# Rebuild from scratch
docker compose down && docker compose up --build
```

## License

MIT


docker build -t opencode-server .
docker run -d --name opencode-server -p 4096:4096 opencode-server