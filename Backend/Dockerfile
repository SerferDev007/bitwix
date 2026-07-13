# Production image for the Bitwix backend (AWS App Runner / any container host).
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (uses the committed package-lock.json).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY src ./src

ENV NODE_ENV=production
# App Runner routes to this port; keep in sync with the service "port" setting.
ENV PORT=8080
EXPOSE 8080

# The server reads all configuration (DB, auth, currency) from environment
# variables injected by App Runner — no .env file is copied into the image.
CMD ["node", "src/server.js"]
