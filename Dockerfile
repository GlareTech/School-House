FROM node:22-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend/prisma backend/prisma
COPY config config
COPY scripts/env-run.mjs scripts/env-run.mjs
RUN npm ci && npm run db:generate

FROM dependencies AS web-build
COPY frontend frontend
RUN npm run build

FROM nginx:1.28-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080

FROM dependencies AS server
ENV NODE_ENV=production
COPY backend backend
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["npm", "start", "-w", "backend"]
