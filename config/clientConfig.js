const { Client, LocalAuth } = require('whatsapp-web.js');

function getClient(accountName) {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

  return new Client({
    authStrategy: new LocalAuth({
      clientId: accountName,      // 🔑 identifica a conta
      dataPath: '/app/sessions'   // 🔑 raiz única de sessões
    }),
    puppeteer: {
      headless: true,
      executablePath: execPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--ozone-platform=none'
      ]
    }
  });
}

module.exports = getClient;
