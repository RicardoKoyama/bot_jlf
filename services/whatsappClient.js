const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const getClientConfig = require('../config/clientConfig');
const { log } = require('../utils/logger');
const { updateAccountStatus } = require('./accountService');
const { handleIncomingMessage } = require('./messageReceiver');

const clients = {};
const qrCodes = {};

function applySendSeenFix(client, accountName) {
  try {
    client.pupPage?.evaluate(() => {
      if (window?.WWebJS) {
        // Neutraliza o sendSeen quebrado após update do WhatsApp Web
        window.WWebJS.sendSeen = async () => {};
      }
    });
    log(`[${accountName}] Patch sendSeen aplicado com sucesso`);
  } catch (err) {
    log(`[${accountName}] Falha ao aplicar patch sendSeen: ${err.message}`);
  }
}

const initializeClients = async (accounts) => {
  for (const account of accounts) {
    const accountName = account.account_name;
    const accountId = account.id;

    const client = new Client(getClientConfig(accountName));

    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      qrCodes[accountName] = qr;
      log(`[${accountName}] QR Code gerado. Escaneie com o WhatsApp!`);
      updateAccountStatus(accountId, 'QR_CODE', 'QR code gerado. Aguarda leitura.');
    });

    client.on('authenticated', () => {
      log(`[${accountName}] Cliente autenticado!`);
      updateAccountStatus(accountId, 'AUTENTICADO', 'Sessão autenticada.');
    });

    client.on('ready', () => {
      log(`[${accountName}] Cliente WhatsApp está pronto!`);
      updateAccountStatus(accountId, 'PRONTO', 'Cliente pronto para uso.');

      // 🔧 PATCH CRÍTICO CONTRA BUG markedUnread / sendSeen
      applySendSeenFix(client, accountName);
    });

    client.on('auth_failure', (msg) => {
      log(`[${accountName}] Falha de autenticação: ${msg}`);
      updateAccountStatus(accountId, 'FALHA_AUTENTICAÇÃO', msg);
    });

    client.on('disconnected', (reason) => {
      log(`[${accountName}] Cliente desconectado: ${reason}`);
      updateAccountStatus(accountId, 'DESCONECTADO', reason);
    });

    client.on('message', async (message) => {
      await handleIncomingMessage(message, accountName, accountId, client);
    });

    await new Promise((resolve, reject) => {
      client.once('ready', () => resolve());
      client.once('auth_failure', msg => reject(new Error(msg)));
      client.initialize();
    });

    clients[accountName] = client;
  }
};

const createAndStartClient = async (account) => {
  const accountName = account.account_name;
  const accountId = account.id;

  const client = new Client(getClientConfig(accountName));

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    qrCodes[accountName] = qr;
    log(`[${accountName}] QR Code gerado. Escaneie com o WhatsApp!`);
    updateAccountStatus(accountId, 'QR_CODE', 'QR code gerado. Aguarda leitura.');
  });

  client.on('authenticated', () => {
    log(`[${accountName}] Cliente autenticado!`);
    updateAccountStatus(accountId, 'AUTENTICADO', 'Sessão autenticada.');
  });

  client.on('ready', () => {
    log(`[${accountName}] Cliente WhatsApp está pronto!`);
    updateAccountStatus(accountId, 'PRONTO', 'Cliente pronto para uso.');

    // 🔧 PATCH CRÍTICO CONTRA BUG markedUnread / sendSeen
    applySendSeenFix(client, accountName);
  });

  client.on('auth_failure', (msg) => {
    log(`[${accountName}] Falha de autenticação: ${msg}`);
    updateAccountStatus(accountId, 'FALHA_AUTENTICAÇÃO', msg);
  });

  client.on('disconnected', (reason) => {
    log(`[${accountName}] Cliente desconectado: ${reason}`);
    updateAccountStatus(accountId, 'DESCONECTADO', reason);
  });

  client.on('message', async (message) => {
    await handleIncomingMessage(message, accountName, accountId, client);
  });

  client.initialize();
  clients[accountName] = client;
};

const getClient = (accountName) => {
  return clients[accountName];
};

const getAllClients = () => {
  return clients;
};

module.exports = {
  initializeClients,
  getClient,
  getAllClients,
  createAndStartClient,
  qrCodes
};
