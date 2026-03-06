const fs = require('fs');
const lines = fs.readFileSync('public/app.js', 'utf8').split('\n');
let p = 0; let b = 0;
for (let i = 0; i < lines.length; i++) {
    const prevP = p;
    p += (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    b += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > 274 && i < 2376 && p > 0 && b === 1) { // inside initApp top level
        console.log((i + 1) + '\tp: ' + p + '\tb: ' + b + '\t' + lines[i].trim());
    }
}
