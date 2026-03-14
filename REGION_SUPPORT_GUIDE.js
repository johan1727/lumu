// DETECCIÓN DE PAÍS Y CONFIGURACIÓN REGIONAL
// Agregar esto en tu frontend (app.js) y backend

const REGION_CONFIG = {
  MX: {
    currency: 'MXN',
    locale: 'es-MX',
    stores: ['amazon', 'mercadolibre', 'walmart', 'liverpool', 'coppel', 'elektra'],
    tld: 'com.mx',
    payment: 'Stripe MX'
  },
  US: {
    currency: 'USD',
    locale: 'en-US',
    stores: ['amazon', 'walmart', 'bestbuy', 'target', 'costco', 'homedepot'],
    tld: 'com',
    payment: 'Stripe US'
  }
};

// Detectar país por geoloc reverse o IP
async function detectUserRegion() {
  // Opción 1: Usar la geoloc que ya tienes
  const lat = document.getElementById('user-lat')?.value;
  const lng = document.getElementById('user-lng')?.value;
  
  if (lat && lng) {
    // Reverse geocoding gratuito
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=es`);
    const data = await res.json();
    const countryCode = data.countryCode; // 'MX', 'US', etc.
    return REGION_CONFIG[countryCode] || REGION_CONFIG.MX;
  }
  
  // Opción 2: IP detection (fallback)
  const ipRes = await fetch('https://ipapi.co/json/');
  const ipData = await ipRes.json();
  return REGION_CONFIG[ipData.country_code] || REGION_CONFIG.MX;
}

// Formatear precio según región
function formatPrice(amount, region = 'MX') {
  const config = REGION_CONFIG[region] || REGION_CONFIG.MX;
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency
  }).format(amount);
}

// Ejemplo: $1,251.93 MXN (MX) vs $1,251.93 USD (US)
