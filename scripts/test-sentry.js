require('dotenv').config();

const Sentry = require('@sentry/node');

const args = process.argv.slice(2);
const shouldSend = args.includes('--yes');
const environment = process.env.NODE_ENV || 'development';
const dsn = process.env.SENTRY_DSN || '';

if (!dsn) {
    console.error('❌ SENTRY_DSN no está configurado en .env');
    process.exit(1);
}

if (!shouldSend) {
    console.log('⚠️ Este script envía un error real a Sentry.');
    console.log('Ejecuta: node scripts/test-sentry.js --yes');
    process.exit(1);
}

console.log('✅ SENTRY_DSN encontrado:', dsn.substring(0, 30) + '...');
console.log(`🌍 NODE_ENV=${environment}`);

Sentry.init({
    dsn,
    environment: `manual-${environment}`,
    tracesSampleRate: 0,
});

console.log('📡 Sentry inicializado. Enviando error de prueba...');

async function main() {
    try {
        throw new Error(`Sentry manual smoke test from ${environment}`);
    } catch (error) {
        const eventId = Sentry.captureException(error);
        console.log(`✅ Error capturado. Event ID: ${eventId}`);
    }

    await Sentry.flush(2000);
    console.log('✅ Script completado. Revisa tu dashboard de Sentry.');
    process.exit(0);
}

main().catch(async (error) => {
    console.error('❌ Falló el script de prueba de Sentry:', error.message);
    await Sentry.close(2000);
    process.exit(1);
});
