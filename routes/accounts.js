const express = require('express');
const router = express.Router();
const { getAllClients, getClient, createAndStartClient } = require('../services/whatsappClient');
const { loadWhatsAppAccounts } = require('../services/accountService');
const { pool } = require('../services/dbService');
const { ensureAuthenticated } = require('../middlewares/auth');
const { qrCodes } = require('../services/whatsappClient');

// Atualiza QR codes no serviço WhatsApp
const { clients } = require('../services/whatsappClient');
Object.values(clients || {}).forEach(client => {
  client.on('qr', (qr) => {
    const accountName = client.options.sessionName;
    qrCodes[accountName] = qr;
  });
});

router.get('/', async (req, res) => {
  const accounts = await loadWhatsAppAccounts();
  const clients = getAllClients();

  const data = accounts.map(acc => ({
    id: acc.id,
    name: acc.account_name,
    status: acc.status,
    phone_number: acc.phone_number,
    isReady: clients[acc.account_name]?.info ? true : false,
  }));

  res.render('contas', {
    title: 'Contas WhatsApp',
    accounts: data
  });
});

// Tela com informações da conta - 16/07/2025
router.get('/:accountName/info', ensureAuthenticated, async (req, res) => {
  const accountName = req.params.accountName;

  const result = await pool.query('SELECT * FROM jlf_whatsapp_accounts WHERE account_name = $1', [accountName]);
  const account = result.rows[0];

  const qr = qrCodes[accountName] || null;

  res.render('account-info', {
    title: `Info - ${accountName}`,
    account,
    qrCode: qr
  });
});

// Desativar uma conta - 16/07/2025
router.post('/:accountName/desativar', ensureAuthenticated, async (req, res) => {
  const { accountName } = req.params;

  try {
    await pool.query('UPDATE jlf_whatsapp_accounts SET is_active = false WHERE account_name = $1', [accountName]);
    res.redirect('/accounts');
  } catch (err) {
    console.error('Erro ao desativar conta:', err);
    res.status(500).send('Erro ao desativar conta.');
  }
});

// Incluir uma conta de whatsapp - 16/07/2025
router.get('/nova', ensureAuthenticated, (req, res) => {
  res.render('nova-conta', { title: 'Nova Conta' });
});
router.post('/nova', ensureAuthenticated, async (req, res) => {
  const { account_name, phone_number } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO jlf_whatsapp_accounts (account_name, phone_number, is_active, status)
      VALUES ($1, $2, true, 'pendente')
      RETURNING *
    `, [account_name, phone_number]);

    const novaConta = result.rows[0];

    await createAndStartClient(novaConta); // Inicia o client após salvar no banco

    res.redirect('/accounts');
  } catch (err) {
    console.error('Erro ao criar nova conta:', err);
    res.status(500).send('Erro ao criar nova conta.');
  }
});

router.get('/:accountName/qrcode', (req, res) => {
  const accountName = req.params.accountName;
  const qr = qrCodes[accountName];
  if (qr) {
    res.json({ qr });
  } else {
    res.status(404).json({ error: 'No QR code available' });
  }
});

router.post('/:accountName/restart', (req, res) => {
  const accountName = req.params.accountName;
  const client = getClient(accountName);

  if (client) {
    client.destroy().then(() => {
      client.initialize();
      res.json({ success: true });
    });
  } else {
    res.status(404).json({ error: 'Client not found' });
  }
});

module.exports = router;
