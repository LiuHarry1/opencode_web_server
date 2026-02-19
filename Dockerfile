FROM ubuntu:24.04

LABEL maintainer="opencode-server"
LABEL description="OpenCode Server with Agent Skills — zero-mount multi-user deployment"

ENV DEBIAN_FRONTEND=noninteractive

# System deps + Node.js 20 + Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git unzip ca-certificates \
    poppler-utils qpdf libreoffice-calc \
    libgl1 libglib2.0-0 python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"

# MCP filesystem server (pre-install so npx isn't needed at runtime)
RUN npm install -g @modelcontextprotocol/server-filesystem

# Python venv + app deps
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Workspace + git + config
WORKDIR /workspace
RUN git init && git config user.email "opencode@server" && git config user.name "OpenCode Server"
COPY config/docker/opencode.json ./opencode.json
COPY .opencode/skills/ ./.opencode/skills/
COPY .opencode/mcp-servers/ ./.opencode/mcp-servers/
COPY .opencode/lsp/ ./.opencode/lsp/
COPY .opencode/plugins/ ./.opencode/plugins/
COPY data/ ./data/
RUN echo "# OpenCode Workspace" > README.md && git add -A && git commit -m "Initial workspace setup" --allow-empty || true

# Entrypoint
COPY config/docker/entrypoint.sh /opt/entrypoint.sh
RUN sed -i 's/\r$//' /opt/entrypoint.sh && chmod +x /opt/entrypoint.sh

EXPOSE 4096
ENV OPENCODE_PORT=4096 OPENCODE_HOST=0.0.0.0
ENTRYPOINT ["/opt/entrypoint.sh"]
