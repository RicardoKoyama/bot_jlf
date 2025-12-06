const { log } = require('../utils/logger');
const { execFile } = require('child_process');
const { pool } = require('../services/dbService');
const {
  writeTempImage,
  cleanupTemp,
  base64ToBinaryString,
  parseGS1FromBinaryString,
  parseGS1FromBinaryLinear,
  normalizeGTIN,
} = require('./utilsGS1');

const DECODER_BIN = process.env.DECODER_BIN || 'BarcodeReaderCLI';

async function handleEntregaProdutoViaFoto(message) {
  const legenda = (message.body || '').toUpperCase().trim();
  log(`[BOT] Legenda recebida: "${legenda}"`);

  if (!legenda.startsWith('ENTREGA')) return false;

  const partes = legenda.split(' ');
  const venda = parseInt(partes[1]);
  const caixas = parseInt(partes[2]);

  if (isNaN(venda) || isNaN(caixas)) {
    await message.reply('❗ Informe corretamente a venda e a quantidade de caixas. Ex: ENTREGA 888888 5');
    return true;
  }

  if (message.type !== 'image') {
    await message.reply('❗ Envie uma *imagem* com a legenda *ENTREGA <venda> <caixas>*.');
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
      execFile(DECODER_BIN, args, { timeout: 20000 }, (err, stdout) => {
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

    const gtin = normalizeGTIN(parsed.GTIN || '');
    const lote = parsed['10'] || parsed.LOTE;
/*
    if (!gtin || !lote) {
      await message.reply('⚠️ Código GS1 inválido. GTIN ou LOTE ausente.');
      return true;
    }*/

    // Busca entrega pendente
    const consulta = `
      SELECT pe.saida, pe.sequencialcto, (pe.faltaentregar/p.cp_quantidadecaixa) as caixas,
             pe.produto, pe.nomelote, p.cp_quantidadecaixa
        FROM v_frmentregaspendentes_tblpv pe 
   LEFT JOIN produtoslote p 
          ON p.produto = pe.produto AND p.chave = pe.chavelote
       WHERE pe.saida = $1 AND pe.codigobarra = $2
    `;
    const { rows } = await pool.query(consulta, [venda, gtin]);
    const entrega = rows[0];

    if (!entrega) {
      await message.reply('❗ Produto ou lote não encontrado para essa venda.');
      return true;
    }

    if (!entrega.cp_quantidadecaixa || entrega.cp_quantidadecaixa <= 0) {
      await message.reply('⚠️ Produto sem metragem por caixa cadastrada.');
      return true;
    }

    const metragem = caixas * parseFloat(entrega.cp_quantidadecaixa);

    // Realiza entrega
    await pool.query(
      `SELECT jlf_retiraexpedicaoproduto($1, $2, $3, '', $4)`,
      [entrega.saida, entrega.sequencialcto, metragem, entrega.produto]
    );

    await message.reply(
      `✅ Entrega confirmada com sucesso!\n` +
      `• Produto: ${gtin}\n` +
      `• Lote: ${entrega.nomelote || lote}\n` +
      `• Quantidade: ${caixas} caixas (${metragem.toFixed(2)} m²)`
    );

    return true;
  } catch (err) {
    log(`[ErroEntregaFoto] ${err.stack || err.message}`);
    await message.reply('❗ Erro ao processar a entrega. Tente novamente.');
    return true;
  } finally {
    if (tmp?.dir) cleanupTemp(tmp.dir);
  }
}

module.exports = {
  handleEntregaProdutoViaFoto,
};
