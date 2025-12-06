const { log } = require('../utils/logger');
const { pool } = require('../services/dbService');
const fetch = require('node-fetch');
const { MessageMedia } = require('whatsapp-web.js');
const cheerio = require('cheerio');
require("dotenv").config();

async function handleDelta(message, accountId, searchTerm, whatsappClients) {
  try {
    const client = whatsappClients[accountId];

    if (!client) {
      log(`[BOT] Cliente não encontrado para a conta ${accountId}`);
      await message.reply('❗ Ocorreu um erro interno. Cliente WhatsApp não localizado.');
      return;
    }

    let response;
    let imageUrl = null;

    // 🔹 NOVO: se o termo é uma URL da Delta, extrair a referência do site
    if (searchTerm.includes('deltaporcelanatonova.com.br')) {
      const referencia = await getDeltaReferenciaFromPage(searchTerm);

      if (!referencia) {
        await client.sendMessage(
          message.from,
          '⚠️ Não foi possível identificar a referência na página do produto Delta.'
        );
        return;
      }

      await client.sendMessage(
        message.from,
        `🔍 *Referência Delta identificada:* ${referencia}\nConsultando estoque na fábrica...`
      );

      // consulta direto na API Delta usando a referência
      response = await searchDeltaStockAPI(referencia);
      imageUrl = response.imageUrl;
    }

    // 🔹 Caso padrão: pesquisa por texto ou código
    else if (/[a-zA-Z]/.test(searchTerm)) {
      const textOnly = await searchDeltaProducts(searchTerm);
      response = { message: textOnly };
    } else {
      response = await searchDeltaStockAPI(searchTerm);
      imageUrl = response.imageUrl;
    }

    // 🔹 Envio da resposta (com ou sem imagem)
    if (imageUrl) {
      try {
        const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
        await client.sendMessage(message.from, media, { caption: response.message });
      } catch (err) {
        console.error('Erro ao baixar ou enviar a imagem:', err);
        await client.sendMessage(message.from, response.message); // fallback
      }
    } else {
      await client.sendMessage(message.from, response.message);
    }

    log(`[BOT] Respondeu consulta Delta: ${searchTerm}`);
  } catch (error) {
    console.error('Erro no handleDelta:', error);
    await message.reply('❗ Ocorreu um erro ao consultar o estoque Delta.');
  }
}

async function searchDeltaProducts(searchTerm) {
  try {
    const query = `
      SELECT 
        nome, 
        referenciafabrica 
      FROM produtos 
      WHERE nome ILIKE $1 AND marca = 391
      LIMIT 20
    `;

    const result = await pool.query(query, [`%${searchTerm}%`]);

    let message = '📊 *PRODUTOS DELTA* 📊\n\n';

    if (result.rows.length === 0) {
      message += 'Nenhum produto encontrado no cadastro de produtos do MSI.';
    } else {
      message += `🔍 *Resultados para a busca:* ${searchTerm}\n\n`;

      const produtosParaEnviar = result.rows.slice(0, 10);

      produtosParaEnviar.forEach((produto, index) => {
        message += `*${index + 1}. ${produto.nome || 'Produto sem nome'}*\n`;
        message += `   🔹 Referência: ${produto.referenciafabrica || 'N/A'}\n`;
      });

      if (result.rows.length > 10) {
        message += `\n*Mais ${result.rows.length - 10} produtos encontrados...*`;
      }
    }

    return message;
  } catch (error) {
    console.error('Erro ao buscar lista de produtos Delta:', error);
    throw new Error('Erro ao buscar lista de produtos Delta');
  }
}

async function searchDeltaStockAPI(searchTerm) {
  try {
    let formattedSearch = searchTerm.replace(/%/g, '');

    if (!formattedSearch.endsWith('-A')) {
      formattedSearch += '-A';
    }

    const url = `https://portal-api.deltaceramica.com.br/api/v1/consulta_estoque/${formattedSearch}`;

    const headers = {
      accept: 'application/json',
      apikey: 'eyJhbGciOiJIUzI1NiJ9.eyJjb2RfZW1wcmVzYSI6IjUwNzIxNTk5MDAwMTIwIiwiZXhwIjoyNjk0MDIxNTM4fQ.6jrkhbmRE1vftungyqezBGjkGpXZ30pQywgpEVC9PiU'
    };

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        return { message: 'Nenhum produto encontrado na API Delta.' };
      }
      throw new Error(`Erro na API Delta: ${response.status}`);
    }

    const data = await response.json();

    let message = '📊 *ESTOQUE DELTA* 📊\n\n';
    message += `*${data.dsc_item || 'Produto não encontrado'}*\n`;
    const estoque = parseFloat(data.sdo_saldo_estoque) || 0;
    message += `📦 *Estoque disponível:* ${estoque.toLocaleString()} ${data.dsc_un_medidas || 'unidades'}\n`;
    message += `🔹 Referência: ${data.cod_produto || 'N/A'}\n`;
    message += `🔹 M2 por caixa: ${data.prd_m2_caixa || 'N/A'}\n`;
    message += `🔹 M2 por pallet: ${data.prd_m2_pallet || 'N/A'}\n`;
    message += `🔹 CX por pallet: ${data.prd_cx_pallet || 'N/A'}\n`;

    return {
      message,
      imageUrl: data.prd_link_img_produto || null
    };
  } catch (error) {
    console.error('Erro ao consultar estoque Delta API:', error);
    return { message: '❗ Erro ao consultar o estoque Delta via API.' };
  }
}

async function getDeltaReferenciaFromPage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro ao acessar página Delta (${response.status})`);

    const html = await response.text();
    const $ = cheerio.load(html);

    let referencia = null;

    $('p, span, li, div').each((_, el) => {
      const text = $(el).text().trim();
      if (/ref(eren[çc]ia)?[:\s]/i.test(text)) {
        referencia = text.replace(/.*ref(eren[çc]ia)?[:\s]*/i, '').trim();
        return false;
      }
    });

    return referencia || null;
  } catch (err) {
    console.error('Erro ao extrair referência Delta:', err);
    return null;
  }
}

module.exports = { handleDelta };
