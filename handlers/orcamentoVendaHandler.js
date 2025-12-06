const { log } = require('../utils/logger');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool } = require('../services/dbService');

// Decodificador externo
const DECODER_BIN = process.env.DECODER_BIN || 'BarcodeReaderCLI';

// Mapa temporário para guardar chave do orçamento e aguardar número do cliente
const aguardandoTelefone = new Map();

// Utilidades que você pode importar do handler original
const {
  writeTempImage,
  cleanupTemp,
  base64ToBinaryString,
  parseGS1FromBinaryString,
  parseGS1FromBinaryLinear,
  normalizeGTIN,
} = require('./utilsGS1'); // suponha que movemos essas utilidades para cá

// Função principal
async function handleVendaOrcamentoViaFoto(message, accountId, whatsappClients) {
  const legenda = (message.body || '').toUpperCase().trim();
  const estadoExistente = aguardandoTelefone.get(message.from);

  log(`[BOT] Legenda recebida: "${legenda}"`);

  if (!legenda.startsWith('VP')) return false;

  const partes = legenda.split(' ');
  const quantidadeDesejada = parseFloat(partes[1]);

  if (isNaN(quantidadeDesejada)) {
    await message.reply('❗ Informe a metragem desejada. Ex: VENDA 15');
    return true;
  }

  if (message.type !== 'image') {
    await message.reply('❗ Envie uma *imagem* com a legenda *VENDA X*.');
    return true;
  }

  let tmp;
  try {
    const media = await message.downloadMedia();
    if (!media) {
      await message.reply('❗ Não consegui baixar a imagem. Tente novamente.');
      return true;
    }

    tmp = writeTempImage(media);

    const args = [
      '-type=datamatrix,qr,ucc128',
      '-max-bc=20',
      '-timeout=8',
      '-s',
      '-format=json',
      '-fields=text,data,type,length',
      tmp.file,
    ];

    const rawJson = await new Promise((resolve, reject) => {
      execFile(DECODER_BIN, args, { timeout: 20000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`Decoder falhou: ${err.message}`));
        resolve(String(stdout || '').trim());
      });
    });

    const payload = JSON.parse(rawJson);
    const bar = payload?.sessions?.[0]?.barcodes?.[0];

    const text = bar?.text ? String(bar.text) : null;
    const dataB64 = bar?.data ? String(bar.data) : null;

    let parsed = {};
    if (dataB64) {
      const bin = base64ToBinaryString(dataB64);
      parsed = parseGS1FromBinaryString(bin);
    } else if (text) {
      const cleaned = text.replaceAll('{GS}', '').replaceAll(String.fromCharCode(0x1D), '');
      parsed = parseGS1FromBinaryLinear(cleaned);
    } else {
      await message.reply('⚠️ Não consegui entender o código. Tente novamente.');
      return true;
    }

    // 🔎 Produto
    const gtin = normalizeGTIN(parsed.GTIN || '');
    if (!gtin) {
      await message.reply('⚠️ GTIN não reconhecido.');
      return true;
    }

    const qProduto = `
      SELECT chave, nome
      FROM v_frmprodutos_tblprodutos
      WHERE codigobarra = $1
      LIMIT 1
    `;
    const { rows: produtos } = await pool.query(qProduto, [gtin]);
    if (!produtos.length) {
      await message.reply('❗ Produto não encontrado no sistema.');
      return true;
    }

    const produto = produtos[0];

    // 📦 Metragem por caixa
    const qCaixa = `
      SELECT cp_quantidadecaixa
      FROM produtoslote
      WHERE produto = $1
      LIMIT 1
    `;
    const { rows: lotes } = await pool.query(qCaixa, [produto.chave]);
    const metragemPorCaixa = parseFloat(lotes[0]?.cp_quantidadecaixa || 0);

    if (!metragemPorCaixa) {
      await message.reply('⚠️ Produto sem metragem por caixa cadastrada.');
      return true;
    }

    const caixasNecessarias = Math.ceil(quantidadeDesejada / metragemPorCaixa);
    const quantidadeFinal = parseFloat((caixasNecessarias * metragemPorCaixa).toFixed(2));

    // 💰 Preço
    const qPreco = `SELECT coalesce(pega_preco_pdv($1, 1), (select precovenda from produtos where chave = $1)) AS preco`;
    const { rows: precos } = await pool.query(qPreco, [produto.chave]);
    const precoUnitario = parseFloat(precos[0]?.preco || 0);

    if (!precoUnitario) {
      await message.reply('❗ Não foi possível obter o preço do produto.');
      return true;
    }

    const valorTotal = parseFloat((quantidadeFinal * precoUnitario).toFixed(2));

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SET ROLE 'Administrador';`);

        let chaveOrcamento;

        if (estadoExistente?.orcamento) {
            chaveOrcamento = estadoExistente.orcamento;
            log(`[BOT] Reutilizando orçamento em aberto: #${chaveOrcamento}`);
        } else {
            // 🧾 Cria novo orçamento
            const qInsertOrcamento = `
                INSERT INTO orcamentos (nomecliente, fisicajuridica, vendedorinterno, dataoperacao, vrfrete, comjuros, "local", frete, freteredespacho)
                VALUES ('CONSUMIDOR', 1, 4282, CURRENT_DATE, 0, FALSE, 9, 9, 2)
                RETURNING orcamento
            `;
            const { rows: orcRows } = await client.query(qInsertOrcamento);
            chaveOrcamento = orcRows[0].orcamento;
        }

        // 🧾 Insere produto
        const qInsertProduto = `
            INSERT INTO produtosorcamento 
            (orcamento, quantidade, vrunitario, desconto, vrdesconto, produto, adicionalfinanceiro, vradicionalfinanceiro, chavepromocao, "local", digfrete, cp_margem)
            VALUES 
            ($1, $2, $3, 0, 0, $4, 0, 0, 6866, 9, FALSE, 46.10178)
        `;
        await client.query(qInsertProduto, [chaveOrcamento, quantidadeFinal, precoUnitario, produto.chave]);

        // 🧾 Insere parcela
        const qInsertParcela = `
            INSERT INTO vctosorcamento 
            (orcamento, vencimento, valor, pagamento)
            VALUES 
            ($1, CURRENT_DATE, $2, 58)
        `;
        await client.query(qInsertParcela, [chaveOrcamento, valorTotal]);

        await client.query('COMMIT');

        // 🔄 Recupera itens atuais do orçamento para exibir depois
        const qItens = `
        SELECT po.produto, p.nome, po.quantidade
            FROM produtosorcamento po
            JOIN produtos p ON p.chave = po.produto
        WHERE po.orcamento = $1
        ORDER BY po.chave
        `;
        const { rows: itensOrcamento } = await client.query(qItens, [chaveOrcamento]);

        aguardandoTelefone.set(message.from, {
            orcamento: chaveOrcamento,
            itens: itensOrcamento
        });

        let resposta = `✅ Produto incluído no orçamento #${chaveOrcamento}:\n` +
        `• ${produto.nome}\n` +
        `• Metragem: ${quantidadeFinal} m²\n` +
        `• Valor total: R$ ${valorTotal.toFixed(2)}\n\n`;

        if (itensOrcamento.length) {
        resposta += `📋 Itens no orçamento:\n`;
        itensOrcamento.forEach((item, idx) => {
            resposta += `${idx + 1} - ${item.nome} — ${item.quantidade} m²\n`;
        });

        resposta += `\n✏️ Para alterar um item, envie:\n`;
        resposta += `[1 - 20] para alterar o item 1 para 20 m²\n`;
        resposta += `[1 - 0] para remover o item 1\n`;
        resposta += `📞 Ou envie o número do cliente para concluir.`;
        }

        await message.reply(resposta);


        return true;

    } catch (err) {
        await client.query('ROLLBACK');
        log(`[OrcamentoViaFoto][DB] Erro: ${err.message}`);
        await message.reply('❗ Erro ao gerar o orçamento. Verifique se o produto está ativo e tente novamente.');
        return true;
    } finally {
        client.release();
    }


  } catch (e) {
    log(`[OrcamentoViaFoto] Erro: ${e.stack || e.message}`);
    await message.reply('❗ Erro ao processar a venda. Tente novamente.');
    return true;
  } finally {
    if (tmp?.dir) cleanupTemp(tmp.dir);
  }
}

// Handler para receber número e enviar link
async function handleTelefoneResposta(message) {
  const estado = aguardandoTelefone.get(message.from);
  if (!estado) return false;

  const telefone = String(message.body || '').replace(/\D/g, '');
  if (telefone.length < 10) {
    await message.reply('❗ Informe um número de telefone válido (com DDD).');
    return true;
  }

  const vMensagem = `Olá, Segue o link para que você possa visualizar seu orçamento! *Agradecemos por sua preferência* https://checkout.grupojlf.com.br/orcamento/${estado.orcamento}/detalhes`;

  await pool.query(`INSERT INTO jlf_whatsapp (numero, mensagem) VALUES ($1, $2)`, [telefone, vMensagem]);
  await pool.query(`INSERT INTO integracoes.catalogo_links_gerados (orcamento, operacao, telefone) VALUES ($1, 4, $2)`, [estado.orcamento, telefone]);
  await pool.query(`UPDATE orcamentos SET status = 1 WHERE orcamento = $1`, [estado.orcamento]);

  aguardandoTelefone.delete(message.from);
  await message.reply('📨 Orçamento enviado com sucesso!');

  return true;
}

async function atualizarOuExcluirItemDoOrcamento(message) {
  const estado = aguardandoTelefone.get(message.from);
  if (!estado || !estado.itens || !estado.itens.length) return false;

  const texto = (message.body || '').trim();
  const m = texto.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return false;

  const idx = parseInt(m[1]) - 1;
  const novaQtd = parseFloat(m[2]);

  if (isNaN(idx) || idx < 0 || idx >= estado.itens.length) {
    await message.reply('❗ Número do item inválido.');
    return true;
  }

  const item = estado.itens[idx];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET ROLE 'Administrador';`);

    if (novaQtd === 0) {
      await client.query(`
        DELETE FROM produtosorcamento
        WHERE orcamento = $1 AND produto = $2
      `, [estado.orcamento, item.produto]);

      await message.reply(`🗑️ Item *${item.nome}* removido do orçamento.`);
    } else {
      await client.query(`
        UPDATE produtosorcamento
        SET quantidade = $1
        WHERE orcamento = $2 AND produto = $3
      `, [novaQtd, estado.orcamento, item.produto]);

      await message.reply(`✅ Quantidade do item *${item.nome}* atualizada para ${novaQtd} m².`);
    }

    await client.query('COMMIT');

    // Atualiza a lista local em memória
    const { rows: novosItens } = await client.query(`
      SELECT po.produto, p.nome, po.quantidade
        FROM produtosorcamento po
        JOIN produtos p ON p.chave = po.produto
       WHERE po.orcamento = $1
       ORDER BY po.chave
    `, [estado.orcamento]);
    estado.itens = novosItens;
    aguardandoTelefone.set(message.from, estado);

  } catch (err) {
    await client.query('ROLLBACK');
    await message.reply('❗ Erro ao atualizar o item. Tente novamente.');
    console.error('[BOT] Erro update item:', err.message);
  } finally {
    client.release();
  }

  return true;
}


module.exports = {
  handleVendaOrcamentoViaFoto,
  handleTelefoneResposta,
  atualizarOuExcluirItemDoOrcamento
};
