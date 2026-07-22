FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @marketplace/web...

COPY apps/web/next-env.d.ts apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/tsconfig.json apps/web/
COPY apps/web/src apps/web/src
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
RUN pnpm --filter @marketplace/shared build && pnpm --filter @marketplace/web build

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runner

WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system web && adduser --system --ingroup web web
COPY --from=build --chown=web:web /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=web:web /workspace/apps/web/.next/static ./apps/web/.next/static

USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
