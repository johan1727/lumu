const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');
const lines = content.split('\n');

let stack = [];
let inString = false;
let stringChar = '';
let inBlockComment = false;
let inLineComment = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    inLineComment = false;
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const nextChar = line[j + 1] || '';

        if (inBlockComment) {
            if (char === '*' && nextChar === '/') {
                inBlockComment = false;
                j++;
            }
            continue;
        }

        if (inString) {
            if (char === '\\') {
                j++;
                continue;
            }
            if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (char === '/' && nextChar === '/') {
            inLineComment = true;
            break;
        }

        if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            j++;
            continue;
        }

        if (char === '\'' || char === '"' || char === '`') {
            inString = true;
            stringChar = char;
            continue;
        }

        if (char === '(' || char === '{' || char === '[') {
            stack.push({ char, line: i + 1, col: j + 1 });
        } else if (char === ')' || char === '}' || char === ']') {
            if (stack.length === 0) {
                console.log(`Extra closing ${char} at line ${i + 1}, col ${j + 1}`);
            } else {
                const top = stack.pop();
                const expected = char === ')' ? '(' : char === '}' ? '{' : '[';
                if (top.char !== expected) {
                    console.log(`Mismatch at line ${i + 1}, col ${j + 1}: expected closing for ${top.char} (from line ${top.line}), but found ${char}`);
                    stack.push(top); // keep it to see where it breaks
                }
            }
        }
    }
}
if (stack.length > 0) {
    console.log("Unclosed opening brackets:");
    stack.forEach(s => {
        console.log(`${s.char} at line ${s.line}, col ${s.col}`);
    });
} else {
    console.log("All pairs matched perfectly!");
}
