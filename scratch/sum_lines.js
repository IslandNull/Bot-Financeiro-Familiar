const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, '..', 'docs', 'SPREADSHEET_SNAPSHOT.md');
const content = fs.readFileSync(snapshotPath, 'utf8');

// Parse Faturas_Linhas section
const lines = content.split('\n');
let parsingLinhas = false;
const linhas = [];

for (const line of lines) {
  if (line.startsWith('## Faturas_Linhas')) {
    parsingLinhas = true;
    continue;
  }
  if (parsingLinhas && line.startsWith('## ')) {
    parsingLinhas = false;
  }
  if (parsingLinhas && line.startsWith('|') && !line.includes('ID Linha') && !line.includes('---')) {
    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 5) {
      linhas.push({
        id_linha: parts[0],
        id_fatura: parts[1],
        id_cartao: parts[2],
        competencia: parts[3],
        valor_previsto: parseFloat(parts[4]),
        status_origem: parts[5]
      });
    }
  }
}

// Group by invoice
const grouped = {};
for (const l of linhas) {
  if (!grouped[l.id_fatura]) {
    grouped[l.id_fatura] = { card: l.id_cartao, competencia: l.competencia, total: 0, count: 0 };
  }
  grouped[l.id_fatura].total += l.valor_previsto;
  grouped[l.id_fatura].count++;
}

console.log('Sums from Faturas_Linhas:');
for (const [id, data] of Object.entries(grouped)) {
  console.log(`Invoice: ${id} | Card: ${data.card} | Competencia: ${data.competencia} | Sum: ${data.total.toFixed(2)} (${data.count} lines)`);
}
