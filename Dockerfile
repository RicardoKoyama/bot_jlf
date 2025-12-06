# Imagem base oficial do Puppeteer com Chrome e dependências já configuradas
FROM ghcr.io/puppeteer/puppeteer:22.8.2

# Define diretório de trabalho
WORKDIR /app

# Instala Chromium dentro da imagem
USER root
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-common \
    chromium-sandbox \
    && rm -rf /var/lib/apt/lists/*

# Faz o puppeteer-core usar o Chromium instalado
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instala dependências gráficas necessárias (para chartjs-node-canvas)
USER root
RUN apt-get update && apt-get install -y \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Volta para o usuário padrão do Puppeteer
USER pptruser

# Copia package.json e instala dependências Node (chart.js incluído)
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copia o restante do código-fonte
COPY . .

# Define volumes persistentes (montados externamente)
VOLUME ["/app/inlite/bin", "/app/sessions", "/app/.wwebjs_cache", "/app/.wwebjs_auth"]

# Expõe a porta do painel Express
EXPOSE 3000

# Define variável para libs locais do Inlite
ENV LD_LIBRARY_PATH="/app/inlite/bin:/usr/lib/x86_64-linux-gnu"

# Comando padrão
CMD ["node", "index.js"]
