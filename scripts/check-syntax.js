'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appsScriptDir = path.join(__dirname, '..', 'apps-script');
const files = fs.readdirSync(appsScriptDir).filter(f => f.endsWith('.js'));

console.log(`Checking syntax of ${files.length} files in apps-script/...`);

for (const file of files) {
    const filePath = path.join(appsScriptDir, file);
    try {
        execSync(`node --check "${filePath}"`, { stdio: 'inherit' });
    } catch (err) {
        console.error(`Syntax check failed for ${file}`);
        process.exit(1);
    }
}

console.log('All syntax checks passed!');
