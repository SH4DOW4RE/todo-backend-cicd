FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node database ./database
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["sh", "-c", "node src/scripts/migrate.js && exec node src/server.js"]
