const express = require('express');
const router = express.Router();
const { pool } = require('../services/dbService');

router.get('/colunas/:tabela', async (req, res) => {
    const tabela = req.params.tabela;

    try {
        const result = await pool.query(
            `SELECT column_name FROM information_schema.columns 
             WHERE table_name = $1 AND table_schema = 'public' 
             ORDER BY ordinal_position`,
            [tabela]
        );

        const colunas = result.rows.map(row => row.column_name);
        res.json({ colunas });
    } catch (err) {
        console.error('Erro ao buscar colunas da tabela:', err);
        res.status(500).json({ error: 'Erro ao buscar colunas' });
    }
});

module.exports = router;