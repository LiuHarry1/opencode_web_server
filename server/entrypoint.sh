#!/bin/bash
set -e

echo "============================================"
echo "  OpenCode Server - Starting Up"
echo "============================================"

# -----------------------------------------------
# 1. Check authentication
# -----------------------------------------------
AUTH_DIR="$HOME/.config/opencode"

if [ -d "$AUTH_DIR" ] && [ "$(ls -A $AUTH_DIR 2>/dev/null)" ]; then
    echo "[✓] Found existing OpenCode auth config"
else
    echo "[!] No auth config found."
    echo "    Please mount your local auth config:"
    echo "    -v \$HOME/.config/opencode:/root/.config/opencode"
    echo ""
    echo "    Or run 'opencode auth login' interactively first."
    echo ""

    # If COPILOT_TOKEN is provided, we can try to set it up
    if [ -n "$COPILOT_TOKEN" ]; then
        echo "[*] COPILOT_TOKEN detected, attempting auto-setup..."
        mkdir -p "$AUTH_DIR"
        echo "{\"copilot_token\": \"$COPILOT_TOKEN\"}" > "$AUTH_DIR/auth.json"
        echo "[✓] Auth config created from COPILOT_TOKEN"
    fi
fi

# -----------------------------------------------
# 2. Check if opencode.json exists
# -----------------------------------------------
if [ -f "/app/opencode.json" ]; then
    echo "[✓] Found opencode.json configuration"
else
    echo "[!] No opencode.json found, using defaults"
fi

# -----------------------------------------------
# 3. Restore skills (volume mount may overwrite global config)
# -----------------------------------------------
SKILLS_BACKUP="/opt/opencode-skills"
GLOBAL_SKILLS="$HOME/.config/opencode/skills"

if [ -d "$SKILLS_BACKUP" ] && [ "$(ls -A $SKILLS_BACKUP 2>/dev/null)" ]; then
    # Copy skills to global config (volume mount may have overwritten them)
    if mkdir -p "$GLOBAL_SKILLS" 2>/dev/null; then
        cp -r "$SKILLS_BACKUP"/* "$GLOBAL_SKILLS/" 2>/dev/null || true
        echo "[✓] Skills copied to global config"
    else
        echo "[i] Global config is read-only, using project-level skills only"
    fi

    SKILL_COUNT=$(find "$SKILLS_BACKUP" -name "SKILL.md" | wc -l)
    echo "[✓] Found $SKILL_COUNT custom skill(s):"
    for skill in "$SKILLS_BACKUP"/*/SKILL.md; do
        name=$(basename "$(dirname "$skill")")
        echo "    - $name"
    done
else
    echo "[i] No custom skills found"
fi

# -----------------------------------------------
# 4. Set server password if provided
# -----------------------------------------------
if [ -n "$OPENCODE_SERVER_PASSWORD" ]; then
    echo "[✓] Server password protection enabled"
    export OPENCODE_SERVER_PASSWORD="$OPENCODE_SERVER_PASSWORD"
else
    echo "[!] No OPENCODE_SERVER_PASSWORD set — server is unprotected"
    echo "    Set -e OPENCODE_SERVER_PASSWORD=yourpass for production use"
fi

# -----------------------------------------------
# 5. Start OpenCode Server (API mode for SDK access)
# -----------------------------------------------
PORT="${OPENCODE_PORT:-4096}"
HOST="${OPENCODE_HOST:-0.0.0.0}"

echo ""
echo "============================================"
echo "  Starting OpenCode Server (API Mode)"
echo "  Host: $HOST"
echo "  Port: $PORT"
echo "============================================"
echo ""

# Ensure PATH includes OpenCode bin directory
export PATH="$HOME/.opencode/bin:$HOME/.local/bin:$PATH"

# Try to find opencode
if ! command -v opencode &> /dev/null; then
    echo "[ERROR] opencode command not found in PATH"
    echo "        PATH: $PATH"
    echo "        Checking common locations..."
    ls -la ~/.opencode/bin/opencode 2>/dev/null || echo "  Not in ~/.opencode/bin/"
    ls -la ~/.local/bin/opencode 2>/dev/null || echo "  Not in ~/.local/bin/"
    ls -la /usr/local/bin/opencode 2>/dev/null || echo "  Not in /usr/local/bin/"
    exit 1
fi

echo "[✓] Found opencode: $(which opencode)"

# Use 'opencode serve' for API server mode (for SDK access)
# Use 'opencode web' for Web UI mode (browser interface)
# We use 'serve' here because Chatbot UI needs API access
exec opencode serve --hostname "$HOST" --port "$PORT"
