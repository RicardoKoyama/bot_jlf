const { getClient } = require('./whatsappClient');
const { log } = require('../utils/logger');
const { updateMessageStatus } = require('./dbService');

const queues = {};
const DELAY_MS = 2000; // intervalo entre envios

function formatPhoneNumber(number) {
  const cleaned = number.replace(/\D/g, '');
  if (cleaned.startsWith('55')) {
    return `${cleaned}@c.us`;
  }
  return `55${cleaned}@c.us`;
}

const enqueueMessage = (accountName, number, message, messageId) => {
  if (!queues[accountName]) {
    queues[accountName] = {
      queue: [],
      processing: false
    };
  }

  queues[accountName].queue.push({ number, message, messageId });
  processQueue(accountName);
};

const processQueue = async (accountName) => {
  const queueObj = queues[accountName];
  if (!queueObj || queueObj.processing) return;

  queueObj.processing = true;

  while (queueObj.queue.length > 0) {
    const item = queueObj.queue.shift();
    const { number, message, messageId } = item;

    try {
      const client = getClient(accountName);

      // 🔒 Client ainda não pronto
      if (!client || !client.info || !client.info.wid) {
        log(`[${accountName}] Cliente não pronto, aguardando reconexão...`);
        queueObj.queue.unshift(item);
        await delay(3000);
        continue;
      }

      const formattedphoneNumber = formatPhoneNumber(number);

      const response = await client.sendMessage(formattedphoneNumber, message);

      log(
        `[${accountName}] Mensagem da fila enviada para ${formattedphoneNumber} → ID: ${response.id._serialized}`
      );

      await updateMessageStatus(
        messageId,
        'ENVIADO',
        response.id._serialized,
        accountName,
        'msg_whatsapp'
      );

    } catch (error) {
      const msg = error?.message || '';

      // 🔁 Frame inválido / contexto destruído
      if (
        msg.includes('detached Frame') ||
        msg.includes('Execution context') ||
        msg.includes('Cannot find context')
      ) {
        log(
          `[${accountName}] Frame inválido detectado, reenfileirando mensagem ${messageId}`
        );

        // devolve a mensagem para o início da fila
        queueObj.queue.unshift(item);

        // pausa antes de tentar novamente
        await delay(4000);
        continue;
      }

      log(
        `[${accountName}] Erro ao enviar mensagem da fila (${messageId}): ${msg}`
      );
    }

    await delay(DELAY_MS);
  }

  queueObj.processing = false;
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  enqueueMessage
};
