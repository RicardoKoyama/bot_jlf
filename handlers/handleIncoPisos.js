const { log } = require('../utils/logger');
const { consultaEstoquePorRef } = require('../services/incopisosService'); // você vai criar esse service abaixo

/**
 * Handler principal para consultas de estoque IncoPisos
 * Comando: CI <referencia>
 */
async function handleIncoPisos(message, accountId, termoBuscado, clients) {
  try {
    const ref = termoBuscado.trim();

    if (!ref) {
      await message.reply('❗ Informe o código de referência. Exemplo: *CI 90117*');
      return;
    }

    log(`[IncoPisos] Consultando referência: ${ref}`);

    //await message.reply('🔎 Consultando estoque na IncoPisos... aguarde um instante.');

    const resposta = await consultaEstoquePorRef(ref);

    if (!resposta) {
      await message.reply('⚠️ Nenhum dado de estoque encontrado para essa referência.');
      return;
    }

    await message.reply(resposta);
  } catch (err) {
    log(`[IncoPisos] Erro: ${err.message}`);
    await message.reply('❌ Ocorreu um erro ao consultar o estoque da IncoPisos.');
  }
}

module.exports = { handleIncoPisos };
