const { Pool } = require('pg');
const { log } = require('../utils/logger');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do Postgres:', err);
});

const getMessageById = async (id, channel) => {
  if (channel !== 'msg_whatsapp') {
    throw new Error(`Canal desconhecido: ${channel}`);
  }

  const query = `
    SELECT 
      *
    FROM vp_jlf_whatsapp_api_2 vp
    WHERE vp.id = $1
  `;

  const res = await pool.query(query, [id]);

  return res.rows[0];
};

const updateMessageStatus = async (id, status, whatsappMsgId, contaWhatsApp, channel) => {
  if (channel !== 'msg_whatsapp') {
    throw new Error(`Canal desconhecido: ${channel}`);
  }

  const query = `
    UPDATE jlf_whatsapp
    SET 
      enviada = true,
      status = $1,
      enviado_em = NOW(),
      message_id = $2
    WHERE chave = $3
  `;

  await pool.query(query, [status, whatsappMsgId, id]);
  log(`Registro ${id} atualizado no banco [canal=${channel}].`);
};

module.exports = {
  getMessageById,
  updateMessageStatus,
  pool,
};
