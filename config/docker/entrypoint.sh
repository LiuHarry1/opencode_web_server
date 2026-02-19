#!/bin/bash
set -e

echo "============================================"
echo "  OpenCode Server — Starting Up"
echo "============================================"

# 1. Auth setup
AUTH_DIR="$HOME/.config/opencode"
if [ -n "$COPILOT_TOKEN" ]; then
    mkdir -p "$AUTH_DIR"
    echo "{\"copilot_token\": \"$COPILOT_TOKEN\"}" > "$AUTH_DIR/auth.json"
    echo "[OK] Auth configured from COPILOT_TOKEN"
elif [ -d "$AUTH_DIR" ] && [ "$(ls -A $AUTH_DIR 2>/dev/null)" ]; then
    echo "[OK] Auth config found"
else
    echo "[!] No auth — set COPILOT_TOKEN env var"
fi

# 2. Password protection
if [ -n "$OPENCODE_SERVER_PASSWORD" ]; then
    echo "[OK] Password protection enabled"
else
    echo "[!] No password — server is open"
fi

# 3. Launch
export PATH="/opt/venv/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"
PORT="${OPENCODE_PORT:-4096}"
HOST="${OPENCODE_HOST:-0.0.0.0}"

echo "[OK] Serving on $HOST:$PORT"
exec opencode serve --hostname "$HOST" --port "$PORT"
