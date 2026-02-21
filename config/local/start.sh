#!/bin/bash
# ============================================
# 本地测试 OpenCode Server（无需 Docker）
#
# 用法:
#   1. 激活 Python 环境: conda activate llm_ft
#   2. 运行: bash config/local/start.sh
#
# 脚本会自动:
#   - 检查 opencode CLI 和 Python 环境
#   - 处理 .opencode 目录的符号链接（如果项目不在 git root）
#   - 在 http://localhost:4096 启动服务
# ============================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 加载 .env（跟 docker compose 行为一致，已有的 shell 变量不会被覆盖）
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

PYTHON_BIN="$(which python)"
GIT_ROOT="$(cd "$PROJECT_ROOT" && git rev-parse --show-toplevel 2>/dev/null || echo "$PROJECT_ROOT")"

# 检查 opencode CLI
if ! command -v opencode &>/dev/null; then
    echo "[ERROR] opencode CLI not found."
    echo "        Install: curl -fsSL https://opencode.ai/install | bash"
    exit 1
fi

# 检查 Python 环境
if ! python -c "import fastmcp" 2>/dev/null; then
    echo "[ERROR] fastmcp not found in current Python: $PYTHON_BIN"
    echo "        Run: conda activate llm_ft  (or pip install fastmcp)"
    exit 1
fi

# 如果项目目录不是 git root，需要做 .opencode 的符号链接
NEED_SYMLINK=false
if [ "$GIT_ROOT" != "$PROJECT_ROOT" ]; then
    if [ ! -e "$GIT_ROOT/.opencode" ]; then
        ln -s "$PROJECT_ROOT/.opencode" "$GIT_ROOT/.opencode"
        NEED_SYMLINK=true
        echo "[OK] Symlinked $GIT_ROOT/.opencode -> $PROJECT_ROOT/.opencode"
    fi
fi

echo "============================================"
echo "  OpenCode Local Test Server"
echo "============================================"
echo "[OK] Project:  $PROJECT_ROOT"
echo "[OK] Python:   $PYTHON_BIN"
echo "[OK] Config:   $PROJECT_ROOT/opencode.json"
echo ""
echo "Starting on http://localhost:4096 ..."
echo "(Press Ctrl+C to stop)"
echo ""

cleanup() {
    if [ "$NEED_SYMLINK" = true ] && [ -L "$GIT_ROOT/.opencode" ]; then
        rm "$GIT_ROOT/.opencode"
        echo "[CLEANUP] Removed symlink $GIT_ROOT/.opencode"
    fi
}
trap cleanup EXIT

cd "$PROJECT_ROOT"
opencode serve --port 4096 --print-logs --log-level WARN
