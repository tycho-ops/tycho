# Final Stage
FROM oven/bun:alpine
WORKDIR /app

# OCI standard labels
LABEL org.opencontainers.image.title="Tycho Dynamic Dashboard"
LABEL org.opencontainers.image.description="Fully automated, dynamic server dashboard and services hub for Tycho installations"
LABEL org.opencontainers.image.source="https://github.com/crapougnax/tycho"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.vendor="Quatrain Technologies"
LABEL org.opencontainers.image.authors="Quatrain Developers <developers@quatrain.com>"

# Copy package descriptors and source code
COPY package.json ./
RUN bun install --production

COPY src/ ./src/
COPY html/ ./html/

# Expose HTTP port 80
EXPOSE 80

# Command to run discovery server
CMD ["bun", "run", "src/index.ts"]
