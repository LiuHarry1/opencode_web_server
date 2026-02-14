FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY server.js ./
COPY public/ ./public/

# Create workspace directories (will be overridden by volume mounts)
RUN mkdir -p /workspace/uploads /workspace/outputs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
