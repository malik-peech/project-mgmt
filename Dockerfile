FROM node:20-alpine

# curl needed for Coolify healthcheck
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]
