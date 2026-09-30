/** Parse a single provider price without assuming US decimal separators. */
function parseShoppingPrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value !== 'string') return null;

    const raw = value.trim().replace(/[\u00a0\u202f]/g, ' ');
    if (!raw || /-\s*(?:[$€£]\s*|(?:MXN|USD|CAD|EUR)\s*)?\d/i.test(raw) || /\d[\d.,]*\s*(?:-|–|—|\bto\b|\ba\b)\s*(?:[$€£]\s*|(?:MXN|USD|CAD|EUR)\s*)?\d/i.test(raw)) return null;

    let numeric = raw.replace(/[^\d.,]/g, '');
    if (!numeric || !/\d/.test(numeric)) return null;

    const separators = [...numeric.matchAll(/[.,]/g)].map(match => match.index);
    if (separators.length > 0) {
        const lastIndex = separators[separators.length - 1];
        const trailingDigits = numeric.length - lastIndex - 1;
        const separatorKinds = new Set([...numeric.matchAll(/[.,]/g)].map(match => match[0]));
        const hasBothSeparators = separatorKinds.size > 1;

        if (hasBothSeparators) {
            // The final separator is decimal only when followed by one or two digits.
            if (trailingDigits === 1 || trailingDigits === 2) {
                const integerPart = numeric.slice(0, lastIndex).replace(/[.,]/g, '');
                const fractionPart = numeric.slice(lastIndex + 1).replace(/[.,]/g, '');
                numeric = `${integerPart}.${fractionPart}`;
            } else {
                numeric = numeric.replace(/[.,]/g, '');
            }
        } else {
            const separator = numeric[lastIndex];
            const parts = numeric.split(separator);
            const looksGrouped = parts.length > 1 && parts.slice(1).every(part => part.length === 3);
            if (looksGrouped || trailingDigits === 0 || trailingDigits > 2) {
                numeric = numeric.replace(/[.,]/g, '');
            } else {
                const integerPart = parts.slice(0, -1).join('');
                const fractionPart = parts[parts.length - 1];
                numeric = `${integerPart}.${fractionPart}`;
            }
        }
    }

    const parsed = Number(numeric);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

module.exports = { parseShoppingPrice };
