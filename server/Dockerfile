FROM ubuntu:24.04

LABEL maintainer="opencode-server"
LABEL description="OpenCode Server with Copilot authentication and custom Agent Skills"

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS (needed for some opencode features)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
# OpenCode installs to ~/.opencode/bin, add to PATH
ENV PATH="/root/.opencode/bin:${PATH}"
# Verify installation
RUN which opencode && opencode --version || echo "Warning: opencode not found in PATH"

# Create working directory
WORKDIR /app

# Copy OpenCode configuration
COPY opencode.json /app/opencode.json

# Copy custom agent skills
COPY agents/ /app/agents/

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose the OpenCode server port
EXPOSE 4096

# Environment variables
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

# Entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
