FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Fly build context is apps/api only: no monorepo ../../packages — use self-contained tsconfig.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

COPY package.json ./
COPY tsconfig.docker.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

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

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
