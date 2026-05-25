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

const valTownProxy = path.join(__dirname, '..', 'val-town', 'telegram-proxy.ts');
const valTownMain = path.join(__dirname, '..', 'val-town', 'main.ts');
for (const valTownFile of [valTownProxy, valTownMain]) {
    const displayPath = path.relative(path.join(__dirname, '..'), valTownFile).replace(/\\/g, '/');
    console.log(`Checking syntax of ${displayPath}...`);
    try {
        execSync(`node --check --experimental-transform-types "${valTownFile}"`, { stdio: 'inherit' });
    } catch (err) {
        console.error(`Syntax check failed for ${displayPath}`);
        process.exit(1);
    }
}

console.log('Val Town proxy syntax check passed!');
