const { pool } = require('./accountService');
const { log } = require('../utils/logger');
const { processAutomation, processAutomationImage } = require('./automationRouter');
const { handleLoteQuickReply } = require('../handlers/handleDecodifica');

/**
 * Telefones autorizados (formato: DDI + DDD + número, sem @)
 */
const allowedNumbers = new Set([
  '5514996665935', /* ricardo */
  '5514997624313', /* taty */
  '5514991182979', /* netto */
  '5514996716116',  /* joão vitor */
  '5514996301756',  /* luiz */

  '5514998122657',
  '5514996320098',
  '5514997022068',
  '5514991183231',
  '5514981153889'
]);

/**
 * LIDs autorizados (fallback operacional)
 * ⚠️ Usar apenas quando o telefone não puder ser resolvido
 */
const allowedLIDs = new Set([
  '32087751000096@lid', /* ricardo */
  '25430602059930@lid', /* taty */
  '135192819835025@lid',  /* netto */
  '78297690021957@lid',  /* luiz */
  '3277177495563@lid' /* joão vitor */

]);

/**
 * Tenta normalizar o remetente para número de telefone real.
 * Retorna string (5514...) ou null se não for possível.
 */
function normalizeFromNumber(message) {
  // Caso padrão
  if (message.from.endsWith('@c.us')) {
    return message.from.replace('@c.us', '');
  }

  // Caso LID
  if (message.from.endsWith('@lid')) {
    // tenta extrair participante real
    if (message._data?.id?.participant?.endsWith('@c.us')) {
      return message._data.id.participant.replace('@c.us', '');
    }

    // fallback pelo chat associado
    if (message._data?.chat?.id?.user) {
      return `55${message._data.chat.id.user}`;
    }

    return null;
  }

  return null;
}

async function handleIncomingMessage(message, accountName, accountId, client) {
  try {
    // 🔕 Ignorar grupos
    if (message.from.endsWith('@g.us')) return;

    // 🔕 Ignorar contas específicas
    if (accountName === 'Cobranca') return;
    if (accountName === 'Principal') return;

    const rawFrom = message.from;
    const fromNumber = normalizeFromNumber(message);

    /**
     * 🔐 AUTORIZAÇÃO
     */
    let autorizado = false;

    // Prioridade: telefone real
    if (fromNumber && allowedNumbers.has(fromNumber)) {
      autorizado = true;
    }

    // Fallback: LID explícito
    if (!autorizado && rawFrom.endsWith('@lid') && allowedLIDs.has(rawFrom)) {
      autorizado = true;
    }

    if (!autorizado) {
      if (rawFrom.endsWith('@lid') && !allowedLIDs.has(rawFrom)) {
        log(`[${accountName}] LID novo detectado (não autorizado): ${rawFrom}`);
      } else {
        log(`[${accountName}] Mensagem bloqueada de remetente não autorizado: ${rawFrom}`);
      }
      return;
    }

    /**
     * 🚀 FLUXO DA CONTA COMUNICACAO
     */
    if (accountName === 'Comunicacao') {

      // 1️⃣ Quick reply de lote (1/2 + nome)
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

      // 2️⃣ Reply genérico a mensagem enviada
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

      // 3️⃣ Imagens
      if (message.type === 'image') {
        await processAutomationImage(message, accountId, client);
        return;
      }

      // 4️⃣ Texto padrão
      await processAutomation(message, accountId, client);
    }

  } catch (error) {
    console.error(`[${accountName}] Erro ao processar mensagem recebida: ${error.message}`);
  }
}

module.exports = { handleIncomingMessage };
