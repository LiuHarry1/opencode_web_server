FROM ubuntu:24.04

LABEL maintainer="opencode-server"
LABEL description="OpenCode Server with Copilot authentication and custom Agent Skills"

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python 3 + pip + venv
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"
RUN which opencode && opencode --version || echo "Warning: opencode not found in PATH"

# Working directory
WORKDIR /app

# Copy OpenCode configuration
COPY opencode.json /app/opencode.json
COPY test.pdf /app/test.pdf
COPY test.xlsx /app/test.xlsx

# Copy skills to staging area (not affected by volume mounts)
COPY agents/skills/ /opt/opencode-skills/

# Install Python dependencies required by skills
COPY agents/skills/mcp-builder/scripts/requirements.txt /tmp/skill-requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/skill-requirements.txt \
    && rm /tmp/skill-requirements.txt

# Place skills at project level (/app) and root level (/)
RUN git init /app
COPY agents/skills/ /app/.opencode/skills/
RUN git init /
COPY agents/skills/ /.opencode/skills/

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 4096

ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

ENTRYPOINT ["/app/entrypoint.sh"]
