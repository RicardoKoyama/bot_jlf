const { log } = require('../utils/logger');
const { pool } = require('../services/dbService');

async function handleApagarSalvaDados(message, accountId, nomeUsuario) {
  try {
    const user = (nomeUsuario || '').trim();
    if (!user) {
      await message.reply('❗ Informe o nome do usuário. Ex.: AS joao');
      return true;
    }

    const form = '%vend%';

    log(`[BOT] [AS] Apagando salvadados de: ${user}`);

    const result = await pool.query(
      'DELETE FROM salvadados WHERE usuario ILIKE $1 and formulario ilike $2',
      [user, form]
    );

    await message.reply(`✅ ${result.rowCount} registro(s) apagado(s) para o usuário "${user}".`);
    return true;
  } catch (err) {
    log(`[BOT] [AS] Erro: ${err.message}`);
    await message.reply('❗ Ocorreu um erro ao apagar os dados.');
    return true;
  }
}

module.exports = { handleApagarSalvaDados };
