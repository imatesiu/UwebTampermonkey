FROM node:22-alpine

WORKDIR /app

COPY package.json tampermonkey.config.json ./
COPY scripts ./scripts
COPY src ./src

EXPOSE 8123

CMD ["npm", "run", "dev:docker"]
