/**
 * Script de diagnóstico para API de producción
 * Ejecutar: node scripts/diagnose-prod-search.js
 */

const https = require('https');

function makeRequest(hostname, path, method, data, followRedirects = true) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            // Handle redirects (301, 302, 307, 308)
            if (followRedirects && [301, 302, 307, 308].includes(res.statusCode)) {
                const redirectUrl = new URL(res.headers.location, `https://${hostname}`);
                console.log(`  ↳ Redirect ${res.statusCode} to: ${redirectUrl.hostname}${redirectUrl.pathname}`);
                return makeRequest(redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search, method, data, false)
                    .then(resolve)
                    .catch(reject);
            }
            
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: JSON.parse(body)
                    });
                } catch (e) {
                    resolve({ status: res.statusCode, body: body.substring(0, 500) });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function diagnose() {
    console.log('=== DIAGNÓSTICO DE BÚSQUEDA EN PRODUCCIÓN ===\n');
    
    const tests = [
        {
            name: 'Búsqueda básica (sin filtros)',
            body: { query: 'iPhone 15', country: 'MX' }
        },
        {
            name: 'Búsqueda con filtro Amazon (prefer)',
            body: { query: 'iPhone 15', country: 'MX', preferredStoreKey: 'amazon', preferredStoreMode: 'prefer' }
        },
        {
            name: 'Búsqueda con filtro Amazon + ML (exclusive)',
            body: { query: 'iPhone 15', country: 'MX', preferredStoreKeys: ['amazon', 'mercado libre'], preferredStoreMode: 'exclusive' }
        },
        {
            name: 'Búsqueda específica (la de tu screenshot)',
            body: { query: 'iPhone 15 reacondicionado 128GB', country: 'MX', preferredStoreKeys: ['amazon', 'mercado libre'], preferredStoreMode: 'exclusive' }
        }
    ];

    for (const test of tests) {
        console.log(`\n--- ${test.name} ---`);
        console.log(`Query: ${JSON.stringify(test.body)}`);
        
        try {
            const start = Date.now();
            const response = await makeRequest('lumu.dev', '/api/buscar', 'POST', test.body);
            const time = Date.now() - start;
            
            console.log(`Status: ${response.status} (${time}ms)`);
            
            if (response.body && typeof response.body === 'object') {
                const data = response.body;
                console.log(`Tipo respuesta: ${data.tipo_respuesta || 'N/A'}`);
                console.log(`Cache status: ${data.search_metadata?.cache_status || 'N/A'}`);
                console.log(`Resultados: ${data.top_5_baratos?.length || 0}`);
                console.log(`Canonical key: ${data.search_metadata?.canonical_key || 'N/A'}`);
                
                if (data.top_5_baratos && data.top_5_baratos.length > 0) {
                    console.log('\nPrimeros 3 resultados:');
                    data.top_5_baratos.slice(0, 3).forEach((item, i) => {
                        console.log(`  ${i+1}. ${(item.title || item.titulo || 'N/A').substring(0, 50)}... - $${item.price || item.precio} - ${item.source || item.tienda}`);
                    });
                } else {
                    console.log('\n⚠️ SIN RESULTADOS');
                    if (data.search_metadata) {
                        console.log('Metadata:', JSON.stringify(data.search_metadata, null, 2).substring(0, 500));
                    }
                }
            } else {
                console.log('Respuesta no JSON:', response.body);
            }
        } catch (err) {
            console.log(`❌ ERROR: ${err.message}`);
        }
    }
    
    console.log('\n=== FIN DEL DIAGNÓSTICO ===');
}

diagnose().catch(console.error);
