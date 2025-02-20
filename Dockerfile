FROM node:18.19.0

# Set environment variable for Docker
ENV DOCKER=true

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install chromium

# Copy the rest of the application
COPY . .

# Generate Prisma client and create database
RUN npx prisma generate \
    && npx prisma db push

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "dev"] 