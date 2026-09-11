FROM node:24.15.0-alpine

ENV NODE_ENV=production \
    PORT=4175 \
    HOST=0.0.0.0 \
    VERSO_WORLD_STORAGE=/data/worlds \
    VERSO_PAYMENT_STORAGE=/data/payments \
    VERSO_PAYMENTS_ENABLED=false

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY server ./server
RUN mkdir -p /data/worlds /data/payments && chown -R node:node /data
USER node

EXPOSE 4175
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node server/healthcheck.mjs
STOPSIGNAL SIGTERM
CMD ["node", "--experimental-strip-types", "server/index.mjs"]
