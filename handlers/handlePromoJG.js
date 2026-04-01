const { pool } = require('../services/dbService');

async function handlePromoJG(message, accountId, whatsappClients) {
  const client = whatsappClients[accountId];
  console.log('[PROMOJG] Mensagem recebida:', message.body);

  if (!client) {
    console.error(`[PROMOJG] Cliente não encontrado para conta ${accountId}`);
    await message.reply('❗ Erro interno. Cliente WhatsApp não localizado.');
    return;
  }

  const body = message.body.trim().toLowerCase();

  // comando esperado: promo 12345
  if (!body.startsWith('promo ')) return false;

  const partes = body.split(' ');
  const codigo = partes[1];

  if (!/^\d+$/.test(codigo)) {
    await message.reply('❗ Código inválido. Use por exemplo: *promo 12345*');
    return true;
  }

  try {
    const result = await pool.query(
      'UPDATE fisicajuridica SET cp_profissional = true WHERE fisicajuridica = $1',
      [codigo]
    );

    if (result.rowCount === 0) {
      await message.reply(`⚠️ Profissional ${codigo} não encontrado.`);
    } else {
      await message.reply(`✅ Profissional ${codigo} atualizado como *profissional* com sucesso.`);
    }

    console.log(`[PROMOJG] Profissional ${codigo} atualizado.`);
  } catch (err) {
    console.error(`[PROMOJG] Erro ao atualizar profissional ${codigo}:`, err);
    await message.reply('❗ Erro ao executar o comando.');
  }

  return true; // comando tratado
}

module.exports = { handlePromoJG };