'use strict';

const { SHEETS } = require('./schema');
const { getCanonicalSeed } = require('./seed');

function activeRows(rows) {
    return (rows || []).filter((row) => row.ativo === true);
}

function pick(row, fields) {
    return fields.reduce((result, field) => {
        if (row[field] !== undefined) result[field] = row[field];
        return result;
    }, {});
}

function buildParserContext(seed) {
    const source = seed || getCanonicalSeed();

    return {
        categories: activeRows(source[SHEETS.CONFIG_CATEGORIAS]).map((row) =>
            pick(row, [
                'id_categoria',
                'nome',
                'grupo',
                'tipo_evento_padrao',
                'classe_dre',
                'escopo_padrao',
                'afeta_dre_padrao',
                'afeta_patrimonio_padrao',
                'afeta_caixa_familiar_padrao',
                'visibilidade_padrao',
            ])
        ),
        sources: activeRows(source[SHEETS.CONFIG_FONTES]).map((row) =>
            pick(row, ['id_fonte', 'nome', 'tipo', 'titular', 'moeda'])
        ),
        cards: activeRows(source[SHEETS.CARTOES]).map((row) =>
            pick(row, ['id_cartao', 'id_fonte', 'nome', 'titular', 'fechamento_dia', 'vencimento_dia'])
        ),
    };
}

module.exports = {
    buildParserContext,
};
