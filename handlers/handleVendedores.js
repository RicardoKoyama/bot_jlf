const { log } = require('../utils/logger');
const { gerarGraficoPizza } = require('./graphUtils');
const { MessageMedia } = require('whatsapp-web.js');
const { pool } = require('../services/dbService');

async function handleFatVendedores(message, accountId, searchTerm, whatsappClients) {
  try {
    const client = whatsappClients[accountId];

    if (!client) {
      log(`[BOT] Cliente não encontrado para a conta ${accountId}`);
      await message.reply('❗ Ocorreu um erro interno. Cliente WhatsApp não localizado.');
      return;
    }

    const { dados, dataInicio, dataFim } = await searchFatVendedores(searchTerm);

    let response = buildFatVendedoresMessage(dados, dataInicio, dataFim);

    await client.sendMessage(message.from, response);

    log(`[BOT] Respondeu consulta de faturamento para o período ${dataInicio} a ${dataFim}`);

    if (dados.length > 0) {
      const imageBuffer = await gerarGraficoPizza(dados, 'Faturamento por Vendedor', 'vendedor');

      const base64Image = imageBuffer.toString('base64');

      const media = new MessageMedia('image/png', base64Image, 'grafico.png');

      await client.sendMessage(message.from, media);

      log(`[BOT] Enviou gráfico de faturamento para o período ${dataInicio} a ${dataFim}`);
    }

  } catch (error) {
    console.error('Erro no handleFaturamento:', error);
    await message.reply('❗ Ocorreu um erro ao processar sua consulta de faturamento.');
  }
}

function buildFatVendedoresMessage(faturamento, dataInicio, dataFim) {
  const formatar = (data) => {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  let dataTexto = formatar(dataInicio);
  if (dataInicio !== dataFim) {
    dataTexto += ` até ${formatar(dataFim)}`;
  }

  let response = `🔍 *RESULTADOS DA CONSULTA* 🔍\n📅 Período: ${dataTexto}\n\n`;

  if (faturamento.length === 0) {
    response += 'Nenhum dado de faturamento encontrado no período.';
  } else {
    faturamento.forEach((item, index) => {
      response += `*${item.vendedor.trim()}*\n`;
      response += `💰 Faturamento: R$ ${item.faturamento}\n`;
      response += `📦 Saídas: ${item.saidas}\n\n`;
    });
  }

  return response;
}
async function searchFatVendedores(formattedSearch) {
  const partes = (formattedSearch || '')
    .replace(/%+$/, '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  let dataInicio, dataFim;

  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  const formatData = (d) => d.toISOString().slice(0, 10);

  if (partes.length === 0) {
    dataInicio = formatData(hoje);
    dataFim = formatData(hoje);

  } else if (partes.length === 1) {
    const valor = partes[0];

    if (valor === 'HOJE') {
      dataInicio = formatData(hoje);
      dataFim = formatData(hoje);
    } else if (valor === 'ONTEM') {
      dataInicio = formatData(ontem);
      dataFim = formatData(ontem);
    } else {
      dataInicio = parseDataBR(valor);
      dataFim = parseDataBR(valor);

      if (!dataInicio || !dataFim) {
        throw new Error('Data inválida. Use o formato DD/MM/AAAA ou palavras-chave HOJE/ONTEM.');
      }
    }
  } else if (partes.length === 2) {
    dataInicio = parseDataBR(partes[0]);
    dataFim = parseDataBR(partes[1]);

    if (!dataInicio || !dataFim) {
      throw new Error('Datas inválidas. Digite dia (ex.: 15), dia/mês (ex.: 15/04) ou data completa DD/MM/AAAA. Ou use HOJE/ONTEM.');
    }

    if (dataInicio > dataFim) {
      throw new Error('Data inicial não pode ser maior que a data final.');
    }
  } else {
    throw new Error('Número de parâmetros inválido. Use no máximo 2 datas separadas por vírgula.');
  }

  const query = `
      SELECT 
          SUM(saidas) AS saidas, 
          vendedor, 
          TO_CHAR(SUM(faturamento), '9g999g999d99') AS faturamento 
      FROM vp_jlf_whatsapp_consulta_faturamento_vendedor
      WHERE dataoperacao::date BETWEEN $1 AND $2
      GROUP BY 2 
      ORDER BY 2
  `;
  const result = await pool.query(query, [dataInicio, dataFim]);

  return { dados: result.rows, dataInicio, dataFim };
}


function parseDataBR(dataStr) {
  const hoje = new Date();
  let dia, mes, ano;

  const partes = dataStr.split('/');

  if (partes.length === 1 && /^\d{1,2}$/.test(partes[0])) {
    dia = partes[0].padStart(2, '0');
    mes = String(hoje.getMonth() + 1).padStart(2, '0');
    ano = String(hoje.getFullYear());
  } else if (partes.length === 2) {
    dia = partes[0].padStart(2, '0');
    mes = partes[1].padStart(2, '0');
    ano = String(hoje.getFullYear());
  } else if (partes.length === 3) {
    dia = partes[0].padStart(2, '0');
    mes = partes[1].padStart(2, '0');
    ano = partes[2];
  } else {
    return null;
  }

  const isoDate = `${ano}-${mes}-${dia}`;
  const dateObj = new Date(isoDate);
  return isNaN(dateObj.getTime()) ? null : isoDate;
}

module.exports = {
  handleFatVendedores
};
