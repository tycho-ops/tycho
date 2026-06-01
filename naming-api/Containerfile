# Final Stage
FROM oven/bun:1.1-alpine

# Set working directory and configure ownership
WORKDIR /app
RUN chown -R bun:bun /app

# Switch to the unprivileged bun user
USER bun

# OCI standard labels
LABEL org.opencontainers.image.title="Tycho Naming API"
LABEL org.opencontainers.image.description="Secure, privacy-first dynamic DNS server-side API for tycho.cc utilizing Quatrain Core"
LABEL org.opencontainers.image.source="https://github.com/crapougnax/tycho"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.vendor="Quatrain Technologies"
LABEL org.opencontainers.image.authors="Quatrain Developers <developers@quatrain.com>"

# Copy dependencies first for layer caching
COPY --chown=bun:bun package.json ./

# Install dependencies (ignoring workspace limits to run standalone)
RUN bun install --production

# Copy source code and config files
COPY --chown=bun:bun tsconfig.json ./
COPY --chown=bun:bun src/ ./src/

# Expose server port
EXPOSE 4000

# Run in production mode using Bun
CMD ["bun", "run", "src/index.ts"]
