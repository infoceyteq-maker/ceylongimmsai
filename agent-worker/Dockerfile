# GIMMS AUTO-PILOT WORKER
#
# A browser needs a real Linux image with Chromium's shared libraries. Vercel's
# serverless runtime cannot provide that, and its functions time out long before a
# multi-minute browsing session finishes. This image is deployed to Fly.io /
# Railway / Render / any container host.
#
# Build:  docker build -t gimms-agent-worker .
# Run:    docker run -p 8080:8080 -e WORKER_SECRET=... gimms-agent-worker

FROM node:22-bookworm-slim

# Chromium's runtime dependencies. Kept in one layer so the image stays cacheable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      wget \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
# Playwright's own chromium download, so the image does not depend on a system package.
RUN npm install --omit=dev && npx playwright install chromium --with-deps || npx playwright install chromium

COPY src ./src

# The service must be killable quickly when a deploy replaces it.
STOPSIGNAL SIGTERM

# Non-root: a browser compromise should not be root inside the container.
RUN useradd --create-home --shell /bin/bash worker \
    && chown -R worker:worker /app
USER worker

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
