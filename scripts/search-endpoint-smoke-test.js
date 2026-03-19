require('dotenv').config();

const BASE_URL = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ENDPOINT = `${BASE_URL}/api/buscar`;

const TEST_CASES = [
    {
        name: 'mx_brand_model',
        body: {
            query: 'macbook air m3 16gb 512gb',
            radius: 'global',
            country: 'MX',
            conditionMode: 'new'
        },
        expected: {
            country: 'MX',
            minResults: 1,
            queryTypes: ['brand_model', 'generic'],
            requireMetadata: ['canonical_key', 'query_type', 'commercial_readiness']
        }
    },
    {
        name: 'mx_budget_need_based',
        body: {
            query: 'laptop para programar menos de 15000 pesos',
            radius: 'global',
            country: 'MX',
            conditionMode: 'new'
        },
        expected: {
            country: 'MX',
            minResults: 0,
            queryTypes: ['need_based', 'generic', 'conversational'],
            maxBudgetMin: 10000,
            requireMetadata: ['max_budget', 'query_type']
        }
    },
    {
        name: 'mx_ambiguous',
        body: {
            query: 'quiero un apple barato',
            radius: 'global',
            country: 'MX',
            conditionMode: 'new'
        },
        expected: {
            country: 'MX',
            minResults: 0,
            needsDisambiguation: true,
            requireMetadata: ['needs_disambiguation', 'disambiguation_options']
        }
    },
    {
        name: 'mx_speculative',
        body: {
            query: 'ps6 precio y fecha de salida',
            radius: 'global',
            country: 'MX',
            conditionMode: 'new'
        },
        expected: {
            country: 'MX',
            minResults: 0,
            isSpeculative: true,
            queryTypes: ['speculative'],
            requireMetadata: ['is_speculative', 'commercial_readiness']
        }
    },
    {
        name: 'mx_used_search',
        body: {
            query: 'iphone 13 128gb',
            radius: 'global',
            country: 'MX',
            conditionMode: 'used'
        },
        expected: {
            country: 'MX',
            minResults: 0,
            requireIntentCondition: 'used'
        }
    },
    {
        name: 'us_brand_model',
        body: {
            query: 'airpods pro 2',
            radius: 'global',
            country: 'US',
            conditionMode: 'new'
        },
        expected: {
            country: 'US',
            minResults: 0,
            queryTypes: ['brand_model', 'generic'],
            requireRegionCurrency: 'USD'
        }
    },
    {
        name: 'skip_llm_direct',
        body: {
            query: 'smart tv 55 pulgadas 4k',
            radius: 'global',
            country: 'MX',
            skipLLM: true,
            conditionMode: 'new'
        },
        expected: {
            country: 'MX',
            minResults: 0,
            queryTypes: ['generic']
        }
    }
];

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function readPath(obj, path) {
    return path.split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
}

function validateResult(result, expected) {
    const failures = [];
    const metadata = result.search_metadata || {};
    const products = Array.isArray(result.top_5_baratos) ? result.top_5_baratos : [];

    if (result.tipo_respuesta !== 'resultados' && result.tipo_respuesta !== 'conversacion') {
        failures.push(`tipo_respuesta inválido: ${result.tipo_respuesta}`);
    }

    if (!isObject(result.region)) {
        failures.push('region ausente o inválido');
    }

    if (expected.country && result.region?.country !== expected.country) {
        failures.push(`country esperado: ${expected.country}, recibido: ${result.region?.country}`);
    }

    if (expected.requireRegionCurrency && result.region?.currency !== expected.requireRegionCurrency) {
        failures.push(`currency esperado: ${expected.requireRegionCurrency}, recibido: ${result.region?.currency}`);
    }

    if (!isObject(result.intencion_detectada)) {
        failures.push('intencion_detectada ausente o inválido');
    }

    if (!isObject(metadata)) {
        failures.push('search_metadata ausente o inválido');
    }

    if (Array.isArray(expected.requireMetadata)) {
        for (const key of expected.requireMetadata) {
            const value = metadata[key];
            const present = Array.isArray(value) ? true : value !== undefined;
            if (!present) failures.push(`search_metadata.${key} ausente`);
        }
    }

    if (Array.isArray(expected.queryTypes) && metadata.query_type && !expected.queryTypes.includes(metadata.query_type)) {
        failures.push(`query_type esperado en [${expected.queryTypes.join(', ')}], recibido: ${metadata.query_type}`);
    }

    if (typeof expected.isSpeculative === 'boolean' && Boolean(metadata.is_speculative) !== expected.isSpeculative) {
        failures.push(`is_speculative esperado: ${expected.isSpeculative}, recibido: ${metadata.is_speculative}`);
    }

    if (typeof expected.needsDisambiguation === 'boolean' && Boolean(metadata.needs_disambiguation) !== expected.needsDisambiguation) {
        failures.push(`needs_disambiguation esperado: ${expected.needsDisambiguation}, recibido: ${metadata.needs_disambiguation}`);
    }

    if (typeof expected.maxBudgetMin === 'number' && !(typeof metadata.max_budget === 'number' && metadata.max_budget >= expected.maxBudgetMin)) {
        failures.push(`max_budget esperado >= ${expected.maxBudgetMin}, recibido: ${metadata.max_budget}`);
    }

    if (typeof expected.minResults === 'number' && products.length < expected.minResults) {
        failures.push(`minResults esperado >= ${expected.minResults}, recibido: ${products.length}`);
    }

    if (expected.requireIntentCondition && result.intencion_detectada?.modo_condicion !== expected.requireIntentCondition) {
        failures.push(`modo_condicion esperado: ${expected.requireIntentCondition}, recibido: ${result.intencion_detectada?.modo_condicion}`);
    }

    const urls = new Set();
    for (const product of products) {
        if (!product || typeof product !== 'object') {
            failures.push('producto inválido en top_5_baratos');
            continue;
        }

        if (!product.titulo || !String(product.titulo).trim()) failures.push('producto sin titulo');
        if (!product.tienda || !String(product.tienda).trim()) failures.push('producto sin tienda');
        if (product.urlOriginal) {
            const normalizedUrl = String(product.urlOriginal).trim();
            if (urls.has(normalizedUrl)) failures.push(`URL duplicada detectada: ${normalizedUrl}`);
            urls.add(normalizedUrl);
        }

        if (product.storeTier !== undefined && ![1, 2, 3].includes(Number(product.storeTier))) {
            failures.push(`storeTier inválido: ${product.storeTier}`);
        }
    }

    return failures;
}

async function runCase(testCase) {
    const startedAt = Date.now();
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(testCase.body)
    });

    const elapsedMs = Date.now() - startedAt;
    const rawText = await response.text();
    let data = null;

    if (rawText && rawText.trim()) {
        try {
            data = JSON.parse(rawText);
        } catch (error) {
            return {
                ok: false,
                failures: [`Respuesta no JSON (${response.status}): ${rawText.slice(0, 200)}`],
                status: response.status,
                elapsedMs,
                data: null
            };
        }
    }

    if (!response.ok) {
        return {
            ok: false,
            failures: [`HTTP ${response.status}: ${data?.error || 'sin detalle'}`],
            status: response.status,
            elapsedMs,
            data
        };
    }

    const failures = validateResult(data || {}, testCase.expected || {});
    return {
        ok: failures.length === 0,
        failures,
        status: response.status,
        elapsedMs,
        data
    };
}

async function main() {
    let failed = 0;

    console.log(`\n[/api/buscar Smoke Test] Endpoint: ${ENDPOINT}`);
    console.log(`[Smoke Test] Ejecutando ${TEST_CASES.length} casos\n`);

    for (const testCase of TEST_CASES) {
        try {
            const result = await runCase(testCase);
            const summary = result.data ? {
                tipo_respuesta: result.data.tipo_respuesta,
                region: result.data.region,
                intencion_detectada: result.data.intencion_detectada,
                search_metadata: result.data.search_metadata,
                result_count: Array.isArray(result.data.top_5_baratos) ? result.data.top_5_baratos.length : 0,
                sugerencias_count: Array.isArray(result.data.sugerencias) ? result.data.sugerencias.length : 0
            } : null;

            console.log(`--- ${testCase.name} ---`);
            console.log(`query: ${testCase.body.query}`);
            console.log(`status: ${result.status} | elapsed: ${result.elapsedMs}ms`);
            if (summary) {
                console.log(JSON.stringify(summary, null, 2));
            }

            if (result.ok) {
                console.log('RESULT: PASS\n');
            } else {
                failed += 1;
                console.log(`RESULT: FAIL\n- ${result.failures.join('\n- ')}\n`);
            }
        } catch (error) {
            failed += 1;
            console.log(`--- ${testCase.name} ---`);
            console.log(`RESULT: ERROR\n- ${error.message}\n`);
        }
    }

    console.log(`[/api/buscar Smoke Test] Finalizado. Fallos: ${failed}/${TEST_CASES.length}`);
    process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
    console.error('[/api/buscar Smoke Test] Error fatal:', error);
    process.exit(1);
});
