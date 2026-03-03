const { pool } = require('./accountService');
const { log } = require('../utils/logger');
const { processAutomation, processAutomationImage } = require('./automationRouter');
const { handleLoteQuickReply } = require('../handlers/handleDecodifica');

/**
 * Normaliza número real
 */
function normalizeFromNumber(message) {
  if (message.from.endsWith('@c.us')) {
    return message.from.replace('@c.us', '');
  }

  if (message.from.endsWith('@lid')) {
    if (message._data?.id?.participant?.endsWith('@c.us')) {
      return message._data.id.participant.replace('@c.us', '');
    }

    if (message._data?.chat?.id?.user) {
      return `55${message._data.chat.id.user}`;
    }

    return null;
  }

  return null;
}

/**
 * Consulta autorização no banco
 */
async function isAuthorized(rawFrom, fromNumber) {
  try {
    const { rows } = await pool.query(
      `
      SELECT 1
        FROM usuarios u
       WHERE (u.cp_whatsapp = $1)
          OR (u.cp_whatsapplid = $2)
       LIMIT 1
      `,
      [fromNumber, rawFrom]
    );

    return rows.length > 0;
  } catch (err) {
    log(`Erro ao consultar permissão no banco: ${err.message}`);
    return false;
  }
}

async function handleIncomingMessage(message, accountName, accountId, client) {
  try {

    if (message.from.endsWith('@g.us')) return;
    if (accountName === 'Cobranca') return;
    if (accountName === 'Principal') return;

    const rawFrom = message.from;
    const fromNumber = normalizeFromNumber(message);

    const autorizado = await isAuthorized(rawFrom, fromNumber);

    if (!autorizado) {
      log(`[${accountName}] Tentativa de acesso não autorizado: ${rawFrom}`);
      return;
    }

    if (accountName === 'Comunicacao') {

      // 1️⃣ Quick reply lote
      try {
        const handled = await handleLoteQuickReply(message);
        if (handled) {
          if (message.hasQuotedMsg) {
            const quoted = await message.getQuotedMessage();
            await pool.query(
              `UPDATE jlf_whatsapp
                  SET resposta = $1,
                      status   = 'RESPONDIDO'
                WHERE message_id = $2
                  AND status NOT ILIKE 'RESPONDIDO'`,
              [message.body, quoted.id._serialized]
            );
          }
          return;
        }
      } catch (e) {
        log(`[${accountName}] handleLoteQuickReply erro: ${e.message}`);
      }

      // 2️⃣ Reply padrão
      if (message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        const quotedId = quoted.id._serialized;

        await pool.query(
          `UPDATE jlf_whatsapp
              SET resposta = $1,
                  status   = 'RESPONDIDO'
            WHERE message_id = $2
              AND status NOT ILIKE 'RESPONDIDO'`,
          [message.body, quotedId]
        );

        log(`[${accountName}] Resposta registrada no banco para message_id ${quotedId}.`);
        return;
      }

      // 3️⃣ Imagem
      if (message.type === 'image') {
        await processAutomationImage(message, accountId, client);
        return;
      }

      // 4️⃣ Texto
      await processAutomation(message, accountId, client);
    }

  } catch (error) {
    console.error(`[${accountName}] Erro ao processar mensagem recebida: ${error.message}`);
  }
}

module.exports = { handleIncomingMessage };