# syntax=docker/dockerfile:1
ARG NODE_VERSION=lts-alpine
FROM node:${NODE_VERSION}
ENV NODE_ENV=production
WORKDIR /usr/src/app
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
RUN <<EOF
  mkdir -p /var/run/pimper
  mkfifo -m 622 /var/run/pimper/source
  chown -R node:node /var/run/pimper
EOF
USER node
COPY . .
ENTRYPOINT [ "node", "src/main.js" ]
HEALTHCHECK --interval=5s --timeout=5s CMD test -p /var/run/pimper/source
