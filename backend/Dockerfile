# syntax=docker/dockerfile:1
# Use Debian slim base so we can install both Node.js AND Python + Playwright
FROM node:22-slim

WORKDIR /app

# ── System dependencies ────────────────────────────────────────────────────────
# Install Python 3, pip, and all Chromium/Playwright system libs in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    # Playwright system-level libs for Chromium
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-xcb1 libxext6 \
    fonts-liberation wget ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# ── Python workers ─────────────────────────────────────────────────────────────
# Install Python packages (fast_flights for flights, playwright for hotels)
RUN pip3 install --no-cache-dir --break-system-packages \
    fast_flights \
    playwright

# Download Playwright Chromium browser (headless, no sandbox needed in Docker)
RUN python3 -m playwright install chromium

# ── Node.js app ────────────────────────────────────────────────────────────────
COPY package*.json ./
RUN npm install

# Copy full backend source (routes, assets, workers, supabase, etc.)
COPY . .

EXPOSE 3001

CMD ["npm", "start"]
