# Build a partir da raiz do monorepo:
#   docker build -f apps/api/Dockerfile .
# Fly: ver [build].context em fly.toml
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

COPY packages/sync ./packages/sync
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.docker.json ./apps/api/tsconfig.docker.json
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src

WORKDIR /app/apps/api

# npm fora do pnpm workspace não entende workspace:* — aponta para o pacote local.
RUN node -e "\
  const fs = require('fs');\
  const p = './package.json';\
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));\
  if (j.dependencies?.['@opensync/sync']) {\
    j.dependencies['@opensync/sync'] = 'file:../../packages/sync';\
  }\
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\\n');\
"

RUN npm install
RUN npx prisma generate
RUN npx nest build -p tsconfig.docker.json
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

# simple-git invoca o CLI `git` para clone/commit/push (sync e git/tree/blob).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates openssh-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
