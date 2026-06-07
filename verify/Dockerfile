# TrueCapture verify + sign static site, served by nginx.
# The c2pa-web WASM is committed (verify/vendor/), so there is no build step.
FROM nginx:1.27-alpine

# Routing (serve.json equivalent) + WASM MIME.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# At container start, write config.js from VERIFY_BACKEND_URL so the browser knows
# where the backend is (when unset, the committed config.js auto-detects). nginx's
# base image runs every /docker-entrypoint.d/*.sh before starting.
RUN cat > /docker-entrypoint.d/40-truecapture-config.sh <<'SH' && chmod +x /docker-entrypoint.d/40-truecapture-config.sh
#!/bin/sh
set -e
if [ -n "$VERIFY_BACKEND_URL" ]; then
  printf "window.TRUECAPTURE_BACKEND=%s;\n" "'$VERIFY_BACKEND_URL'" > /usr/share/nginx/html/config.js
  echo "[truecapture] config.js -> $VERIFY_BACKEND_URL"
fi
SH

# Static site (node_modules, tests, .env excluded via .dockerignore).
COPY . /usr/share/nginx/html
# Drop build/docker artefacts that shouldn't be web-served.
RUN rm -rf /usr/share/nginx/html/Dockerfile \
           /usr/share/nginx/html/nginx.conf \
           /usr/share/nginx/html/serve.json \
           /usr/share/nginx/html/vitest.config.js \
           /usr/share/nginx/html/.dockerignore

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
