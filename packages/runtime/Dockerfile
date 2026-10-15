# Build from the repo root:  docker buildx build --platform linux/arm64 -f packages/runtime/Dockerfile -t mansamusa-runtime .
# AgentCore Runtime requires linux/arm64 and port 8080.
FROM --platform=$BUILDPLATFORM node:20-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/core/package.json packages/core/
COPY packages/runtime/package.json packages/runtime/
COPY packages/alerts-lambda/package.json packages/alerts-lambda/
RUN yarn install --immutable
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/runtime packages/runtime
RUN yarn workspace @mansamusa/core build && yarn workspace @mansamusa/runtime build

FROM node:20-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /repo/packages/runtime/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.cjs"]
