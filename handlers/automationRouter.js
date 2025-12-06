const { handleDelta } = require('../handlers/handleDelta');
const { handleFaturamento } = require('../handlers/handleFaturamento');
const { handleAjuda } = require('../handlers/handleAjuda');
const { handleFatVendedores } = require('../handlers/handleVendedores');
const { handleGenerico } = require('../handlers/handleGenerico');
const { getConsultaByTermo } = require('../db/consultas');
const { log } = require('../utils/logger');
const { handleCPI } = require('../handlers/handleProdInativo');
const { handleDecodifica } = require('../handlers/handleDecodifica');
const { handleApagarSalvaDados } = require('../handlers/handlerApagarSalvaDados');

async function processAutomation(message, accountId, client) {
    const text = message.body.trim();
    const textUpper = text.toUpperCase();
    const cleanedText = textUpper.startsWith('*')
        ? textUpper.substring(1).trim()
        : textUpper;

    // 🟠 1️⃣ Verifica se é resposta de número de telefone (aguardando orçamento)
    const { handleTelefoneResposta } = require('../handlers/orcamentoVendaHandler');
    const isPhoneHandled = await handleTelefoneResposta(message);
    const { atualizarOuExcluirItemDoOrcamento } = require('../handlers/orcamentoVendaHandler');
    const isUpdateHandled = await atualizarOuExcluirItemDoOrcamento(message);
    if (isUpdateHandled) return;
    if (isPhoneHandled) return;

    // 🟢 2️⃣ Se não for número, segue o fluxo normal de comandos
    const todasConsultas = await getConsultaByTermo(cleanedText);
    if (!todasConsultas) {
        log(`[BOT] Nenhum comando reconhecido: ${text}`);
        return;
    }

    const exigeParametro = todasConsultas.exige_parametro;
    const termosArray = String(todasConsultas.termos)
        .split(',')
        .map(t => t.trim().toUpperCase());

    const termoBuscado = cleanedText
        .replace(new RegExp(`^(${termosArray.join('|')})`, 'i'), '')
        .trim();

    if (!termoBuscado && !exigeParametro) {
        await handleAjuda(message, accountId, termoBuscado, { [accountId]: client });
        return;    
    }

    if (!termoBuscado) {
        await message.reply('❗ Informe o termo de busca após o comando.');
        return;
    }

    const handlerName = todasConsultas.handler || 'handleGenerico';

    switch (handlerName) {
      case 'handleFaturamento':
        await handleFaturamento(message, accountId, termoBuscado, { [accountId]: client });
        break;

      case 'handleFatVendedores':
        await handleFatVendedores(message, accountId, termoBuscado, { [accountId]: client });
        break;

      case 'handleDelta':
        await handleDelta(message, accountId, termoBuscado, { [accountId]: client });
        break;

      case 'handleCPI':
        await handleCPI(message, accountId, termoBuscado, { [accountId]: client });
        break;

      case 'handleApagarSalvaDados':
        await handleApagarSalvaDados(message, accountId, termoBuscado, { [accountId]: client });
        break;

      case 'handleGenerico':
      default:
        await handleGenerico(message, accountId, termoBuscado, { [accountId]: client }, todasConsultas);
        break;
    }
}


async function processAutomationImage(message, accountId, client) {
  // A legenda vira o "texto" do comando
  const caption = (message.caption || message.body || '').trim();
  const captionUpper = caption.toUpperCase();
  const cleaned = captionUpper.startsWith('*') ? captionUpper.substring(1).trim() : captionUpper;
  const {
    handleVendaOrcamentoViaFoto,
    handleTelefoneResposta
  } = require('../handlers/orcamentoVendaHandler');

  
  if (!cleaned) {
    await message.reply('🖼️ Envie a imagem com uma legenda de comando. Ex.: *cg*');
    return;
  }
  
  const consulta = await getConsultaByTermo(cleaned);
  if (!consulta) {
    await message.reply('❗ Comando não reconhecido na legenda. Tente: *cg*');
    return;
  }

  const exigeParametro = consulta.exige_parametro;
  const termosArray = String(consulta.termos).split(',').map(t => t.trim().toUpperCase());
  const termoBuscado = cleaned.replace(new RegExp(`^(${termosArray.join('|')})`, 'i'), '').trim();

  // Se exigia parâmetro e não veio
  if (exigeParametro && !termoBuscado) {
    await message.reply('❗ Informe o termo após o comando. Ex.: *cg CÓDIGO*');
    return;
  }

  const handlerName = consulta.handler || 'handleDecodifica';

  switch (handlerName) {
    case 'handleDecodifica':
      await handleDecodifica(message, accountId, termoBuscado, { [accountId]: client });
      break;

    case 'handleVendaOrcamentoViaFoto':
      await handleVendaOrcamentoViaFoto(message, accountId, { [accountId]: client });
      break;

    default:
      await handleGenerico(message, accountId, termoBuscado, { [accountId]: client }, consulta);
      break;
  }
}

module.exports = {
  processAutomation,
  processAutomationImage, // 👈 exporta
};