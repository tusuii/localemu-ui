# syntax=docker/dockerfile:1
#
# LocalEmu Console: AWS-console style web UI for LocalEmu.
#
# The server build bundles every dependency (including the AWS SDK clients),
# so the runtime stage only needs Node and the `dist/` folder.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    LOCALEMU_ENDPOINT=http://localemu:4566
WORKDIR /app
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4321
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/api/health >/dev/null || exit 1
CMD ["node", "dist/server/entry.mjs"]
