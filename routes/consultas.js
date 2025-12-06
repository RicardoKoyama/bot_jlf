const express = require('express');
const router = express.Router();
const { pool } = require('../services/dbService');

// Listagem
router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM jlf_whatsapp_consultas WHERE ativo ORDER BY nome');
        const consultas = resultado.rows;
        res.render('consultas/index', {
            layout: 'layouts/layout',
            title: 'Consultas WhatsApp',
            consultas
        });
    } catch (err) {
        console.error('Erro ao buscar consultas:', err);
        res.status(500).send('Erro ao carregar consultas');
    }
});

// Formulário de nova consulta
router.get('/nova', async (req, res) => {
    try {
        const tabelasRes = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename
        `);
        const tabelas = tabelasRes.rows.map(row => row.tablename);
        res.render('consultas/form', {
            title: 'Nova Consulta',
            consulta: null,
            tabelas
        });
    } catch (err) {
        console.error('Erro ao buscar tabelas:', err);
        res.status(500).send('Erro ao carregar formulário');
    }
});

// Salvando consulta
router.post('/salvar', async (req, res) => {
    const {
        id, nome, termos, tabela, condicoes_extra, handler
    } = req.body;

    const colunas = Array.isArray(req.body.colunas) ? req.body.colunas.join(',') : '';
    const colunas_like = Array.isArray(req.body.colunas_like) ? req.body.colunas_like.join(',') : '';

    const termosSanitizados = termos
        .split(',')
        .map(t => t.trim().toUpperCase())
        .filter(t => t.length > 0)
        .join(',');

    try {
        if (id) {
            await pool.query(`
                UPDATE jlf_whatsapp_consultas
                SET nome = $1, termos = $2, tabela = $3, colunas = $4, colunas_like = $5, condicoes_extra = $6, handler = $7
                WHERE id = $8
            `, [nome, termosSanitizados, tabela, colunas, colunas_like, condicoes_extra, handler, id]);
        } else {
            await pool.query(`
                INSERT INTO jlf_whatsapp_consultas 
                (nome, termos, tabela, colunas, colunas_like, condicoes_extra, handler, ativo)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            `, [nome, termosSanitizados, tabela, colunas, colunas_like, condicoes_extra, handler]);
        }

        res.redirect('/consultas');
    } catch (err) {
        console.error('Erro ao salvar consulta:', {
            body: req.body,
            error: err
        });
        res.status(500).send('Erro ao salvar consulta');
    }
});

// Edição
router.get('/editar/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM jlf_whatsapp_consultas WHERE id = $1', [req.params.id]);
        const consulta = rows[0];

        const tabelasRes = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);
        const tabelas = tabelasRes.rows.map(row => row.tablename);

        res.render('consultas/form', {
            consulta,
            tabelas,
            title: 'Editar Consulta'
        });
    } catch (err) {
        console.error('Erro ao carregar consulta para edição:', err);
        res.status(500).send('Erro ao carregar consulta');
    }
});

// Desativar
router.get('/desativar/:id', async (req, res) => {
    try {
        await pool.query('UPDATE jlf_whatsapp_consultas SET ativo = false WHERE id = $1', [req.params.id]);
        res.redirect('/consultas');
    } catch (err) {
        console.error('Erro ao desativar consulta:', err);
        res.status(500).send('Erro ao desativar consulta');
    }
});

module.exports = router;
