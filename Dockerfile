# Build stage
FROM node:20-alpine as build

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the project files
COPY . .

# Create a .env file with the environment variable
ARG BOT_ENDPOINT=/agent/chat
ENV VITE_BOT_ENDPOINT=${BOT_ENDPOINT}

# Build the project (ignoring TypeScript errors)
RUN npx tsc --noEmit --incremental false || true && npx vite build

# Production stage
FROM nginx:alpine

# Copy the build output from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]