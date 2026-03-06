const fs = require('fs');
const lines = fs.readFileSync('public/app.js', 'utf8').split('\n');
let p = 0;
let out = '';
for (let i = 0; i < lines.length; i++) {
    p += (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    if (i > 274 && i <= 2376 && p > 0) {
        out += ((i + 1) + ': ' + p + ' | ' + lines[i].trim()) + '\n';
    }
}
fs.writeFileSync('p_output.json', JSON.stringify({ result: out }), 'utf8');
