FROM node:20.20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libgtk-3-0 \
  libnss3 \
  libasound2 \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  zlib1g-dev \
  xdg-utils \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN useradd -m botuser

COPY package*.json ./

RUN chown -R botuser:botuser /app

USER botuser

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

ENV LD_LIBRARY_PATH="/app/inlite/bin:/usr/lib/x86_64-linux-gnu"

CMD ["node", "index.js"]
