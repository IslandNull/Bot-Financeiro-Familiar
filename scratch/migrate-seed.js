const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '../src/seed.js');
let content = fs.readFileSync(seedPath, 'utf8');

// Regex to capture each category block
const regex = /\{[^{}]*id_categoria:\s*'([^']+)'[^{}]*\}/g;

content = content.replace(regex, (block, id) => {
    let limit = "''";
    let accum = "''";
    
    if (id === 'OPEX_DELIVERY_FAMILIAR') {
        limit = 300;
        accum = false;
    } else if (id === 'OPEX_RESTAURANTE_FAMILIAR') {
        limit = 0;
        accum = false;
    } else if (id === 'OPEX_LAZER_FAMILIAR') {
        limit = 400;
        accum = false;
    } else if (id === 'OPEX_LAZER_PESSOAL') {
        limit = 0;
        accum = false;
    } else if (id === 'OPEX_PET') {
        limit = 300;
        accum = true;
    } else if (id === 'OPEX_ROUPAS') {
        limit = 200;
        accum = true;
    } else if (id === 'OPEX_VESTUARIO_LUANA') {
        limit = 0;
        accum = true;
    } else if (id === 'OPEX_FARMACIA') {
        limit = 150;
        accum = true;
    } else if (id === 'OPEX_SAUDE_BEM_ESTAR') {
        limit = 0;
        accum = true;
    }
    
    // Find the indentation of the block to match it
    const visIndex = block.indexOf('visibilidade_padrao:');
    if (visIndex !== -1) {
        // Find line break and indentation preceding visibilidade_padrao
        let indent = '            '; // default fallback
        const linesBefore = block.substring(0, visIndex).split('\n');
        const lastLine = linesBefore[linesBefore.length - 1];
        const matchIndent = lastLine.match(/^(\s*)/);
        if (matchIndent) {
            indent = matchIndent[1];
        }
        
        const target = block.match(/visibilidade_padrao:\s*'([^']+)',/)[0];
        const replacement = `${target}\n${indent}limite_mensal: ${limit},\n${indent}acumula_sobra: ${accum},`;
        return block.replace(target, replacement);
    }
    return block;
});

fs.writeFileSync(seedPath, content, 'utf8');
console.log('Successfully updated seed.js with correct indentation');
