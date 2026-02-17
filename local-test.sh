#!/bin/bash
# ============================================
# 本地测试 OpenCode Server（无需 Docker）
# 用法: conda activate llm_ft && bash local-test.sh
# ============================================
set -e

# 检查 opencode
if ! command -v opencode &>/dev/null; then
    echo "[ERROR] opencode CLI not found. Install: curl -fsSL https://opencode.ai/install | bash"
    exit 1
fi

# 检查 Python 环境中是否有 fastmcp
if ! python -c "import fastmcp" 2>/dev/null; then
    echo "[ERROR] fastmcp not found in current Python: $(which python)"
    echo "        Run: conda activate llm_ft  (or pip install fastmcp)"
    exit 1
fi

echo "============================================"
echo "  OpenCode Local Test Server"
echo "============================================"
echo "[OK] Python: $(which python)"
echo "[OK] Starting on http://localhost:4096 ..."
echo "(Press Ctrl+C to stop)"
echo ""

cd "$(dirname "$0")"
opencode serve --port 4096
