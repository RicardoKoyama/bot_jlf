const { log } = require('../utils/logger');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool } = require('../services/dbService');

const DECODER_BIN = process.env.DECODER_BIN || 'BarcodeReaderCLI';
const DEBUG = (process.env.DEBUG_DECODIFICA || '0') === '1';

function normalizeGTIN(gtin) {
  if (!gtin) return gtin;
  const s = String(gtin).trim();
  // Se vier GS1 com 14 dígitos e iniciar com 0, remove apenas o primeiro 0
  if (s.length === 14 && s.startsWith('0')) return s.substring(1);
  return s;
}

// AIs suportados e comprimentos fixos (null = variável)
const AI_DEFS = {
  '01': { label: 'GTIN',        len: 14 },
  '11': { label: 'Fabricação',  len: 6  },
  '17': { label: 'Validade',    len: 6  },
  '10': { label: 'Lote',        len: null }, // variável
  '21': { label: 'Série',       len: null }, // variável
  '240':{ label: 'Tonalidade',  len: null }, // variável (AI de 3 dígitos)
  '90': { label: 'Bitola',      len: null }, // variável
};

// ordem para tentar casar AI (tente 3 dígitos antes de 2)
const AI_ORDER = ['240', '01', '11', '17', '10', '21', '90'];

function writeTempImage(media) {
  const ext = (() => {
    const mt = (media.mimetype || '').toLowerCase();
    if (mt.includes('png')) return '.png';
    if (mt.includes('jpeg') || mt.includes('jpg')) return '.jpg';
    if (mt.includes('webp')) return '.webp';
    return '.img';
  })();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whdmx-'));
  const file = path.join(dir, `img${ext}`);
  fs.writeFileSync(file, Buffer.from(media.data, 'base64'));
  return { dir, file };
}

function cleanupTemp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function base64ToBinaryString(b64) {
  // latin1 (binary) mantém bytes crus, incluindo 0x1D (GS)
  return Buffer.from(b64, 'base64').toString('latin1');
}

function bytesToHexView(str) {
  // Exibe bytes em HEX, marcando o GS (1D)
  const hex = [];
  for (let i = 0; i < str.length; i++) {
    const b = str.charCodeAt(i);
    hex.push(b === 0x1D ? '[1D]' : b.toString(16).padStart(2, '0'));
  }
  return hex.join(' ');
}

/**
 * Parser GS1 orientado a segmentos de GS (0x1D).
 * Regras:
 * - Split por GS; para cada segmento:
 *   - varrer até achar um AI válido (se tiver ruído antes, ignorar);
 *   - AIs de comprimento FIXO consomem os N próximos caracteres;
 *   - AIs de comprimento VARIÁVEL consomem ATÉ O FIM DO SEGMENTO.
 */
function parseGS1FromBinaryString(binStr) {
  const GS = String.fromCharCode(0x1D);
  const segments = binStr.split(GS);
  const out = {};

  if (DEBUG) {
    log(`[Decodifica][DBG] Segments (${segments.length}):`);
    segments.forEach((s, idx) => {
      log(`[Decodifica][DBG]  [${idx}] HEX: ${bytesToHexView(s)}`);
      log(`[Decodifica][DBG]  [${idx}] TXT: "${s}"`);
    });
  }

  for (const seg of segments) {
    let i = 0;
    while (i < seg.length) {
      // procurar AI começando em i; se não achar, avança 1
      let foundAI = null;
      for (const ai of AI_ORDER) {
        if (seg.startsWith(ai, i)) { foundAI = ai; break; }
      }
      if (!foundAI) { i += 1; continue; }

      const def = AI_DEFS[foundAI];
      const start = i;
      i += foundAI.length;

      if (def.len != null) {
        if (i + def.len > seg.length) {
          if (DEBUG) log(`[Decodifica][DBG]  AI ${foundAI} (${def.label}) FIXO abortado (falta dado)`);
          break;
        }
        const value = seg.substring(i, i + def.len);
        i += def.len;
        if (!out[def.label]) out[def.label] = value;
        if (DEBUG) log(`[Decodifica][DBG]  AI ${foundAI} (${def.label}) FIXO -> "${value}" [pos ${start}-${i-1}]`);
      } else {
        // variável: consome ATÉ O FIM DO SEGMENTO
        const value = seg.substring(i);
        i = seg.length;
        if (!out[def.label]) out[def.label] = value;
        if (DEBUG) log(`[Decodifica][DBG]  AI ${foundAI} (${def.label}) VAR -> "${value}" [pos ${start}-${seg.length-1}]`);
      }
    }
  }
  return out;
}

/**
 * Fallback linear (sem GS). Útil se só vier texto sem FNC1.
 * Heurístico: pode errar se aparecer "01" dentro de valores, mas ajuda quando só há TEXT.
 */
function parseGS1FromBinaryLinear(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    let foundAI = null;
    for (const ai of AI_ORDER) {
      if (s.startsWith(ai, i)) { foundAI = ai; break; }
    }
    if (!foundAI) break;

    const def = AI_DEFS[foundAI];
    i += foundAI.length;

    if (def.len != null) {
      if (i + def.len > s.length) break;
      const value = s.substring(i, i + def.len);
      i += def.len;
      if (!out[def.label]) out[def.label] = value;
      if (DEBUG) log(`[Decodifica][DBG]  [LIN] AI ${foundAI} (${def.label}) FIXO -> "${value}"`);
    } else {
      // tenta achar próximo AI; senão, consome até o fim
      let nextPos = s.length;
      for (const ai of AI_ORDER) {
        const pos = s.indexOf(ai, i);
        if (pos !== -1 && pos < nextPos) nextPos = pos;
      }
      const value = s.substring(i, nextPos);
      i = nextPos;
      if (!out[def.label]) out[def.label] = value;
      if (DEBUG) log(`[Decodifica][DBG]  [LIN] AI ${foundAI} (${def.label}) VAR -> "${value}"`);
    }
  }
  return out;
}

function formatParsed(p) {
  if (!p || Object.keys(p).length === 0) return '⚠️ Nenhum dado GS1 reconhecido.';
  const o = [];
  // se preferir exibir o GTIN já normalizado, use normalizeGTIN(p.GTIN) aqui:
  if (p.GTIN)          o.push(`• GTIN: ${p.GTIN}`);
  if (p['Fabricação']) o.push(`• Data Fabricação: ${p['Fabricação']}`);
  if (p.Validade)      o.push(`• Validade: ${p.Validade}`);
  if (p.Lote)          o.push(`• Lote: ${p.Lote}`);
  if (p.Tonalidade)    o.push(`• Tonalidade: ${p.Tonalidade}`);
  if (p.Bitola)        o.push(`• Bitola: ${p.Bitola}`);
  if (p.Série)         o.push(`• Série: ${p.Série}`);
  return o.join('\n');
}

async function respondWithStockInfo(message, parsed) {
  const gtinRaw = parsed.GTIN || '';
  const loteRaw = (parsed.Lote || '').trim();

  const gtin = normalizeGTIN(gtinRaw);

  if (!gtin) {
    await message.reply('⚠️ GTIN não identificado no código.');
    return;
  }

  // 1) Produto por GTIN
  const qProduto = `
    SELECT chave, referenciafabrica, nome
    FROM v_frmprodutos_tblprodutos
    WHERE codigobarra = $1
    LIMIT 1
  `;
  const { rows: prodRows } = await pool.query(qProduto, [gtin]);

  if (prodRows.length === 0) {
    await message.reply('❗ *PRODUTO NÃO CADASTRADO*');
    return;
  }

  const produto = prodRows[0];
  const produtoChave = produto.chave;
  const produtoRef = produto.referenciafabrica || '';
  const produtoNome = produto.nome || '';

  // Sem lote no GS1 → apenas info do produto
  if (!loteRaw) {
    await message.reply(
      `🔎 Produto encontrado:\n• Chave: ${produtoChave}\n• Ref.: ${produtoRef}\n• Nome: ${produtoNome}\n\n*Sem AI (10) Lote no código.*`
    );
    return;
  }

  // 2) Lote específico
  const qLote = `
    SELECT lote, (entradas - saidas) AS estoque
    FROM v_frmprodutos_tblprodutoslote
    WHERE produto = $1
      AND lote ILIKE $2
    ORDER BY lote
    LIMIT 1
  `;
  const { rows: loteRows } = await pool.query(qLote, [produtoChave, loteRaw]);

  if (loteRows.length === 0) {
    // 3) Listar lotes existentes + instruções via reply
    const qTodosLotes = `
    SELECT lote, (entradas - saidas) AS estoque
    FROM v_frmprodutos_tblprodutoslote
    WHERE produto = $1
    ORDER BY lote
    LIMIT 50
    `;
    const { rows: lotesAll } = await pool.query(qTodosLotes, [produtoChave]);

    const lista = lotesAll.length
    ? lotesAll.map(r => `• ${r.lote} — Estoque: ${Number(r.estoque || 0)}`).join('\n')
    : 'Nenhum lote registrado para este produto.';

    // TAG “máquina-legível” — NÃO REMOVA a primeira linha; ela carrega os parâmetros
    const tag = `[#LCHK PROD=${produtoChave} GTIN=${gtin} LOTE=${loteRaw}]`;

    await message.reply(
    `${tag}\n` +
    `❗ *LOTE NÃO CADASTRADO*\n` +
    `Produto: ${produtoChave} — ${produtoNome}\n` +
    ` Ref Fábrica: - ${produtoRef}\n` +
    `GTIN/EAN: ${gtin}\n` +
    `Lote lido: ${loteRaw}\n\n` +
    `Lotes existentes:\n${lista}\n\n` +
    `Responda esta mensagem (reply) com:\n` +
    `*1* — Criar novo lote com o nome *${loteRaw}*\n` +
    `*2* — Relacionar com lote existente (vou pedir o nome)\n`
    );
    return;

  }

  const lote = loteRows[0];
  const estoque = Number(lote.estoque || 0);

  await message.reply(
    `✅ Produto ${produtoChave}\n` +
    `✅ Lote ${lote.lote}\n` + 
    `✅ *Estoque disponível*: ${estoque}\n` + 
    `Para Consultar o Estoque na Fábrica *DIGITE: CD ${produtoRef}*\n`
  );
}

async function handleDecodifica(message, accountId, termoBuscado, whatsappClients) {
  const client = whatsappClients[accountId];
  if (!client) {
    await message.reply('❗ Erro interno: cliente WhatsApp não localizado.');
    return;
  }
  if (message.type !== 'image') {
    await message.reply('Envie uma *imagem* com a legenda *cg* para decodificar.');
    return;
  }

  let tmp;
  try {
    const media = await message.downloadMedia();
    if (!media) {
      await message.reply('❗ Não consegui baixar a imagem. Tente novamente.');
      return;
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

    if (DEBUG) {
      log(`[Decodifica][DBG] BIN: ${DECODER_BIN}`);
      log(`[Decodifica][DBG] ARGS: ${JSON.stringify(args)}`);
      log(`[Decodifica][DBG] TMP: ${tmp.file}`);
    }

    const rawJson = await new Promise((resolve, reject) => {
      execFile(DECODER_BIN, args, { timeout: 20000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`Decoder falhou: ${err.message} / ${stderr || ''}`));
        resolve(String(stdout || '').trim());
      });
    });

    if (DEBUG) {
      const preview = rawJson.length > 1200 ? rawJson.slice(0, 1200) + '... [trunc]' : rawJson;
      log(`[Decodifica][DBG] JSON: ${preview}`);
    }

    const payload = JSON.parse(rawJson);
    const bar = payload?.sessions?.[0]?.barcodes?.[0];

    const text = bar?.text ? String(bar.text) : null;

    log('[Decodifica] Código lido:', text || '[sem texto]');
    const dataB64 = bar?.data ? String(bar.data) : null;

    // 🔹 Desvio: se QRCode contém link da Delta → encaminhar para handler Delta
    if (text && text.includes('deltaporcelanatonova.com.br')) {
      const { handleDelta } = require('./handleDelta');
      await message.reply('🔎 Código Delta detectado. Consultando referência...');
      await handleDelta(message, accountId, text, whatsappClients);
      return; // interrompe fluxo normal de decodificação GS1
    }

    if (DEBUG) {
      if (text) log(`[Decodifica][DBG] TEXT: "${text}"`);
      if (dataB64) {
        log(`[Decodifica][DBG] DATA.b64.len=${dataB64.length}`);
        const bin = base64ToBinaryString(dataB64);
        log(`[Decodifica][DBG] DATA.hex: ${bytesToHexView(bin)}`);
      }
    }

    let parsed = {};
    if (dataB64) {
      const bin = base64ToBinaryString(dataB64);
      parsed = parseGS1FromBinaryString(bin);
    } else if (text) {
      const cleaned = text.replaceAll('{GS}', '').replaceAll(String.fromCharCode(0x1D), '');
      parsed = parseGS1FromBinaryLinear(cleaned);
    } else {
      await message.reply('⚠️ Decoder não retornou conteúdo legível (text/data).');
      return;
    }

    // (opcional) enviar o resumo decodificado
    const msg = formatParsed(parsed);
    await message.reply(`✅ Decodificação:\n${msg}`);

    // Depois, consulta banco e responde conforme regras
    try {
      await respondWithStockInfo(message, parsed);
    } catch (dbErr) {
      log(`[Decodifica][DB] Erro consulta: ${dbErr.message}`);
      await message.reply('❗ Ocorreu um erro ao consultar o banco de dados.');
    }

    if (DEBUG) log(`[Decodifica][DBG] PARSED: ${JSON.stringify(parsed)}`);
  } catch (e) {
    log(`[Decodifica] Erro: ${e.stack || e.message}`);
    await message.reply('❗ Erro ao decodificar a imagem (CLI).');
  } finally {
    if (tmp?.dir) cleanupTemp(tmp.dir);
  }
}
// estado curto do passo 2 (usuario respondeu "2" e estamos aguardando o nome do lote existente)
const lotRelateState = new Map(); // key = message.from -> { produtoChave, novoLote }

function parseTagFromQuoted(body) {
  // [#LCHK PROD=123 GTIN=789... LOTE=ABC123]
  const m = body.match(/\[#LCHK\s+PROD=(\S+)\s+GTIN=(\S+)\s+LOTE=(\S+)\]/i);
  if (!m) return null;
  return { produtoChave: m[1], gtin: m[2], lote: m[3] };
}

async function handleLoteQuickReply(message) {
  const cmd = String(message.body || '').trim();

  // 1) PRIMEIRO: se há estado pendente (passo 2), processa independente do quoted
  const st = lotRelateState.get(message.from);
  if (st) {
    // usuário enviou o nome do lote existente
    const loteDigitado = cmd;
    if (!loteDigitado) {
      await message.reply('❗ Informe o *nome do lote existente* exatamente como aparece na lista.');
      return true;
    }

    // Busca o valor EXATO salvo no banco (tolerante a case/espacos via ILIKE)
    const qFindExact = `
      SELECT lote
        FROM produtoslote
       WHERE produto = $1
         AND lote ILIKE $2
       ORDER BY lote
       LIMIT 1
    `;
    const { rows: found } = await pool.query(qFindExact, [st.produtoChave, loteDigitado]);
    if (found.length === 0) {
      await message.reply('❗ Lote não encontrado. Envie o nome exatamente como aparece na lista.');
      return true;
    }
    const loteAtualExato = found[0].lote;

    const novoNome = String(st.novoLote || '').trim();
    if (!novoNome) {
      lotRelateState.delete(message.from);
      await message.reply('❗ Novo nome de lote inválido.');
      return true;
    }

    // Evita colisão: já existe novo nome?
    const qCheckDup = `
      SELECT 1
        FROM produtoslote
       WHERE produto = $1
         AND lote = $2
       LIMIT 1
    `;
    const { rows: dup } = await pool.query(qCheckDup, [st.produtoChave, novoNome]);
    if (dup.length > 0) {
      await message.reply(`⚠️ Já existe um lote "${novoNome}" para este produto. Escolha outro nome ou crie um novo lote.`);
      return true;
    }

    const qUpdate = `
      UPDATE produtoslote
         SET lote = $2
       WHERE produto = $1
         AND lote = $3
    `;
    const { rowCount } = await pool.query(qUpdate, [st.produtoChave, novoNome, loteAtualExato]);

    if (rowCount === 0) {
      await message.reply('❗ Nenhuma linha atualizada. Tente novamente informando o nome exato do lote existente.');
      return true;
    }

    lotRelateState.delete(message.from);
    await message.reply(`✅ Lote relacionado: *${loteAtualExato}* → *${novoNome}* (produto ${st.produtoChave}).`);
    return true;
  }

  // 2) Se não há estado, então é o PRIMEIRO passo: precisa ser reply da #LCHK
  if (!message.hasQuotedMsg) return false;
  const quoted = await message.getQuotedMessage();
  const quotedBody = quoted?.body || '';
  if (!quotedBody.includes('[#LCHK')) return false;

  const meta = parseTagFromQuoted(quotedBody);
  if (!meta) return false;

  // Opção 1 — Criar lote agora
  if (cmd === '1') {
    const qInsert = `
      INSERT INTO produtoslote (produto, lote, dh, "local")
      VALUES ($1, $2, NOW(), 9)
      ON CONFLICT DO NOTHING
    `;
    await pool.query(qInsert, [meta.produtoChave, meta.lote]);
    await message.reply(`✅ Lote *${meta.lote}* criado para o produto *${meta.produtoChave}* (GTIN ${meta.gtin}).`);
    return true;
  }

  // Opção 2 — Guardar estado e pedir o nome do lote existente
  if (cmd === '2') {
    lotRelateState.set(message.from, {
      produtoChave: meta.produtoChave,
      novoLote: meta.lote, // nome que veio do DataMatrix
    });
    await message.reply('✍️ Envie o *nome do lote existente* (exatamente como aparece na lista).');
    return true;
  }

  // Não é 1/2 → não trate aqui
  return false;
}



module.exports = { 
    handleDecodifica ,
    handleLoteQuickReply
};
