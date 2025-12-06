const express = require('express');
const router = express.Router();
const { pool } = require('../services/dbService'); 

router.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login',
    layout: false,
    error: req.query.error
  });
});

router.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;

  const query = 'SELECT * FROM usuarios WHERE usuario = $1 AND senhaapp = $2';
  const values = [usuario, senha];

  try {
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      req.session.user = {
        id: result.rows[0].id,
        usuario: result.rows[0].usuario
      };
      res.redirect('/accounts');
    } else {
      res.render('auth/login', { error: 'Usuário ou senha inválidos.' });
    }
  } catch (err) {
    console.error(err);
    res.render('auth/login', { error: 'Erro interno. Tente novamente.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
