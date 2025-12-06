const { Client, LocalAuth } = require('whatsapp-web.js');

function getClient(accountName) {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

  return new Client({
    authStrategy: new LocalAuth({
      dataPath: `./sessions/${accountName}`,
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
