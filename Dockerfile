FROM node:20.20-bullseye

WORKDIR /app

# Dependências nativas necessárias (canvas + chromium)
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

# Copia manifests
COPY package*.json ./

# Instala dependências exatamente como no PM2
RUN npm install --legacy-peer-deps

# Copia o código
COPY . .

# Porta do painel
EXPOSE 3000

# Libs do Inlite
ENV LD_LIBRARY_PATH="/app/inlite/bin:/usr/lib/x86_64-linux-gnu"

CMD ["node", "index.js"]
