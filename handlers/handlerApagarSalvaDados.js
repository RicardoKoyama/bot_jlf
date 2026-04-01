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

async function handleCPProfissional(message, accountId, nomeUsuario) {
  console.log('handleCPProfissional chamado com:', { nomeUsuario });
  try {
    const user = (nomeUsuario || '').trim();
    if (!user) {
      await message.reply('❗ Informe o fisica juridica do profissional. Ex.: JT 28668');
      return true;
    }

    log(`[BOT] [JT] Ativando o profissional: ${user}`);

    const result = await pool.query(
      'update fisicajuridica set cp_profissional = true where fisicajuridica = $1',
      [user]
    );

    await message.reply(`✅ ${result.rowCount} registro(s) ativado(s) para o profissional "${user}".`);
    return true;
  } catch (err) {
    log(`[BOT] [JT] Erro: ${err.message}`);
    await message.reply('❗ Ocorreu um erro ao ativar o profissional.');
    return true;
  }
}

module.exports = { handleApagarSalvaDados, handleCPProfissional };
