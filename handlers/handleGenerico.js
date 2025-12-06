const { pool } = require('../services/dbService');

function aplicarTemplate(template, row) {
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    const valor = row[key.trim()];
    return valor !== undefined && valor !== null ? valor : '';
  });
}

async function handleGenerico(message, accountId, searchTerm, clients, config) {
  const texto = message.body.trim();

  // --- NOVO COMANDO: "lote 33864 / 2,5" ---
  if (/^lote\s+\d+\s*\/\s*\d+[.,]?\d*$/i.test(texto)) {
    try {
      const [, produtoStr, qtdStr] = texto.match(/^lote\s+(\d+)\s*\/\s*([\d.,]+)/i);
      const produto = parseInt(produtoStr, 10);
      const quantidade = parseFloat(qtdStr.replace(',', '.'));

      await pool.query(
        `INSERT INTO produtoslote (produto, lote, local, cp_quantidadecaixa, cp_permitenegativo)
         VALUES ($1, 'ENCOMENDA', 9, $2, TRUE)`,
        [produto, quantidade]
      );

      const { rows } = await pool.query(
        `SELECT produto, lote, local, cp_quantidadecaixa::numeric(18,2)
           FROM produtoslote
          WHERE produto = $1 and not cp_concluido
          ORDER BY chave DESC LIMIT 10`,
        [produto]
      );

      if (rows.length === 0) {
        await message.reply('⚠️ Lote criado, mas nenhum dado foi retornado.');
        return;
      }

      let resposta = `✅ *Lote criado com sucesso!*\n\n📦 *Lotes do produto no sistema:*\n\n`;
      rows.forEach((r, i) => {
        resposta += `*${i + 1}.* Lote: ${r.lote} | Qt/Caixa: ${r.cp_quantidadecaixa.replace('.', ',')} m²\n`;
      });

      await message.reply(resposta);

    } catch (err) {
      console.error('Erro ao inserir lote:', err);
      await message.reply('⚠️ Erro ao criar o lote. Verifique o formato e tente novamente.');
    }
    return;
  }

  // --- fluxo normal de consultas ---
  const { tabela, colunas, colunas_like, condicoes_extra, modelo_resposta } = config;

  const selectCols = colunas.split(',').map(c => c.trim()).join(', ');
  const likeConds = colunas_like.split(',').map(col => `${col.trim()} ILIKE $1`).join(' OR ');
  const where = condicoes_extra ? `(${likeConds}) AND (${condicoes_extra})` : `(${likeConds})`;

  const buscaLivre = searchTerm.startsWith('*');
  const termoBusca = buscaLivre ? `%${searchTerm.slice(1)}%` : `${searchTerm}%`;
  const params = [termoBusca];

  const sql = `SELECT ${selectCols} FROM ${tabela} WHERE ${where} LIMIT 10`;

  const { rows: results } = await pool.query(sql, params);

  if (results.length === 0) {
    await message.reply('❗ Nenhum resultado encontrado.');
    return;
  }

  let response = '🔍 *RESULTADOS DA CONSULTA* 🔍\n\n';

  results.forEach((row, index) => {
    const linha = aplicarTemplate(modelo_resposta, row);
    response += `*${index + 1}.* ${linha.trim()}\n\n`;
  });

  if (results.length === 10) {
    response += '⚠️ *Atenção:* Mostrando apenas os 10 primeiros resultados';
  }

  await message.reply(response);
}

module.exports = { handleGenerico };
