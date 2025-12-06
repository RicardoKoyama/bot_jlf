const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");
require("dotenv").config();

if (typeof global.File === 'undefined') global.File = class File {};

const BASE_URL = process.env.EMBRAMACO_URL;
const USER = process.env.EMBRAMACO_USER;
const PASS = process.env.EMBRAMACO_PASS;
const CIA = process.env.EMBRAMACO_CIA;

const jar = new CookieJar();
let client;
let SESSION_ID = null;

async function ensureClient() {
  if (!client) {
    const { wrapper } = await import("axios-cookiejar-support");
    client = wrapper(axios.create({ jar, withCredentials: true }));
  }
  return client;
}

async function login() {
  const http = await ensureClient();

  const data = new URLSearchParams({
    form_user_id: USER,
    form_password: PASS,
    sistema: "CLI",
    id_cia: CIA,
  });

  const res = await http.post(`${BASE_URL}/login.php`, data.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    maxRedirects: 0,
    validateStatus: (s) => s < 400 || s === 302,
  });

  // Tenta capturar session_id do cookie, não da URL
  const setCookie = res.headers["set-cookie"] || [];
  const cookieStr = setCookie.join("; ");
  const match = cookieStr.match(/session_id=([^;]+)/);

  if (!match) {
    throw new Error("Não foi possível capturar o session_id da Embramaco (via cookie).");
  }

  SESSION_ID = match[1];
}


/**
 * Consulta de estoque por referência (similar ao Incopisos)
 */
async function consultaEstoqueEmbramaco(ref) {
  if (!SESSION_ID) await login();

  const http = await ensureClient();

  // Pré-aquecimento
  const warmUrl = `${BASE_URL}/relatorios/format_rel.php?id_cia=${CIA}&nome_rel=rel_estoque.php&mostra=Estoque&opcoes=4&ped_aux=0&session_id=${SESSION_ID}`;
  await http.get(warmUrl);

  const params = new URLSearchParams({
    id_cia: CIA,
    StatusRel: "1",
    ref_produto: ref,
  });

  const res = await http.post(`${BASE_URL}/relatorios/rel_estoque.php`, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Origin": BASE_URL,
      "Referer": warmUrl,
    },
  });

  const html = res.data.toString();
  const $ = cheerio.load(html);

  // Localiza tabela principal
  const tabela = $("table").filter((i, el) => $(el).find("th:contains('Produto')").length > 0).first();
  const linhas = tabela.find("tr").slice(1); // ignora header

  const resultados = [];
  linhas.each((i, el) => {
    const cols = $(el).find("td");
    if (cols.length >= 6) {
      const codigo = $(cols[0]).text().trim();
      const produto = $(cols[1]).text().trim();
      const tonalidade = $(cols[3]).text().trim();
      const lote = $(cols[4]).text().trim();
      const saldo = $(cols[5]).text().trim();

      if (codigo && produto && lote) {
        resultados.push({ codigo, produto, tonalidade, lote, saldo });
      }
    }
  });

  if (!resultados.length) return null;

  const cabecalho = `🏗️ Estoque Embramaco – Produto ${resultados[0].produto}`;
  const linhasFmt = resultados
    .map(
      (r) =>
        `* Lote: ${r.lote} - Estoque Disponível ${r.saldo} m²`
    )
    .join("\n");

  return `${cabecalho}\n\n${linhasFmt}`;
}


module.exports = { consultaEstoqueEmbramaco };
