const { Client, LocalAuth } = require('whatsapp-web.js');

function getClient(accountName) {
  return new Client({
    authStrategy: new LocalAuth({
      clientId: accountName,
      dataPath: '/app/sessions'
    }),
    puppeteer: {
      headless: true,
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });
}

module.exports = getClient;
