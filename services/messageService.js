const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { getClient } = require('./whatsappClient');
const { log } = require('../utils/logger');
const { enqueueMessage } = require('./messageQueue');

const sendMessage = async (accountName, number, message, messageId, filePath = null) => {
  if (accountName === 'Cobranca') {
    enqueueMessage(accountName, number, message, messageId);
    log(`[${accountName}] Mensagem para ${number} enfileirada`);
    return { enqueued: true };
  }

  try {
    const formattedphoneNumber = formatPhoneNumber(number);
    const client = getClient(accountName);
    if (!client) {
      log(`Cliente WhatsApp não encontrado para conta ${accountName}`);
      return null;
    }

    let response;

    if (filePath) {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(filePath);

      if (!fs.existsSync(absolutePath)) {
        log(`[${accountName}] Arquivo não encontrado: ${absolutePath}`);
        return null;
      }

      const fileBuffer = fs.readFileSync(absolutePath);
      const base64 = fileBuffer.toString('base64');
      const fileName = path.basename(absolutePath);

      // Detect MIME type by extension
      let mimeType = 'application/octet-stream';
      const ext = path.extname(absolutePath).toLowerCase();

      if (ext === '.pdf') {
        mimeType = 'application/pdf';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        mimeType = 'image/jpeg';
      } else if (ext === '.png') {
        mimeType = 'image/png';
      } else if (ext === '.gif') {
        mimeType = 'image/gif';
      }
      // (adicione outros tipos se desejar)

      const media = new MessageMedia(mimeType, base64, fileName);

      response = await client.sendMessage(formattedphoneNumber, media, {
        caption: message || '',
      });

      log(`[${accountName}] Arquivo enviado para ${formattedphoneNumber} → ID: ${response.id._serialized}`);
    } else {
      response = await client.sendMessage(formattedphoneNumber, message);
      log(`[${accountName}] Mensagem enviada para ${formattedphoneNumber} → ID: ${response.id._serialized}`);
    }

    return response;

  } catch (error) {
    log(`[${accountName}] Erro ao enviar mensagem 1: ${error.message}`);
    return null;
  }
};

function formatPhoneNumber(number) {
  const cleaned = number.replace(/\D/g, '');

  if (cleaned.startsWith('55')) {
      return `${cleaned}@c.us`;
  }

  return `55${cleaned}@c.us`;
}

module.exports = { sendMessage };
