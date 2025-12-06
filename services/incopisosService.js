const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const fs = require("fs");
const cheerio = require("cheerio");
require("dotenv").config();

if (typeof global.File === 'undefined') global.File = class File {};

const BASE_URL = process.env.INCOPISOS_URL;
const USER = process.env.INCOPISOS_USER;
const PASS = process.env.INCOPISOS_PASS;
const CIA = process.env.INCOPISOS_CIA;

const jar = new CookieJar();
let client;
let SSID = null;

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
  const match = (res.headers["location"] || "").match(/ssid=([^&]+)/);
  if (!match) throw new Error("Não foi possível capturar o SSID");
  SSID = match[1];
}

async function consultaEstoquePorRef(ref) {
  if (!SSID) await login();

  const http = await ensureClient();

  // Pré-aquecimento da página format_rel.php
  const warmUrl = `${BASE_URL}/relatorios/format_rel.php?nome_rel=rel_estoque.php&mostra=Estoque&opcoes=4&ssid=${SSID}`;
  await http.get(warmUrl);

  const hojeBR = new Date().toLocaleDateString("pt-BR");
  const params = new URLSearchParams({
    hoje: hojeBR,
    ref: "A",
    tamanho: "Todos",
    id_cia_marca: "0",
    pesq_prd: String(ref),
    continuar: "Gerar Relatório",
    ssid: SSID,
  });

  const referer = warmUrl;
  const res = await http.post(
    `${BASE_URL}/relatorios/rel_estoque.php`,
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": referer,
      },
    }
  );

  // --- 🔍 Análise do HTML ---
  const html = res.data;
  const $ = cheerio.load(html);
  const tabelas = $("table");
  console.log(`🔎 Encontradas ${tabelas.length} tabelas no HTML.`);

  // tenta achar uma tabela com colunas de produto
  let tabela = null;
  tabelas.each((i, tbl) => {
    const texto = $(tbl).text().replace(/\s+/g, " ");
    if (texto.includes("Código") && texto.includes("Produto")) {
      tabela = $(tbl);
    }
  });

  const resultados = [];

  if (tabela) {
    const linhas = tabela.find("tr");
    linhas.each((i, el) => {
      const cols = $(el).find("td");
      if (cols.length === 7) {
        const codigo = $(cols[0]).text().trim();
        const produto = $(cols[1]).text().trim();
        const bitola = $(cols[3]).text().trim();
        const tonalidade = $(cols[4]).text().trim();
        const lote = $(cols[5]).text().trim();
        const saldo = $(cols[6]).text().trim();
        resultados.push({ codigo, produto, lote, bitola, tonalidade, saldo });
      }
    });
  }

  // --- 🧾 Caso sem resultados: salva o HTML para debug ---
  if (!resultados.length) {
    const filePath = "/home/ubuntu/apis/whatsapp-bot/saida_incopisos_debug.html";
    fs.writeFileSync(filePath, html, "utf8");
    console.warn(
      `⚠️ Nenhum dado de estoque encontrado para ref ${ref}. HTML salvo em: ${filePath}`
    );
    return null;
  }

  // --- Formatação da resposta ---
  const cabecalho = `🏗️ Estoque IncoPisos – Produto ${resultados[0].produto}`;
  const linhasFmt = resultados
    .map(
      (r) =>
        `• Lote: ${r.lote} - Bitola: ${r.bitola} - Tonalidade: ${r.tonalidade}\n  Estoque Disponível ${r.saldo} m²`
    )
    .join("\n");

  return `${cabecalho}\n\n${linhasFmt}`;
}

module.exports = { consultaEstoquePorRef };