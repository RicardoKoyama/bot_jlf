const { pool } = require('./accountService');
const { log } = require('../utils/logger');
const { processAutomation, processAutomationImage } = require('./automationRouter');
const { handleLoteQuickReply } = require('../handlers/handleDecodifica'); // 👈 importa

function normalizeFromNumber(message) {
  // Caso normal
  if (message.from.endsWith('@c.us')) {
    return message.from.replace('@c.us', '');
  }

  // Caso LID → tentar extrair telefone real
  if (message.from.endsWith('@lid')) {
    // tenta usar o "author" ou "fromMe" context
    if (message._data?.notifyName && message._data?.id?.participant) {
      return message._data.id.participant.replace('@c.us', '');
    }

    // fallback: se tiver chat associado
    if (message._data?.chat?.id?.user) {
      return `55${message._data.chat.id.user}`;
    }

    return null; // não conseguiu resolver
  }

  return null;
}


async function handleIncomingMessage(message, accountName, accountId, client) {
  try {
    if (message.from.endsWith('@g.us')) return;
    if (accountName === 'Cobranca') return;
    if (accountName === 'Principal') return;

    const fromNumber = normalizeFromNumber(message);

    if (!fromNumber) {
      log(`[${accountName}] Não foi possível normalizar remetente: ${message.from}`);
      return;
    }


    const allowedNumbers = new Set([
      '5514996665935','5514998122657','5514991182979','5514996301756', '5514996973391', '5514996320098',
      '5514997624313','5514997022068','5514991183231','5514996716116', '5514981153889'
    ]);
    if (!allowedNumbers.has(fromNumber)) {
      log(`[${accountName}] Mensagem bloqueada de número não autorizado: ${fromNumber}`);
      return;
    }

    if (accountName === 'Comunicacao') {
      // ✅ 1) Sempre tenta tratar fluxo de lote (1/2 + nome), com ou sem quoted #LCHK
      try {
        // sempre tenta quick reply de lote ANTES de qualquer tratamento de reply
        const handled = await handleLoteQuickReply(message);
        if (handled) {
          // opcional: registrar no jlf_whatsapp se quiser
          if (message.hasQuotedMsg) {
            const quoted = await message.getQuotedMessage();
            await pool.query(
              `UPDATE jlf_whatsapp SET resposta=$1, status='RESPONDIDO' WHERE message_id=$2 AND status NOT ILIKE 'RESPONDIDO'`,
              [message.body, quoted.id._serialized]
            );
          }
          return;
        }

      } catch (e) {
        log(`[${accountName}] handleLoteQuickReply erro: ${e.message}`);
      }

      // 2) Caso não tenha sido um quick reply de lote, segue sua lógica atual de replies genéricos
      if (message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        const quotedId = quoted.id._serialized;
        const updateQuery = `
          UPDATE jlf_whatsapp
             SET resposta = $1,
                 status   = 'RESPONDIDO'
           WHERE message_id = $2
             AND status NOT ILIKE 'RESPONDIDO'
        `;
        await pool.query(updateQuery, [message.body, quotedId]);
        log(`[${accountName}] Resposta registrada no banco para message_id ${quotedId}.`);
        return;
      }

      // 3) Imagens → roteador de imagem
      if (message.type === 'image') {
        await processAutomationImage(message, accountId, client);
        return;
      }

      // 4) Texto normal → roteador padrão
      await processAutomation(message, accountId, client);
    }
  } catch (error) {
    console.error(`[${accountName}] Erro ao processar mensagem recebida: ${error.message}`);
  }
}

module.exports = { handleIncomingMessage };
