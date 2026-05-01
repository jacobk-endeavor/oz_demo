# Optional production image: Node (vite preview + API middleware) + Python 3 for KB ingest subprocess.
# DigitalOcean / Fly / ECS: set Dockerfile as build source when the Node buildpack has no python3.

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm run setup

COPY . .

RUN npm run build \
  && bash scripts/deploy-setup-kb-ingest.sh

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
