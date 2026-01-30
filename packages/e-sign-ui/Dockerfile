FROM ghcr.io/cedyngroup/node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (clean install)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID

# Build the app
RUN npm run build

# Production stage
FROM ghcr.io/cedyngroup/nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
