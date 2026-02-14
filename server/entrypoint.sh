#!/bin/bash
set -e

echo "============================================"
echo "  OpenCode Server — Starting Up"
echo "  Multi-user Docker Deployment"
echo "============================================"

# -----------------------------------------------
# 1. Check authentication
# -----------------------------------------------
AUTH_DIR="$HOME/.config/opencode"

if [ -d "$AUTH_DIR" ] && [ "$(ls -A $AUTH_DIR 2>/dev/null)" ]; then
    echo "[OK] Found existing OpenCode auth config"
else
    echo "[!] No auth config found."
    echo "    Mount your local auth config:"
    echo "    -v \$HOME/.config/opencode:/root/.config/opencode"

    if [ -n "$COPILOT_TOKEN" ]; then
        echo "[*] COPILOT_TOKEN detected, attempting auto-setup..."
        mkdir -p "$AUTH_DIR"
        echo "{\"copilot_token\": \"$COPILOT_TOKEN\"}" > "$AUTH_DIR/auth.json"
        echo "[OK] Auth config created from COPILOT_TOKEN"
    fi
fi

# -----------------------------------------------
# 2. Restore skills (volume mount may overwrite)
# -----------------------------------------------
SKILLS_BACKUP="/opt/opencode-skills"
WORKSPACE_SKILLS="/workspace/.opencode/skills"

if [ -d "$SKILLS_BACKUP" ] && [ "$(ls -A $SKILLS_BACKUP 2>/dev/null)" ]; then
    mkdir -p "$WORKSPACE_SKILLS"
    cp -r "$SKILLS_BACKUP"/* "$WORKSPACE_SKILLS/" 2>/dev/null || true

    SKILL_COUNT=$(find "$SKILLS_BACKUP" -name "SKILL.md" | wc -l)
    echo "[OK] Restored $SKILL_COUNT agent skill(s):"
    for skill in "$SKILLS_BACKUP"/*/SKILL.md; do
        if [ -f "$skill" ]; then
            name=$(basename "$(dirname "$skill")")
            echo "    - $name"
        fi
    done

    # Also copy to global config if writable
    GLOBAL_SKILLS="$HOME/.config/opencode/skills"
    if mkdir -p "$GLOBAL_SKILLS" 2>/dev/null; then
        cp -r "$SKILLS_BACKUP"/* "$GLOBAL_SKILLS/" 2>/dev/null || true
    fi
else
    echo "[i] No custom skills found"
fi

# -----------------------------------------------
# 3. Ensure opencode.json exists in workspace
# -----------------------------------------------
if [ -f "/workspace/opencode.json" ]; then
    echo "[OK] Found opencode.json configuration"
else
    echo "[!] No opencode.json found, creating default"
    cat > /workspace/opencode.json << 'JSONEOF'
{
  "$schema": "https://opencode.ai/schema.json",
  "model": "github-copilot/gpt-5.2",
  "permission": {
    "skill": { "*": "allow" }
  }
}
JSONEOF
fi

# -----------------------------------------------
# 4. Ensure workspace data directory exists
# -----------------------------------------------
mkdir -p /workspace/data

echo "[OK] Workspace directory ready: /workspace/data"

# -----------------------------------------------
# 5. Set server password if provided
# -----------------------------------------------
if [ -n "$OPENCODE_SERVER_PASSWORD" ]; then
    echo "[OK] Server password protection enabled"
    export OPENCODE_SERVER_PASSWORD="$OPENCODE_SERVER_PASSWORD"
else
    echo "[!] No OPENCODE_SERVER_PASSWORD — server is unprotected"
fi

# -----------------------------------------------
# 6. Verify Python dependencies
# -----------------------------------------------
echo ""
echo "[*] Verifying Python environment..."
python3 -c "
import sys
print(f'    Python: {sys.version}')
pkgs = ['pypdf', 'pdfplumber', 'reportlab', 'pypdfium2', 'PIL', 'pandas', 'openpyxl']
ok = []
fail = []
for p in pkgs:
    try:
        __import__(p)
        ok.append(p)
    except ImportError:
        fail.append(p)
if ok:
    print('    Installed: ' + ', '.join(ok))
if fail:
    print('    Missing: ' + ', '.join(fail))
" 2>/dev/null || echo "    [!] Python verification skipped"

# -----------------------------------------------
# 7. Start OpenCode Server
# -----------------------------------------------
PORT="${OPENCODE_PORT:-4096}"
HOST="${OPENCODE_HOST:-0.0.0.0}"

echo ""
echo "============================================"
echo "  OpenCode Server (API Mode)"
echo "  Host: $HOST"
echo "  Port: $PORT"
echo "  Workspace: /workspace"
echo "  Skills: /workspace/.opencode/skills/"
echo "============================================"
echo ""

# Activate Python venv and ensure opencode is in PATH
export PATH="/opt/venv/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"

if ! command -v opencode &> /dev/null; then
    echo "[ERROR] opencode command not found in PATH"
    echo "        PATH: $PATH"
    ls -la ~/.opencode/bin/opencode 2>/dev/null || echo "  Not in ~/.opencode/bin/"
    ls -la ~/.local/bin/opencode 2>/dev/null || echo "  Not in ~/.local/bin/"
    exit 1
fi

echo "[OK] Found opencode: $(which opencode)"

exec opencode serve --hostname "$HOST" --port "$PORT"
