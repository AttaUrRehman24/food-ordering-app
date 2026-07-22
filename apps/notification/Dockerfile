#  Documentation §13 — distroless multi-stage, non-root
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci || npm install
RUN npx nx build notification

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=build /app/dist/apps/notification ./dist
COPY --from=deps /app/node_modules ./node_modules
ENV NODE_ENV=production
USER nonroot
EXPOSE 3006
CMD ["dist/main.js"]
