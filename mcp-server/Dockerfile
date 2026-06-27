FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching
COPY package*.json ./
RUN npm install --omit=dev

# App source (data/*.json including seller.json ship with the image;
# .env is excluded via .dockerignore — secrets come from fly secrets)
COPY . .

# This image IS the wolf-prefixed server; bake the prefix in so tools never
# collide with the shared "einvoice" MCP even if fly.toml [env] is forgotten.
ENV PORT=3001
ENV TOOL_PREFIX=wolf_
EXPOSE 3001

CMD ["node", "src/index.js"]
