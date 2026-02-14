FROM ubuntu:24.04

LABEL maintainer="opencode-server"
LABEL description="OpenCode Server with Agent Skills (PDF, XLSX, MCP) — multi-user Docker deployment"

ENV DEBIAN_FRONTEND=noninteractive

# -----------------------------------------------
# 1. System dependencies
# -----------------------------------------------
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    ca-certificates \
    # PDF command-line tools
    poppler-utils \
    qpdf \
    # LibreOffice for XLSX recalculation
    libreoffice-calc \
    # Image processing support (libgl1 replaces libgl1-mesa-glx in Ubuntu 24.04+)
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------
# 2. Python 3 + pip + venv
# -----------------------------------------------
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# -----------------------------------------------
# 3. Node.js 20 LTS
# -----------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------
# 4. Install OpenCode CLI
# -----------------------------------------------
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"
RUN which opencode && opencode --version || echo "Warning: opencode not found in PATH"

# -----------------------------------------------
# 5. Install ALL Python dependencies for skills
# -----------------------------------------------
COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# -----------------------------------------------
# 6. Set up workspace (clean, minimal visible dirs)
# -----------------------------------------------
# /workspace is the main working directory — this is what users "see"
# .opencode/ is hidden and contains skills + config
RUN mkdir -p /workspace

WORKDIR /workspace

# Initialize git repo (required by opencode)
RUN git init /workspace && \
    git config user.email "opencode@server" && \
    git config user.name "OpenCode Server"

# -----------------------------------------------
# 7. Copy OpenCode configuration
# -----------------------------------------------
COPY opencode.json /workspace/opencode.json

# -----------------------------------------------
# 8. Copy Agent Skills into .opencode/skills/ (hidden from users)
# -----------------------------------------------
COPY agents/skills/ /workspace/.opencode/skills/

# Also keep a backup in /opt for restoration after volume mounts
COPY agents/skills/ /opt/opencode-skills/

# Also place skills at root level for global fallback
RUN git init / 2>/dev/null || true
COPY agents/skills/ /.opencode/skills/

# -----------------------------------------------
# 9. Copy entrypoint
# -----------------------------------------------
COPY entrypoint.sh /opt/entrypoint.sh
RUN sed -i 's/\r$//' /opt/entrypoint.sh && chmod +x /opt/entrypoint.sh

# -----------------------------------------------
# 10. Create shared upload/output directories
# -----------------------------------------------
RUN mkdir -p /workspace/uploads /workspace/outputs

# Make initial commit so opencode has a clean state
RUN cd /workspace && \
    echo "# OpenCode Workspace" > README.md && \
    git add -A && \
    git commit -m "Initial workspace setup" --allow-empty || true

EXPOSE 4096

ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

ENTRYPOINT ["/opt/entrypoint.sh"]
