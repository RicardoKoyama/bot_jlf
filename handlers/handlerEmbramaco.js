const { log } = require('../utils/logger');
const { consultaEstoqueEmbramaco } = require('../services/embramacoService');

/**
 * Handler principal para consultas de estoque Embramaco
 * Comando: CE <referencia>
 */
async function handleEmbramaco(message, accountId, termoBuscado, clients) {
  try {
    const ref = termoBuscado.trim();

    if (!ref) {
      await message.reply('❗ Informe o código de referência. Exemplo: *CE RT11008*');
      return;
    }

    log(`[Embramaco] Consultando referência: ${ref}`);

    //await message.reply('🔎 Consultando estoque na Embramaco... aguarde um instante.');

    const resposta = await consultaEstoqueEmbramaco(ref);

    if (!resposta) {
      await message.reply('⚠️ Nenhum dado de estoque encontrado para essa referência.');
      return;
    }

    await message.reply(resposta);
  } catch (err) {
    log(`[Embramaco] Erro: ${err.message}`);
    await message.reply('❌ Ocorreu um erro ao consultar o estoque da Embramaco.');
  }
}

module.exports = { handleEmbramaco };
