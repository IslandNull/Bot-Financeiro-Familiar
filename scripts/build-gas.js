'use strict';

const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'gas-core.js')],
    outfile: path.join(root, 'apps-script', 'generated-core.js'),
    bundle: true,
    format: 'iife',
    globalName: 'BFFCore',
    platform: 'neutral',
    target: ['es2019'],
    legalComments: 'none',
    sourcemap: false,
    minify: false,
});

console.log('Built apps-script/generated-core.js');
