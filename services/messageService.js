const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { getClient } = require('./whatsappClient');
const { log } = require('../utils/logger');
const { enqueueMessage } = require('./messageQueue');

async function ensureChat(client, jid, accountName) {
  try {
    const chat = await client.getChatById(jid).catch(() => null);

    if (!chat) {
      log(`[${accountName}] Chat inexistente para ${jid}, forçando criação`);
      // mensagem mínima para forçar criação do lid
      await client.sendMessage(jid, ' ');
      // pequeno delay para o WhatsApp Web estabilizar
      await new Promise(r => setTimeout(r, 800));
    }
  } catch (err) {
    log(`[${accountName}] Falha ao garantir chat para ${jid}: ${err.message}`);
  }
}

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

    const jid = formattedphoneNumber;

    // 🔐 AQUI É O PONTO EXATO DA CORREÇÃO
    await ensureChat(client, jid, accountName);

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
