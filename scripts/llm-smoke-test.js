require('dotenv').config();

const llmService = require('../src/services/llmService');

const TEST_CASES = [
    {
        name: 'slang_latam',
        query: 'quiero una compu gamer barata con 16 ram',
        expected: {
            queryType: ['generic', 'need_based', 'conversational'],
            searchLanguage: ['es', 'auto']
        }
    },
    {
        name: 'comparison',
        query: 'iphone 15 vs samsung s24',
        expected: {
            queryType: ['comparison'],
            isComparison: true
        }
    },
    {
        name: 'budget',
        query: 'laptop para programar menos de 15000 pesos',
        expected: {
            maxBudgetMin: 10000,
            queryType: ['need_based', 'generic', 'conversational']
        }
    },
    {
        name: 'speculative',
        query: 'ps6 precio y fecha de salida',
        expected: {
            isSpeculative: true,
            queryType: ['speculative']
        }
    },
    {
        name: 'ambiguous',
        query: 'quiero un apple barato',
        expected: {
            needsDisambiguation: true
        }
    },
    {
        name: 'brand_model',
        query: 'macbook air m3 16gb 512gb',
        expected: {
            queryType: ['brand_model'],
            commercialReadinessMin: 0.7
        }
    },
    {
        name: 'coupon_deal',
        query: 'cupón nike mexico',
        expected: {
            queryType: ['coupon_deal', 'generic']
        }
    }
];

function checkCase(result, expected) {
    const failures = [];

    if (expected.queryType && !expected.queryType.includes(result.queryType)) {
        failures.push(`queryType esperado en [${expected.queryType.join(', ')}], recibido: ${result.queryType}`);
    }

    if (typeof expected.isComparison === 'boolean' && Boolean(result.isComparison) !== expected.isComparison) {
        failures.push(`isComparison esperado: ${expected.isComparison}, recibido: ${result.isComparison}`);
    }

    if (typeof expected.isSpeculative === 'boolean' && Boolean(result.isSpeculative) !== expected.isSpeculative) {
        failures.push(`isSpeculative esperado: ${expected.isSpeculative}, recibido: ${result.isSpeculative}`);
    }

    if (typeof expected.needsDisambiguation === 'boolean' && Boolean(result.needsDisambiguation) !== expected.needsDisambiguation) {
        failures.push(`needsDisambiguation esperado: ${expected.needsDisambiguation}, recibido: ${result.needsDisambiguation}`);
    }

    if (expected.searchLanguage && !expected.searchLanguage.includes(result.searchLanguage)) {
        failures.push(`searchLanguage esperado en [${expected.searchLanguage.join(', ')}], recibido: ${result.searchLanguage}`);
    }

    if (typeof expected.maxBudgetMin === 'number' && !(typeof result.maxBudget === 'number' && result.maxBudget >= expected.maxBudgetMin)) {
        failures.push(`maxBudget esperado >= ${expected.maxBudgetMin}, recibido: ${result.maxBudget}`);
    }

    if (typeof expected.commercialReadinessMin === 'number' && !(typeof result.commercialReadiness === 'number' && result.commercialReadiness >= expected.commercialReadinessMin)) {
        failures.push(`commercialReadiness esperado >= ${expected.commercialReadinessMin}, recibido: ${result.commercialReadiness}`);
    }

    if (!result.searchQuery || !String(result.searchQuery).trim()) {
        failures.push('searchQuery vacío');
    }

    if (!result.normalizedQuery || !String(result.normalizedQuery).trim()) {
        failures.push('normalizedQuery vacío');
    }

    if (!Array.isArray(result.alternativeQueries)) {
        failures.push('alternativeQueries no es array');
    }

    return failures;
}

async function main() {
    const countryCode = process.argv[2] || 'MX';
    let failed = 0;

    console.log(`\n[LLM Smoke Test] Ejecutando ${TEST_CASES.length} casos para región ${countryCode}\n`);

    for (const testCase of TEST_CASES) {
        try {
            const result = await llmService.analyzeMessage(testCase.query, [], { countryCode });
            const failures = checkCase(result, testCase.expected);
            const ok = failures.length === 0;

            console.log(`--- ${testCase.name} ---`);
            console.log(`query: ${testCase.query}`);
            console.log(JSON.stringify({
                action: result.action,
                queryType: result.queryType,
                normalizedQuery: result.normalizedQuery,
                searchQuery: result.searchQuery,
                isComparison: result.isComparison,
                isSpeculative: result.isSpeculative,
                needsDisambiguation: result.needsDisambiguation,
                commercialReadiness: result.commercialReadiness,
                searchLanguage: result.searchLanguage,
                maxBudget: result.maxBudget,
                brandOfficialQuery: result.brandOfficialQuery,
                excludeTerms: result.excludeTerms,
                alternativeQueries: result.alternativeQueries
            }, null, 2));

            if (ok) {
                console.log('RESULT: PASS\n');
            } else {
                failed += 1;
                console.log(`RESULT: FAIL\n- ${failures.join('\n- ')}\n`);
            }
        } catch (error) {
            failed += 1;
            console.log(`--- ${testCase.name} ---`);
            console.log(`RESULT: ERROR\n- ${error.message}\n`);
        }
    }

    console.log(`[LLM Smoke Test] Finalizado. Fallos: ${failed}/${TEST_CASES.length}`);
    process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
    console.error('[LLM Smoke Test] Error fatal:', error);
    process.exit(1);
});
