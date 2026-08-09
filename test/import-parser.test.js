'use strict';

const assert = require('assert');
const {
    MAX_IMPORT_TRANSACTIONS,
    buildImportRuleSuggestion,
    decodeStatementBytes,
    formatImportPreview,
    parseStatement,
    planImportPreview,
} = require('../src/import-parser');

function test(name, fn) { fn(); console.log(`ok - ${name}`); }

const ofx1 = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260730120000[-3:BRT]<TRNAMT>-42.50<FITID>fit-1<NAME>Mercado Central<MEMO>Compra</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const ofx2 = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260729</DTPOSTED><TRNAMT>100.00</TRNAMT><FITID>fit-2</FITID><NAME>Salario</NAME></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

test('parses synthetic OFX 1 SGML and OFX 2 XML with FITID', () => {
    const first = parseStatement(ofx1);
    const second = parseStatement(ofx2);
    assert.strictEqual(first.format, 'ofx');
    assert.strictEqual(first.transactions[0].external_id, 'fit-1');
    assert.strictEqual(first.transactions[0].signed_amount, -42.5);
    assert.strictEqual(second.transactions[0].external_id, 'fit-2');
    assert.strictEqual(second.transactions[0].signed_amount, 100);
});

test('parses CSV delimiters, aliases, Brazilian and dot-decimal values', () => {
    const semicolon = parseStatement('\uFEFFData;Descrição;Débito;Crédito\n30/07/2026;Mercado;1.234,56;\n2026-07-31;Salário;;2000.00');
    const comma = parseStatement('date,description,amount\n2026-07-30,Taxi,-12.34');
    const tab = parseStatement('data\thistorico\tvalor\n30/07/2026\tPadaria\t-10,50');
    assert.deepStrictEqual(semicolon.transactions.map(row => row.signed_amount), [-1234.56, 2000]);
    assert.strictEqual(comma.transactions[0].signed_amount, -12.34);
    assert.strictEqual(tab.transactions[0].signed_amount, -10.5);
});

test('decodes Windows-1252 CSV without storing raw content', () => {
    const bytes = Buffer.from('Data;Descri\xe7\xe3o;Valor\n30/07/2026;Farm\xe1cia;-12,50', 'latin1');
    const parsed = parseStatement(decodeStatementBytes(bytes));
    assert.strictEqual(parsed.transactions[0].description, 'Farmácia');
    assert.strictEqual(parsed.transactions[0].signed_amount, -12.5);
});

test('decodes UTF-8 deterministically when Apps Script has no TextDecoder', () => {
    const originalTextDecoder = global.TextDecoder;
    try {
        global.TextDecoder = undefined;
        const bytes = Buffer.from('Data;Descri\u00e7\u00e3o;Valor\n30/07/2026;Caf\u00e9;-12,50', 'utf8');
        const parsed = parseStatement(decodeStatementBytes(bytes));
        assert.strictEqual(parsed.transactions[0].description, 'Caf\u00e9');
        assert.strictEqual(parsed.transactions[0].signed_amount, -12.5);
    } finally {
        global.TextDecoder = originalTextDecoder;
    }
});

test('caps each statement at 200 processable transactions', () => {
    const csv = ['data;descricao;valor'].concat(Array.from({ length: 205 }, (_, index) => `2026-07-30;item ${index};-1,00`)).join('\n');
    const parsed = parseStatement(csv);
    assert.strictEqual(parsed.transactions.length, MAX_IMPORT_TRANSACTIONS);
    assert.strictEqual(parsed.truncated, true);
    assert.strictEqual(parsed.total_found, 205);
});

test('only a reviewed deterministic rule enters the safe batch', () => {
    const parsed = parseStatement(ofx1);
    const rule = { assinatura_descricao: 'mercado central', tipo_evento: 'despesa', id_categoria: 'OPEX_MERCADO', status_revisao: 'revisado', ativo: true };
    const preview = planImportPreview({ transactions: parsed.transactions, fileUniqueId: 'file-1', originId: 'source-1', rules: [rule] });
    assert.strictEqual(preview.counts.included, 1);
    assert.strictEqual(preview.included[0].import_key, 'file-1|fit-1');
    const suggested = buildImportRuleSuggestion(parsed.transactions[0], { id_categoria: 'OPEX_MERCADO' });
    assert.strictEqual(suggested.auto_include, false);
    assert.strictEqual(suggested.status_revisao, 'sugerido');
});

test('classifies reupload, manual duplicate, closed period, ambiguous and transfer outside safe batch', () => {
    const base = parseStatement(ofx1).transactions[0];
    const input = { transactions: [base], fileUniqueId: 'file-1', originId: 'source-1', rules: [{ assinatura_descricao: 'mercado', tipo_evento: 'despesa', status_revisao: 'revisado', ativo: true }] };
    assert.strictEqual(planImportPreview({ ...input, existingImportKeys: ['file-1|fit-1'] }).counts.duplicates, 1);
    assert.strictEqual(planImportPreview({ ...input, manualLaunches: [{ data: base.date, valor: base.amount, descricao: base.description }] }).counts.possible_duplicate, 1);
    assert.strictEqual(planImportPreview({ ...input, closedCompetencies: ['2026-07'] }).counts.blocked, 1);
    assert.strictEqual(planImportPreview({ ...input, transactions: [{ ...base, ambiguous: true }] }).counts.ambiguous, 1);
    assert.strictEqual(planImportPreview({ ...input, transactions: [{ ...base, transaction_type: 'xfer' }] }).counts.unsupported, 1);
});

test('group preview contains totals only while private preview shows at most ten sanitized descriptions', () => {
    const transaction = parseStatement(ofx1).transactions[0];
    const preview = { counts: { included: 1, duplicates: 0, possible_duplicate: 0, ambiguous: 0, blocked: 0, unsupported: 0 }, included: [{ ...transaction, description: 'Conta 123456789 Mercado' }] };
    assert.doesNotMatch(formatImportPreview(preview, { groupChat: true }), /Mercado/);
    const privateText = formatImportPreview(preview, { groupChat: false });
    assert.match(privateText, /\[numero\] Mercado/);
    assert.doesNotMatch(privateText, /123456789/);
});

module.exports = Promise.resolve();
