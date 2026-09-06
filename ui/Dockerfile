# Development Dockerfile for OwlFlow UI with hot-reloading
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Enable Corepack and pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package descriptors for optimal caching
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies
RUN pnpm install

# Copy source files
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Run Vite dev server with host binding for container networking
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]
