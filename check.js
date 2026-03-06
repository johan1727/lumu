const fs = require('fs');
const code = fs.readFileSync('public/app.js', 'utf8');
let open = 0;
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    open += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (lines[i].includes('initApp')) console.log((i + 1) + ': ' + open + ' -> ' + lines[i].trim());
    if (lines[i].includes('catch')) console.log((i + 1) + ': ' + open + ' -> ' + lines[i].trim());
    if (open < 0) {
        console.log('Negative braces at line ' + (i + 1) + ': ' + lines[i]);
        break;
    }
}
