const { getClient } = require('./whatsappClient');
const { log } = require('../utils/logger');
const { updateMessageStatus } = require('./dbService');

const queues = {};
const DELAY_MS = 2000; // ajuste o delay aqui (2s)

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

    queues[accountName].queue.push({ number, message, messageId});
    processQueue(accountName);
};

const processQueue = async (accountName) => {
    const queueObj = queues[accountName];
    if (queueObj.processing) return;

    queueObj.processing = true;

    while (queueObj.queue.length > 0) {
        const { number, message, messageId } = queueObj.queue.shift();
        try {
            const formattedphoneNumber = formatPhoneNumber(number);
            const client = getClient(accountName);
            if (!client) {
                log(`Cliente WhatsApp não encontrado para conta ${accountName}`);
                continue;
            }
            const response = await client.sendMessage(formattedphoneNumber, message);
            log(`[${accountName}] Mensagem da fila enviada para ${formattedphoneNumber} → ID: ${response.id._serialized}`);
            await updateMessageStatus(messageId, 'ENVIADO', response.id._serialized, accountName, 'msg_whatsapp');
        } catch (error) {
            log(`[${accountName}] Erro ao enviar mensagem da fila: ${error.message}`);
        }
        await delay(DELAY_MS);
    }

    queueObj.processing = false;
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    enqueueMessage,
};
