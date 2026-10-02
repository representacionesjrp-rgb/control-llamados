FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY server/package.json server/pnpm-lock.yaml ./server/
RUN pnpm --dir server install --frozen-lockfile
COPY server ./server
RUN pnpm --dir server build && pnpm --dir server prune --prod

FROM node:24-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV DATA_DIR=/data
COPY --from=build /app/server ./
EXPOSE 4200
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/src/index.js"]
