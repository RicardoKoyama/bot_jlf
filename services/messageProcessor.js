const { getMessageById, updateMessageStatus } = require('./dbService');
const { sendMessage } = require('./messageService');
const { log } = require('../utils/logger');

const processMessage = async (id, channel) => {
  try {
    const messageData = await getMessageById(id, channel);

    if (!messageData) {
      log(`Nenhum registro encontrado para ID ${id}`);
      return;
    }

    const contaWhatsApp = messageData.conta_whatsapp || 'default';

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
