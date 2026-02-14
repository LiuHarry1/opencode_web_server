FROM node:20-slim

WORKDIR /app

# Copy package files (including lock file for reproducible builds)
COPY package.json package-lock.json ./

# Install dependencies with ci for reproducible builds
RUN npm ci --omit=dev

# Copy application source
COPY server.js ./
COPY public/ ./public/

# Create workspace directories (will be overridden by volume mounts)
RUN mkdir -p /workspace/uploads /workspace/outputs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
