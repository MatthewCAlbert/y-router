# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S appuser -u 1001

# Change ownership of the app directory
RUN chown -R appuser:nodejs /app
USER appuser

# Expose port
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Start the application with tsx
CMD ["npx", "tsx", "server.ts"] 