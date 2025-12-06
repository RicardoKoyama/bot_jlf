const { Pool } = require('pg');
const { log } = require('../utils/logger');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING
});

const getMessageById = async (id, channel) => {
  let query;

  if (channel === 'msg_whatsapp_2') {
    query = `
      SELECT 
        vp.id,
        vp.numero,
        vp.mensagem,
        jwa.account_name as conta_whatsapp,
        vp.status,
        vp.file_path
      FROM vp_jlf_whatsapp_api vp
      left join jlf_whatsapp_accounts jwa on jwa.id = vp.jlf_whatsapp_account
      WHERE vp.id = $1
    `;
  } else if (channel === 'msg_whatsapp') {
    query = `
      SELECT 
        *
      FROM vp_jlf_whatsapp_api_2 vp
      WHERE vp.id = $1
    `;
  } else {
    throw new Error(`Canal desconhecido: ${channel}`);
  }

  const res = await pool.query(query, [id]);

  return res.rows[0];
};

const updateMessageStatus = async (id, status, whatsappMsgId, contaWhatsApp, channel) => {
  let query;

  if (channel === 'msg_whatsapp_2') {
    query = `
      UPDATE jlf_whatsapp_2
      SET 
        enviada = true,
        status = $1,
        enviado_em = NOW(),
        message_id = $2
      WHERE id = $3
    `;
  } else if (channel === 'msg_whatsapp') {
    query = `
      UPDATE jlf_whatsapp
      SET 
        enviada = true,
        status = $1,
        enviado_em = NOW(),
        message_id = $2
      WHERE chave = $3
    `;
  } else {
    throw new Error(`Canal desconhecido: ${channel}`);
  }

  await pool.query(query, [status, whatsappMsgId, id]);
  log(`Registro ${id} atualizado no banco [canal=${channel}].`);
};

module.exports = {
  getMessageById,
  updateMessageStatus,
  pool,
};
