FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json yarn.lock ./
COPY sdk/core/package.json sdk/core/
COPY backend/package.json backend/
RUN yarn install --frozen-lockfile
COPY sdk/core/ sdk/core/
COPY backend/ backend/
COPY tsconfig.json ./
RUN cd sdk/core && yarn build && cd /build/backend && yarn build

FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
COPY sdk/core/package.json sdk/core/
COPY backend/package.json backend/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /build/sdk/core/dist/ sdk/core/dist/
COPY --from=builder /build/backend/dist/ backend/dist/
RUN mkdir -p /app/data && addgroup -S sss && adduser -S sss -G sss && chown -R sss:sss /app
USER sss
EXPOSE 3001
ENV NODE_ENV=production
ENV DB_PATH=/app/data/sss.sqlite
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
