# TrueCapture backend — Fastify + C2PA signing/verify.
#
# Debian (glibc) base, NOT Alpine: the native deps (sharp, @contentauth/c2pa-node)
# and the bundled ffmpeg-static binary are glibc builds. Node 22.5+ is required for
# the built-in node:sqlite.
FROM node:22-bookworm-slim

# openssl: the EC signing chain is generated with the openssl CLI on first boot
# (src/keys/chain.js). ca-certificates: outbound HTTPS to DeDi + OIDC JWKS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Install deps first for better layer caching (package-lock is committed). The
# install scripts fetch sharp's libvips, the c2pa-node native addon, and the
# ffmpeg-static binary used for WebM->MP4 transcoding.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# .keys holds the signing chain AND the share-link store (records.db) — mount a
# volume here to persist the signing identity across rebuilds. Owned by the
# unprivileged `node` user that the process runs as.
RUN mkdir -p /app/.keys && chown -R node:node /app
USER node

ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
