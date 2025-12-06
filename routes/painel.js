// routes/painel.js
const express = require('express');
const router = express.Router();
const { pool } = require('../services/dbService');

router.get('/contatos-clientes', async (req, res) => {
  const { periodo } = req.query;

  // Define data inicial com base no filtro
  const hoje = new Date();
  let dataInicial = new Date();

  switch (periodo) {
    case '3m':
      dataInicial.setMonth(hoje.getMonth() - 3);
      break;
    case '6m':
      dataInicial.setMonth(hoje.getMonth() - 6);
      break;
    case '1a':
      dataInicial.setFullYear(hoje.getFullYear() - 1);
      break;
    default:
      dataInicial.setMonth(hoje.getMonth()); // Mês atual
  }

  const dataInicioStr = dataInicial.toISOString().split('T')[0];
  const dataFimStr = hoje.toISOString().split('T')[0];

  const result = await pool.query(`
    WITH vendas_periodo AS (
      SELECT 
        s.fisicajuridica AS fj_cliente,
        s.vendedori AS fj_vendedor,
        MAX(s.dataoperacao) AS ultima_venda,
        COUNT(*) AS total_vendas
      FROM saidas s
      WHERE s.dataoperacao::date BETWEEN $1 AND $2
        AND s.fisicajuridica <> 1
      GROUP BY s.fisicajuridica, s.vendedori
    ), vendedor_principal AS (
      SELECT DISTINCT ON (vp.fj_cliente) vp.fj_cliente,
        vp.fj_vendedor,
        vp.ultima_venda,
        vp.total_vendas
      FROM vendas_periodo vp
      ORDER BY vp.fj_cliente, vp.total_vendas DESC
    ), dados_finais AS (
      SELECT 
        fj.nome AS nome_cliente,
        fj.telefoneramal AS telefone_cliente,
        fj2.nomefantasia AS nome_vendedor,
        vp.total_vendas,
        vp.ultima_venda,
        hc.data AS data_ultimo_contato,
        th.descricao AS tipo_contato
      FROM vendedor_principal vp
      JOIN fisicajuridica fj ON fj.fisicajuridica = vp.fj_cliente AND fj.pessoa = 1
      JOIN fisicajuridica fj2 ON fj2.fisicajuridica = vp.fj_vendedor
      LEFT JOIN LATERAL (
        SELECT * FROM historicofj 
        WHERE fisicajuridica = vp.fj_cliente 
        ORDER BY data DESC 
        LIMIT 1
      ) hc ON true
      LEFT JOIN tipohistorico th ON th.chave = hc.tipo
    )
    SELECT * FROM dados_finais
    ORDER BY total_vendas DESC;
  `, [dataInicioStr, dataFimStr]);

  res.render('painel/contatos-clientes', {
    layout: 'layouts/layout',
    title: 'Contatos com Clientes',
    contatos: result.rows,
    periodoSelecionado: periodo || 'atual'
  });
});


module.exports = router;
