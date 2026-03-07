# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm install

# Copy full backend source (routes, assets, workers, supabase, etc.)
COPY . .

EXPOSE 3001

CMD ["npm", "start"]
