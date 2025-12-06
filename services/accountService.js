const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING
});

async function loadWhatsAppAccounts() {
  try {
    const res = await pool.query(`
      SELECT *
      FROM jlf_whatsapp_accounts
      WHERE is_active = true
    `);
    return res.rows;
  } catch (error) {
    console.error('Erro ao carregar contas do banco:', error);
    return [];
  }
}

async function updateAccountStatus(accountId, status, details = '') {
  try {
    await pool.query(
      'UPDATE jlf_whatsapp_accounts SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, accountId]
    );

    await pool.query(
      'INSERT INTO jlf_whatsapp_account_status_history (account_id, status, details) VALUES ($1, $2, $3)',
      [accountId, status, details]
    );

  } catch (error) {
    console.error('Erro ao atualizar status da conta:', error);
  }
}

module.exports = {
  loadWhatsAppAccounts,
  updateAccountStatus,
  pool
};
