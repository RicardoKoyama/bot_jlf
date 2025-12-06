const { log } = require('../utils/logger');

async function handleAjuda(message, accountId, searchTerm, whatsappClients) {
  try {
    const client = whatsappClients[accountId];

    if (!client) {
      log(`[BOT] Cliente não encontrado para a conta ${accountId}`);
      await message.reply('❗ Ocorreu um erro interno. Cliente WhatsApp não localizado.');
      return;
    }

    let ajudaMsg = `🤖 *MENU DE COMANDOS* 🤖\n\n`;
    ajudaMsg += `CP / PRODUTO <nome>*\n- Consulta produtos pelo início do nome.\n`;
    ajudaMsg += `CC / CLIENTE <nome>*\n- Consulta clientes pelo início do nome.\n`;
    ajudaMsg += `CD / DELTA <nome ou código>*\n- Consulta estoque da Delta (nome ou código Delta).\n`;
    ajudaMsg += `CI / INCOPISOS <referência>*\n- Consulta estoque da Incopisos.\n`;
    ajudaMsg += `CE / EMBRAMACO <referência>*\n- Consulta estoque da Embramaco.\n`;
    ajudaMsg += `LOTE COD_PRODUTO / QTDE_EMBALAGEM*\n- Cria lote encomenda para revestimento.\n`;
    ajudaMsg += `INATIVO <código>*\n- Ativa um produto.\n`;
    ajudaMsg += `CF / FATURAMENTO <data> ou <data inicial>,<data final>*\n- Consulta faturamento por data.\n`;
    ajudaMsg += `CV / VENDEDORES <data> ou <data inicial>,<data final>*\n- Consulta faturamento por data.\n`;
    ajudaMsg += `AS <usuario> - Apaga o salvadados do usuário\n`;
    ajudaMsg += `Exemplos:\n`;
    ajudaMsg += `   *FATURAMENTO / VENDEDORES HOJE / ONTEM*\n`;
    ajudaMsg += `   *FATURAMENTO 01/07,30/07*\n\n`;
    ajudaMsg += `✅ Digite o comando desejado conforme os exemplos acima.`;

    await client.sendMessage(message.from, ajudaMsg);
    
    log(`[BOT] Respondeu comando de ajuda.`);

  } catch (error) {
    console.error('[BOT] Erro no handleAjuda:', error);
    await message.reply('❗ Ocorreu um erro ao exibir a ajuda.');
  }
}

module.exports = {
  handleAjuda
};
