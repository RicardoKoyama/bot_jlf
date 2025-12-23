const { getMessageById, updateMessageStatus } = require('./dbService');
const { sendMessage } = require('./messageService');
const { log } = require('../utils/logger');
const { getClient } = require('./whatsappClient');

async function ensureChat(accountName, number) {

  console.log(`Garantindo chat para ${number} na conta ${accountName}`);

  try {
    const client = getClient(accountName);

    console.log(`Cliente obtido: ${client ? 'sim' : 'não'}`);

    if (!client) return;

    const jid = number.replace(/\D/g, '').startsWith('55')
      ? `${number.replace(/\D/g, '')}@c.us`
      : `55${number.replace(/\D/g, '')}@c.us`;

    console.log(`JID formatado: ${jid}`);

    const chat = await client.getChatById(jid).catch(() => null);

    if (!chat) {
      log(`[${accountName}] Chat inexistente para ${jid}, forçando criação`);
      await client.sendMessage(jid, ' ');
      await new Promise(r => setTimeout(r, 400));
    }
  } catch (err) {
    log(`[${accountName}] Erro no ensureChat (${number}): ${err.message}`);
  }
}

const processMessage = async (id, channel) => {

  try {
    const messageData = await getMessageById(id, channel);

    if (!messageData) {
      log(`Nenhum registro encontrado para ID ${id}`);
      return;
    }

    console.log(`Conta WhatsApp: ${messageData.conta_whatsapp}`);

    const contaWhatsApp = messageData.conta_whatsapp || 'default';

    await ensureChat(contaWhatsApp, messageData.numero);

    const response = await sendMessage(
      contaWhatsApp,
      messageData.numero,
      messageData.mensagem,
      id,
      messageData.file_path
    );

    if (!response) {
      log(`Falha ao enviar mensagem ID ${id}`);
      return;
    }

    if (response.enqueued) {
      return;
    }

    const whatsappMsgId = response.id._serialized;

    await updateMessageStatus(id, 'ENVIADO', whatsappMsgId, contaWhatsApp, channel);

  } catch (error) {
    log(`Erro ao processar mensagem ID ${id}: ${error.message}`);
  }
};

module.exports = { processMessage };
