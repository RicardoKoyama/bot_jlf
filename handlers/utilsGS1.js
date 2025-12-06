const fs = require('fs');
const os = require('os');
const path = require('path');

// AIs suportados e comprimentos fixos (null = variável)
const AI_DEFS = {
  '01': { label: 'GTIN',        len: 14 },
  '11': { label: 'Fabricação',  len: 6  },
  '17': { label: 'Validade',    len: 6  },
  '10': { label: 'Lote',        len: null },
  '21': { label: 'Série',       len: null },
  '240':{ label: 'Tonalidade',  len: null },
  '90': { label: 'Bitola',      len: null },
};

// ordem de tentativa (3 dígitos primeiro)
const AI_ORDER = ['240', '01', '11', '17', '10', '21', '90'];

/**
 * Remove zeros à esquerda do GTIN, se aplicável.
 */
function normalizeGTIN(gtin) {
  if (!gtin) return gtin;
  const s = String(gtin).trim();
  if (s.length === 14 && s.startsWith('0')) return s.substring(1);
  return s;
}

/**
 * Salva imagem temporária no disco.
 */
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

/**
 * Remove arquivos temporários.
 */
function cleanupTemp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * Decodifica base64 para string binária crua.
 */
function base64ToBinaryString(b64) {
  return Buffer.from(b64, 'base64').toString('latin1');
}

/**
 * Interpreta GS1 a partir de string binária com separadores 0x1D.
 */
function parseGS1FromBinaryString(binStr) {
  const GS = String.fromCharCode(0x1D);
  const segments = binStr.split(GS);
  const out = {};

  for (const seg of segments) {
    let i = 0;
    while (i < seg.length) {
      let foundAI = null;
      for (const ai of AI_ORDER) {
        if (seg.startsWith(ai, i)) { foundAI = ai; break; }
      }
      if (!foundAI) { i += 1; continue; }

      const def = AI_DEFS[foundAI];
      i += foundAI.length;

      if (def.len != null) {
        if (i + def.len > seg.length) break;
        const value = seg.substring(i, i + def.len);
        i += def.len;
        if (!out[def.label]) out[def.label] = value;
      } else {
        const value = seg.substring(i);
        i = seg.length;
        if (!out[def.label]) out[def.label] = value;
      }
    }
  }
  return out;
}

/**
 * Fallback: tenta parse linear se não houver separador GS.
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
    } else {
      let nextPos = s.length;
      for (const ai of AI_ORDER) {
        const pos = s.indexOf(ai, i);
        if (pos !== -1 && pos < nextPos) nextPos = pos;
      }
      const value = s.substring(i, nextPos);
      i = nextPos;
      if (!out[def.label]) out[def.label] = value;
    }
  }
  return out;
}

module.exports = {
  writeTempImage,
  cleanupTemp,
  base64ToBinaryString,
  parseGS1FromBinaryString,
  parseGS1FromBinaryLinear,
  normalizeGTIN,
};
