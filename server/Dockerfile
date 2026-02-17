FROM ubuntu:24.04

LABEL maintainer="opencode-server"
LABEL description="OpenCode Server with Agent Skills (PDF, XLSX, MCP) — zero-mount multi-user deployment"

ENV DEBIAN_FRONTEND=noninteractive

# -----------------------------------------------
# 1. System dependencies (single RUN to reduce layers)
# -----------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    # Python 3
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# -----------------------------------------------
# 2. Node.js 20 LTS
# -----------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------
# 3. Install OpenCode CLI
# -----------------------------------------------
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"
RUN which opencode && opencode --version || echo "Warning: opencode not found in PATH"

# -----------------------------------------------
# 4. Python virtual environment + dependencies
# -----------------------------------------------
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# -----------------------------------------------
# 5. Set up workspace
# -----------------------------------------------
RUN mkdir -p /workspace

WORKDIR /workspace

# Initialize git repo (required by opencode)
RUN git init /workspace && \
    git config user.email "opencode@server" && \
    git config user.name "OpenCode Server"

# -----------------------------------------------
# 6. Copy OpenCode configuration
# -----------------------------------------------
COPY opencode.json /workspace/opencode.json

# -----------------------------------------------
# 7. Copy Agent Skills — baked into image
# -----------------------------------------------
COPY agents/skills/ /workspace/.opencode/skills/

# -----------------------------------------------
# 8. Create workspace data directory
# -----------------------------------------------
RUN mkdir -p /workspace/data

# Make initial commit so opencode has a clean state
RUN cd /workspace && \
    echo "# OpenCode Workspace" > README.md && \
    git add -A && \
    git commit -m "Initial workspace setup" --allow-empty || true

# -----------------------------------------------
# 9. Copy entrypoint
# -----------------------------------------------
COPY entrypoint.sh /opt/entrypoint.sh
RUN sed -i 's/\r$//' /opt/entrypoint.sh && chmod +x /opt/entrypoint.sh

EXPOSE 4096

ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

ENTRYPOINT ["/opt/entrypoint.sh"]
