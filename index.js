require('./startupFix'); // 🔧 carrega polyfill antes de axios / undici

const express = require('express');
const path = require('path');
const accountsRouter = require('./routes/accounts');
const authRouter = require('./routes/auth');
const { ensureAuthenticated } = require('./middlewares/auth');
const { loadWhatsAppAccounts } = require('./services/accountService');
const { initializeClients } = require('./services/whatsappClient');
const { processMessage } = require('./services/messageProcessor');
const { log } = require('./utils/logger');
const { Client } = require('pg');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const consultasRouter = require('./routes/consultas');
const apiRouter = require('./routes/api');
const painelRoutes = require('./routes/painel');
require('dotenv').config();

(async () => {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(expressLayouts);
  app.set('layout', 'layouts/layout');

  app.use(express.static(path.join(__dirname, 'public')));

  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo-super-seguro',
    resave: false,
    saveUninitialized: false
  }));

  app.use('/consultas', consultasRouter);
  app.use('/api', apiRouter);
  app.use('/painel', painelRoutes);
  app.use('/', authRouter);

  // Todas as rotas /accounts passam pelo middleware de autenticação
  app.use('/accounts', ensureAuthenticated, accountsRouter);

  app.get('/', (req, res) => {
    res.redirect('/accounts');
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  // Inicializa contas WhatsApp
  const accounts = await loadWhatsAppAccounts();
  log(`Foram encontradas ${accounts.length} contas WhatsApp.`);

  await initializeClients(accounts);

  // Escuta NOTIFY do Postgres
  const pgClient = new Client({
    connectionString: process.env.PG_CONNECTION_STRING,
  });

  await pgClient.connect();

  pgClient.on('error', (err) => {
    console.error('Erro no client PG:', err);
  });

  pgClient.on('notification', async (msg) => {
    const id = parseInt(msg.payload, 10);
    log(`Recebida notificação do PG  [canal=${msg.channel}]: id=${id}`);
    await processMessage(id, msg.channel);
  });

  await pgClient.query('LISTEN msg_whatsapp');

  log('Escutando Postgres...');

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor web rodando em http://localhost:${PORT}`);
  });
})();
