# Turkistan International Airport — production image.
#
# Optional. The documented deployment is `npm ci && npm run build && npm start`
# on the airport's own server (see README); this exists so that "a clean clone
# builds and starts on plain Node" can be demonstrated on any machine without
# installing a toolchain, and so a rebuild years from now is reproducible.
#
# Nothing here is platform-specific. There is no Vercel adapter, no edge
# runtime and no managed database — one Node process and one directory.

FROM node:22-bookworm-slim AS build

# better-sqlite3 is a native module and compiles from source when no prebuilt
# binary matches the platform (plan decision #2).
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a change to application code does not recompile them.
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

COPY . .

# The build reads no secrets. Every required variable is checked at runtime, so
# an image can be built without knowing the airport's password — which is the
# property that lets this be built in CI.
RUN npm run build

# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
# Outside the application directory: the checkout is replaced on every deploy
# and this is the one thing that must survive it.
ENV DATA_DIR=/var/lib/hsairport
ENV PORT=3000

WORKDIR /app

# One copy, and it is the whole application: the standalone bundle carries its
# own node_modules including the compiled native module, and
# `scripts/prepare-standalone.mjs` has already folded `.next/static` and
# `public/` into it. Nothing is installed here.
COPY --from=build /app/.next/standalone ./

RUN mkdir -p ${DATA_DIR} && chown -R node:node ${DATA_DIR}
USER node

VOLUME ["/var/lib/hsairport"]
EXPOSE 3000

# ADMIN_PASSWORD, SESSION_SECRET and SITE_URL are supplied at run time and are
# deliberately absent from the image.
CMD ["node", "server.js"]
