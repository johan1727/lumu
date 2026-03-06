const fs = require('fs');
const lines = fs.readFileSync('public/app.js', 'utf8').split('\n');
let p = 0;
for (let i = 0; i < lines.length; i++) {
    const prevP = p;
    p += (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    if (i > 274 && i <= 2376 && p > 0) {
        console.log((i + 1) + ': p=' + p + ' | ' + lines[i].trim());
    }
}
