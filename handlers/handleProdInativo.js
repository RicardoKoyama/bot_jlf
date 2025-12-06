const { pool } = require('../services/dbService');

async function handleCPI(message, accountId, whatsappClients) {
  const client = whatsappClients[accountId];
  console.log('Mensagem recebida' , message.body);
  if (!client) {
    console.error(`[CPI] Cliente não encontrado para conta ${accountId}`);
    await message.reply('❗ Erro interno. Cliente WhatsApp não localizado.');
    return;
  }

  const body = message.body.trim().toLowerCase();

  if (!body.startsWith('ci ') && !body.startsWith('inativo ')) return false; // Não é comando CPI

  const partes = body.split(' ');
  const codigo = partes[1];

  if (!/^\d+$/.test(codigo)) {
    await message.reply('❗ Código inválido. Use por exemplo: *cpi 19868*');
    return true;
  }

  try {
    const result = await pool.query(
      'UPDATE produtos SET inativo = FALSE WHERE chave = $1',
      [codigo]
    );

    if (result.rowCount === 0) {
      await message.reply(`⚠️ Produto ${codigo} não encontrado.`);
    } else {
      await message.reply(`✅ Produto ${codigo} ativado com sucesso.`);
    }

    console.log(`[CPI] Produto ${codigo} ativado.`);
  } catch (err) {
    console.error(`[CPI] Erro ao ativar produto ${codigo}:`, err);
    await message.reply('❗ Erro ao executar o comando.');
  }

  return true; // comando tratado
}

module.exports = { handleCPI };
