FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/sync-daemon/package.json packages/sync-daemon/

# Install dependencies (skip keytar native build — not needed in Docker)
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/sync-daemon/ packages/sync-daemon/

# Build
RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/sync-daemon

# Make CLI available
RUN npm link --workspace=packages/sync-daemon

ENTRYPOINT ["node", "packages/sync-daemon/dist/index.js"]
