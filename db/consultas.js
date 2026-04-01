const { pool } = require('../services/dbService');

async function getConsultaByTermo(mensagem) {
    try {
        console.log('Mensagem recebida - ', mensagem);
       if (!mensagem || typeof mensagem !== 'string') {
            console.warn('[BOT] getConsultaByTermo - mensagem vazia ou inválida:', mensagem);
            return null;
        }

        const resultado = await pool.query(`
            SELECT * FROM jlf_whatsapp_consultas
            WHERE ativo AND termos IS NOT NULL AND termos <> ''
        `);

        const consultas = resultado.rows;

        for (const consulta of consultas) {
            const termos = consulta.termos.split(',').map(t => t.trim().toUpperCase());
            for (const termo of termos) {
                if (mensagem.toUpperCase().startsWith(termo)) {
                    return {
                        ...consulta,
                        termo_usado: termo
                    };
                }
            }
        }

        return null;
    } catch (err) {
        console.error('Erro ao buscar consultas por termo:', err);
        return null;
    }
}


module.exports = {
    getConsultaByTermo
};
