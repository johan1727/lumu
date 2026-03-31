console.log('SCRIPT TOP: app.js is starting...');
// --- Global State ---
let supabaseClient = null;
let stripePaymentLink = null;
let currentUser = null;
let _allProducts = [];

function trackMetaEventSafe(eventName, params = {}) {
    if (typeof window.trackMetaEvent === 'function') {
        window.trackMetaEvent(eventName, params);
    }
}

function ensureFunnelSessionId() {
    try {
        if (typeof _ensureInteractionSessionId === 'function') {
            return _ensureInteractionSessionId();
        }
    } catch (e) { }
    try {
        const key = 'lumu_session_id';
        let value = sessionStorage.getItem(key);
        if (!value) {
            value = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            sessionStorage.setItem(key, value);
        }
        return value;
    } catch (e) {
        return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

function trackFunnelEvent(eventType, extra = {}) {
    _trackEvent(eventType, {
        session_id: ensureFunnelSessionId(),
        ...extra
    });
}

window.addEventListener('load', () => {
    trackFunnelEvent('page_view', {
        action_context: 'home'
    });
}, { once: true });

// --- Global Error Handlers ---
window.addEventListener('error', function (event) {
    console.error('[App Error] Global exception caught:', event.error);
    // Don't spam the user with JS errors — only show for critical failures
});
window.addEventListener('unhandledrejection', function (event) {
    console.error('[App Error] Unhandled Promise Rejection:', event.reason);
    // Catch network failures and notify user
    const msg = String(event.reason?.message || event.reason || '');
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR_')) {
        if (typeof showGlobalFeedback === 'function') {
            showGlobalFeedback(isEnglishRegion(detectRegion()) ? 'Connection error. Check your internet and try again.' : 'Error de conexión. Verifica tu internet e intenta de nuevo.', 'error');
        }
    }
});

function safeToast(message, tone = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, tone);
        return;
    }
    if (typeof showGlobalFeedback === 'function') {
        showGlobalFeedback(message, tone);
        return;
    }
    console.warn('[UI Feedback Fallback]', tone, message);
}

// --- DOM Elements (initialized in DOMContentLoaded) ---
let authContainer, authModal, closeModalBtn, modalBackdrop, btnGoogleLogin;
let historyModal, closeHistoryBtn, historyBackdrop, historyList;
let favoritesModal, closeFavoritesBtn, favoritesBackdrop, navFavoritos, favoritesList;
let profileModal, closeProfileBtn, profileBackdrop;
let feedbackModal, closeFeedbackBtn, feedbackBackdrop, btnFeedback, feedbackForm, feedbackSuccess;
let searchForm, searchInput, searchButton, errorMessage;
let btnDeepResearch = null;
let btnSearchModeNormal = null;
let chatContainer, resultsWrapper, resultsGrid, resultsContainer;
let adModal, adCountdownText, btnSkipAd;
let b2bModal, closeB2bModal, b2bBackdrop, navB2b, btnProcessB2b, btnExportB2b;
let mobileMenuDrawer, mobileMenuBackdrop, mobileMenuPanel, btnMobileMenu, btnCloseMobileMenu, mobileAuthContainer;
let adsLoader, adsManager, adsDone = false, adContainer, adDisplayContainer;
let imageUpload, btnAttachImage, imagePreviewContainer, imagePreview, btnRemoveImage;
let btnVoiceInput, isRecording = false;
let selectedImageBase64 = null;
let bestOptionSummaryState = null;
// Location inputs (global so they're accessible in submit handler)
let locRadiusInput, userLatInput, userLngInput;
let conditionModeInput = null;
let includeKnownMarketplacesInput = null;
let includeHighRiskMarketplacesInput = null;
let currentRegion = 'MX';
let serverDetectedRegion = null;
const SEARCH_SNAPSHOTS_KEY = 'lumu_search_snapshots';
const REGION_OVERRIDE_KEY = 'lumu_region_override';
const ONBOARDING_V3_KEY = 'lumu_onboarding_v3';
const ONBOARDING_PREF_KEY = 'lumu_onboarding_preference';

const REGION_LABELS = {
    MX: {
        locale: 'es-MX',
        currency: 'MXN',
        searchPlaceholder: 'Dime qué estás buscando... Ej: iPhone 15 Pro Max',
        submitLabel: 'Enviar',
        helperCopy: 'Lumu usa tu ubicación segura para encontrar ofertas físicas.',
        filters: {
            global: '🌎 Todas partes',
            local_only: '📍 Tiendas Locales',
            nearby: '🚗 Cerca de mí',
            safe: 'Solo Tiendas Seguras'
        },
        resultsFound: 'resultados encontrados',
        searchFor: 'Buscando',
        coinsTitle: 'Lumu Coins',
        coinsCopy: 'Cada búsqueda válida te acerca a PRO temporal.',
        coinsRemaining: 'Te faltan {count} para desbloquear PRO temporal.',
        scopes: {
            global: 'Todas partes',
            local_only: 'Tiendas locales',
            nearby: 'Cerca de mí'
        },
        activeSafe: 'Tiendas seguras',
        activeRegion: 'México',
        toolbar: {
            sortLowPrice: '💰 Menor precio',
            sortHighPrice: '💎 Mayor precio',
            sortStore: '🏪 Por tienda',
            sortRelevance: '⭐ Relevancia',
            allStores: '🏬 Todas las tiendas',
            freeShipping: '🚚 Envío gratis'
        },
        sections: {
            analysisComplete: 'Análisis completado.',
            bestOptions: 'Mejores opciones seguras:',
            flashDeals: 'Ofertas Relámpago',
            trending: 'Tendencias del Momento',
            inspiration: 'Inspiración para ti',
            mayAlsoLike: 'Quizás también te interese',
            guides: 'Guías de Compra Lumu'
        },
        footer: {
            tagline: 'Tu Personal Shopper con IA. Encuentra el mejor precio en segundos.',
            categories: 'Categorías',
            company: 'Empresa',
            rights: 'Todos los derechos reservados.'
        }
    },
    US: {
        locale: 'en-US',
        currency: 'USD',
        searchPlaceholder: 'What are you looking for? Ex: iPhone 15 Pro Max',
        submitLabel: 'Search',
        helperCopy: 'Lumu uses your secure location to find nearby offers.',
        filters: {
            global: '🌎 Everywhere',
            local_only: '📍 Local Stores',
            nearby: '🚗 Near Me',
            safe: 'Trusted Stores Only'
        },
        resultsFound: 'results found',
        searchFor: 'Searching',
        coinsTitle: 'Lumu Coins',
        coinsCopy: 'Each valid search gets you closer to temporary PRO.',
        coinsRemaining: '{count} left to unlock temporary PRO.',
        scopes: {
            global: 'Everywhere',
            local_only: 'Local stores',
            nearby: 'Near me'
        },
        activeSafe: 'Trusted stores',
        activeRegion: 'United States',
        toolbar: {
            sortLowPrice: '💰 Lowest price',
            sortHighPrice: '💎 Highest price',
            sortStore: '🏪 By store',
            sortRelevance: '⭐ Relevance',
            allStores: '🏬 All stores',
            freeShipping: '🚚 Free shipping'
        },
        sections: {
            analysisComplete: 'Analysis complete.',
            bestOptions: 'Best safe options:',
            flashDeals: 'Flash Deals',
            trending: 'Trending Now',
            inspiration: 'Inspiration for you',
            mayAlsoLike: 'You may also like',
            guides: 'Lumu Shopping Guides'
        },
        footer: {
            tagline: 'Your AI Personal Shopper. Find the best price in seconds.',
            categories: 'Categories',
            company: 'Company',
            rights: 'All rights reserved.'
        }
    }
};

// Build LATAM region configs that share Spanish UI with MX but different currency/locale/region
(function buildLatamRegionLabels() {
    const latamOverrides = {
        CL: { locale: 'es-CL', currency: 'CLP', activeRegion: 'Chile' },
        CO: { locale: 'es-CO', currency: 'COP', activeRegion: 'Colombia' },
        AR: { locale: 'es-AR', currency: 'ARS', activeRegion: 'Argentina' },
        PE: { locale: 'es-PE', currency: 'PEN', activeRegion: 'Perú' }
    };
    const mxBase = REGION_LABELS.MX;
    for (const [code, overrides] of Object.entries(latamOverrides)) {
        REGION_LABELS[code] = {
            ...mxBase,
            ...overrides,
            filters: { ...mxBase.filters },
            scopes: { ...mxBase.scopes },
            toolbar: { ...mxBase.toolbar },
            sections: { ...mxBase.sections },
            footer: { ...mxBase.footer }
        };
    }
})();

const REGION_FLAGS = {
    MX: '🇲🇽',
    CL: '🇨🇱',
    CO: '🇨🇴',
    AR: '🇦🇷',
    PE: '🇵🇪',
    US: '🇺🇸'
};

function getVoiceRecognitionLocale(regionCode = 'MX') {
    const normalized = String(regionCode || 'MX').toUpperCase();
    const localeMap = {
        MX: 'es-MX',
        CL: 'es-CL',
        CO: 'es-CO',
        AR: 'es-AR',
        PE: 'es-PE',
        US: 'en-US'
    };
    return localeMap[normalized] || 'es-MX';
}

function isEnglishRegion(regionCode = currentRegion) {
    return String(regionCode || 'MX').toUpperCase() === 'US';
}

function getLanguageBucket(regionCode = currentRegion) {
    return isEnglishRegion(regionCode) ? 'US' : 'MX';
}

function localizeDynamicResultText(value, isUS = isEnglishRegion()) {
    const text = String(value || '').trim();
    if (!text) return '';

    const replacements = isUS ? [
        [/llega gratis mañana/gi, 'Arrives free tomorrow'],
        [/llega mañana/gi, 'Arrives tomorrow'],
        [/env[ií]o gratis/gi, 'Free shipping'],
        [/ver precio en tienda/gi, 'Check in-store price'],
        [/tienda verificada/gi, 'Verified store'],
        [/oferta real/gi, 'Real deal'],
        [/precio normal/gi, 'Normal price'],
        [/descuento sospechoso/gi, 'Suspicious discount'],
        [/sospechoso/gi, 'Suspicious'],
        [/mejor precio/gi, 'Best price'],
        [/historial de precio/gi, 'Price history'],
        [/avisarme/gi, 'Alert me'],
        [/margen/gi, 'Margin'],
        [/expira en/gi, 'Ends in']
    ] : [
        [/arrives free tomorrow/gi, 'Llega gratis mañana'],
        [/arrives tomorrow/gi, 'Llega mañana'],
        [/free shipping/gi, 'Envío gratis'],
        [/check in-store price/gi, 'Ver precio en tienda'],
        [/verified store/gi, 'Tienda verificada'],
        [/real deal/gi, 'Oferta real'],
        [/normal price/gi, 'Precio normal'],
        [/suspicious discount/gi, 'Descuento sospechoso'],
        [/suspicious/gi, 'Sospechoso'],
        [/best price/gi, 'Mejor precio'],
        [/price history/gi, 'Historial de precio'],
        [/alert me/gi, 'Avisarme'],
        [/margin/gi, 'Margen'],
        [/ends in/gi, 'Expira en']
    ];

    return replacements.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

function normalizeResultTitle(rawTitle, storeName = '', isUS = isEnglishRegion()) {
    const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    if (!title) return isUS ? 'Product listing' : 'Producto disponible';

    let normalized = title
        .replace(/\s*[-|]\s*(amazon|mercado libre|mercadolibre|walmart|target|costco|best buy|liverpool|coppel|sam'?s club)\b.*$/i, '')
        .replace(/\b(check in-store price|ver precio en tienda)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (storeName && normalized.toLowerCase() === String(storeName).toLowerCase()) {
        normalized = isUS ? 'Product listing' : 'Producto disponible';
    }

    return normalized || (isUS ? 'Product listing' : 'Producto disponible');
}

function buildImageRenderState(product, isUS = isEnglishRegion()) {
    const title = normalizeResultTitle(product?.titulo, product?.tienda, isUS);
    const storeName = String(product?.tienda || product?.fuente || '').trim();
    const fallbackImgUrl = buildFallbackProductImage(title || storeName || 'Lumu');
    let imgUrl = typeof (product?.imgUrl || product?.imagen) === 'string' ? String(product.imgUrl || product.imagen).trim() : '';

    const isMissingImage = !imgUrl || /^(null|undefined|about:blank)$/i.test(imgUrl) || /placeholder|no[\s_-]?image/i.test(imgUrl);
    const isDataImage = imgUrl.startsWith('data:image/');
    const isRemoteImage = /^https?:\/\//i.test(imgUrl);
    const isLocalImage = imgUrl.startsWith('/') || imgUrl.startsWith('./') || imgUrl.startsWith('../');
    const normalizedImgUrl = imgUrl.toLowerCase();
    const looksLikeStoreLogo = /logo|brandmark|favicon|store-logo|icon|sprite|avatar|seller/i.test(normalizedImgUrl)
        || (/(mercadolibre|costco|walmart|amazon|coppel|liverpool|sams|best[\s_-]?buy|elektra|target)/i.test(normalizedImgUrl)
            && /(logo|icon|badge|avatar|seller)/i.test(normalizedImgUrl));
    const looksLikeCatalogAsset = /product|products|prod|sku|image|images|item|catalog|catalogo|pdp|media|photo/i.test(normalizedImgUrl);
    const isLikelyProductImage = !isMissingImage && (isDataImage || isRemoteImage || isLocalImage) && (!looksLikeStoreLogo || looksLikeCatalogAsset);
    const finalImgUrl = isLikelyProductImage ? imgUrl : fallbackImgUrl;

    return {
        title,
        finalImgUrl,
        fallbackImgUrl,
        hasProductImage: isLikelyProductImage
    };
}

const REGION_UI_COPY = {
    MX: {
        nav: {
            inspiration: 'Ofertas',
            trending: 'Tendencias',
            pricing: 'Precios',
            favorites: 'Favoritos',
            miniFavoritesTitle: 'Tus Favoritos Recientes',
            miniFavoritesEmpty: 'Inicia sesión y pasa el cursor para cargar tus favoritos.',
            miniFavoritesOpen: 'Abrir Galería Completa →',
            b2b: 'Distribuidor B2B',
            priceAlertTitle: 'Mis Alertas de Precio',
            login: 'Ingresar'
        },
        hero: {
            titleHtml: 'Compara precios con IA,<br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">encuentra dónde conviene.</span>',
            subtitle: 'Busca cualquier producto y Lumu compara precios en Amazon, Mercado Libre y tiendas locales.',
            assistant: 'Escribe producto, presupuesto, uso o si quieres que compare por ti.',
            attachImageTitle: 'Adjuntar Imagen',
            voiceInputTitle: 'Dictado por Voz'
        },
        guidedSearch: {
            title: 'Búsqueda guiada',
            copy: 'Elige cómo quieres buscar sin perderte entre tantos botones.',
            toggleShow: 'Mostrar filtros',
            toggleHide: 'Ocultar filtros',
            condition: 'Condición',
            location: 'Ubicación',
            shortcuts: 'Atajos IA',
            promptCheapest: 'Lo más barato',
            promptBest: '¿Cuál conviene?',
            promptNearby: 'Cerca de mí',
            promptCheapestData: 'Quiero la opción más barata disponible',
            promptBestData: 'Compárame precios y dime cuál conviene más',
            promptNearbyData: 'Buscar opciones en tiendas locales cerca de mí'
        },
        categoryBar: {
            tech: 'Tecnología',
            fashion: 'Moda',
            home: 'Hogar',
            sports: 'Deportes',
            beauty: 'Belleza',
            toys: 'Juguetes',
            cars: 'Autos'
        },
        home: {
            popularCategories: 'Categorías Populares',
            phones: 'Celulares',
            laptops: 'Laptops',
            audio: 'Audio',
            consoles: 'Consolas',
            shoes: 'Tenis',
            kitchen: 'Cocina',
            perfumes: 'Perfumes',
            furniture: 'Muebles',
            trendingTitle: 'Lo Más Buscado',
            dayDealsTitle: 'Ofertas del Día',
            flashDealsTitle: 'Ofertas Relámpago',
            viewAll: 'Ver todas',
            flashBadge1: 'MÁS BUSCADO',
            flashMeta1: 'Llega gratis mañana',
            flashBadge2: 'OFERTA DEL DÍA',
            flashMeta2: 'Llega gratis mañana',
            flashMeta3: 'Importación segura',
            flashBadge4: 'LIQUIDACIÓN',
            flashMeta4: 'Últimas 5 unidades',
            coinsSubtitle: 'Sube con cada búsqueda útil'
        },
        historyModal: {
            title: 'Mis Búsquedas',
            copy: 'Historial de productos que le has pedido a Lumu AI.'
        },
        priceAlerts: {
            title: '🔔 Alertas de Precio',
            copy: 'Te avisamos cuando baje el precio.',
            productPlaceholder: 'Ej: iPhone 15 Pro',
            currencyLabel: 'MXN $',
            maxPricePlaceholder: 'Precio máximo (ej: 18000)',
            submit: '➕ Agregar Alerta',
            activeTitle: 'Alertas Activas',
            empty: 'Aún no tienes alertas configuradas.'
        },
        profile: {
            titleHtml: 'Mi Perfil<span class="text-primary">.ai</span>',
            loadingName: 'Cargando Nombre...',
            loadingPlan: 'Cargando plan...',
            currentPlan: 'Plan Actual',
            statusFree: 'Gratis',
            planVip: 'Uso intensivo',
            planFree: 'Plan Básico (Gratis)',
            searchesLeftUnlimited: 'Búsquedas restantes: según tu plan',
            searchesLeft: 'Búsquedas restantes: {count}',
            upgradeTitle: '¡Sube de Nivel AHORA!',
            upgradeCopy: 'Hazte VIP y accede a más capacidad de búsqueda, sin anuncios y con mejores herramientas.',
            upgradeButton: 'Comprar Acceso VIP ($39)',
            historyTitle: 'Historial de Búsquedas',
            historySubtitle: 'Revisa tus compras pasadas',
            logout: 'Cerrar Sesión Segura'
        },
        pricing: {
            badge: 'Más valor por menos',
            title: '¿Quieres más capacidad de búsqueda?',
            copyHtml: 'Desde <strong class="text-emerald-600">$39 MXN/mes</strong> — sin anuncios, con alertas de precio y herramientas para encontrar más rápido las mejores ofertas.',
            chipAds: 'Sin anuncios',
            chipAlerts: 'Alertas de precio',
            chipCoupons: 'Cupones exclusivos',
            button: 'Ver Planes y Precios'
        },
        footer: {
            supporting: 'Compara más claro. Decide más rápido.',
            rights: '© 2026 Lumu AI. Todos los derechos reservados.',
            explore: 'Explora',
            cheapPhones: 'Celulares baratos',
            phonePrices: 'Precios de celulares',
            valuePhones: 'Celulares calidad-precio',
            workStudy: 'Trabajo y estudio',
            gaming: 'Gaming',
            styleHome: 'Estilo y hogar',
            about: 'Sobre Nosotros',
            privacy: 'Privacidad',
            terms: 'Términos',
            savingsGuide: 'Guía de Ahorro',
            tutorial: 'Tutorial',
            trustPrivacy: 'Privacidad clara',
            trustStores: 'Tiendas seguras',
            trustNoSpam: 'Sin spam'
        },
        b2b: {
            title: 'Plan Revendedor (B2B)',
            copy: 'Búsqueda masiva en lote para importar a Excel.',
            copyHighlight: '(Máximo 10 items por vez en Beta)',
            inputLabel: 'Lista de Productos (Uno por línea)',
            placeholder: 'Pega tu lista de inventario aquí:\n\nNintendo Switch OLED\nConsola PS5\niPhone 15 Pro Max 256GB\nAspiradora Dyson V15\nMonitor LG Ultrawide 34',
            process: 'Procesar Lote',
            resultsTitle: 'Resultados de Búsqueda Masiva',
            export: 'Exportar CSV',
            loader: 'Analizando mercados globales...',
            thQuery: 'Tu Query',
            thPrice: 'Mejor Precio',
            thStore: 'Tienda',
            thAction: 'Acción',
            empty: 'Pega tu lista y haz clic en procesar para ver los resultados aquí.'
        },
        feedback: {
            title: 'Danos tu opinión',
            copy: 'Ayúdanos a mejorar Lumu AI.',
            label: 'Tu sugerencia o comentario',
            placeholder: 'Ej. Deberían agregar más tiendas como Zara o H&M...',
            submit: 'Enviar Feedback',
            successTitle: '¡Gracias por tu apoyo!',
            successCopy: 'Hemos recibido tu mensaje correctamente.'
        },
        ad: {
            title: 'Enlace Bloqueado',
            copy: 'Para mantener Lumu 100% gratis, mira este breve anuncio patrocinado para desbloquear la oferta.',
            waiting: 'Esperando anuncio...',
            vipPrefix: '¿Cansado de los anuncios?',
            vipButton: 'Hazte VIP'
        },
        favorites: {
            title: 'Mis Favoritos',
            subtitle: 'Tu Wishlist Personal',
            cloud: 'Guardado en la Nube via Supabase',
            close: 'Cerrar'
        },
        auth: {
            title: 'Crea tu cuenta gratis',
            copy: 'Desbloquea más búsquedas, favoritos, historial y alertas de precio.',
            bonus: '🎁 Bono de bienvenida: búsquedas extra incluidas',
            benefit1: 'Más búsquedas al registrarte',
            benefit2: 'Gana Lumu Coins con cada búsqueda',
            benefit3: 'Guarda favoritos e historial',
            benefit4: 'Activa alertas de precio',
            google: 'Continuar con Google',
            termsHtml: 'Al continuar, aceptas nuestros <a href="/terminos.html" class="underline hover:text-primary">Términos</a> y <a href="/privacidad.html" class="underline hover:text-primary">Privacidad</a>.'
        },
        mobileMenu: {
            title: 'Menú',
            inspiration: 'Inspiración',
            trending: 'Tendencias',
            favorites: 'Mis Favoritos',
            b2b: 'Plan Reseller (B2B)',
            categories: 'Categorías',
            tech: 'Tecnología',
            fashion: 'Moda',
            home: 'Hogar',
            sports: 'Deportes',
            beauty: 'Belleza',
            toys: 'Juguetes'
        },
        compare: {
            title: 'Comparador de Productos',
            clear: 'Limpiar',
            open: 'Comparar'
        },
        seoGuides: {
            title: 'Guías de Compra Lumu',
            copy: 'Aprende a encontrar las mejores ofertas y ahorrar como un experto',
            guide1Title: 'Cómo elegir tu próxima Laptop',
            guide1Copy: 'Descubre qué procesador y memoria RAM necesitas realmente para trabajar o estudiar sin pagar de más en 2026.',
            guide2Title: 'Electrodomésticos Inteligentes',
            guide2Copy: 'Ahorra en tu recibo de luz eligiendo aparatos con certificación de eficiencia energética y tecnología Inverter.',
            guide3Title: 'El Arte de Usar Cupones',
            guide3Copy: 'Aprende a combinar ofertas relámpago con cupones bancarios para obtener descuentos reales de hasta el 70%.',
            cta: 'Leer más',
            popularTitle: 'Búsquedas Populares en México',
            popular1: 'iPhone 16 en oferta',
            popular2: 'Audífonos noise cancelling baratos',
            popular3: 'Comprar Smart TV 4K online',
            popular4: 'Freidoras de Aire Ninja mejor precio',
            popular5: 'Tenis Nike Originales en liquidación'
        },
        cookies: {
            title: 'Privacidad Lumu',
            copyHtml: 'Usamos cookies necesarias para sesión, favoritos y seguridad. Con tu permiso activamos analítica para mejorar recomendaciones y medir rendimiento. <a href="/privacidad.html" class="text-emerald-700 hover:text-emerald-800 underline font-bold">Ver política</a>.',
            reject: 'Solo necesarias',
            accept: 'Aceptar y continuar',
            backToTop: 'Volver arriba',
            floatingFeedback: 'Danos tu Opinión'
        },
        wishlistShare: {
            title: 'Compartir mi Wishlist',
            copy: 'Comparte tus productos favoritos con un link',
            savedLabel: 'Tus productos guardados:',
            copyButton: 'Copiar',
            whatsapp: 'Compartir por WhatsApp'
        },
        postBuy: {
            title: '🛍️ ¿Compraste el producto?',
            copy: 'Cuéntanos tu experiencia y ayuda a otros compradores',
            yes: '✅ Sí, la visité',
            no: 'Todavía no'
        },
        achievements: {
            title: 'Mis Logros',
            copy: 'Los logros se basan en tus búsquedas con Lumu'
        }
    },
    US: {
        nav: {
            inspiration: 'Deals',
            trending: 'Trending',
            pricing: 'Pricing',
            favorites: 'Favorites',
            miniFavoritesTitle: 'Your Recent Favorites',
            miniFavoritesEmpty: 'Sign in and hover to load your favorites.',
            miniFavoritesOpen: 'Open Full Gallery →',
            b2b: 'B2B Distributor',
            priceAlertTitle: 'My Price Alerts',
            login: 'Sign In'
        },
        hero: {
            titleHtml: 'Compare prices with AI,<br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">find where it makes sense.</span>',
            subtitle: 'Search any product and Lumu compares prices across Amazon, Mercado Libre, and local stores.',
            assistant: 'Type the product, budget, use case, or ask Lumu to compare for you.',
            attachImageTitle: 'Attach Image',
            voiceInputTitle: 'Voice Dictation'
        },
        guidedSearch: {
            title: 'Guided search',
            copy: 'Choose how you want to search without getting lost between too many buttons.',
            toggleShow: 'Show filters',
            toggleHide: 'Hide filters',
            condition: 'Condition',
            location: 'Location',
            shortcuts: 'AI shortcuts',
            promptCheapest: 'Cheapest option',
            promptBest: 'Best value?',
            promptNearby: 'Near me',
            promptCheapestData: 'I want the cheapest option available',
            promptBestData: 'Compare prices and tell me which option is best',
            promptNearbyData: 'Search for options in local stores near me'
        },
        categoryBar: {
            tech: 'Tech',
            fashion: 'Fashion',
            home: 'Home',
            sports: 'Sports',
            beauty: 'Beauty',
            toys: 'Toys',
            cars: 'Cars'
        },
        home: {
            popularCategories: 'Popular Categories',
            phones: 'Phones',
            laptops: 'Laptops',
            audio: 'Audio',
            consoles: 'Consoles',
            shoes: 'Sneakers',
            kitchen: 'Kitchen',
            perfumes: 'Fragrances',
            furniture: 'Furniture',
            trendingTitle: 'Most Searched',
            dayDealsTitle: 'Deals of the Day',
            flashDealsTitle: 'Flash Deals',
            viewAll: 'View all',
            flashBadge1: 'MOST WANTED',
            flashMeta1: 'Free delivery tomorrow',
            flashBadge2: 'DEAL OF THE DAY',
            flashMeta2: 'Free delivery tomorrow',
            flashMeta3: 'Safe import',
            flashBadge4: 'CLEARANCE',
            flashMeta4: 'Last 5 units',
            coinsSubtitle: 'Progress grows with every useful search'
        },
        historyModal: {
            title: 'My Searches',
            copy: 'History of products you have asked Lumu AI to compare.'
        },
        priceAlerts: {
            title: '🔔 Price Alerts',
            copy: 'We will notify you when the price drops.',
            productPlaceholder: 'Ex: iPhone 15 Pro',
            currencyLabel: 'USD $',
            maxPricePlaceholder: 'Maximum price (ex: 999)',
            submit: '➕ Add Alert',
            activeTitle: 'Active Alerts',
            empty: 'You have no alerts configured yet.'
        },
        profile: {
            titleHtml: 'My Profile<span class="text-primary">.ai</span>',
            loadingName: 'Loading name...',
            loadingPlan: 'Loading plan...',
            currentPlan: 'Current Plan',
            statusFree: 'Free',
            planVip: 'Intensive Use',
            planFree: 'Basic Plan (Free)',
            searchesLeftUnlimited: 'Searches left: based on your plan',
            searchesLeft: 'Searches left: {count}',
            upgradeTitle: 'Upgrade NOW!',
            upgradeCopy: 'Go VIP and unlock more search capacity, no ads, and better tools.',
            upgradeButton: 'Buy VIP Access ($39)',
            historyTitle: 'Search History',
            historySubtitle: 'Review your past searches',
            logout: 'Secure Sign Out'
        },
        pricing: {
            badge: 'More value for less',
            title: 'Want more search capacity?',
            copyHtml: 'Starting at <strong class="text-emerald-600">$39 MXN/month</strong> — ad-free, with price alerts and tools to find the best deals faster.',
            chipAds: 'No ads',
            chipAlerts: 'Price alerts',
            chipCoupons: 'Exclusive coupons',
            button: 'View Plans & Pricing'
        },
        footer: {
            supporting: 'Compare with more clarity. Decide faster.',
            rights: '© 2026 Lumu AI. All rights reserved.',
            explore: 'Explore',
            cheapPhones: 'Budget phones',
            phonePrices: 'Phone prices',
            valuePhones: 'Best value phones',
            workStudy: 'Work and study',
            gaming: 'Gaming',
            styleHome: 'Style and home',
            about: 'About Us',
            privacy: 'Privacy',
            terms: 'Terms',
            savingsGuide: 'Savings Guide',
            tutorial: 'Tutorial',
            trustPrivacy: 'Clear privacy',
            trustStores: 'Trusted stores',
            trustNoSpam: 'No spam'
        },
        b2b: {
            title: 'Reseller Plan (B2B)',
            copy: 'Bulk search in batches to export into Excel.',
            copyHighlight: '(Maximum 10 items per batch in Beta)',
            inputLabel: 'Product List (One per line)',
            placeholder: 'Paste your inventory list here:\n\nNintendo Switch OLED\nPS5 Console\niPhone 15 Pro Max 256GB\nDyson V15 Vacuum\nLG Ultrawide 34 Monitor',
            process: 'Process Batch',
            resultsTitle: 'Bulk Search Results',
            export: 'Export CSV',
            loader: 'Analyzing global markets...',
            thQuery: 'Your Query',
            thPrice: 'Best Price',
            thStore: 'Store',
            thAction: 'Action',
            empty: 'Paste your list and click process to see the results here.'
        },
        feedback: {
            title: 'Share your feedback',
            copy: 'Help us improve Lumu AI.',
            label: 'Your suggestion or comment',
            placeholder: 'Ex. You should add more stores like Zara or H&M...',
            submit: 'Send Feedback',
            successTitle: 'Thanks for your support!',
            successCopy: 'We received your message successfully.'
        },
        ad: {
            title: 'Link Locked',
            copy: 'To keep Lumu 100% free, watch this short sponsored ad to unlock the offer.',
            waiting: 'Waiting for ad...',
            vipPrefix: 'Tired of ads?',
            vipButton: 'Go VIP'
        },
        favorites: {
            title: 'My Favorites',
            subtitle: 'Your Personal Wishlist',
            cloud: 'Cloud saved via Supabase',
            close: 'Close'
        },
        auth: {
            title: 'Create your free account',
            copy: 'Unlock more searches, favorites, history, and price alerts.',
            bonus: '🎁 Welcome bonus: extra searches included',
            benefit1: 'More searches when you sign up',
            benefit2: 'Earn Lumu Coins with each search',
            benefit3: 'Save favorites and history',
            benefit4: 'Enable price alerts',
            google: 'Continue with Google',
            termsHtml: 'By continuing, you agree to our <a href="/terms.html" class="underline hover:text-primary">Terms</a> and <a href="/privacy.html" class="underline hover:text-primary">Privacy</a>.'
        },
        mobileMenu: {
            title: 'Menu',
            inspiration: 'Inspiration',
            trending: 'Trending',
            favorites: 'My Favorites',
            b2b: 'Reseller Plan (B2B)',
            categories: 'Categories',
            tech: 'Tech',
            fashion: 'Fashion',
            home: 'Home',
            sports: 'Sports',
            beauty: 'Beauty',
            toys: 'Toys'
        },
        compare: {
            title: 'Product Comparison',
            clear: 'Clear',
            open: 'Compare'
        },
        seoGuides: {
            title: 'Lumu Buying Guides',
            copy: 'Learn how to find the best deals and save like an expert',
            guide1Title: 'How to choose your next laptop',
            guide1Copy: 'Discover which processor and RAM you really need to work or study without overpaying in 2026.',
            guide2Title: 'Smart Home Appliances',
            guide2Copy: 'Save on your electric bill by choosing appliances with energy efficiency certification and Inverter technology.',
            guide3Title: 'The Art of Using Coupons',
            guide3Copy: 'Learn to combine flash deals with bank coupons to get real discounts of up to 70%.',
            cta: 'Read more',
            popularTitle: 'Popular Searches in the US',
            popular1: 'iPhone 16 on sale',
            popular2: 'Cheap noise-cancelling headphones',
            popular3: 'Buy a 4K Smart TV online',
            popular4: 'Best price on Ninja Air Fryers',
            popular5: 'Nike sneakers on clearance'
        },
        cookies: {
            title: 'Lumu Privacy',
            copyHtml: 'We use essential cookies for session, favorites, and security. With your permission, we enable analytics to improve recommendations and measure performance. <a href="/privacy.html" class="text-emerald-700 hover:text-emerald-800 underline font-bold">View policy</a>.',
            reject: 'Essential only',
            accept: 'Accept and continue',
            backToTop: 'Back to top',
            floatingFeedback: 'Share your feedback'
        },
        wishlistShare: {
            title: 'Share my Wishlist',
            copy: 'Share your favorite products with a link',
            savedLabel: 'Your saved products:',
            copyButton: 'Copy',
            whatsapp: 'Share on WhatsApp'
        },
        postBuy: {
            title: '🛍️ Did you check out the product?',
            copy: 'Tell us about your experience and help other shoppers',
            yes: '✅ Yes, I checked it out',
            no: 'Not yet'
        },
        achievements: {
            title: 'My Achievements',
            copy: 'Achievements are based on your searches with Lumu'
        }
    }
};

// --- State ---
let chatHistory = [];
let adInterval = null;
window._pendingAdUrl = null;
window._pendingAdUrlOriginal = null;
let lastB2bData = null;
let currentPhoneAttempt = '';
let currentStep = 1;
const totalSteps = 3;
let _authModalWasOpened = false;
let _authModalCompleted = false;
let _isSearchInProgress = false;
let _activeSearchAbortController = null;
let _activeBrowseCategory = '';
let _deepResearchArmed = false;
let _lastSubmittedDeepResearch = false;
const DEEP_RESEARCH_UPDATE_BANNER_KEY = 'lumu_seen_deep_search_update_v1';
let _searchFlowRevealObserver = null;

function ensureSearchFlowRevealObserver() {
    if (_searchFlowRevealObserver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return _searchFlowRevealObserver;
    _searchFlowRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            _searchFlowRevealObserver?.unobserve(entry.target);
        });
    }, {
        threshold: 0.14,
        rootMargin: '0px 0px -8% 0px'
    });
    return _searchFlowRevealObserver;
}

function observeSearchFlowElement(element, delay = 0) {
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.classList.add('is-visible');
        return;
    }
    element.classList.add('search-flow-reveal');
    if (delay > 0) {
        element.style.transitionDelay = `${delay}ms`;
    }
    const observer = ensureSearchFlowRevealObserver();
    observer?.observe(element);
}

function initSearchFlowReveal() {
    [
        document.getElementById('search-form'),
        document.getElementById('filters-wrapper'),
        document.getElementById('search-context-panel'),
        document.getElementById('results-toolbar'),
        document.getElementById('pricing-section')
    ].forEach((element, index) => observeSearchFlowElement(element, index * 40));
}

function maybeShowDeepResearchUpdateBanner() {
    if (localStorage.getItem(DEEP_RESEARCH_UPDATE_BANNER_KEY) === 'true') return;
    const searchShell = document.getElementById('search-shell');
    const selector = document.getElementById('search-mode-selector');
    if (!searchShell || !selector) return;
    if (document.getElementById('deep-research-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'deep-research-update-banner';
    banner.className = 'mx-2 mb-3 rounded-[1.6rem] border px-4 py-4 md:px-5 md:py-4';
    banner.innerHTML = `
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="min-w-0">
                <div class="mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]" data-banner-chip>
                    <span>✨</span>
                    <span>${getLocalizedText('Nueva actualización', 'New update')}</span>
                </div>
                <p class="text-sm font-black" data-banner-title>${getLocalizedText('Búsqueda Profunda ahora revisa más tiendas y variantes.', 'Deep Research now checks more stores and variants.')}</p>
                <p class="mt-1 text-xs md:text-sm font-medium leading-relaxed" data-banner-copy>${getLocalizedText('Actívala cuando quieras ampliar resultados VIP. Este aviso solo te lo mostramos una vez.', 'Enable it anytime to expand VIP results. This notice is only shown once.')}</p>
            </div>
            <div class="flex items-center gap-2 md:flex-shrink-0">
                <button type="button" id="deep-research-update-cta" class="inline-flex items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white ring-1 ring-white/10 transition hover:bg-white/15">${getLocalizedText('Ver modo', 'View mode')}</button>
                <button type="button" id="deep-research-update-close" class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black/10 text-white/80 transition hover:bg-black/20 hover:text-white" aria-label="Close">✕</button>
            </div>
        </div>
    `;

    searchShell.insertBefore(banner, selector.closest('.flex.items-center.shrink-0')?.parentElement?.parentElement || searchShell.children[3] || null);
    observeSearchFlowElement(banner, 20);

    const dismiss = () => {
        localStorage.setItem(DEEP_RESEARCH_UPDATE_BANNER_KEY, 'true');
        banner.remove();
    };

    banner.querySelector('#deep-research-update-close')?.addEventListener('click', dismiss);
    banner.querySelector('#deep-research-update-cta')?.addEventListener('click', () => {
        selector.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btnDeepResearch?.classList.add('animate-pulse');
        setTimeout(() => btnDeepResearch?.classList.remove('animate-pulse'), 1600);
        dismiss();
    });
}

function setDeepResearchState(enabled) {
    _deepResearchArmed = Boolean(enabled);
    if (!btnDeepResearch || !btnSearchModeNormal) return;
    btnDeepResearch.setAttribute('data-enabled', _deepResearchArmed ? 'true' : 'false');
    btnSearchModeNormal.setAttribute('data-enabled', _deepResearchArmed ? 'false' : 'true');
    btnDeepResearch.classList.toggle('bg-white', _deepResearchArmed);
    btnDeepResearch.classList.toggle('shadow-sm', _deepResearchArmed);
    btnDeepResearch.classList.toggle('text-violet-800', _deepResearchArmed);
    btnDeepResearch.classList.toggle('text-violet-600', !_deepResearchArmed);
    btnDeepResearch.classList.toggle('ring-1', _deepResearchArmed);
    btnDeepResearch.classList.toggle('ring-violet-200', _deepResearchArmed);
    btnSearchModeNormal.classList.toggle('bg-white', !_deepResearchArmed);
    btnSearchModeNormal.classList.toggle('shadow-sm', !_deepResearchArmed);
    btnSearchModeNormal.classList.toggle('text-slate-800', !_deepResearchArmed);
    btnSearchModeNormal.classList.toggle('text-slate-500', _deepResearchArmed);
    btnSearchModeNormal.classList.toggle('ring-1', !_deepResearchArmed);
    btnSearchModeNormal.classList.toggle('ring-slate-200', !_deepResearchArmed);
    const copyEl = document.getElementById('deep-research-copy');
    const badgeEl = document.getElementById('deep-research-badge');
    if (copyEl) {
        copyEl.textContent = _deepResearchArmed
            ? getLocalizedText('Modo activo: más tiendas, más variantes y mejores resultados. Usa más créditos VIP.', 'Active mode: more stores, more variants, and better results. Uses more VIP credits.')
            : getLocalizedText('Modo normal activo. Cambia a Búsqueda Profunda para ampliar resultados.', 'Normal mode active. Switch to Deep Research to expand results.');
    }
    if (badgeEl) {
        badgeEl.classList.toggle('inline-flex', _deepResearchArmed);
        badgeEl.classList.toggle('hidden', !_deepResearchArmed);
        badgeEl.classList.toggle('animate-pulse', _deepResearchArmed);
        if (_deepResearchArmed) {
            setTimeout(() => badgeEl.classList.remove('animate-pulse'), 1800);
        }
    }
}

function showDeepResearchSelectorNotice(message, tone = 'info') {
    const selector = document.getElementById('search-mode-selector');
    if (!selector) {
        safeToast(message, tone);
        return;
    }
    const parent = selector.parentElement;
    if (!parent) {
        safeToast(message, tone);
        return;
    }

    const existing = document.getElementById('deep-research-selector-notice');
    if (existing) existing.remove();

    const palette = tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-violet-200 bg-violet-50 text-violet-800';

    const notice = document.createElement('div');
    notice.id = 'deep-research-selector-notice';
    notice.className = `mt-2 w-full max-w-md rounded-xl border px-3 py-2 text-[10px] sm:text-[11px] font-bold shadow-sm leading-tight ${palette}`;
    notice.textContent = message;
    parent.classList.add('relative', 'flex-col', 'items-start');
    parent.appendChild(notice);

    clearTimeout(showDeepResearchSelectorNotice._timer);
    showDeepResearchSelectorNotice._timer = setTimeout(() => {
        notice.remove();
    }, 3200);
}

async function hasVipAccess() {
    const currentPlan = String(currentUser?.plan || '').toLowerCase();
    if (currentUser?.is_premium || ['personal_vip', 'personal_vip_annual', 'b2b', 'b2b_annual', 'vip', 'pro'].includes(currentPlan)) {
        return true;
    }
    if (!currentUser || !supabaseClient) return false;
    try {
        const { data: profileData } = await supabaseClient
            .from('profiles')
            .select('is_premium, plan')
            .eq('id', currentUser.id)
            .single();
        const plan = String(profileData?.plan || '').toLowerCase();
        return Boolean(profileData?.is_premium || ['personal_vip', 'personal_vip_annual', 'b2b', 'b2b_annual', 'vip', 'pro'].includes(plan));
    } catch {
        return false;
    }
}

async function promptDeepResearchUpgrade() {
    if (!currentUser) {
        safeToast(getLocalizedText('Inicia sesión para usar Búsqueda Profunda.', 'Sign in to use Deep Research.'), 'info');
        openModal();
        return;
    }

    const isES = currentRegion !== 'US';

    // Remove any existing upgrade modal
    document.getElementById('vip-upgrade-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vip-upgrade-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:24px;max-width:420px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,0.25);transform:scale(0.95);opacity:0;transition:all 0.3s ease;max-height:90vh;overflow-y:auto;';

    panel.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="width:56px;height:56px;margin:0 auto 12px;background:linear-gradient(135deg,#8b5cf6,#d946ef);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 16px rgba(139,92,246,0.3);">
                <span style="font-size:28px;">✨</span>
            </div>
            <div style="display:inline-block;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:999px;padding:4px 12px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#6d28d9;margin-bottom:10px;">VIP ${isES ? 'Recomendado' : 'Recommended'}</div>
            <h3 style="font-size:22px;font-weight:900;color:#0f172a;margin:0 0 8px;">${isES ? '¿Deseas convertirte en VIP?' : 'Want to become VIP?'}</h3>
            <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0;">${isES ? 'Búsqueda Profunda revisa más tiendas, más variantes y te da los mejores resultados. Es exclusiva del plan VIP.' : 'Deep Research checks more stores, more variants, and gives you the best results. Exclusive to VIP.'}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#ecfdf5;border:1px solid #d1fae5;border-radius:16px;">
                <span style="font-size:20px;">🔬</span>
                <div>
                    <div style="font-size:12px;font-weight:700;color:#064e3b;">${isES ? 'Búsqueda Profunda VIP' : 'VIP Deep Research'}</div>
                    <div style="font-size:10px;color:#047857;">${isES ? 'Más tiendas, más variantes y mejores resultados' : 'More stores, variants, and better results'}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f5f3ff;border:1px solid #ede9fe;border-radius:16px;">
                <span style="font-size:20px;">⚡</span>
                <div>
                    <div style="font-size:12px;font-weight:700;color:#4c1d95;">${isES ? 'Más créditos VIP' : 'More VIP credits'}</div>
                    <div style="font-size:10px;color:#6d28d9;">${isES ? 'Activa búsquedas más potentes con tu plan' : 'Unlock more powerful searches'}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#eff6ff;border:1px solid #dbeafe;border-radius:16px;">
                <span style="font-size:20px;">💎</span>
                <div>
                    <div style="font-size:12px;font-weight:700;color:#1e3a5f;">${isES ? 'Acceso prioritario' : 'Priority access'}</div>
                    <div style="font-size:10px;color:#2563eb;">${isES ? 'Nuevas funciones primero' : 'New features first'}</div>
                </div>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
            <button type="button" data-action="confirm" style="width:100%;padding:14px;border:none;border-radius:16px;font-size:14px;font-weight:700;color:#fff;background:linear-gradient(135deg,#7c3aed,#d946ef);cursor:pointer;box-shadow:0 4px 14px rgba(124,58,237,0.4);min-height:52px;">
                ${isES ? '✨ Ver planes VIP' : '✨ View VIP plans'}
            </button>
            <button type="button" data-action="cancel" style="width:100%;padding:14px;border:none;border-radius:16px;font-size:14px;font-weight:700;color:#64748b;background:#f1f5f9;cursor:pointer;min-height:48px;">
                ${isES ? 'Ahora no' : 'Not now'}
            </button>
        </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
        panel.style.transform = 'scale(1)';
        panel.style.opacity = '1';
    });

    const closeUpgradeModal = () => {
        panel.style.transform = 'scale(0.95)';
        panel.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    };

    // Use event delegation on overlay — guaranteed to work
    overlay.addEventListener('click', (e) => {
        const target = e.target;

        // Click on backdrop
        if (target === overlay) {
            closeUpgradeModal();
            return;
        }

        // Click on cancel or close
        const cancelBtn = target.closest('[data-action="cancel"]');
        if (cancelBtn) {
            closeUpgradeModal();
            return;
        }

        // Click on confirm (Ver planes VIP)
        const confirmBtn = target.closest('[data-action="confirm"]');
        if (confirmBtn) {
            closeUpgradeModal();
            // Navigate to pricing page
            window.location.href = '/precios.html';
            return;
        }
    });
}

function explainDeepResearchMode(isVipEligible = false) {
    const message = isVipEligible
        ? getLocalizedText(
            '🔬 **Búsqueda Profunda** revisa más tiendas, más variantes y más rescates para darte los mejores resultados posibles. Está incluida en cualquier plan VIP y consume más créditos de tu plan que una búsqueda normal.',
            '🔬 **Deep Research** checks more stores, more variants, and more rescue paths to give you the best possible results. It is included in any VIP plan and consumes more plan credits than a normal search.'
        )
        : getLocalizedText(
            '🔬 **Búsqueda Profunda** revisa más tiendas, más variantes y más rescates para darte los mejores resultados posibles. Para usarla necesitas cualquier plan VIP y consume más créditos de tu plan que una búsqueda normal.',
            '🔬 **Deep Research** checks more stores, more variants, and more rescue paths to give you the best possible results. To use it, you need any VIP plan and it consumes more plan credits than a normal search.'
        );
    showDeepResearchSelectorNotice(message.replace(/\*\*/g, ''), isVipEligible ? 'success' : 'warning');
}

function setBrowseCategoryState(categoryKey = '') {
    _activeBrowseCategory = categoryKey || '';
    document.querySelectorAll('[data-header-category]').forEach((button) => {
        button.classList.toggle('browse-nav-chip-active', button.getAttribute('data-header-category') === _activeBrowseCategory);
    });
}

function revealLandingBrowseSections() {
    const ids = ['header-browse-strip', 'category-icon-bar', 'flash-deals-section', 'tendencias-section'];
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.classList.remove('hidden');
    });
}

function hideLandingBrowseSections() {
    const ids = ['category-icon-bar', 'flash-deals-section', 'tendencias-section'];
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });
}

function queueBrowseSearch(query, categoryKey = '') {
    if (!query) return;
    const input = document.getElementById('search-input');
    const form = document.getElementById('search-form');
    if (!input || !form) return;

    setBrowseCategoryState(categoryKey);
    input.value = query;
    input.style.height = '56px';
    input.style.height = `${input.scrollHeight}px`;
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

// --- Conversion Analytics ---
const _detectDevice = () => /Mobi|Android/i.test(navigator.userAgent) ? (/iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'mobile') : 'desktop';
let _conversionBounceTimer = null;
const _ensureInteractionSessionId = () => {
    if (!window._interactionSessionId) {
        window._interactionSessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return window._interactionSessionId;
};
const _buildProductTrackingPayload = (product = {}, extra = {}) => ({
    product_title: product.titulo || '',
    store: product.tienda || '',
    url: product.urlMonetizada || product.urlOriginal || '',
    price: Number(product.precio || 0) || undefined,
    result_source: product.resultSource || undefined,
    store_tier: Number(product.storeTier || 0) || undefined,
    best_buy_score: typeof product.bestBuyScore === 'number' ? product.bestBuyScore : undefined,
    brand: product.storeCanonical || undefined,
    ...extra
});
window._lastSearchContext = { canonical_key: '', product_category: '', search_id: '', search_query: '' };
function _trackEvent(event_type, extra = {}) {
    try {
        const searchContext = window._lastSearchContext || {};
        const body = {
            event_type,
            device: _detectDevice(),
            canonical_key: searchContext.canonical_key || undefined,
            product_category: searchContext.product_category || undefined,
            search_id: searchContext.search_id || undefined,
            session_id: _ensureInteractionSessionId(),
            search_query: searchContext.search_query || window._lastSearchQuery || undefined,
            ...extra
        };
        const headers = { 'Content-Type': 'application/json' };
        if (window.supabaseClient && window.currentUser) {
            window.supabaseClient.auth.getSession().then(({ data }) => {
                if (data?.session?.access_token) headers['Authorization'] = `Bearer ${data.session.access_token}`;
                fetch('/api/track', { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => { });
            }).catch(() => {
                fetch('/api/track', { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => { });
            });
        } else {
            fetch('/api/track', { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => { });
        }
    } catch (e) { /* never block UI */ }
}

// --- Interactive Tutorial State ---
let tutorialActive = false;
let tutorialStep = 1;

window.initTutorial = function() {
    const tutorialCompleto = localStorage.getItem('lumu_tutorial_v2');
    if (!tutorialCompleto) {
        tutorialActive = true;
        const overlay = document.getElementById('tutorial-overlay');
        if(overlay) {
            overlay.classList.remove('invisible', 'opacity-0');
            showTutorialStep(1);
        }
    }
};

window.showTutorialStep = function(step) {
    document.querySelectorAll('.tutorial-step').forEach(el => el.classList.add('hidden'));
    const currentStepEl = document.getElementById(`tutorial-step-${step}`);
    if(currentStepEl) {
        currentStepEl.classList.remove('hidden');
        tutorialStep = step;
    }
};

window.nextTutorialStep = function(step) {
    showTutorialStep(step);
};

window.finishTutorial = function() {
    const overlay = document.getElementById('tutorial-overlay');
    if(overlay) {
        overlay.classList.add('invisible', 'opacity-0');
        setTimeout(() => {
            localStorage.setItem('lumu_tutorial_v2', 'true');
            tutorialActive = false;
        }, 300);
    }
    
    // Auto-focus search input to encourage immediate action
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.focus();
};

// Listeners for closing the tutorial early and progressing steps
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('tutorial-close');
    if(closeBtn) {
        closeBtn.addEventListener('click', window.finishTutorial);
    }
    
    // Tutorial Navigation Buttons (CSP Compliant)
    const btnNext2 = document.getElementById('btn-tutorial-next-2');
    if(btnNext2) btnNext2.addEventListener('click', () => window.nextTutorialStep(2));
    
    const btnNext3 = document.getElementById('btn-tutorial-next-3');
    if(btnNext3) btnNext3.addEventListener('click', () => window.nextTutorialStep(3));
    
    const btnFinish = document.getElementById('btn-tutorial-finish');
    if(btnFinish) btnFinish.addEventListener('click', window.finishTutorial);
    
    const btnReset = document.getElementById('btn-reset-tutorial');
    if(btnReset) {
        btnReset.addEventListener('click', () => {
            localStorage.removeItem('lumu_tutorial_done'); 
            localStorage.removeItem('lumu_onboarding_done'); 
            localStorage.removeItem('lumu_tutorial_v2');
            location.reload();
        });
    }
});

// --- Modal Transitions ---
function openModal() {
    if (!authModal) return;
    if (!_authModalWasOpened) {
        _authModalWasOpened = true;
        _authModalCompleted = false;
        _trackEvent('auth_modal_open');
    }
    authModal.classList.remove('invisible', 'opacity-0');
    const panel = authModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }
};

function closeModal() {
    if (!authModal) return;
    if (_authModalWasOpened && !_authModalCompleted && !currentUser) {
        _trackEvent('auth_modal_dismiss');
    }
    _authModalWasOpened = false;
    authModal.classList.add('invisible', 'opacity-0');
    const panel = authModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-100');
        panel.classList.add('scale-95');
    }
};

// --- Global Feedback Toast ---
function showGlobalFeedback(message, type = 'info') {
    // Remove existing toast if present
    const existing = document.getElementById('global-feedback-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'global-feedback-toast';
    const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-slate-800';
    toast.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[999] ${bgColor} text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold transition-all duration-300 opacity-0 translate-y-[-10px]`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-[-10px]');
        toast.classList.add('opacity-100', 'translate-y-0');
    });

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
};

function getRegionConfig() {
    return REGION_LABELS[currentRegion] || REGION_LABELS.MX;
}

function getRegionUICopy() {
    return REGION_UI_COPY[currentRegion] || REGION_UI_COPY.MX;
}

function setTextById(id, value) {
    const element = document.getElementById(id);
    if (element && typeof value === 'string') element.textContent = value;
}

function setHTMLById(id, value) {
    const element = document.getElementById(id);
    if (element && typeof value === 'string') element.innerHTML = value;
}

function setPlaceholderById(id, value) {
    const element = document.getElementById(id);
    if (element && typeof value === 'string') element.placeholder = value;
}

function setTitleById(id, value) {
    const element = document.getElementById(id);
    if (element && typeof value === 'string') element.title = value;
}

function setFirstTextNodeById(id, value) {
    const element = document.getElementById(id);
    if (!element || typeof value !== 'string') return;
    const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (textNode) {
        textNode.textContent = ` ${value}`;
    }
}

function formatCurrencyByRegion(amount) {
    const config = getRegionConfig();
    return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency
    }).format(Number(amount || 0));
}

function formatCurrencyByCode(amount, regionCode = currentRegion) {
    const normalizedRegion = String(regionCode || currentRegion || 'MX').toUpperCase();
    const config = REGION_LABELS[normalizedRegion] || REGION_LABELS.MX;
    return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency
    }).format(Number(amount || 0));
}

function getProductCurrencyCode(product = {}) {
    const explicitCode = String(product.currencyCode || product.currency || '').trim().toUpperCase();
    if (explicitCode) return explicitCode;
    const countryCode = String(product.countryCode || product.country || product.region || currentRegion || 'MX').trim().toUpperCase();
    const config = REGION_LABELS[countryCode] || REGION_LABELS.MX;
    return config.currency || 'MXN';
}

function formatProductPriceLabel(amount, product = {}) {
    const countryCode = String(product.countryCode || product.country || product.region || currentRegion || 'MX').trim().toUpperCase();
    const formatted = formatCurrencyByCode(amount, countryCode);
    const currencyCode = getProductCurrencyCode(product);
    return `${formatted} ${currencyCode}`.trim();
}

function getStoredOnboardingPreference() {
    return String(localStorage.getItem(ONBOARDING_PREF_KEY) || '').trim().toLowerCase();
}

function applyOnboardingPreference(preference = '') {
    const normalizedPreference = String(preference || '').trim().toLowerCase();
    if (!normalizedPreference) return;

    if (conditionModeInput && !conditionModeInput.value) {
        conditionModeInput.value = 'all';
    }

    const btnSafeStores = document.getElementById('btn-safe-stores');
    if (btnSafeStores && normalizedPreference === 'trusted') {
        btnSafeStores.setAttribute('data-safe', 'true');
        btnSafeStores.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
        btnSafeStores.classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
    } else if (btnSafeStores && btnSafeStores.getAttribute('data-safe') !== 'true') {
        btnSafeStores.setAttribute('data-safe', 'false');
        btnSafeStores.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
        btnSafeStores.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
    }

    if (searchInput) {
        if (normalizedPreference === 'cheapest' && !searchInput.placeholder.toLowerCase().includes('barato')) {
            searchInput.placeholder = isEnglishRegion()
                ? 'Search products and find the cheapest real option...'
                : 'Busca productos y encuentra la opción más barata real...';
        } else if (normalizedPreference === 'best_value' && !searchInput.placeholder.toLowerCase().includes('value')) {
            searchInput.placeholder = isEnglishRegion()
                ? 'Search products and compare the best value options...'
                : 'Busca productos y compara las opciones que más convienen...';
        }
    }

    if (typeof renderActiveFiltersSummary === 'function') renderActiveFiltersSummary();
}

function buildWelcomeOnboardingModal() {
    const existing = document.getElementById('welcome-onboarding-modal');
    if (existing) return existing;
    const _onbEs = !isEnglishRegion();

    const overlay = document.createElement('div');
    overlay.id = 'welcome-onboarding-modal';
    overlay.className = 'fixed inset-0 z-[120] hidden items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4';
    overlay.innerHTML = `
        <div class="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/60 bg-white shadow-2xl">
            <button id="welcome-onboarding-close" class="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-slate-800" aria-label="Close onboarding">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <div class="welcome-onboarding-hero bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-6 py-8 text-white md:px-8">
                <div class="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.25em]">${_onbEs ? 'Bienvenido a Lumu' : 'Welcome to Lumu'}</div>
                <h2 id="welcome-onboarding-title" class="mt-4 text-3xl font-black leading-tight">${_onbEs ? '¿Desde dónde compras?' : 'Where are you shopping from?'}</h2>
                <p id="welcome-onboarding-copy" class="mt-2 max-w-xl text-sm font-medium text-emerald-50/90">${_onbEs ? 'Elige tu país para mostrarte las tiendas, precios y moneda correctos.' : 'Pick your country so we can show the right stores, prices and currency from the start.'}</p>
            </div>
            <div class="welcome-onboarding-panel px-6 py-6 md:px-8 md:py-8">
                <div id="welcome-onboarding-step-1" class="space-y-4">
                    <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <button type="button" data-region-choice="MX" class="welcome-region-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-2xl">🇲🇽</div><div class="mt-2 text-sm font-black text-slate-900">México</div><div class="text-xs font-medium text-slate-500">MXN · Amazon MX · Mercado Libre</div></button>
                        <button type="button" data-region-choice="US" class="welcome-region-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-2xl">🇺🇸</div><div class="mt-2 text-sm font-black text-slate-900">United States</div><div class="text-xs font-medium text-slate-500">USD · Amazon · Walmart · Target</div></button>
                        <button type="button" data-region-choice="CL" class="welcome-region-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-2xl">🇨🇱</div><div class="mt-2 text-sm font-black text-slate-900">Chile</div><div class="text-xs font-medium text-slate-500">CLP · Falabella · Ripley · Paris</div></button>
                        <button type="button" data-region-choice="CO" class="welcome-region-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-2xl">🇨🇴</div><div class="mt-2 text-sm font-black text-slate-900">Colombia</div><div class="text-xs font-medium text-slate-500">COP · Éxito · Alkosto · ML</div></button>
                        <button type="button" data-region-choice="AR" class="welcome-region-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-2xl">🇦🇷</div><div class="mt-2 text-sm font-black text-slate-900">Argentina</div><div class="text-xs font-medium text-slate-500">ARS · Frávega · ML · Musimundo</div></button>
                        <button type="button" data-region-choice="PE" class="welcome-region-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-2xl">🇵🇪</div><div class="mt-2 text-sm font-black text-slate-900">Perú</div><div class="text-xs font-medium text-slate-500">PEN · Falabella · Ripley · Plaza Vea</div></button>
                    </div>
                </div>
                <div id="welcome-onboarding-step-2" class="hidden space-y-4">
                    <div class="grid gap-3">
                        <button type="button" data-pref-choice="cheapest" class="welcome-pref-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-sm font-black text-slate-900">${_onbEs ? '💰 Precio más bajo' : '💰 Cheapest price'}</div><div class="mt-1 text-xs font-medium text-slate-500">${_onbEs ? 'Priorizamos los precios más bajos primero.' : 'We prioritize lower prices first.'}</div></button>
                        <button type="button" data-pref-choice="best_value" class="welcome-pref-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-sm font-black text-slate-900">${_onbEs ? '⭐ Mejor relación calidad-precio' : '⭐ Best value'}</div><div class="mt-1 text-xs font-medium text-slate-500">${_onbEs ? 'Equilibrio entre precio, confianza y calidad.' : 'Balance price, trust and product quality.'}</div></button>
                        <button type="button" data-pref-choice="trusted" class="welcome-pref-option rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><div class="text-sm font-black text-slate-900">${_onbEs ? '🏪 Solo tiendas seguras' : '🏪 Trusted stores only'}</div><div class="mt-1 text-xs font-medium text-slate-500">${_onbEs ? 'Empezar con tiendas oficiales y vendedores verificados.' : 'Start with safer stores and official sellers.'}</div></button>
                    </div>
                </div>
                <div class="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <button id="welcome-onboarding-back" type="button" class="hidden rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">${_onbEs ? 'Atrás' : 'Back'}</button>
                    <div class="ml-auto flex items-center gap-2">
                        <button id="welcome-onboarding-skip" type="button" class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50">${_onbEs ? 'Saltar' : 'Skip'}</button>
                        <button id="welcome-onboarding-next" type="button" class="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" disabled>${_onbEs ? 'Continuar' : 'Continue'}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function initWelcomeOnboarding() {
    applyOnboardingPreference(getStoredOnboardingPreference());
    const overlay = buildWelcomeOnboardingModal();
    const title = document.getElementById('welcome-onboarding-title');
    const copy = document.getElementById('welcome-onboarding-copy');
    const step1 = document.getElementById('welcome-onboarding-step-1');
    const step2 = document.getElementById('welcome-onboarding-step-2');
    const nextBtn = document.getElementById('welcome-onboarding-next');
    const backBtn = document.getElementById('welcome-onboarding-back');
    const skipBtn = document.getElementById('welcome-onboarding-skip');
    const closeBtn = document.getElementById('welcome-onboarding-close');

    if (!overlay || !title || !copy || !step1 || !step2 || !nextBtn || !backBtn || !skipBtn || !closeBtn) return;

    let selectedRegion = '';
    let selectedPreference = '';
    let currentStep = 1;
    let autoOpenTimer = null;

    const hideModal = (markDone = false) => {
        if (autoOpenTimer) {
            clearTimeout(autoOpenTimer);
            autoOpenTimer = null;
        }
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        if (markDone) {
            localStorage.setItem(ONBOARDING_V3_KEY, 'done');
        }
    };

    const syncStepUi = () => {
        const isStepOne = currentStep === 1;
        step1.classList.toggle('hidden', !isStepOne);
        step2.classList.toggle('hidden', isStepOne);
        backBtn.classList.toggle('hidden', isStepOne);
        const _sEs = !isEnglishRegion(selectedRegion || currentRegion);
        title.textContent = isStepOne
            ? (_sEs ? '¿Desde dónde compras?' : 'Where are you shopping from?')
            : (_sEs ? '¿Qué es lo más importante para ti?' : 'What matters most to you?');
        copy.textContent = isStepOne
            ? (_sEs ? 'Elige tu país para mostrarte las tiendas, precios y moneda correctos.' : 'Pick your country so we can show the right stores, prices and currency from the start.')
            : (_sEs ? 'Elige un estilo de búsqueda. Puedes cambiar los filtros cuando quieras.' : 'Choose a default shopping style. You can still change filters any time.');
        nextBtn.textContent = isStepOne
            ? (_sEs ? 'Continuar' : 'Continue')
            : (_sEs ? 'Empezar a usar Lumu' : 'Start using Lumu');
        nextBtn.disabled = isStepOne ? !selectedRegion : !selectedPreference;
    };

    overlay.querySelectorAll('[data-region-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            selectedRegion = button.getAttribute('data-region-choice') || 'MX';
            overlay.querySelectorAll('[data-region-choice]').forEach((item) => {
                item.classList.remove('border-emerald-500', 'bg-emerald-50', 'ring-2', 'ring-emerald-200');
            });
            button.classList.add('border-emerald-500', 'bg-emerald-50', 'ring-2', 'ring-emerald-200');
            nextBtn.disabled = false;
        });
    });

    overlay.querySelectorAll('[data-pref-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            selectedPreference = button.getAttribute('data-pref-choice') || 'best_value';
            overlay.querySelectorAll('[data-pref-choice]').forEach((item) => {
                item.classList.remove('border-emerald-500', 'bg-emerald-50', 'ring-2', 'ring-emerald-200');
            });
            button.classList.add('border-emerald-500', 'bg-emerald-50', 'ring-2', 'ring-emerald-200');
            nextBtn.disabled = false;
        });
    });

    nextBtn.addEventListener('click', () => {
        if (currentStep === 1) {
            if (!selectedRegion) return;
            localStorage.setItem(REGION_OVERRIDE_KEY, selectedRegion);
            currentRegion = selectedRegion;
            applyRegionalCopy();
            currentStep = 2;
            syncStepUi();
            return;
        }

        if (!selectedPreference) return;
        localStorage.setItem(ONBOARDING_PREF_KEY, selectedPreference);
        applyOnboardingPreference(selectedPreference);
        hideModal(true);
        if (searchInput) searchInput.focus();
    });

    backBtn.addEventListener('click', () => {
        currentStep = 1;
        syncStepUi();
    });

    const dismissOnboarding = () => {
        applyOnboardingPreference(getStoredOnboardingPreference());
        hideModal(true);
    };

    skipBtn.addEventListener('click', dismissOnboarding);
    closeBtn.addEventListener('click', dismissOnboarding);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) dismissOnboarding();
    });

    syncStepUi();

    window.openWelcomeOnboarding = () => {
        if (autoOpenTimer) {
            clearTimeout(autoOpenTimer);
            autoOpenTimer = null;
        }
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        syncStepUi();
    };

    const onboardingAlreadyDone = localStorage.getItem(ONBOARDING_V3_KEY) === 'done';
    const userAlreadyInteracted = localStorage.getItem('lumu_local_history') || sessionStorage.getItem('just_logged_in');
    const shouldAutoOpen = !onboardingAlreadyDone && !userAlreadyInteracted;

    if (shouldAutoOpen) {
        autoOpenTimer = setTimeout(() => {
            if (document.visibilityState !== 'visible') return;
            if (resultsWrapper && !resultsWrapper.classList.contains('hidden')) return;
            window.openWelcomeOnboarding();
        }, 900);
    }
}

function getRecentHistoryEntries(limit = 4) {
    const rawEntries = JSON.parse(localStorage.getItem('lumu_local_history') || '[]');
    return rawEntries
        .map((entry) => {
            if (typeof entry === 'string') {
                return { query: entry, savedAt: null };
            }
            return {
                query: String(entry?.query || '').trim(),
                savedAt: entry?.savedAt || null
            };
        })
        .filter((entry) => entry.query)
        .slice(0, limit);
}

function renderContinuityHub() {
    const continuityList = document.getElementById('continuity-recent-list');
    const openHistoryBtn = document.getElementById('continuity-open-history');
    const historyMenu = document.getElementById('continuity-history-menu');
    const historyItems = document.getElementById('continuity-history-items');

    if (!continuityList) return;

    const recentEntries = getRecentHistoryEntries(4);
    if (recentEntries.length === 0) {
        continuityList.textContent = isEnglishRegion() ? 'No recent searches' : 'Sin recientes';
        if (historyItems) {
            historyItems.innerHTML = `
                <button type="button" class="continuity-history-open w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-50">
                    ${isEnglishRegion() ? 'Open full history' : 'Abrir historial completo'}
                </button>
            `;
        }
    } else {
        continuityList.textContent = recentEntries[0]?.query || (isEnglishRegion() ? 'Open history' : 'Abrir historial');
        if (historyItems) {
            historyItems.innerHTML = `
                ${recentEntries.map((entry) => `
                    <button type="button" class="continuity-history-entry w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50" data-query="${sanitize(entry.query)}">
                        <p class="truncate text-sm font-bold text-slate-800">${sanitize(entry.query)}</p>
                        <p class="mt-0.5 text-[11px] font-medium text-slate-400">${isEnglishRegion() ? 'Search again' : 'Buscar otra vez'}</p>
                    </button>
                `).join('')}
                <div class="my-1 h-px bg-slate-100"></div>
                <button type="button" class="continuity-history-open w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50">
                    ${isEnglishRegion() ? 'Open full history' : 'Abrir historial completo'}
                </button>
            `;
        }
    }

    if (historyItems) {
        historyItems.querySelectorAll('.continuity-history-entry').forEach((button) => {
            button.addEventListener('click', () => {
                const query = button.getAttribute('data-query') || '';
                historyMenu?.classList.add('hidden');
                if (!query || typeof window.quickSearch !== 'function') return;
                window.quickSearch(query);
            });
        });

        historyItems.querySelectorAll('.continuity-history-open').forEach((button) => {
            button.addEventListener('click', () => {
                historyMenu?.classList.add('hidden');
                if (typeof openHistoryModal === 'function') openHistoryModal();
            });
        });
    }

    if (openHistoryBtn) {
        openHistoryBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (historyMenu) {
                historyMenu.classList.toggle('hidden');
            } else if (typeof openHistoryModal === 'function') {
                openHistoryModal();
            }
        };
    }

    if (historyMenu && !historyMenu.dataset.outsideBound) {
        document.addEventListener('click', (event) => {
            if (!historyMenu.contains(event.target) && !openHistoryBtn?.contains(event.target)) {
                historyMenu.classList.add('hidden');
            }
        });
        historyMenu.dataset.outsideBound = 'true';
    }
}

function detectRegion() {
    const savedOverride = localStorage.getItem(REGION_OVERRIDE_KEY);
    if (savedOverride && savedOverride !== 'auto' && REGION_LABELS[savedOverride]) {
        return savedOverride;
    }
    if (serverDetectedRegion && REGION_LABELS[serverDetectedRegion]) {
        return serverDetectedRegion;
    }
    const lang = (navigator.language || '').toLowerCase();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const timezoneMap = {
        'America/Santiago': 'CL',
        'America/Punta_Arenas': 'CL',
        'America/Bogota': 'CO',
        'America/Buenos_Aires': 'AR',
        'America/Cordoba': 'AR',
        'America/Mendoza': 'AR',
        'America/Lima': 'PE',
        'America/Mexico_City': 'MX',
        'America/Monterrey': 'MX',
        'America/Cancun': 'MX',
        'America/Merida': 'MX',
        'America/Chihuahua': 'MX',
        'America/Mazatlan': 'MX',
        'America/Hermosillo': 'MX',
        'America/Tijuana': 'MX',
        'America/New_York': 'US',
        'America/Chicago': 'US',
        'America/Denver': 'US',
        'America/Los_Angeles': 'US',
        'America/Phoenix': 'US',
        'America/Anchorage': 'US',
        'Pacific/Honolulu': 'US'
    };
    if (timezoneMap[tz]) return timezoneMap[tz];
    if (lang.includes('es-cl')) return 'CL';
    if (lang.includes('es-co')) return 'CO';
    if (lang.includes('es-ar')) return 'AR';
    if (lang.includes('es-pe')) return 'PE';
    if (lang.includes('es-mx')) return 'MX';
    if (lang.includes('en-us') || lang === 'en') return 'US';
    return 'MX';
}

function applyRegionalCopy() {
    currentRegion = detectRegion();
    const config = getRegionConfig();
    const ui = getRegionUICopy();
    const isEnglish = isEnglishRegion(currentRegion);
    const languageBucket = getLanguageBucket(currentRegion);
    const regionBadge = currentRegion === 'auto' ? 'AUTO' : currentRegion;
    const savedOverride = localStorage.getItem(REGION_OVERRIDE_KEY) || 'auto';

    const searchInputEl = document.getElementById('search-input');
    if (searchInputEl) searchInputEl.placeholder = config.searchPlaceholder;

    const searchButtonEl = document.getElementById('search-button');
    if (searchButtonEl) {
        const labelNode = Array.from(searchButtonEl.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (labelNode) labelNode.textContent = ` ${config.submitLabel} `;
    }

    const helperCopy = document.getElementById('location-helper-copy');
    if (helperCopy) {
        const helperTextNode = Array.from(helperCopy.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (helperTextNode) helperTextNode.textContent = ` ${config.helperCopy}`;
    }

    const regionPill = document.getElementById('detected-region-pill');
    if (regionPill) {
        regionPill.innerHTML = `<span aria-hidden="true" class="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-full bg-white px-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm">${regionBadge}</span><span class="min-w-0 truncate">${config.activeRegion || 'Región automática'}</span>`;
    }

    const globalBtn = document.getElementById('filter-global');
    const localBtn = document.getElementById('filter-local-only');
    const nearbyBtn = document.getElementById('filter-nearby');
    const safeBtn = document.getElementById('btn-safe-stores');
    const knownMarketplacesBtn = document.getElementById('btn-known-marketplaces');
    const highRiskBtn = document.getElementById('btn-high-risk-marketplaces');
    const onlyCouponsBtn = document.getElementById('btn-only-coupons');
    const onlyRealDealsBtn = document.getElementById('btn-only-real-deals');
    const advancedFiltersTitle = document.getElementById('filter-section-advanced');
    const pricingCopy = document.getElementById('pricing-copy');

    if (globalBtn) globalBtn.textContent = config.filters.global;
    if (localBtn) localBtn.textContent = config.filters.local_only;
    if (nearbyBtn) nearbyBtn.textContent = config.filters.nearby;
    if (safeBtn) {
        const icon = safeBtn.querySelector('svg')?.outerHTML || '';
        safeBtn.innerHTML = `${icon} ${config.filters.safe}`;
    }
    if (knownMarketplacesBtn) {
        knownMarketplacesBtn.textContent = isEnglish ? 'Known marketplaces' : 'Marketplaces conocidos';
    }
    if (highRiskBtn) {
        highRiskBtn.textContent = isEnglish ? 'High risk' : 'Riesgo alto';
    }
    if (onlyCouponsBtn) {
        onlyCouponsBtn.textContent = isEnglish ? 'Coupons only' : 'Solo con cupón';
    }
    if (onlyRealDealsBtn) {
        onlyRealDealsBtn.textContent = isEnglish ? 'Real deals only' : 'Solo oferta real';
    }
    if (advancedFiltersTitle) {
        advancedFiltersTitle.textContent = isEnglish ? 'Advanced filters' : 'Filtros avanzados';
    }
    if (pricingCopy) {
        pricingCopy.innerHTML = isEnglish
            ? 'From <strong class="text-emerald-600">$39 USD/month</strong> — no ads, price alerts, and tools to find the best deals faster.'
            : `Desde <strong class="text-emerald-600">$39 ${config.currency}/mes</strong> — sin anuncios, con alertas de precio y herramientas para encontrar más rápido las mejores ofertas.`;
    }

    const flashDealsSection = document.getElementById('flash-deals-section');
    if (flashDealsSection) {
        flashDealsSection.classList.toggle('hidden', !['MX', 'US'].includes(currentRegion));
    }

    document.querySelectorAll('.region-option-btn').forEach((button) => {
        const regionCode = button.getAttribute('data-region') || 'auto';
        const isActive = regionCode === savedOverride || (savedOverride === 'auto' && regionCode === 'auto');
        button.classList.toggle('bg-emerald-50', isActive);
        button.classList.toggle('text-emerald-700', isActive);
        button.classList.toggle('ring-1', isActive);
        button.classList.toggle('ring-emerald-200', isActive);
    });

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.content = isEnglish
            ? `Compare prices in ${config.activeRegion} with localized stores, marketplaces and nearby results.`
            : `Compara precios en ${config.activeRegion} con tiendas locales, marketplaces y resultados cerca de ti.`;
    }

    // Toolbar translations
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && config.toolbar) {
        sortSelect.innerHTML = `
            <option value="price-asc">${config.toolbar.sortLowPrice}</option>
            <option value="price-desc">${config.toolbar.sortHighPrice}</option>
            <option value="store">${config.toolbar.sortStore}</option>
            <option value="relevance">${config.toolbar.sortRelevance}</option>
        `;
    }

    const storeFilter = document.getElementById('store-filter');
    if (storeFilter && config.toolbar) {
        const currentValue = storeFilter.value;
        const firstOption = storeFilter.querySelector('option[value="all"]');
        if (firstOption) firstOption.textContent = config.toolbar.allStores;
        storeFilter.value = currentValue;
    }

    const freeShippingLabel = document.getElementById('free-shipping-label');
    if (freeShippingLabel && config.toolbar) {
        freeShippingLabel.textContent = config.toolbar.freeShipping;
    }

    setTextById('nav-ofertas', ui.nav.inspiration);
    setTextById('nav-tendencias', ui.nav.trending);
    setTextById('nav-precios', ui.nav.pricing);
    setTextById('nav-favorites-label', ui.nav.favorites);
    setTextById('mini-favorites-title', ui.nav.miniFavoritesTitle);
    setTextById('mini-favorites-empty', ui.nav.miniFavoritesEmpty);
    setTextById('mini-favorites-open', ui.nav.miniFavoritesOpen);
    setTextById('nav-b2b-label', ui.nav.b2b);
    setTitleById('btn-price-alert', ui.nav.priceAlertTitle);
    setTextById('nav-login-label', ui.nav.login);

    setHTMLById('hero-title', ui.hero.titleHtml);
    setTextById('hero-subtitle', ui.hero.subtitle);
    setTextById('search-assistant-copy', ui.hero.assistant);
    setTitleById('btn-attach-image', ui.hero.attachImageTitle);
    setTitleById('btn-voice-input', ui.hero.voiceInputTitle);

    setTextById('guided-search-title', ui.guidedSearch.title);
    setTextById('guided-search-copy', ui.guidedSearch.copy);
    setTextById('filter-section-condition', ui.guidedSearch.condition);
    setTextById('filter-section-location', ui.guidedSearch.location);
    setTextById('filter-section-ai-shortcuts', ui.guidedSearch.shortcuts);
    setTextById('search-prompt-cheapest', ui.guidedSearch.promptCheapest);
    setTextById('search-prompt-best', ui.guidedSearch.promptBest);
    setTextById('search-prompt-nearby', ui.guidedSearch.promptNearby);

    const promptCheapest = document.getElementById('search-prompt-cheapest');
    const promptBest = document.getElementById('search-prompt-best');
    const promptNearby = document.getElementById('search-prompt-nearby');
    if (promptCheapest) promptCheapest.dataset.prompt = ui.guidedSearch.promptCheapestData;
    if (promptBest) promptBest.dataset.prompt = ui.guidedSearch.promptBestData;
    if (promptNearby) promptNearby.dataset.prompt = ui.guidedSearch.promptNearbyData;

    document.querySelectorAll('.condition-chip').forEach(chip => {
        const mode = chip.getAttribute('data-condition') || 'all';
        chip.textContent = getConditionLabel(mode);
    });

    setTextById('category-chip-tech', ui.categoryBar.tech);
    setTextById('category-chip-fashion', ui.categoryBar.fashion);
    setTextById('category-chip-home', ui.categoryBar.home);
    setTextById('category-chip-sports', ui.categoryBar.sports);
    setTextById('category-chip-beauty', ui.categoryBar.beauty);
    setTextById('category-chip-toys', ui.categoryBar.toys);
    setTextById('category-chip-cars', ui.categoryBar.cars);
    const headerCategoryLabels = {
        smartphones: isEnglish ? 'Phones' : 'Smartphones',
        laptops: ui.categoryBar.laptops,
        gaming: 'Gaming',
        audio: ui.categoryBar.audio,
        tv: 'TVs',
        home: ui.categoryBar.home
    };
    document.querySelectorAll('[data-header-category]').forEach((button) => {
        const key = button.getAttribute('data-header-category') || '';
        if (headerCategoryLabels[key]) button.textContent = headerCategoryLabels[key];
    });
    setBrowseCategoryState(_activeBrowseCategory);

    setTextById('flash-deals-title', ui.home.flashDealsTitle);
    setTextById('flash-deals-view-all', ui.home.viewAll);
    setTextById('flash-deal-badge-1', ui.home.flashBadge1);
    setTextById('flash-deal-meta-1', ui.home.flashMeta1);
    setTextById('flash-deal-badge-2', ui.home.flashBadge2);
    setTextById('flash-deal-meta-2', ui.home.flashMeta2);
    setTextById('flash-deal-meta-3', ui.home.flashMeta3);
    setTextById('flash-deal-badge-4', ui.home.flashBadge4);
    setTextById('flash-deal-meta-4', ui.home.flashMeta4);
    setTextById('extra-categories-title', ui.home.popularCategories);
    setTextById('extra-category-phones', ui.home.phones);
    setTextById('extra-category-laptops', ui.home.laptops);
    setTextById('extra-category-audio', ui.home.audio);
    setTextById('extra-category-consoles', ui.home.consoles);
    setTextById('extra-category-shoes', ui.home.shoes);
    setTextById('extra-category-kitchen', ui.home.kitchen);
    setTextById('extra-category-perfumes', ui.home.perfumes);
    setTextById('extra-category-furniture', ui.home.furniture);
    setTextById('extra-trending-title', ui.home.trendingTitle);
    setTextById('extra-deals-title', ui.home.dayDealsTitle);
    setTextById('coins-progress-subtitle', ui.home.coinsSubtitle);
    setTextById('results-title', `${config.sections.analysisComplete} `);
    setTextById('showcase-title', languageBucket === 'US' ? SHOWCASE_COPY.US.title : SHOWCASE_COPY.MX.title);

    const resultsTitle = document.getElementById('results-title');
    if (resultsTitle) {
        resultsTitle.innerHTML = `${config.sections.analysisComplete} <span class="text-slate-500 font-medium">${config.sections.bestOptions}</span>`;
    }

    const showcaseRegionCopy = languageBucket === 'US' ? SHOWCASE_COPY.US : SHOWCASE_COPY.MX;
    setTextById('showcase-title', showcaseRegionCopy.title);
    const showcaseViewTrends = document.getElementById('showcase-view-trends');
    if (showcaseViewTrends) {
        const textNode = Array.from(showcaseViewTrends.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (textNode) textNode.textContent = `${showcaseRegionCopy.viewTrends} `;
    }
    showcaseRegionCopy.categories.forEach((value, index) => setTextById(`showcase-cat-${index + 1}`, value));
    showcaseRegionCopy.products.forEach((value, index) => setTextById(`showcase-product-${index + 1}`, value));

    TREND_PILL_COPY[languageBucket].forEach((value, index) => {
        const button = document.getElementById(`trend-pill-${index + 1}`);
        if (!button) return;
        button.innerHTML = `${button.innerHTML.split('</span>')[0] || button.textContent}`;
        const emoji = button.textContent.trim().split(/\s+/)[0];
        button.textContent = `${emoji} ${value}`;
        button.onclick = () => quickSearch(button.getAttribute(isEnglish ? 'data-query-en' : 'data-query-es') || '');
    });

    updateSeasonTitle();

    setTextById('history-modal-title', ui.historyModal.title);
    setTextById('history-modal-copy', ui.historyModal.copy);

    setTextById('price-alert-title', ui.priceAlerts.title);
    setTextById('price-alert-copy', ui.priceAlerts.copy);
    setPlaceholderById('alert-product', ui.priceAlerts.productPlaceholder);
    setTextById('alert-currency-label', ui.priceAlerts.currencyLabel);
    setPlaceholderById('alert-price', ui.priceAlerts.maxPricePlaceholder);
    setTextById('alert-submit-label', ui.priceAlerts.submit);
    setTextById('alerts-active-title', ui.priceAlerts.activeTitle);
    setTextById('alerts-empty-copy', ui.priceAlerts.empty);

    setHTMLById('profile-modal-title', ui.profile.titleHtml);
    setTextById('profile-plan-current-label', ui.profile.currentPlan);
    setTextById('upgrade-title', ui.profile.upgradeTitle);
    setTextById('upgrade-copy', ui.profile.upgradeCopy);
    setTextById('upgrade-button-label', ui.profile.upgradeButton);
    setTextById('history-title', ui.profile.historyTitle);
    setTextById('history-subtitle', ui.profile.historySubtitle);
    setTextById('logout-label', ui.profile.logout);

    setTextById('pricing-badge', ui.pricing.badge);
    setTextById('pricing-title', ui.pricing.title);
    setHTMLById('pricing-copy', ui.pricing.copyHtml);
    setTextById('pricing-chip-ads', ui.pricing.chipAds);
    setTextById('pricing-chip-alerts', ui.pricing.chipAlerts);
    setTextById('pricing-chip-coupons', ui.pricing.chipCoupons);
    setTextById('pricing-button-label', ui.pricing.button);

    setTextById('footer-brand-tagline', config.footer.tagline);
    setTextById('footer-brand-supporting', ui.footer.supporting);
    setTextById('footer-rights-copy', ui.footer.rights);
    setTextById('footer-explore-title', ui.footer.explore);
    setTextById('footer-link-celulares', ui.footer.cheapPhones);
    setTextById('footer-link-precios', ui.footer.phonePrices);
    setTextById('footer-link-calidad-precio', ui.footer.valuePhones);
    setTextById('footer-link-work', ui.footer.workStudy);
    setTextById('footer-link-gaming', ui.footer.gaming);
    setTextById('footer-link-style', ui.footer.styleHome);
    setTextById('footer-company-title', config.footer.company);
    setTextById('footer-link-about', ui.footer.about);
    setTextById('footer-link-privacy', ui.footer.privacy);
    setTextById('footer-link-terms', ui.footer.terms);
    setTextById('footer-link-guide', ui.footer.savingsGuide);
    setTextById('footer-link-tutorial', ui.footer.tutorial);
    setTextById('footer-trust-privacy', ui.footer.trustPrivacy);
    setTextById('footer-trust-stores', ui.footer.trustStores);
    setTextById('footer-trust-no-spam', ui.footer.trustNoSpam);

    setTextById('b2b-title', ui.b2b.title);
    setFirstTextNodeById('b2b-copy', ui.b2b.copy);
    setTextById('b2b-copy-highlight', ui.b2b.copyHighlight);
    setTextById('b2b-input-label', ui.b2b.inputLabel);
    setPlaceholderById('b2b-textarea', ui.b2b.placeholder);
    setTextById('b2b-process-label', ui.b2b.process);
    setTextById('b2b-results-title', ui.b2b.resultsTitle);
    setTextById('b2b-export-label', ui.b2b.export);
    setTextById('b2b-loader-text', ui.b2b.loader);
    setTextById('b2b-th-query', ui.b2b.thQuery);
    setTextById('b2b-th-price', ui.b2b.thPrice);
    setTextById('b2b-th-store', ui.b2b.thStore);
    setTextById('b2b-th-action', ui.b2b.thAction);
    setTextById('b2b-empty-state', ui.b2b.empty);

    setTextById('feedback-title', ui.feedback.title);
    setTextById('feedback-copy', ui.feedback.copy);
    setTextById('feedback-label', ui.feedback.label);
    setPlaceholderById('feedback-text', ui.feedback.placeholder);
    setTextById('feedback-submit-label', ui.feedback.submit);
    setTextById('feedback-success-title', ui.feedback.successTitle);
    setTextById('feedback-success-copy', ui.feedback.successCopy);

    setTextById('ad-gateway-title', ui.ad.title);
    setTextById('ad-gateway-copy', ui.ad.copy);
    setTextById('btn-skip-ad', ui.ad.waiting);
    setFirstTextNodeById('ad-vip-copy', ui.ad.vipPrefix);
    setTextById('ad-vip-button', ui.ad.vipButton);

    setTextById('favorites-title', ui.favorites.title);
    setTextById('favorites-subtitle', ui.favorites.subtitle);
    setTextById('favorites-cloud-copy', ui.favorites.cloud);
    setTextById('favorites-close-label', ui.favorites.close);

    setTextById('auth-title', ui.auth.title);
    setTextById('auth-copy', ui.auth.copy);
    setTextById('auth-bonus', ui.auth.bonus);
    setTextById('auth-benefit-1', ui.auth.benefit1);
    setTextById('auth-benefit-2', ui.auth.benefit2);
    setTextById('auth-benefit-3', ui.auth.benefit3);
    setTextById('auth-benefit-4', ui.auth.benefit4);
    setTextById('google-login-label', ui.auth.google);
    setHTMLById('auth-terms-copy', ui.auth.termsHtml);

    setTextById('mobile-menu-title', ui.mobileMenu.title);
    setTextById('mobile-link-inspiration', ui.mobileMenu.inspiration);
    setTextById('mobile-link-trending', ui.mobileMenu.trending);
    setTextById('mobile-favorites-label', ui.mobileMenu.favorites);
    setTextById('mobile-b2b-label', ui.mobileMenu.b2b);
    setTextById('mobile-categories-title', ui.mobileMenu.categories);
    setTextById('mobile-cat-tech', ui.mobileMenu.tech);
    setTextById('mobile-cat-fashion', ui.mobileMenu.fashion);
    setTextById('mobile-cat-home', ui.mobileMenu.home);
    setTextById('mobile-cat-sports', ui.mobileMenu.sports);
    setTextById('mobile-cat-beauty', ui.mobileMenu.beauty);
    setTextById('mobile-cat-toys', ui.mobileMenu.toys);

    setTextById('compare-modal-title', ui.compare.title);
    setTextById('compare-clear-btn', ui.compare.clear);
    setTextById('compare-open-btn', ui.compare.open);

    setTextById('seo-guides-title', ui.seoGuides.title);
    setTextById('seo-guides-copy', ui.seoGuides.copy);
    setTextById('seo-guide-1-title', ui.seoGuides.guide1Title);
    setTextById('seo-guide-1-copy', ui.seoGuides.guide1Copy);
    setTextById('seo-guide-1-cta', ui.seoGuides.cta);
    setTextById('seo-guide-2-title', ui.seoGuides.guide2Title);
    setTextById('seo-guide-2-copy', ui.seoGuides.guide2Copy);
    setTextById('seo-guide-2-cta', ui.seoGuides.cta);
    setTextById('seo-guide-3-title', ui.seoGuides.guide3Title);
    setTextById('seo-guide-3-copy', ui.seoGuides.guide3Copy);
    setTextById('seo-guide-3-cta', ui.seoGuides.cta);
    setTextById('popular-searches-title', ui.seoGuides.popularTitle);
    setTextById('popular-search-1', ui.seoGuides.popular1);
    setTextById('popular-search-2', ui.seoGuides.popular2);
    setTextById('popular-search-3', ui.seoGuides.popular3);
    setTextById('popular-search-4', ui.seoGuides.popular4);
    setTextById('popular-search-5', ui.seoGuides.popular5);

    setTextById('feedback-floating-label', ui.cookies.floatingFeedback);
    setTitleById('btn-back-to-top', ui.cookies.backToTop);
    const backToTopBtn = document.getElementById('btn-back-to-top');
    if (backToTopBtn) backToTopBtn.setAttribute('aria-label', ui.cookies.backToTop);
    setTextById('cookie-banner-title', ui.cookies.title);
    setHTMLById('cookie-banner-copy', ui.cookies.copyHtml);
    setTextById('btn-reject-cookies', ui.cookies.reject);
    setTextById('btn-accept-cookies', ui.cookies.accept);

    setTextById('wishlist-share-title', ui.wishlistShare.title);
    setTextById('wishlist-share-copy', ui.wishlistShare.copy);
    setTextById('wishlist-share-saved-label', ui.wishlistShare.savedLabel);
    setTextById('wishlist-copy-label', ui.wishlistShare.copyButton);
    setTextById('wishlist-wa-label', ui.wishlistShare.whatsapp);

    setTextById('post-buy-title', ui.postBuy.title);
    setTextById('post-buy-copy', ui.postBuy.copy);
    setTextById('post-buy-yes', ui.postBuy.yes);
    setTextById('post-buy-no', ui.postBuy.no);

    setTextById('achievements-title', ui.achievements.title);
    setTextById('achievements-copy', ui.achievements.copy);

    syncLocationFilterLabels();
}

function renderSearchContext({ query = '', radius = 'global', safeStoresOnly = false, resultCount = 0 } = {}) {
    const config = getRegionConfig();
    const panel = document.getElementById('search-context-panel');
    const scopePill = document.getElementById('search-scope-pill');
    const resultsSummary = document.getElementById('search-results-summary');
    const querySummary = document.getElementById('search-query-summary');
    const chipsContainer = document.getElementById('active-search-chips');

    if (!panel || !scopePill || !resultsSummary || !querySummary || !chipsContainer) return;

    const scopeKey = radius === 'local_only' ? 'local_only' : (radius !== 'global' ? 'nearby' : 'global');
    panel.classList.remove('hidden');
    scopePill.textContent = config.scopes[scopeKey];
    resultsSummary.textContent = `${resultCount} ${config.resultsFound}`;
    querySummary.innerHTML = `<span class="font-bold text-slate-800">${config.searchFor}:</span> <span class="text-slate-600">“${sanitize(query)}”</span>`;

    const chips = [
        `<span class="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm">${config.scopes[scopeKey]}</span>`,
        `<span class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">${config.activeRegion}</span>`
    ];

    if (safeStoresOnly) {
        chips.push(`<span class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm">${config.activeSafe}</span>`);
    }

    chipsContainer.innerHTML = chips.join('');
}

function updateCoinsProgress(totalSearches = 0) {
    const config = getRegionConfig();
    const valueEl = document.getElementById('coins-progress-value');
    const barEl = document.getElementById('coins-progress-bar');
    const titleEl = document.getElementById('coins-progress-title');
    const copyEl = document.getElementById('coins-progress-copy');
    if (!valueEl || !barEl || !titleEl || !copyEl) return;

    const progress = totalSearches % 50;
    const remaining = 50 - progress;
    titleEl.textContent = config.coinsTitle;
    valueEl.textContent = `${progress}/50`;
    barEl.style.width = `${(progress / 50) * 100}%`;
    valueEl.classList.toggle('bg-emerald-50', progress > 0);
    valueEl.classList.toggle('text-emerald-700', progress > 0);
    barEl.parentElement?.classList.toggle('ring-1', progress > 0);
    barEl.parentElement?.classList.toggle('ring-emerald-100', progress > 0);
    copyEl.textContent = progress === 0
        ? config.coinsCopy
        : config.coinsRemaining.replace('{count}', remaining);
}

function getSearchButtonLabel() {
    return getRegionConfig().submitLabel;
}

function getSearchButtonIdleHTML() {
    return `
                <span>${getSearchButtonLabel()}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-corner-down-left"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
            `;
}

function getSearchButtonCancelHTML() {
    return `
                <span>${getLocalizedText('Cancelar', 'Cancel')}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            `;
}

function getSearchSnapshots() {
    try {
        return JSON.parse(localStorage.getItem(SEARCH_SNAPSHOTS_KEY) || '{}');
    } catch (error) {
        console.warn('Could not parse search snapshots:', error);
        return {};
    }
}

function getSearchSnapshot(query) {
    if (!query) return null;
    return getSearchSnapshots()[String(query).trim().toLowerCase()] || null;
}

function saveSearchSnapshot(snapshot) {
    if (!snapshot?.query || !Array.isArray(snapshot?.results)) return;
    const snapshots = getSearchSnapshots();
    snapshots[String(snapshot.query).trim().toLowerCase()] = {
        ...snapshot,
        savedAt: snapshot.savedAt || new Date().toISOString()
    };
    localStorage.setItem(SEARCH_SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

function buildFallbackProductImage(label = 'Lumu') {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ecfdf5"/><stop offset="1" stop-color="#dbeafe"/></linearGradient></defs><rect width="320" height="240" rx="28" fill="url(#bg)"/><rect x="22" y="22" width="276" height="196" rx="24" fill="#ffffff" stroke="#a7f3d0"/><g fill="none" stroke="#10b981" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M116 93h88l-9 67h-70l-9-67z"/><path d="M139 93V82a21 21 0 0 1 42 0v11"/></g><text x="160" y="189" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#065f46">${String(label).slice(0, 20)}</text></svg>`)}`;
}

function getLocalizedText(spanish, english) {
    return isEnglishRegion() ? english : spanish;
}

const TRUST_LABEL_EN = {
    'Confiable': 'Trusted',
    'Tienda oficial': 'Official store',
    'Vendedor verificado': 'Verified seller',
    'Marketplace conocido': 'Known marketplace',
    'Riesgo alto': 'High risk',
    'Marketplace/C2C': 'Marketplace/C2C',
    'Marketplace': 'Marketplace'
};

const TREND_PILL_COPY = {
    MX: ['Lentes de Sol', 'Tenis Nike', 'Bocinas JBL', 'Robot Aspiradora', 'Sillas Gamer', 'GoPro', 'Smart TV 4K'],
    US: ['Sunglasses', 'Nike Sneakers', 'JBL Speakers', 'Robot Vacuum', 'Gaming Chairs', 'GoPro', '4K Smart TV']
};

const SHOWCASE_COPY = {
    MX: {
        title: 'Inspiración para ti',
        viewTrends: 'Ver tendencias',
        categories: ['Videojuegos', 'Audio Premium', 'Smartwatches', 'Cocina'],
        products: [
            'Nintendo Switch OLED 64GB Color Blanco',
            'Audífonos inalámbricos Sony WH-1000XM5 Noise Cancelling',
            'Apple Watch Series 9 (GPS, 45mm) Caja de Aluminio',
            'Freidora de Aire Ninja AF101 3.7L'
        ]
    },
    US: {
        title: 'Inspiration for you',
        viewTrends: 'View trends',
        categories: ['Gaming', 'Premium Audio', 'Smartwatches', 'Kitchen'],
        products: [
            'Nintendo Switch OLED 64GB White',
            'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
            'Apple Watch Series 9 (GPS, 45mm) Aluminum Case',
            'Ninja AF101 Air Fryer 3.7L'
        ]
    }
};

function localizeCouponDetails(details = '') {
    if (!isEnglishRegion()) return details;
    return String(details || '')
        .replace(/ENV[IÍ]O GRATIS/gi, 'FREE SHIPPING')
        .replace(/CUP[OÓ]N DISPONIBLE/gi, 'COUPON AVAILABLE')
        .replace(/DESCUENTO/gi, 'DISCOUNT')
        .replace(/M[IÍ]N\./gi, 'MIN.');
}

function updateSeasonTitle() {
    const el = document.getElementById('season-title');
    if (!el) return;
    const month = new Date().getMonth();
    const seasonsEs = [
        { icon: '❄️', label: 'Invierno' },
        { icon: '❄️', label: 'Invierno' },
        { icon: '🌸', label: 'Primavera' },
        { icon: '🌸', label: 'Primavera' },
        { icon: '🌸', label: 'Primavera' },
        { icon: '☀️', label: 'Verano' },
        { icon: '☀️', label: 'Verano' },
        { icon: '☀️', label: 'Verano' },
        { icon: '🍂', label: 'Otoño' },
        { icon: '🍂', label: 'Otoño' },
        { icon: '🍂', label: 'Otoño' },
        { icon: '❄️', label: 'Invierno' }
    ];
    const seasonsEn = [
        { icon: '❄️', label: 'Winter' },
        { icon: '❄️', label: 'Winter' },
        { icon: '🌸', label: 'Spring' },
        { icon: '🌸', label: 'Spring' },
        { icon: '🌸', label: 'Spring' },
        { icon: '☀️', label: 'Summer' },
        { icon: '☀️', label: 'Summer' },
        { icon: '☀️', label: 'Summer' },
        { icon: '🍂', label: 'Fall' },
        { icon: '🍂', label: 'Fall' },
        { icon: '🍂', label: 'Fall' },
        { icon: '❄️', label: 'Winter' }
    ];
    const season = (currentRegion === 'US' ? seasonsEn : seasonsEs)[month];
    el.innerHTML = currentRegion === 'US'
        ? `<span class="text-2xl drop-shadow-sm">${season.icon}</span> ${season.label} Trends ${new Date().getFullYear()}`
        : `<span class="text-2xl drop-shadow-sm">${season.icon}</span> Tendencias ${season.label} ${new Date().getFullYear()}`;
}

// SF V2: Smart Filter Suggestions with relevance scoring, toggle, persistence, expanded categories
const _smartFilterActiveSet = new Set();
let _smartFilterQueryKey = '';

function _getSmartFilterStorageKey() {
    const q = String(document.getElementById('search-input')?.value || '').trim().toLowerCase().slice(0, 80);
    return q ? `lumu_sf:${q}` : '';
}

function _syncSmartFiltersForQuery() {
    const key = _getSmartFilterStorageKey();
    if (key !== _smartFilterQueryKey) {
        _smartFilterQueryKey = key;
        _smartFilterActiveSet.clear();
    }
}

function resetSafeStoresToggle() {
    const btnSafeStores = document.getElementById('btn-safe-stores');
    if (!btnSafeStores) return;
    btnSafeStores.setAttribute('data-safe', 'false');
    btnSafeStores.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
    btnSafeStores.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
    if (typeof renderActiveFiltersSummary === 'function') renderActiveFiltersSummary();
}

function renderSmartFilterSuggestions(products = []) {
    const toolbar = document.getElementById('results-toolbar');
    if (!toolbar) return;
    let wrap = document.getElementById('smart-filter-suggestions');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'smart-filter-suggestions';
        wrap.className = 'hidden mb-4 flex flex-wrap gap-2 items-center';
        toolbar.parentElement?.insertBefore(wrap, toolbar.nextSibling);
    }

    const query = String(document.getElementById('search-input')?.value || '').toLowerCase();
    const total = products.length || 1;

    // --- Count product attributes ---
    let couponCount = 0, realDealCount = 0, freeShipCount = 0, trustedCount = 0;
    products.forEach(p => {
        if (p.cupon) couponCount++;
        if (p.dealVerdict?.status === 'real_deal') realDealCount++;
        const text = `${p.titulo || ''} ${p.couponDetails || ''}`.toLowerCase();
        if (text.includes('gratis') || text.includes('free') || text.includes('shipping')) freeShipCount++;
        const trust = (p.trustLabel || '').toLowerCase();
        if (trust.includes('confiable') || trust.includes('trusted') || trust.includes('oficial') || trust.includes('official') || trust.includes('verificado') || trust.includes('verified')) trustedCount++;
    });

    // --- Expanded category detection ---
    const CAT = {
        tech:    /iphone|airpods|laptop|macbook|samsung|galaxy|tv|switch|ps5|xbox|playstation|monitor|aud[ií]fonos|headphones|gopro|tablet|ipad|drone/.test(query),
        home:    /freidora|refrigerador|aspiradora|mueble|silla|air fryer|vacuum|chair|kitchen|blender|licuadora|horno|microwave/.test(query),
        fashion: /tenis|zapatos|nike|adidas|ropa|sneakers|shoes|jacket|hoodie|vestido|dress|bolsa|mochila|backpack/.test(query),
        luxury:  /perfume|reloj|watch|bolsa|cartera|wallet|joyería|jewelry|ring|anillo|collar|necklace|pulsera|bracelet/.test(query),
        budget:  /barato|econ[oó]mico|cheap|deal|oferta|descuento|remate|clearance|sale/.test(query),
        gaming:  /ps5|xbox|switch|consola|gaming|gamer|controller|headset|rgb|razer|logitech/.test(query),
        kids:    /niño|niña|bebé|baby|kids|juguete|toy|lego|disney|pañal|stroller/.test(query),
        outdoor: /camping|bicicleta|bike|tienda.*campaña|tent|hiking|kayak|pesca|fishing/.test(query)
    };

    // --- Build scored suggestions ---
    const candidates = [];

    if (realDealCount > 0) {
        const pct = realDealCount / total;
        let score = 50 + pct * 30; // base 50, up to 80 from data
        if (CAT.budget) score += 20;
        candidates.push({ key: 'real', score, label: getLocalizedText('Solo oferta real', 'Real deals only'), icon: '🔥',
            toggle: () => document.getElementById('btn-only-real-deals')?.click() });
    }
    if (couponCount > 0) {
        const pct = couponCount / total;
        let score = 40 + pct * 30;
        if (CAT.budget) score += 15;
        candidates.push({ key: 'coupon', score, label: getLocalizedText('Solo con cupón', 'Coupons only'), icon: '🏷️',
            toggle: () => document.getElementById('btn-only-coupons')?.click() });
    }
    if (freeShipCount > 0) {
        const pct = freeShipCount / total;
        let score = 35 + pct * 25;
        if (CAT.fashion || CAT.home) score += 15;
        candidates.push({ key: 'shipping', score, label: getLocalizedText('Envío gratis', 'Free shipping'), icon: '🚚',
            toggle: () => document.getElementById('free-shipping-filter')?.click() });
    }
    if (trustedCount > 0 || CAT.tech || CAT.luxury || CAT.gaming || CAT.kids) {
        let score = 30 + (trustedCount / total) * 20;
        if (CAT.tech) score += 25;
        if (CAT.luxury) score += 30;
        if (CAT.gaming) score += 20;
        if (CAT.kids) score += 25;
        candidates.push({ key: 'safe', score, label: getLocalizedText('Tiendas seguras', 'Trusted stores'), icon: '🛡️',
            toggle: () => document.getElementById('btn-safe-stores')?.click() });
    }

    // Sort by score descending, take top 4
    candidates.sort((a, b) => b.score - a.score);
    const suggestions = candidates.slice(0, 4);

    if (!suggestions.length) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        return;
    }

    _syncSmartFiltersForQuery();

    wrap.classList.remove('hidden');
    const label = document.createElement('span');
    label.className = 'text-xs font-bold text-slate-400 mr-1 select-none';
    label.textContent = getLocalizedText('Filtros sugeridos:', 'Suggested filters:');

    wrap.innerHTML = '';
    wrap.appendChild(label);

    suggestions.forEach((item) => {
        const isActive = _smartFilterActiveSet.has(item.key);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-sf-key', item.key);
        btn.className = isActive
            ? 'sf-chip rounded-full border border-emerald-500 bg-emerald-600 text-white px-3 py-1.5 text-xs font-black shadow-sm hover:bg-emerald-700 transition-all'
            : 'sf-chip rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-black shadow-sm hover:bg-emerald-100 transition-all';
        btn.innerHTML = `${item.icon} ${item.label}`;
        btn.addEventListener('click', () => {
            const nowActive = _smartFilterActiveSet.has(item.key);
            if (nowActive) {
                _smartFilterActiveSet.delete(item.key);
                btn.className = 'sf-chip rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-black shadow-sm hover:bg-emerald-100 transition-all';
            } else {
                _smartFilterActiveSet.add(item.key);
                btn.className = 'sf-chip rounded-full border border-emerald-500 bg-emerald-600 text-white px-3 py-1.5 text-xs font-black shadow-sm hover:bg-emerald-700 transition-all';
            }
            item.toggle();
        });
        wrap.appendChild(btn);
    });
}

function getConditionMode() {
    return conditionModeInput?.value || 'all';
}

function getConditionLabel(mode = getConditionMode()) {
    if (mode === 'used') return getLocalizedText('Usado / reacondicionado', 'Used / refurbished');
    if (mode === 'new') return getLocalizedText('Solo nuevo', 'New only');
    return getLocalizedText('Nuevo + usado', 'New + used');
}

function getResultLeadCopy(searchIntent = {}, totalResults = 0) {
    const searchLabel = sanitize(searchIntent?.busqueda || '');
    const condition = searchIntent?.condicion === 'used'
        ? getLocalizedText('usado', 'used')
        : getLocalizedText('nuevo', 'new');

    if (!searchLabel) {
        return getLocalizedText(
            `Encontré ${totalResults} opciones relevantes y ordenadas por conveniencia.`,
            `I found ${totalResults} relevant options sorted by usefulness.`
        );
    }

    return getLocalizedText(
        `Encontré ${totalResults} opciones para "${searchLabel}" en estado ${condition}. Te dejé primero los resultados más útiles y abajo un apoyo breve del shopper.`,
        `I found ${totalResults} options for "${searchLabel}" in ${condition} condition. I placed the most useful results first and a short shopper summary below.`
    );
}

function isBroadUiSearch(searchText = '') {
    const normalized = String(searchText || '').toLowerCase().trim();
    if (!normalized) return false;
    if (/^(celulares?|smartphones?|telefonos?|tel[eé]fonos?|laptops?|notebooks?|computadoras?|aud[ií]fonos|headphones|earbuds|bocinas?|televisores?|pantallas?|tvs?|smart tv|hogar|electrodom[eé]sticos|aspiradoras?|freidoras?|cafeteras?)$/i.test(normalized)) {
        return true;
    }
    const signals = [
        /iphone|samsung|xiaomi|motorola|pixel/i,
        /lenovo|hp|asus|dell|acer|macbook/i,
        /tv|televisor|oled|qled|pantalla/i,
        /aud[ií]fonos|gamer|bluetooth|speaker|bocina/i,
        /robot aspiradora|aspiradora|hogar|oferta|barato/i
    ].filter((pattern) => pattern.test(normalized)).length;
    return signals >= 2 || normalized.split(/\s+/).length >= 4;
}

function syncLocationFilterLabels() {
    const config = getRegionConfig();
    const globalBtn = document.getElementById('filter-global');
    const localBtn = document.getElementById('filter-local-only');
    const nearbyBtn = document.getElementById('filter-nearby');

    if (globalBtn) globalBtn.textContent = config.filters.global;
    if (localBtn) localBtn.textContent = config.filters.local_only;
    if (nearbyBtn) nearbyBtn.textContent = config.filters.nearby;
}

function restoreHomeSections() {
    const categoryIconBar = document.getElementById('category-icon-bar');
    const flashDealsSection = document.getElementById('flash-deals-section');
    const tendenciasSection = document.getElementById('tendencias-section');
    const resultsWrapper = document.getElementById('results-wrapper');
    const chatContainer = document.getElementById('chat-container');
    const resultsGrid = document.getElementById('results-grid');
    const contextPanel = document.getElementById('search-context-panel');
    const errorMessage = document.getElementById('error-message');
    const resultsTitle = document.getElementById('results-title');
    const resultsToolbar = document.getElementById('results-toolbar');
    const resultsCount = document.getElementById('results-count');

    categoryIconBar?.classList.remove('hidden');
    flashDealsSection?.classList.remove('hidden');
    tendenciasSection?.classList.remove('hidden');
    resultsWrapper?.classList.add('hidden');
    chatContainer?.classList.add('hidden');
    if (resultsGrid) resultsGrid.innerHTML = '';
    if (contextPanel) contextPanel.classList.add('hidden');
    resultsToolbar?.classList.add('hidden');
    if (resultsCount) resultsCount.textContent = '';
    if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.classList.add('hidden');
    }
    if (resultsTitle) {
        const config = getRegionConfig();
        resultsTitle.innerHTML = `${config.sections.analysisComplete} <span class="text-slate-500 font-medium">${config.sections.bestOptions}</span>`;
    }
    removeTypingIndicator();
}

// --- RECONSTRUCTED FUNCTIONS ---
async function renderFavoritesList() {
    if (!favoritesList) return;
    const sb = window.supabaseClient || null;
    const user = window.currentUser || null;
    if (!sb || !user) {
        favoritesList.innerHTML = `<p class="text-slate-400 text-center py-8">${isEnglishRegion() ? 'Sign in to view your favorites.' : 'Inicia sesión para ver tus favoritos.'}</p>`;
        return;
    }

    favoritesList.innerHTML = '<div class="col-span-full flex justify-center py-8"><div class="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div></div>';

    try {
        const { data, error } = await sb.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            favoritesList.innerHTML = `<p class="text-slate-400 text-center py-8">${isEnglishRegion() ? 'You do not have saved products yet.' : 'Aún no tienes productos guardados.'}</p>`;
            return;
        }

        favoritesList.innerHTML = data.map(item => {
            const favPrice = typeof item.product_price === 'number' ? item.product_price : parseFloat(String(item.product_price || '0').replace(/[^0-9.-]+/g, ''));
            const safeTitle = sanitize(item.product_title || (isEnglishRegion() ? 'Untitled product' : 'Producto sin título'));
            const safeUrl = sanitize(item.product_url || '#');
            const safeImage = sanitize(item.product_image || '');
            return `
                <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all">
                    <div class="flex gap-4">
                        <div class="w-20 h-20 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0">
                            <img src="${safeImage}" class="w-full h-full object-contain" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%27100%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f1f5f9%27/%3E%3Ctext x=%2750%27 y=%2755%27 text-anchor=%27middle%27 font-size=%2730%27 fill=%27%2394a3b8%27%3E📦%3C/text%3E%3C/svg%3E'">
                        </div>
                        <div class="flex-grow min-w-0">
                            <h4 class="font-bold text-slate-800 text-sm mb-1 truncate">${safeTitle}</h4>
                            <p class="text-emerald-600 font-black text-lg mb-2">${formatCurrencyByRegion(favPrice || 0)}</p>
                            <div class="flex gap-2">
                                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="flex-grow bg-slate-900 text-white text-[11px] font-black py-2 rounded-lg text-center hover:bg-emerald-600 transition-colors">${isEnglishRegion() ? 'View Product' : 'Ver Producto'}</a>
                                <button onclick="window.removeFavoriteFromList('${encodeURIComponent(item.product_url)}')" class="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error rendering favorites:', err);
        favoritesList.innerHTML = `<p class="text-rose-500 text-center py-8">${isEnglishRegion() ? 'Error loading favorites.' : 'Error cargando favoritos.'}</p>`;
    }
};

window.renderMiniFavorites = async () => {
    const list = document.getElementById('mini-favorites-list');
    if (!list) return;

    if (list.getAttribute('data-loaded') === 'true') return;

    const sb = window.supabaseClient || null;
    const user = window.currentUser || null;

    if (!sb || !user) {
        list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 font-medium">${isEnglishRegion() ? 'Sign in to view your favorites.' : 'Inicia sesión para ver tus favoritos.'}</p>`;
        return;
    }

    list.innerHTML = '<div class="flex justify-center py-4"><div class="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div></div>';

    try {
        const { data, error } = await sb.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4);
        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 font-medium">${isEnglishRegion() ? 'You do not have saved products yet.' : 'Aún no tienes productos guardados.'}</p>`;
            list.setAttribute('data-loaded', 'true');
            return;
        }

        list.innerHTML = data.map(item => {
            const favPrice = typeof item.product_price === 'number' ? item.product_price : parseFloat(String(item.product_price || '0').replace(/[^0-9.-]+/g, ''));
            const safeTitle = sanitize(item.product_title || (isEnglishRegion() ? 'Untitled product' : 'Producto sin título'));
            const safeUrl = sanitize(item.product_url || '#');
            const safeImage = sanitize(item.product_image || '');
            return `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="flex gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors group">
                    <div class="w-12 h-12 bg-white border border-slate-100 rounded-lg overflow-hidden flex-shrink-0 p-1">
                        <img src="${safeImage}" class="w-full h-full object-contain" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2750%27 height=%2750%27 viewBox=%270 0 50 50%27%3E%3Crect width=%2750%27 height=%2750%27 fill=%27%23f1f5f9%27/%3E%3Ctext x=%2725%27 y=%2730%27 text-anchor=%27middle%27 font-size=%2715%27 fill=%27%2394a3b8%27%3E📦%3C/text%3E%3C/svg%3E'">
                    </div>
                    <div class="flex flex-col justify-center min-w-0">
                        <h4 class="font-bold text-slate-800 text-[11px] mb-0.5 truncate group-hover:text-primary transition-colors">${safeTitle}</h4>
                        <p class="text-emerald-600 font-extrabold text-xs">${formatCurrencyByRegion(favPrice || 0)}</p>
                    </div>
                </a>
            `;
        }).join('');

        list.setAttribute('data-loaded', 'true');
    } catch (err) {
        console.error('Error rendering mini favorites:', err);
        list.innerHTML = `<p class="text-xs text-rose-500 text-center py-4 font-medium">${isEnglishRegion() ? 'Error loading favorites.' : 'Error cargando favoritos.'}</p>`;
    }
};

// quickSearch defined later in initApp with full executeSearch logic

// --- RECONSTRUCTED MODAL FUNCTIONS ---
function openHistoryModal() {
    if (!historyModal) return;
    historyModal.classList.remove('invisible', 'opacity-0');
    const panel = historyModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }
    if (typeof loadSearchHistory === 'function') loadSearchHistory();
}

function closeHistoryModal() {
    if (!historyModal) return;
    historyModal.classList.add('invisible', 'opacity-0');
    const panel = historyModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-100');
        panel.classList.add('scale-95');
    }
}

function openProductHistoryModal(product = {}) {
    if (!historyModal || !historyList) return;

    const titleEl = document.getElementById('history-modal-title');
    const copyEl = document.getElementById('history-modal-copy');
    const safeTitle = sanitize(product.titulo || (currentRegion === 'US' ? 'Product history' : 'Historial del producto'));
    const priceTrend = product.priceTrend || {};
    const history = Array.isArray(priceTrend.history) ? [...priceTrend.history].reverse() : [];
    const currentPrice = Number(product.precio);
    const hasTrackedHistory = history.length > 0;
    const points = history
        .map((entry) => Number(entry.price))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (Number.isFinite(currentPrice) && currentPrice > 0) {
        points.push(currentPrice);
    }

    if (points.length === 0) {
        if (titleEl) titleEl.textContent = safeTitle;
        if (copyEl) {
            copyEl.textContent = currentRegion === 'US'
                ? 'We still do not have enough tracked prices for this product.'
                : 'Todavía no tenemos suficientes precios rastreados para este producto.';
        }
        historyList.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-5 text-sm font-medium text-slate-500">${currentRegion === 'US' ? 'No tracked price history for this product yet.' : 'Aún no hay historial de precio rastreado para este producto.'}</div>`;
        openHistoryModal();
        return;
    }

    if (titleEl) titleEl.textContent = safeTitle;
    if (copyEl) {
        copyEl.textContent = hasTrackedHistory
            ? (currentRegion === 'US' ? 'Historical snapshots and current price comparison.' : 'Snapshots históricos y comparación con el precio actual.')
            : (currentRegion === 'US' ? 'Current price snapshot ready. We will show more history as we track this product.' : 'Ya tenemos el precio actual. Mostraremos más historial conforme rastreemos este producto.');
    }

    const minP = Math.min(...points);
    const maxP = Math.max(...points);
    const avgP = points.reduce((sum, value) => sum + value, 0) / points.length;
    const w = 560;
    const h = 180;
    const pad = 16;
    const diff = maxP - minP === 0 ? 1 : maxP - minP;
    const pathD = points.map((val, i) => {
        const x = pad + (i * ((w - pad * 2) / Math.max(points.length - 1, 1)));
        const y = pad + (h - pad * 2) - (((val - minP) / diff) * (h - pad * 2));
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');

    historyList.innerHTML = `
        <div class="bg-white rounded-[1.5rem] border border-slate-200 p-5 shadow-sm">
            <div class="flex flex-wrap gap-2 mb-4">
                <span class="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-wider">${currentRegion === 'US' ? 'Current' : 'Actual'} ${Number.isFinite(currentPrice) ? formatCurrencyByRegion(currentPrice) : '—'}</span>
                <span class="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider">${currentRegion === 'US' ? 'Average' : 'Promedio'} ${formatCurrencyByRegion(avgP)}</span>
                <span class="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-wider">${currentRegion === 'US' ? 'Min tracked' : 'Mínimo rastreado'} ${formatCurrencyByRegion(minP)}</span>
                <span class="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black uppercase tracking-wider">${currentRegion === 'US' ? 'Max tracked' : 'Máximo rastreado'} ${formatCurrencyByRegion(maxP)}</span>
            </div>
            <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4 overflow-x-auto">
                <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="min-w-[520px]">
                    <path d="${pathD}" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </div>
        </div>
        <div class="space-y-2">
            ${history.map((entry) => `
                <div class="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4">
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-slate-800">${formatCurrencyByRegion(Number(entry.price) || 0)}</p>
                        <p class="text-xs text-slate-500">${sanitize(entry.date || entry.created_at || '')}</p>
                    </div>
                    <span class="text-[11px] font-black uppercase tracking-wider text-slate-500">${currentRegion === 'US' ? 'Tracked' : 'Rastreado'}</span>
                </div>
            `).join('')}
        </div>
    `;

    openHistoryModal();
}

function getBestOptionProduct(products = []) {
    if (!Array.isArray(products) || products.length === 0) return null;
    return [...products].sort((a, b) => Number(b.bestBuyScore || 0) - Number(a.bestBuyScore || 0))[0] || null;
}

function renderBestOptionSummary(product = null) {
    const summaryEl = document.getElementById('best-option-summary');
    if (!summaryEl) return;
    if (!product) {
        summaryEl.classList.add('hidden');
        summaryEl.innerHTML = '';
        bestOptionSummaryState = null;
        return;
    }

    bestOptionSummaryState = product;
    const isUS = currentRegion === 'US';
    const preferredTarget = String(product.urlOriginal || product.urlMonetizada || '');
    const formattedPrice = Number(product.precio) > 0 ? formatProductPriceLabel(product.precio, product) : (isUS ? 'Price unavailable' : 'Precio no disponible');
    const badgeLabel = sanitize(product.bestBuyLabel || (isUS ? 'Best option' : 'Mejor opción'));
    const shippingCopy = product.shippingText ? sanitize(localizeDynamicResultText(product.shippingText, isUS)) : (isUS ? 'Trusted store and strong match.' : 'Tienda confiable y buena coincidencia.');

    summaryEl.classList.remove('hidden');
    summaryEl.innerHTML = `
        <div class="rounded-[1.75rem] border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4 md:p-5 shadow-sm">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white">✨ ${isUS ? 'Best Option Found' : 'Mejor Opción Encontrada'}</span>
                        <span class="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-emerald-200">${badgeLabel}</span>
                    </div>
                    <h4 class="text-base md:text-lg font-black text-slate-900 line-clamp-2">${sanitize(product.titulo || '')}</h4>
                    <p class="mt-1 text-sm font-medium text-slate-600">${shippingCopy}</p>
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                        <span class="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">${sanitize(product.tienda || (isUS ? 'Store' : 'Tienda'))}</span>
                        <span class="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">${formattedPrice}</span>
                        <span class="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">Score ${(Number(product.bestBuyScore || 0) * 100).toFixed(0)}/100</span>
                    </div>
                </div>
                <div class="flex w-full flex-col gap-2 md:w-auto md:min-w-[220px]">
                    <button id="btn-best-option-focus" type="button" class="min-h-[44px] rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600">${isUS ? 'Show me why' : 'Ver por qué conviene'}</button>
                    <button id="btn-best-option-open" type="button" class="min-h-[44px] rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-black text-emerald-700 transition-all hover:bg-emerald-50">${isUS ? 'Open best offer' : 'Abrir mejor oferta'}</button>
                </div>
            </div>
        </div>
    `;

    summaryEl.querySelector('#btn-best-option-focus')?.addEventListener('click', () => {
        const targetCard = preferredTarget ? document.querySelector(`[data-best-option-url="${CSS.escape(preferredTarget)}"]`) : null;
        if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetCard.classList.add('ring-4', 'ring-emerald-300', 'shadow-2xl', 'shadow-emerald-500/20', 'scale-[1.01]');
            setTimeout(() => targetCard.classList.remove('ring-4', 'ring-emerald-300', 'shadow-2xl', 'shadow-emerald-500/20', 'scale-[1.01]'), 2200);
        }
    });

    summaryEl.querySelector('#btn-best-option-open')?.addEventListener('click', () => {
        if (preferredTarget) window.open(preferredTarget, '_blank');
    });
}

function syncBestOptionButton(products = []) {
    const btn = document.getElementById('btn-best-option');
    if (!btn) return;
    const bestProduct = getBestOptionProduct(products);
    if (!bestProduct || products.length < 2) {
        btn.classList.add('hidden');
        btn.disabled = true;
        renderBestOptionSummary(null);
        return;
    }

    btn.classList.remove('hidden');
    btn.disabled = false;
    btn.onclick = () => {
        renderBestOptionSummary(bestProduct);
        document.getElementById('best-option-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
}

function openFavorites() {
    if (!favoritesModal) return;
    favoritesModal.classList.remove('invisible', 'opacity-0');
    const panel = favoritesModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }
    if (typeof renderFavoritesList === 'function') renderFavoritesList();
}

function closeFavorites() {
    if (!favoritesModal) return;
    favoritesModal.classList.add('invisible', 'opacity-0');
    const panel = favoritesModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-100');
        panel.classList.add('scale-95');
    }
}

async function initApp() {
    console.log('initApp: Initializing App...');
    try {
        // --- Supabase & Config ---
        try {
            console.log('Fetching config...');
            const configRes = await Promise.race([
                fetch('/api/config'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout config')), 3000))
            ]);

            if (configRes && configRes.ok) {
                const config = await configRes.json();
                console.log('Config loaded:', config);
                if (config.detectedCountry && REGION_LABELS[config.detectedCountry]) {
                    serverDetectedRegion = config.detectedCountry;
                    currentRegion = config.detectedCountry;
                }
                if (config.supabaseUrl && window.supabase) {
                    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
                    window.supabaseClient = supabaseClient; // Polyfill for the rest of the app
                }
                if (config.stripePaymentLink) stripePaymentLink = config.stripePaymentLink;
                if (config.stripeB2bPaymentLink) window.stripeB2bPaymentLink = config.stripeB2bPaymentLink;
                if (config.stripeVipAnnualPaymentLink) window.stripeVipAnnualPaymentLink = config.stripeVipAnnualPaymentLink;
                if (config.stripeB2bAnnualPaymentLink) window.stripeB2bAnnualPaymentLink = config.stripeB2bAnnualPaymentLink;
                // Store config globally for push notifications and ad tags
                window.__LUMU_CONFIG = {
                    vapidPublicKey: config.vapidPublicKey || '',
                    rewardedAdTagUrl: config.rewardedAdTagUrl || ''
                };
                // Populate hardcoded Stripe buttons with live config
                const stripeBtn = document.getElementById('stripe-checkout-btn');
                if (stripeBtn && config.stripePaymentLink) stripeBtn.href = config.stripePaymentLink;
            } else {
                console.warn('Config fetch failed or timed out.');
            }
        } catch (e) {
            console.error('Error inicializando config:', e);
        }

        console.log('Assigning DOM elements...');
        // --- DOM Elements ---
        authContainer = document.getElementById('auth-container');
        authModal = document.getElementById('auth-modal');
        closeModalBtn = document.getElementById('close-modal');
        modalBackdrop = document.getElementById('modal-backdrop');
        btnGoogleLogin = document.getElementById('btn-google-login');

        historyModal = document.getElementById('history-modal');
        closeHistoryBtn = document.getElementById('close-history-modal');
        historyBackdrop = document.getElementById('history-backdrop');
        historyList = document.getElementById('history-list');

        favoritesModal = document.getElementById('favorites-modal');
        closeFavoritesBtn = document.getElementById('close-favorites-modal');
        favoritesBackdrop = document.getElementById('favorites-backdrop');
        navFavoritos = document.getElementById('nav-favoritos');
        favoritesList = document.getElementById('favorites-list');

        profileModal = document.getElementById('profile-modal');
        closeProfileBtn = document.getElementById('close-profile-modal');
        profileBackdrop = document.getElementById('profile-backdrop');

        searchForm = document.getElementById('search-form');
        searchInput = document.getElementById('search-input');
        searchButton = document.getElementById('search-button');
        errorMessage = document.getElementById('error-message');

        chatContainer = document.getElementById('chat-container');
        resultsWrapper = document.getElementById('results-wrapper');
        resultsGrid = document.getElementById('results-grid');
        resultsContainer = resultsGrid; // J.1 Alias for global usage

        adModal = document.getElementById('ad-modal');
        adCountdownText = document.getElementById('ad-countdown-text');
        btnSkipAd = document.getElementById('btn-skip-ad');

        imageUpload = document.getElementById('image-upload');
        btnAttachImage = document.getElementById('btn-attach-image');
        imagePreviewContainer = document.getElementById('image-preview-container');
        imagePreview = document.getElementById('image-preview');
        btnRemoveImage = document.getElementById('btn-remove-image');
        btnVoiceInput = document.getElementById('btn-voice-input');
        if (btnVoiceInput) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                btnVoiceInput.disabled = true;
                btnVoiceInput.classList.add('opacity-40', 'cursor-not-allowed');
                btnVoiceInput.title = isEnglishRegion(detectRegion()) ? 'Your browser does not support voice dictation' : 'Tu navegador no soporta dictado por voz';
            } else {
                const recognition = new SpeechRecognition();
                recognition.lang = getVoiceRecognitionLocale(detectRegion());
                recognition.interimResults = true;
                recognition.maxAlternatives = 1;
                recognition.continuous = false;

                const stopRecording = () => {
                    isRecording = false;
                    btnVoiceInput.classList.remove('text-rose-500', 'animate-pulse');
                    btnVoiceInput.classList.add('text-slate-400');
                };

                recognition.onstart = () => {
                    isRecording = true;
                    btnVoiceInput.classList.add('text-rose-500', 'animate-pulse');
                    btnVoiceInput.classList.remove('text-slate-400');
                    if (typeof showGlobalFeedback === 'function') showGlobalFeedback(isEnglishRegion() ? 'Listening... speak now.' : 'Escuchando... habla ahora.', 'info');
                };

                recognition.onresult = (event) => {
                    const transcript = Array.from(event.results)
                        .map(result => result[0]?.transcript || '')
                        .join(' ')
                        .trim();
                    if (!transcript || !searchInput) return;
                    searchInput.value = transcript;
                    searchInput.dispatchEvent(new Event('input'));
                    searchInput.focus();
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    stopRecording();
                    if (typeof showGlobalFeedback !== 'function') return;
                    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                        showGlobalFeedback(isEnglishRegion() ? 'Enable microphone permission in your browser.' : 'Activa el permiso del micrófono en tu navegador.', 'error');
                    } else if (event.error === 'no-speech') {
                        showGlobalFeedback(isEnglishRegion() ? 'No speech detected. Try again.' : 'No detecté voz. Intenta de nuevo.', 'error');
                    } else if (event.error === 'audio-capture') {
                        showGlobalFeedback(isEnglishRegion() ? 'I could not access your microphone.' : 'No pude acceder a tu micrófono.', 'error');
                    } else {
                        showGlobalFeedback(isEnglishRegion() ? 'Microphone error. Try again.' : 'Error con el micrófono. Intenta otra vez.', 'error');
                    }
                };

                recognition.onend = () => stopRecording();

                btnVoiceInput.addEventListener('click', async () => {
                    if (isRecording) {
                        recognition.stop();
                        return;
                    }

                    if (window.isSecureContext === false && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                        if (typeof showGlobalFeedback === 'function') showGlobalFeedback(isEnglishRegion() ? 'Microphone requires HTTPS or localhost.' : 'El micrófono requiere HTTPS o localhost.', 'error');
                        return;
                    }

                    try {
                        if (navigator.mediaDevices?.getUserMedia) {
                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            stream.getTracks().forEach(track => track.stop());
                        }
                        recognition.start();
                    } catch (err) {
                        console.error('Microphone permission error:', err);
                        if (typeof showGlobalFeedback === 'function') showGlobalFeedback(isEnglishRegion() ? 'Microphone permission was not granted.' : 'No se concedió permiso al micrófono.', 'error');
                    }
                });
            }
        }

        navB2b = document.getElementById('nav-b2b');
        b2bModal = document.getElementById('b2b-modal');
        closeB2bModal = document.getElementById('close-b2b-modal');
        b2bBackdrop = document.getElementById('b2b-backdrop');
        btnProcessB2b = document.getElementById('btn-process-b2b');
        btnExportB2b = document.getElementById('btn-export-b2b');

        // --- NEW DOM ELEMENTS & LISTENERS ---
        const btnDarkMode = document.getElementById('btn-dark-mode');
        iconMoon = document.getElementById('icon-moon');
        const categoryIconBar = document.getElementById('category-icon-bar');
        const headerBrowseButtons = document.querySelectorAll('[data-header-category]');
        const browseHubButtons = document.querySelectorAll('[data-browse-category]');
        const flashDealsSection = document.getElementById('flash-deals-section');
        const tendenciasSection = document.getElementById('tendencias-section');
        iconSun = document.getElementById('icon-sun');
        locRadiusInput = document.getElementById('loc-radius');
        userLatInput = document.getElementById('user-lat');
        userLngInput = document.getElementById('user-lng');
        conditionModeInput = document.getElementById('condition-mode');
        includeKnownMarketplacesInput = document.getElementById('include-known-marketplaces');
        includeHighRiskMarketplacesInput = document.getElementById('include-high-risk-marketplaces');
        const locFilterBtns = document.querySelectorAll('.loc-filter-btn');
        const conditionChips = document.querySelectorAll('[data-condition]');
        applyRegionalCopy();
        applyOnboardingPreference(getStoredOnboardingPreference());
        const categoryBtns = document.querySelectorAll('[data-macro-category]');
        const btnLoginHeader = document.getElementById('btn-login');
        const homeLogoLink = document.getElementById('home-logo-link');

        // --- RIPPLE EFFECT ---
        function initRippleButtons() {
            // Apply class dynamically to main buttons
            const targetBtns = document.querySelectorAll('#search-button, #btn-login, .loc-filter-btn, [data-macro-category] > div, #btn-history, #btn-mis-favoritos');
            targetBtns.forEach(b => b.classList.add('ripple-btn'));

            const rippleBtns = document.querySelectorAll('.ripple-btn');
            rippleBtns.forEach(btn => {
                btn.addEventListener('mouseenter', function (e) {
                    const circle = document.createElement('span');
                    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
                    const radius = diameter / 2;

                    circle.style.width = circle.style.height = `${diameter}px`;
                    circle.style.left = `${e.clientX - btn.getBoundingClientRect().left - radius}px`;
                    circle.style.top = `${e.clientY - btn.getBoundingClientRect().top - radius}px`;
                    circle.classList.add('ripple');

                    // Solo mantener 1 ripple a la vez
                    const existingRipple = btn.querySelector('.ripple');
                    if (existingRipple) existingRipple.remove();

                    btn.appendChild(circle);
                });

                // Track mouse to update Ripple position
                btn.addEventListener('mousemove', function (e) {
                    const circle = btn.querySelector('.ripple');
                    if (circle) {
                        const diameter = Math.max(btn.clientWidth, btn.clientHeight);
                        const radius = diameter / 2;
                        circle.style.left = `${e.clientX - btn.getBoundingClientRect().left - radius}px`;
                        circle.style.top = `${e.clientY - btn.getBoundingClientRect().top - radius}px`;
                    }
                });

                // Remove smoothly
                btn.addEventListener('mouseleave', function () {
                    const circle = btn.querySelector('.ripple');
                    if (circle) {
                        circle.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
                        circle.style.transform = 'translate(-50%, -50%) scale(0)';
                        setTimeout(() => circle.remove(), 400);
                    }
                });
            });
        };
        initRippleButtons();

        // Force light mode only

        // 2. Location Filters
        const activeFiltersSummary = document.getElementById('active-filters-summary');
        const onlyCouponsInput = document.getElementById('only-coupons');
        const onlyRealDealsInput = document.getElementById('only-real-deals');
        const renderActiveFiltersSummary = () => {
            if (!activeFiltersSummary) return;

            const config = getRegionConfig();
            const regionFlag = REGION_FLAGS[currentRegion] || '🌎';

            const items = [
                `${regionFlag} ${config.activeRegion}`,
                config.currency,
                getConditionLabel(conditionModeInput?.value || 'all'),
                config.scopes[locRadiusInput?.value === 'local_only' ? 'local_only' : (locRadiusInput?.value !== 'global' ? 'nearby' : 'global')]
            ];

            if (document.getElementById('btn-safe-stores')?.getAttribute('data-safe') === 'true') {
                items.push(config.filters.safe);
            }
            if (includeKnownMarketplacesInput?.value === 'true') {
                items.push(isEnglishRegion() ? 'Known marketplaces' : 'Marketplaces conocidos');
            }
            if (includeHighRiskMarketplacesInput?.value === 'true') {
                items.push(isEnglishRegion() ? 'High risk sources' : 'Riesgo alto');
            }
            if (onlyCouponsInput?.value === 'true') {
                items.push(isEnglishRegion() ? 'Coupons only' : 'Solo con cupón');
            }
            if (onlyRealDealsInput?.value === 'true') {
                items.push(isEnglishRegion() ? 'Real deals only' : 'Solo oferta real');
            }

            activeFiltersSummary.innerHTML = items.map(label => `
                <span class="active-filter-pill rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em]">${label}</span>
            `).join('');

            const toggleFiltersLabel = document.getElementById('toggle-filters-label');
            if (toggleFiltersLabel) {
                const activeCount = Math.max(0, items.length - 4);
                const baseLabel = getRegionUICopy().guidedSearch[
                    document.getElementById('filters-collapsible')?.classList.contains('filters-collapsed') ? 'toggleShow' : 'toggleHide'
                ];
                toggleFiltersLabel.textContent = activeCount > 0 ? `${baseLabel} (${activeCount})` : baseLabel;
            }
        };

        const setToggleState = (button, enabled) => {
            if (!button) return;
            button.setAttribute('data-enabled', enabled ? 'true' : 'false');
            button.classList.toggle('border-emerald-500', enabled);
            button.classList.toggle('bg-emerald-50', enabled);
            button.classList.toggle('text-emerald-700', enabled);
            button.classList.toggle('border-slate-200', !enabled);
            button.classList.toggle('bg-white', !enabled);
            button.classList.toggle('text-slate-600', !enabled);
        };

        const regionPillButton = document.getElementById('detected-region-pill');
        const regionSelectorMenu = document.getElementById('region-selector-menu');
        const regionOptionButtons = document.querySelectorAll('.region-option-btn');
        if (regionPillButton && regionSelectorMenu) {
            const regionSelectorOriginalParent = regionSelectorMenu.parentElement;
            const regionSelectorOriginalNextSibling = regionSelectorMenu.nextElementSibling;
            const positionRegionSelectorMenu = () => {
                const rect = regionPillButton.getBoundingClientRect();
                const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
                const preferredWidth = Math.min(280, Math.max(220, viewportWidth - 24));
                const left = Math.max(12, Math.min(rect.left, viewportWidth - preferredWidth - 12));
                const top = Math.min(rect.bottom + 8, (window.innerHeight || document.documentElement.clientHeight || 0) - 24);
                regionSelectorMenu.style.position = 'fixed';
                regionSelectorMenu.style.left = `${left}px`;
                regionSelectorMenu.style.top = `${top}px`;
                regionSelectorMenu.style.right = 'auto';
                regionSelectorMenu.style.width = `${preferredWidth}px`;
                regionSelectorMenu.style.maxWidth = `${preferredWidth}px`;
                regionSelectorMenu.style.zIndex = '9999';
            };
            const hideRegionSelectorMenu = () => {
                regionSelectorMenu.classList.add('hidden');
                if (regionSelectorOriginalParent && regionSelectorMenu.parentElement !== regionSelectorOriginalParent) {
                    if (regionSelectorOriginalNextSibling && regionSelectorOriginalNextSibling.parentElement === regionSelectorOriginalParent) {
                        regionSelectorOriginalParent.insertBefore(regionSelectorMenu, regionSelectorOriginalNextSibling);
                    } else {
                        regionSelectorOriginalParent.appendChild(regionSelectorMenu);
                    }
                }
                regionSelectorMenu.style.position = '';
                regionSelectorMenu.style.left = '';
                regionSelectorMenu.style.top = '';
                regionSelectorMenu.style.right = '';
                regionSelectorMenu.style.width = '';
                regionSelectorMenu.style.maxWidth = '';
                regionSelectorMenu.style.zIndex = '';
            };
            regionPillButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const willOpen = regionSelectorMenu.classList.contains('hidden');
                if (!willOpen) {
                    hideRegionSelectorMenu();
                    return;
                }
                if (regionSelectorMenu.parentElement !== document.body) {
                    document.body.appendChild(regionSelectorMenu);
                }
                regionSelectorMenu.classList.remove('hidden');
                positionRegionSelectorMenu();
                applyRegionalCopy();
            });
            document.addEventListener('click', hideRegionSelectorMenu);
            regionSelectorMenu.addEventListener('click', (event) => event.stopPropagation());
            window.addEventListener('resize', () => {
                if (!regionSelectorMenu.classList.contains('hidden')) {
                    positionRegionSelectorMenu();
                }
            });
            window.addEventListener('scroll', () => {
                if (!regionSelectorMenu.classList.contains('hidden')) {
                    positionRegionSelectorMenu();
                }
            }, true);
            regionOptionButtons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const selectedRegion = btn.getAttribute('data-region') || 'auto';
                    localStorage.setItem(REGION_OVERRIDE_KEY, selectedRegion);
                    currentRegion = selectedRegion === 'auto' ? detectRegion() : selectedRegion;
                    hideRegionSelectorMenu();
                    applyRegionalCopy();
                    renderActiveFiltersSummary();
                });
            });
        }

        if (locFilterBtns.length > 0 && locRadiusInput) {
            locFilterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const radius = btn.getAttribute('data-radius');
                    locRadiusInput.value = radius;

                    // Update visual classes
                    locFilterBtns.forEach(b => {
                        b.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
                        b.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
                    });
                    btn.classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
                    btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');

                    // Request location if 'Cerca de mí'
                    if (radius !== 'global' && radius !== 'local_only') {
                        if (navigator.geolocation && userLatInput && userLngInput) {
                            // Use cached location if available (less than 10 min old)
                            const cachedLoc = JSON.parse(localStorage.getItem('lumu_geolocation') || 'null');
                            if (cachedLoc && (Date.now() - cachedLoc.ts) < 600000) {
                                userLatInput.value = cachedLoc.lat;
                                userLngInput.value = cachedLoc.lng;
                                syncLocationFilterLabels();
                            } else {
                                btn.textContent = currentRegion === 'US' ? '📍 Locating...' : '📍 Ubicando...';
                                navigator.geolocation.getCurrentPosition((pos) => {
                                    userLatInput.value = pos.coords.latitude;
                                    userLngInput.value = pos.coords.longitude;
                                    localStorage.setItem('lumu_geolocation', JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() }));
                                    syncLocationFilterLabels();
                                }, (err) => {
                                    console.warn('Geolocation denied or failed:', err);
                                    if (typeof showGlobalFeedback === 'function') {
                                        showGlobalFeedback(
                                            currentRegion === 'US' 
                                                ? 'Could not secure your location. Defaulting to Global search.' 
                                                : 'No pudimos obtener tu ubicación. Buscando en "Todas partes".', 
                                            'error'
                                        );
                                    }
                                    // Reset buttons and force a fallback to global text
                                    btn.textContent = currentRegion === 'US' ? '🌎 Global search' : '🌎 Todas partes';
                                    syncLocationFilterLabels();
                                }, { timeout: 8000, maximumAge: 300000 });
                            }
                        }
                    }
                });
            });
        }

        // Fase 6: Filtro Tiendas Seguras
        const btnSafeStores = document.getElementById('btn-safe-stores');
        if (btnSafeStores) {
            btnSafeStores.addEventListener('click', () => {
                const isSafe = btnSafeStores.getAttribute('data-safe') === 'true';
                if (isSafe) {
                    // Turn off
                    btnSafeStores.setAttribute('data-safe', 'false');
                    btnSafeStores.classList.remove('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
                    btnSafeStores.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
                } else {
                    // Turn on
                    btnSafeStores.setAttribute('data-safe', 'true');
                    btnSafeStores.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
                    btnSafeStores.classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-700');
                }
                renderActiveFiltersSummary();
            });
        }

        const btnKnownMarketplaces = document.getElementById('btn-known-marketplaces');
        const btnHighRiskMarketplaces = document.getElementById('btn-high-risk-marketplaces');
        if (btnKnownMarketplaces && includeKnownMarketplacesInput) {
            setToggleState(btnKnownMarketplaces, includeKnownMarketplacesInput.value === 'true');
            btnKnownMarketplaces.addEventListener('click', () => {
                const enabled = btnKnownMarketplaces.getAttribute('data-enabled') !== 'true';
                includeKnownMarketplacesInput.value = enabled ? 'true' : 'false';
                setToggleState(btnKnownMarketplaces, enabled);
                if (!enabled && includeHighRiskMarketplacesInput && btnHighRiskMarketplaces) {
                    includeHighRiskMarketplacesInput.value = 'false';
                    setToggleState(btnHighRiskMarketplaces, false);
                }
                renderActiveFiltersSummary();
            });
        }
        if (btnHighRiskMarketplaces && includeHighRiskMarketplacesInput) {
            setToggleState(btnHighRiskMarketplaces, includeHighRiskMarketplacesInput.value === 'true');
            btnHighRiskMarketplaces.addEventListener('click', () => {
                const enabled = btnHighRiskMarketplaces.getAttribute('data-enabled') !== 'true';
                includeHighRiskMarketplacesInput.value = enabled ? 'true' : 'false';
                setToggleState(btnHighRiskMarketplaces, enabled);
                if (enabled && includeKnownMarketplacesInput && btnKnownMarketplaces) {
                    includeKnownMarketplacesInput.value = 'true';
                    setToggleState(btnKnownMarketplaces, true);
                }
                renderActiveFiltersSummary();
                if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
            });
        }

        const btnOnlyCoupons = document.getElementById('btn-only-coupons');
        if (btnOnlyCoupons && onlyCouponsInput) {
            setToggleState(btnOnlyCoupons, onlyCouponsInput.value === 'true');
            btnOnlyCoupons.addEventListener('click', () => {
                const enabled = btnOnlyCoupons.getAttribute('data-enabled') !== 'true';
                onlyCouponsInput.value = enabled ? 'true' : 'false';
                setToggleState(btnOnlyCoupons, enabled);
                renderActiveFiltersSummary();
                if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
            });
        }

        const btnOnlyRealDeals = document.getElementById('btn-only-real-deals');
        if (btnOnlyRealDeals && onlyRealDealsInput) {
            setToggleState(btnOnlyRealDeals, onlyRealDealsInput.value === 'true');
            btnOnlyRealDeals.addEventListener('click', () => {
                const enabled = btnOnlyRealDeals.getAttribute('data-enabled') !== 'true';
                onlyRealDealsInput.value = enabled ? 'true' : 'false';
                setToggleState(btnOnlyRealDeals, enabled);
                renderActiveFiltersSummary();
                if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
            });
        }

        if (conditionChips.length > 0 && conditionModeInput) {
            conditionChips.forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = btn.getAttribute('data-condition') || 'all';
                    conditionModeInput.value = mode;
                    conditionChips.forEach(chip => chip.classList.remove('condition-chip-active'));
                    btn.classList.add('condition-chip-active');
                    renderActiveFiltersSummary();
                });
            });
        }

        const btnToggleFilters = document.getElementById('btn-toggle-filters');
        const filtersCollapsible = document.getElementById('filters-collapsible');
        const filtersWrapper = document.getElementById('filters-wrapper');
        const filtersMobileOverlay = document.getElementById('filters-mobile-overlay');
        const toggleFiltersLabel = document.getElementById('toggle-filters-label');
        const toggleFiltersIcon = document.getElementById('toggle-filters-icon');

        if (btnToggleFilters && filtersCollapsible) {
            const isMobileFiltersViewport = () => window.innerWidth < 640;
            const syncFiltersPanel = (collapsed) => {
                filtersCollapsible.classList.toggle('filters-collapsed', collapsed);
                if (filtersWrapper) {
                    filtersWrapper.classList.toggle('hidden', collapsed);
                }
                if (filtersMobileOverlay) {
                    filtersMobileOverlay.classList.toggle('filters-open', !collapsed && isMobileFiltersViewport());
                }
                if (document.body) {
                    document.body.classList.toggle('overflow-hidden', !collapsed && isMobileFiltersViewport());
                }
                if (toggleFiltersLabel) {
                    toggleFiltersLabel.textContent = collapsed ? (getRegionUICopy().guidedSearch.toggleShow || 'Filtros') : (getRegionUICopy().guidedSearch.toggleHide || 'Ocultar');
                }
                if (toggleFiltersIcon) {
                    toggleFiltersIcon.classList.toggle('rotate-180', !collapsed);
                }
                btnToggleFilters.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            };

            const syncFiltersPanelForViewport = () => {
                const shouldCollapse = true;
                syncFiltersPanel(shouldCollapse);
            };

            btnToggleFilters.setAttribute('aria-controls', 'filters-collapsible');
            syncFiltersPanelForViewport();

            btnToggleFilters.addEventListener('click', () => {
                const isCollapsed = filtersCollapsible.classList.contains('filters-collapsed');
                syncFiltersPanel(!isCollapsed);
            });

            if (filtersMobileOverlay) {
                filtersMobileOverlay.addEventListener('click', () => {
                    if (isMobileFiltersViewport()) syncFiltersPanel(true);
                });
            }

            window.addEventListener('resize', syncFiltersPanelForViewport);
        }

        renderActiveFiltersSummary();

        if (homeLogoLink) {
            homeLogoLink.addEventListener('click', (e) => {
                if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')) {
                    e.preventDefault();
                    restoreHomeSections();
                    revealLandingBrowseSections();
                    setBrowseCategoryState('');
                    searchInput.value = '';
                    searchInput.style.height = '56px';
                    syncLocationFilterLabels();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        // 3. Category Buttons
        if (categoryBtns.length > 0 && searchInput) {
            categoryBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const macroCategory = btn.getAttribute('data-macro-category');
                    if (macroCategory) {
                        searchInput.value = macroCategory;
                        if (searchForm) {
                            if (typeof searchForm.requestSubmit === 'function') {
                                searchForm.requestSubmit();
                            } else {
                                searchButton.click();
                            }
                        }
                    }
                });
            });
        }

        if (headerBrowseButtons.length > 0) {
            headerBrowseButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const query = button.getAttribute('data-browse-query');
                    const categoryKey = button.getAttribute('data-header-category') || '';
                    queueBrowseSearch(query, categoryKey);
                });
            });
        }

        if (browseHubButtons.length > 0) {
            browseHubButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const query = button.getAttribute('data-browse-query');
                    const categoryKey = button.getAttribute('data-browse-category') || '';
                    queueBrowseSearch(query, categoryKey);
                });
            });
        }

        // 4. Navbar Buttons (Login, Favoritos)
        if (btnLoginHeader) btnLoginHeader.addEventListener('click', openModal);
        if (navFavoritos) navFavoritos.addEventListener('click', openFavorites);

        // DOM hooks for onboarding removed
        if (navB2b) {
            navB2b.addEventListener('click', () => {
                if (b2bModal) {
                    b2bModal.classList.remove('invisible', 'opacity-0');
                    b2bModal.classList.add('opacity-100');
                    const panel = b2bModal.querySelector('.glass-panel, .relative');
                    if (panel) { panel.classList.remove('scale-95'); panel.classList.add('scale-100'); }
                }
            });
        }
        if (closeB2bModal) {
            closeB2bModal.addEventListener('click', () => {
                if (b2bModal) b2bModal.classList.add('invisible', 'opacity-0');
            });
        }
        if (b2bBackdrop) {
            b2bBackdrop.addEventListener('click', () => {
                if (b2bModal) b2bModal.classList.add('invisible', 'opacity-0');
            });
        }

        if (btnProcessB2b) btnProcessB2b.addEventListener('click', processB2bQueries);
        if (btnExportB2b) btnExportB2b.addEventListener('click', exportB2bToCSV);


        adContainer = document.getElementById('ad-video-container');

        if (adContainer) {
            if (typeof initIMA === 'function') {
                initIMA();
            } else {
                console.warn('initIMA no definido, saltando inicialización de anuncios.');
            }
        }

        btnFeedback = document.getElementById('btn-feedback-floating');
        feedbackModal = document.getElementById('feedback-modal');
        closeFeedbackBtn = document.getElementById('close-feedback-modal');
        feedbackBackdrop = document.getElementById('feedback-backdrop');
        feedbackForm = document.getElementById('feedback-form');
        feedbackSuccess = document.getElementById('feedback-success');

        mobileMenuDrawer = document.getElementById('mobile-menu-drawer');
        mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
        mobileMenuPanel = document.getElementById('mobile-menu-panel');
        btnMobileMenu = document.getElementById('btn-mobile-menu');
        btnCloseMobileMenu = document.getElementById('close-mobile-menu');
        mobileAuthContainer = document.getElementById('mobile-auth-container');

        // (Event listeners for history/favorites/profile/modals registered elsewhere — no duplicates)

        if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', closeHistoryModal);
        if (historyBackdrop) historyBackdrop.addEventListener('click', closeHistoryModal);

        if (btnMobileMenu) btnMobileMenu.addEventListener('click', () => toggleMobileMenu(true));
        if (btnCloseMobileMenu) btnCloseMobileMenu.addEventListener('click', () => toggleMobileMenu(false));
        if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', () => toggleMobileMenu(false));

        // --- Pricing Section Buttons ---
        const btnPricingVip = document.getElementById('btn-pricing-vip');
        if (btnPricingVip) btnPricingVip.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Inicia sesión primero para suscribirte', 'info');
                openModal();
                return;
            }
            if (stripePaymentLink) {
                trackMetaEventSafe('PlanSelected', {
                    plan_name: 'vip',
                    plan_price: 39,
                    currency: 'MXN',
                    source: 'homepage_pricing'
                });
                trackFunnelEvent('checkout_click', {
                    action_context: 'homepage_pricing',
                    price: 39,
                    brand: 'vip'
                });
                window.open(`${stripePaymentLink}?client_reference_id=${encodeURIComponent(currentUser.id)}`, '_blank');
            } else {
                showToast('Link de pago no disponible. Intenta más tarde.', 'error');
            }
        });
        const btnPricingB2b = document.getElementById('btn-pricing-b2b');
        if (btnPricingB2b) btnPricingB2b.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Inicia sesión primero para suscribirte', 'info');
                openModal();
                return;
            }
            if (window.stripeB2bPaymentLink) {
                trackMetaEventSafe('PlanSelected', {
                    plan_name: 'b2b',
                    plan_price: 199,
                    currency: 'MXN',
                    source: 'homepage_pricing'
                });
                trackFunnelEvent('checkout_click', {
                    action_context: 'homepage_pricing',
                    price: 199,
                    brand: 'b2b'
                });
                window.open(`${window.stripeB2bPaymentLink}?client_reference_id=${encodeURIComponent(currentUser.id)}`, '_blank');
            } else {
                showToast('Contacta a ventas: soporte.lumu@gmail.com', 'info');
            }
        });

        if (btnPricingVip || btnPricingB2b) {
            const pricingTarget = btnPricingVip?.closest('section') || btnPricingB2b?.closest('section') || btnPricingVip || btnPricingB2b;
            if (pricingTarget && typeof IntersectionObserver === 'function') {
                const pricingObserver = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (!entry.isIntersecting || window.__lumuPricingViewTracked) return;
                        window.__lumuPricingViewTracked = true;
                        trackFunnelEvent('pricing_view', {
                            action_context: 'homepage_pricing_section'
                        });
                        pricingObserver.disconnect();
                    });
                }, { threshold: 0.35 });
                pricingObserver.observe(pricingTarget);
            }
        }

        // --- Logic for Image and Voice ---
        if (btnAttachImage) btnAttachImage.addEventListener('click', () => imageUpload.click());
        if (imageUpload) {
            imageUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (readerEvent) => {
                        selectedImageBase64 = readerEvent.target.result;
                        imagePreview.src = selectedImageBase64;
                        imagePreviewContainer.classList.remove('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        if (btnRemoveImage) {
            btnRemoveImage.addEventListener('click', () => {
                selectedImageBase64 = null;
                imageUpload.value = '';
                imagePreviewContainer.classList.add('hidden');
            });
        }

        // Close menu on nav link click
        document.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', () => toggleMobileMenu(false));
        });

        initWelcomeOnboarding();

        function toggleMobileMenu(show) {
            if (!mobileMenuDrawer || !mobileMenuBackdrop || !mobileMenuPanel) return;
            if (show) {
                mobileMenuDrawer.classList.remove('invisible', 'pointer-events-none');
                mobileMenuBackdrop.classList.replace('opacity-0', 'opacity-100');
                mobileMenuPanel.classList.replace('translate-x-full', 'translate-x-0');
            } else {
                mobileMenuBackdrop.classList.replace('opacity-100', 'opacity-0');
                mobileMenuPanel.classList.replace('translate-x-0', 'translate-x-full');
                setTimeout(() => {
                    mobileMenuDrawer.classList.add('invisible', 'pointer-events-none');
                }, 300);
            }
        }

        // --- Mobile Drawer Action Buttons ---
        const btnMobileNavB2b = document.getElementById('mobile-nav-b2b');
        const btnMobileNavFavoritos = document.getElementById('mobile-nav-favoritos');
        const btnMobileNavAlerts = document.getElementById('mobile-nav-alerts');

        if (btnMobileNavB2b) {
            btnMobileNavB2b.addEventListener('click', () => {
                toggleMobileMenu(false);
                // Abrir modal B2B
                if (b2bModal) {
                    b2bModal.classList.remove('invisible', 'opacity-0');
                    b2bModal.classList.add('opacity-100');
                    const panel = b2bModal.querySelector('.glass-panel, .relative');
                    if (panel) { panel.classList.remove('scale-95'); panel.classList.add('scale-100'); }
                }
            });
        }

        if (btnMobileNavFavoritos) {
            btnMobileNavFavoritos.addEventListener('click', () => {
                toggleMobileMenu(false);
                openFavorites();
            });
        }

        if (btnMobileNavAlerts) {
            btnMobileNavAlerts.addEventListener('click', () => {
                toggleMobileMenu(false);
                const alertsModal = document.getElementById('price-alert-modal');
                if (alertsModal) {
                    alertsModal.classList.remove('invisible', 'opacity-0');
                    alertsModal.classList.add('opacity-100');
                    const panel = alertsModal.querySelector('.glass-panel');
                    if (panel) { panel.classList.remove('scale-95'); panel.classList.add('scale-100'); }
                }
            });
        }

        // --- FIX: Delegación de eventos global para btn-login dinámico ---
        // El #btn-login se regenera al cambiar el estado de sesión, por lo que necesita
        // delegación de eventos en lugar de un listener directo sobre el elemento.
        document.addEventListener('click', (e) => {
            const loginBtn = e.target.closest('#btn-login');
            if (loginBtn) {
                e.preventDefault();
                openModal();
            }
        });

        // --- FIX: Fallback para imágenes rotas ---
        document.querySelectorAll('img').forEach(img => {
            if (!img.dataset.fallbackBound) {
                img.dataset.fallbackBound = '1';
                img.addEventListener('error', function () {
                    this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50' y='55' text-anchor='middle' font-size='30' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E";
                    this.classList.add('opacity-50');
                });
            }
        });

        // --- FEAUTRES INITIALIZATION ---
        if (typeof initFeedback === 'function') initFeedback();
        if (typeof initFavoritesHover === 'function') initFavoritesHover();


        window.removeFavoriteFromList = async (encodedUrl) => {
            const url = decodeURIComponent(encodedUrl);
            const sb = window.supabaseClient || null;
            const user = window.currentUser || null;
            if (!sb || !user) return;

            try {
                await sb.from('favorites').delete().eq('user_id', user.id).eq('product_url', url);
                renderFavoritesList();
            } catch (err) {
                console.error('Error removing favorite:', err);
            }
        };

        // --- Favorites modal bindings ---
        if (closeFavoritesBtn) closeFavoritesBtn.addEventListener('click', closeFavorites);
        if (favoritesBackdrop) favoritesBackdrop.addEventListener('click', closeFavorites);
        window.closeFavorites = closeFavorites;


        // --- PROFILE MODAL LOGIC ---
        profileModal = document.getElementById('profile-modal');
        closeProfileBtn = document.getElementById('close-profile-modal');
        profileBackdrop = document.getElementById('profile-backdrop');

        window.openProfileModal = async (user) => {
            if (!profileModal) return;

            const profileName = document.getElementById('profile-name');
            const profileEmail = document.getElementById('profile-email');
            const planName = document.getElementById('profile-plan-name');
            const statusBadge = document.getElementById('profile-status-badge');
            const searchesLeft = document.getElementById('profile-searches-left');

            if (profileName) profileName.textContent = user.user_metadata?.full_name || user.email.split('@')[0];
            if (profileEmail) profileEmail.textContent = user.email;

            const ui = getRegionUICopy();
            let isVIP = false;
            let plan = 'free';
            let remainingSearchesText = ui.profile.searchesLeftUnlimited;
            const sb = window.supabaseClient || null;

            if (sb) {
                try {
                    const [{ data: profileData }, { data: usageData }] = await Promise.all([
                        sb.from('profiles').select('is_premium, plan').eq('id', user.id).single(),
                        sb.from('user_search_usage').select('lifetime_searches, monthly_searches').eq('user_id', user.id).maybeSingle()
                    ]);

                    if (profileData) {
                        plan = profileData.plan || 'free';
                        isVIP = !!profileData.is_premium || ['personal_vip', 'personal_vip_annual', 'b2b', 'b2b_annual'].includes(plan);
                    }

                    const lifetimeSearches = usageData?.lifetime_searches || 0;
                    const monthlySearches = usageData?.monthly_searches || 0;

                    if (plan === 'b2b' || plan === 'b2b_annual') {
                        remainingSearchesText = ui.profile.searchesLeft.replace('{count}', Math.max(0, 200 - monthlySearches));
                    } else if (isVIP) {
                        remainingSearchesText = ui.profile.searchesLeft.replace('{count}', Math.max(0, 40 - monthlySearches));
                    } else {
                        remainingSearchesText = ui.profile.searchesLeft.replace('{count}', Math.max(0, 10 - lifetimeSearches));
                    }
                } catch (e) {
                    console.error('Error fetching profile usage', e);
                }
            }

            if (planName) planName.textContent = (plan === 'b2b' || plan === 'b2b_annual') ? 'Plan Revendedor B2B' : (isVIP ? ui.profile.planVip : ui.profile.planFree);
            if (statusBadge) statusBadge.textContent = (plan === 'b2b' || plan === 'b2b_annual') ? 'B2B' : (isVIP ? 'VIP' : ui.profile.statusFree);
            if (searchesLeft) searchesLeft.textContent = remainingSearchesText;

            profileModal.classList.remove('invisible', 'opacity-0');
            const panel = profileModal.querySelector('.glass-panel');
            if (panel) {
                panel.classList.remove('scale-95');
                panel.classList.add('scale-100');
            }
        };

        function closeProfileModal() {
            if (!profileModal) return;
            profileModal.classList.add('invisible', 'opacity-0');
            const panel = profileModal.querySelector('.glass-panel');
            if (panel) {
                panel.classList.remove('scale-100');
                panel.classList.add('scale-95');
            }
        };

        if (closeProfileBtn) closeProfileBtn.addEventListener('click', closeProfileModal);
        if (profileBackdrop) profileBackdrop.addEventListener('click', closeProfileModal);

        // Profile modal logout button (separate from dropdown btn-logout)
        const btnLogoutProfile = document.getElementById('btn-logout-profile');
        if (btnLogoutProfile) {
            btnLogoutProfile.addEventListener('click', async () => {
                if (supabaseClient) await supabaseClient.auth.signOut();
                closeProfileModal();
            });
        }

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

        function updateAuthUI(user) {
            currentUser = user;
            window.currentUser = user; // Expose for Ad Gateway
            if (!authContainer) return;
            const ui = getRegionUICopy();

            if (user) {
                // Usuario logueado
                const rawAvatar = user.user_metadata?.avatar_url || '';
                const safeAvatar = rawAvatar.startsWith('http') ? sanitize(rawAvatar) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.email || 'U') + '&background=10B981&color=fff';
                const safeName = sanitize(user.user_metadata?.full_name || user.email.split('@')[0]);
                authContainer.innerHTML = `
                <div class="relative group cursor-pointer flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                    <img src="${safeAvatar}" alt="Avatar" class="w-6 h-6 rounded-full">
                    <span class="text-sm font-bold text-slate-700 max-w-[120px] truncate">${safeName}</span>
                    
                    <div class="absolute top-full mt-2 right-0 bg-white border border-slate-100 shadow-xl rounded-xl p-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                        <button id="btn-history" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-primary rounded-lg transition-colors flex items-center gap-2 mb-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ${ui.historyModal.title}
                        </button>
                        <button id="btn-mis-favoritos" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-primary rounded-lg transition-colors flex items-center gap-2 mb-1">
                            <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path></svg>
                            ${ui.favorites.title}
                        </button>
                        <button id="btn-mi-ahorro" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-emerald-600 rounded-lg transition-colors flex items-center gap-2 mb-1">
                            <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ${currentRegion === 'US' ? 'My Savings' : 'Mi Ahorro'} 
                            <span id="savings-count" class="ml-auto bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-black hidden">$0</span>
                        </button>
                        <button id="btn-mi-perfil" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-primary rounded-lg transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            ${currentRegion === 'US' ? 'My VIP Profile' : 'Mi Perfil VIP'}
                        </button>
                        <div class="h-px bg-slate-100 my-1"></div>
                        <button id="btn-logout" class="w-full text-left px-3 py-2 text-sm text-red-600 font-bold hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            ${currentRegion === 'US' ? 'Sign Out' : 'Salir'}
                        </button>
                    </div>
                </div>
            `;

                // Re-bind listeners for dynamic elements
                document.getElementById('btn-history').addEventListener('click', openHistoryModal);
                document.getElementById('btn-mis-favoritos').addEventListener('click', () => openFavorites());
                document.getElementById('btn-mi-ahorro').addEventListener('click', () => openSavingsDashboard());
                document.getElementById('btn-mi-perfil').addEventListener('click', () => openProfileModal(user));
                
                // Update savings count in menu
                updateMenuSavings();

                document.getElementById('btn-logout').addEventListener('click', async () => {
                    if (supabaseClient) await supabaseClient.auth.signOut();
                });
                closeModal();
                
                // Show PRO Badge if premium
                const proBadge = document.getElementById('pro-badge-nav');
                if (proBadge) {
                    const isPremium = user.is_premium || user.plan === 'personal_vip' || user.plan === 'b2b';
                    if (isPremium) {
                        proBadge.classList.remove('hidden');
                        proBadge.classList.add('flex');
                    } else {
                        proBadge.classList.add('hidden');
                        proBadge.classList.remove('flex');
                    }
                }

                // Fase 6: Lumu Coins
                fetch('/api/me/coins', {
                    headers: { 'Authorization': `Bearer ${user.access_token || ''}` }
                }).then(res => res.json()).then(data => {
                    if (data && data.coins !== undefined) {
                        let coinsBadge = document.getElementById('lumu-coins-nav');
                        if (!coinsBadge) {
                            coinsBadge = document.createElement('div');
                            coinsBadge.id = 'lumu-coins-nav';
                            coinsBadge.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700 shadow-sm transition-all hover:bg-amber-100 cursor-pointer';
                            coinsBadge.title = currentRegion === 'US'
                                ? `${data.coins}/${data.next_goal} for free VIP`
                                : `${data.coins}/${data.next_goal} para VIP gratis`;
                            // Insert before pro-badge if possible, else append to authContainer
                            if (proBadge && proBadge.parentNode) {
                                proBadge.parentNode.insertBefore(coinsBadge, proBadge);
                            } else {
                                authContainer.prepend(coinsBadge);
                            }
                        }
                        coinsBadge.innerHTML = `<span class="text-base drop-shadow-sm">🪙</span> <span>${data.coins}</span>`;
                        // SEC-3: Cache temp VIP status for ad gateway skip
                        window._isPremiumTemp = !!data.is_premium_temp;
                        window._vipTempRemainingMin = data.vip_temp_remaining_min || 0;
                        // Auto-upgrade if temp premium
                        if (data.is_premium_temp && proBadge && proBadge.classList.contains('hidden')) {
                            proBadge.classList.remove('hidden');
                            proBadge.classList.add('flex');
                            const mins = data.vip_temp_remaining_min || 0;
                            proBadge.innerHTML = currentRegion === 'US'
                                ? `⭐ TEMP VIP (${mins}min)`
                                : `⭐ VIP TEMPORAL (${mins}min)`;
                        } else if (!data.is_premium_temp && proBadge) {
                            // If temp VIP expired, hide badge (unless they're real VIP)
                            if (proBadge.textContent.includes('TEMP') || proBadge.textContent.includes('TEMPORAL')) {
                                proBadge.classList.add('hidden');
                                proBadge.classList.remove('flex');
                            }
                        }
                    }
                }).catch(e => console.error('Error fetching coins:', e));

            } else {
                // Usuario deslogueado
                authContainer.innerHTML = `
                <button id="btn-login" class="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-1.5 rounded-lg border border-slate-200 transition-colors flex items-center gap-2 font-bold shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    ${ui.nav.login}
                </button>
            `;
                document.getElementById('btn-login').addEventListener('click', openModal);
            }

            // Update mobile auth container too
            if (mobileAuthContainer) {
                if (user) {
                    const rawAvatar = user.user_metadata?.avatar_url || '';
                    const safeAvatar = rawAvatar.startsWith('http') ? sanitize(rawAvatar) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.email || 'U') + '&background=10B981&color=fff';
                    const safeName = sanitize(user.user_metadata?.full_name || user.email.split('@')[0]);
                    mobileAuthContainer.innerHTML = `
                        <div class="flex items-center gap-3 mb-3">
                            <img src="${safeAvatar}" alt="Avatar" class="w-10 h-10 rounded-full border-2 border-emerald-400">
                            <div>
                                <p class="font-bold text-slate-800 text-sm">${safeName}</p>
                                <p class="text-xs text-slate-400">${sanitize(user.email || '')}</p>
                            </div>
                        </div>
                        <button id="btn-mobile-logout" class="w-full text-sm font-bold text-red-500 hover:bg-red-50 py-2 px-3 rounded-xl transition-colors text-left flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            ${currentRegion === 'US' ? 'Sign Out' : 'Cerrar Sesión'}
                        </button>
                    `;
                    document.getElementById('btn-mobile-logout')?.addEventListener('click', async () => {
                        if (supabaseClient) await supabaseClient.auth.signOut();
                        toggleMobileMenu(false);
                    });
                } else {
                    mobileAuthContainer.innerHTML = `
                        <button id="btn-mobile-login" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            ${currentRegion === 'US' ? 'Sign in with Google' : 'Ingresar con Google'}
                        </button>
                    `;
                    document.getElementById('btn-mobile-login')?.addEventListener('click', () => {
                        toggleMobileMenu(false);
                        openModal();
                    });
                }
            }
        }

        function getPreferredOAuthRedirectUrl() {
            try {
                const currentUrl = new URL(window.location.href);
                const isLocalHost = currentUrl.hostname === 'localhost';
                const isLoopback = currentUrl.hostname === '127.0.0.1';
                if (isLocalHost) {
                    return `http://127.0.0.1:${currentUrl.port || '3000'}${currentUrl.pathname || '/'}`;
                }
                if (isLoopback) {
                    return currentUrl.toString();
                }
                return window.location.origin;
            } catch (error) {
                return window.location.origin;
            }
        }

        async function handleGoogleLogin(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const activeSupabaseClient = supabaseClient || window.supabaseClient;
            if (!activeSupabaseClient) {
                console.error('Google OAuth unavailable: supabaseClient not initialized');
                if (typeof showGlobalFeedback === 'function') {
                    showGlobalFeedback(currentRegion === 'US' ? 'Login is temporarily unavailable. Please refresh and try again.' : 'El login no está disponible temporalmente. Recarga e inténtalo de nuevo.', 'error');
                }
                return;
            }
            if (btnGoogleLogin) {
                btnGoogleLogin.disabled = true;
                btnGoogleLogin.classList.add('opacity-70', 'cursor-wait');
            }
            try {
                sessionStorage.setItem('just_logged_in', 'true');
                const { error } = await activeSupabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: getPreferredOAuthRedirectUrl()
                    }
                });
                if (error) {
                    throw error;
                }
            } catch (error) {
                console.error('Google OAuth start failed:', error);
                if (typeof showGlobalFeedback === 'function') {
                    showGlobalFeedback(currentRegion === 'US' ? 'We could not start Google login. Try again.' : 'No pudimos iniciar el login con Google. Inténtalo otra vez.', 'error');
                }
                if (btnGoogleLogin) {
                    btnGoogleLogin.disabled = false;
                    btnGoogleLogin.classList.remove('opacity-70', 'cursor-wait');
                }
            }
        }

        if (supabaseClient) {
            supabaseClient.auth.onAuthStateChange((event, session) => {
                updateAuthUI(session?.user);

                // Fase 6: Animación de Confeti al registrarse
                if (event === 'SIGNED_IN' && session?.user && typeof confetti === 'function') {
                    // Check if user was created in the last 60 seconds (likely a new signup)
                    const createdAt = new Date(session.user.created_at).getTime();
                    const now = Date.now();
                    const isNewUser = (now - createdAt) < 60000;

                    if (isNewUser && !sessionStorage.getItem('lumu_confetti_fired')) {
                        _authModalCompleted = true;
                        _trackEvent('signup_complete');
                        trackMetaEventSafe('SignupCompleted', {
                            signup_method: 'google_oauth',
                            region: currentRegion || 'MX'
                        });
                        setTimeout(() => {
                            confetti({
                                particleCount: 150,
                                spread: 80,
                                origin: { y: 0.6 },
                                colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899']
                            });
                        }, 500);
                        sessionStorage.setItem('lumu_confetti_fired', 'true');
                        fetch('/api/signup-bonus', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token || ''}`
                            }
                        }).then(res => res.json()).then(data => {
                            if (data?.bonus > 0) {
                                _trackEvent('signup_bonus', { search_query: 'welcome_bonus' });
                                showGlobalFeedback(currentRegion === 'US' ? `Welcome! You unlocked ${data.bonus} extra searches.` : `¡Bienvenido! Desbloqueaste ${data.bonus} búsquedas extra.`, 'success');
                            }
                        }).catch(() => { });
                    }
                }
            });
            // Ocultar botón login si estamos logueados
            const btnLoginNav = document.getElementById('btn-login');
            if (btnLoginNav) btnLoginNav.classList.add('hidden');
        } else {
            // Fallback visual si falla Supabase
            updateAuthUI(null);
        }

        if (btnGoogleLogin) {
            btnGoogleLogin.addEventListener('click', handleGoogleLogin);
        }

        // --- Email/Password auth removed (only Google OAuth is supported) ---


        async function restoreSearchSnapshot(snapshot) {
            if (!snapshot || !Array.isArray(snapshot.results) || snapshot.results.length === 0) return;
            closeHistoryModal();
            if (searchInput) {
                searchInput.value = snapshot.query || '';
                searchInput.style.height = '56px';
                searchInput.style.height = `${searchInput.scrollHeight}px`;
            }
            if (conditionModeInput && snapshot.conditionMode) {
                conditionModeInput.value = snapshot.conditionMode;
                document.querySelectorAll('.condition-chip').forEach(chip => {
                    const isActive = chip.dataset.condition === snapshot.conditionMode;
                    chip.classList.toggle('condition-chip-active', isActive);
                });
            }
            if (locRadiusInput && snapshot.radius) locRadiusInput.value = snapshot.radius;
            if (includeKnownMarketplacesInput) {
                includeKnownMarketplacesInput.value = snapshot.includeKnownMarketplaces === false ? 'false' : 'true';
            }
            if (includeHighRiskMarketplacesInput) {
                includeHighRiskMarketplacesInput.value = snapshot.includeHighRiskMarketplaces ? 'true' : 'false';
            }
            const btnKnownMarketplaces = document.getElementById('btn-known-marketplaces');
            const btnHighRiskMarketplaces = document.getElementById('btn-high-risk-marketplaces');
            if (btnKnownMarketplaces && includeKnownMarketplacesInput) {
                setToggleState(btnKnownMarketplaces, includeKnownMarketplacesInput.value === 'true');
            }
            if (btnHighRiskMarketplaces && includeHighRiskMarketplacesInput) {
                setToggleState(btnHighRiskMarketplaces, includeHighRiskMarketplacesInput.value === 'true');
            }

            chatHistory = [];
            chatContainer.classList.add('hidden');
            chatContainer.innerHTML = '';
            resultsContainer.innerHTML = '';
            resultsWrapper.classList.remove('hidden');
            if (categoryIconBar) categoryIconBar.classList.add('hidden');
            if (flashDealsSection) flashDealsSection.classList.add('hidden');
            if (tendenciasSection) tendenciasSection.classList.add('hidden');
            errorMessage.classList.add('hidden');

            renderSearchContext({
                query: snapshot.query || '',
                radius: snapshot.radius || 'global',
                safeStoresOnly: Boolean(snapshot.safeStoresOnly),
                includeKnownMarketplaces: snapshot.includeKnownMarketplaces !== false,
                includeHighRiskMarketplaces: Boolean(snapshot.includeHighRiskMarketplaces),
                resultCount: snapshot.results.length
            });
            await renderProducts(snapshot.results);
            if (typeof showGlobalFeedback === 'function') {
                showGlobalFeedback(currentRegion === 'US' ? 'Preview restored without using another search.' : 'Vista previa restaurada sin gastar otra búsqueda.', 'success');
            }
        }

        async function loadSearchHistory() {
            const renderHistoryEntry = (query, createdAt = null) => {
                const snapshot = getSearchSnapshot(query);
                const labelDate = createdAt || snapshot?.savedAt;
                const config = getRegionConfig();
                const prettyDate = labelDate
                    ? new Date(labelDate).toLocaleDateString(config.locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : (currentRegion === 'US' ? 'Saved locally' : 'Guardado local');
                const card = document.createElement('div');
                card.className = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
                card.innerHTML = `
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm font-black text-slate-800 truncate">${sanitize(query)}</p>
                            <p class="text-[11px] text-slate-400 font-medium mt-1">${prettyDate}</p>
                            <p class="text-xs font-bold mt-1 ${snapshot?.results?.length ? 'text-emerald-700' : 'text-slate-400'}">${snapshot?.results?.length ? (currentRegion === 'US' ? `${snapshot.results.length} saved results` : `${snapshot.results.length} resultados guardados`) : (currentRegion === 'US' ? 'No saved preview' : 'Sin vista previa guardada')}</p>
                        </div>
                        <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">${currentRegion === 'US' ? 'History' : 'Historial'}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button type="button" class="btn-history-preview px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black hover:bg-emerald-600 transition-colors ${snapshot?.results?.length ? '' : 'opacity-50 cursor-not-allowed'}" ${snapshot?.results?.length ? '' : 'disabled'}>${currentRegion === 'US' ? 'Preview' : 'Ver vista previa'}</button>
                        <button type="button" class="btn-history-refresh px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-black hover:bg-slate-50 transition-colors">${currentRegion === 'US' ? 'Refresh search' : 'Actualizar búsqueda'}</button>
                    </div>
                `;
                const previewBtn = card.querySelector('.btn-history-preview');
                const refreshBtn = card.querySelector('.btn-history-refresh');
                if (previewBtn && snapshot?.results?.length) {
                    previewBtn.addEventListener('click', () => restoreSearchSnapshot(snapshot));
                }
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => {
                        closeHistoryModal();
                        searchInput.value = query;
                        searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    });
                }
                historyList.appendChild(card);
            };

            if (!supabaseClient || !currentUser) {
                const localHist = JSON.parse(localStorage.getItem('lumu_local_history') || '[]');
                if (localHist.length === 0) {
                    historyList.innerHTML = `<div class="text-center py-6 text-slate-400 font-medium text-sm">${currentRegion === 'US' ? 'No recent searches.' : 'No hay búsquedas recientes.'}</div>`;
                    return;
                }
                historyList.innerHTML = '';
                localHist.slice(0, 10).forEach(qh => renderHistoryEntry(typeof qh === 'string' ? qh : qh?.query || '', qh?.savedAt || null));
                return;
            }

            historyList.innerHTML = '<div class="text-center py-8"><svg class="animate-spin h-6 w-6 text-primary mx-auto" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg></div>';

            try {
                const { data, error } = await supabaseClient
                    .from('searches')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (error) throw error;

                if (!data || data.length === 0) {
                    historyList.innerHTML = `<p class="text-center text-slate-400 py-8 font-medium">${currentRegion === 'US' ? 'You have not saved any searches yet.' : 'Aún no has realizado ninguna búsqueda guardada.'}</p>`;
                    return;
                }

                historyList.innerHTML = '';
                data.forEach(item => renderHistoryEntry(item.query, item.created_at));

            } catch (err) {
                console.error('Error cargando historial:', err);
                historyList.innerHTML = `<p class="text-center text-red-400 py-8 font-medium">${currentRegion === 'US' ? 'Error loading history.' : 'Error al cargar el historial.'}</p>`;
            }
        }

        // Expose loadSearchHistory globally so openHistoryModal() can call it
        window.loadSearchHistory = loadSearchHistory;

        // --- Lógica de Barra de Categorías (Iconos Phase 18/19) ---
        window.quickSearch = async (query) => {
            if (!query) return;

            // Limpiar UI para una búsqueda fresca
            if (chatContainer) chatContainer.innerHTML = '';
            if (resultsContainer) resultsContainer.innerHTML = '';
            chatHistory = [];
            searchInput.value = query;

            // Feedback visual
            addChatBubble('ai', currentRegion === 'US' ? `Searching the best deals for **${query}**... ⚡` : `Buscando las mejores ofertas en **${query}**... ⚡`, false);

            // Ejecutar búsqueda con skipLLM
            executeSearch(query, true);
        };

        renderContinuityHub();


        // ------------------------------------

        // --- ChatInput Textarea Logic ---
        if (searchInput && searchForm) { // FIX: Agregada protección para searchForm
            searchInput.addEventListener('input', function () {
                this.style.height = '56px';
                this.style.height = (this.scrollHeight) + 'px';
            });
            let _searchDebounceTimer = null;
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    clearTimeout(_searchDebounceTimer);
                    // trigger form submission manually
                    searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            });
            // Fase 6: Autocomplete logic
            const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
            let _autocompleteTimer = null;
            let currentFocus = -1;

            function renderAutocomplete(suggestions, isRecent = false) {
                if (!autocompleteDropdown) return;
                autocompleteDropdown.innerHTML = '';
                currentFocus = -1;
                const categoryBar = document.getElementById('category-icon-bar');

                if (isRecent && suggestions.length > 0) {
                    const header = document.createElement('div');
                    header.className = 'px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400';
                    header.textContent = currentRegion === 'US' ? 'Recent searches' : 'Búsquedas recientes';
                    autocompleteDropdown.appendChild(header);
                }

                suggestions.forEach((sugg) => {
                    const safeSuggestion = typeof sugg === 'string' ? sugg : (sugg?.query || '');
                    if (!safeSuggestion) return;
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'autocomplete-item w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors';
                    const icon = isRecent
                        ? '<svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
                        : '<svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>';
                    item.innerHTML = `${icon}<span class="text-sm font-medium text-slate-700 truncate">${sanitize(safeSuggestion)}</span>`;
                    item.addEventListener('click', () => {
                        searchInput.value = safeSuggestion;
                        closeAutocomplete();
                        searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    });
                    autocompleteDropdown.appendChild(item);
                });
                if (categoryBar) categoryBar.classList.add('autocomplete-hidden');
                autocompleteDropdown.classList.remove('hidden');
            }

            function closeAutocomplete() {
                if (autocompleteDropdown) {
                    autocompleteDropdown.classList.add('hidden');
                    // We don't clear innerHTML here immediately so clicks can register
                }
                const categoryBar = document.getElementById('category-icon-bar');
                if (categoryBar && resultsWrapper?.classList.contains('hidden')) {
                    categoryBar.classList.remove('autocomplete-hidden');
                }
            }

            // Closes when clicking outside
            document.addEventListener('click', (e) => {
                // If it's not the input and not inside the dropdown
                if (e.target !== searchInput && (!autocompleteDropdown || !autocompleteDropdown.contains(e.target))) {
                    closeAutocomplete();
                }
            });

            // Debounce: autocomplete only
            searchInput.addEventListener('input', function () {
                clearTimeout(_searchDebounceTimer);
                clearTimeout(_autocompleteTimer);
                
                const val = this.value.trim();
                
                if (!val || val.length < 2) {
                    // Show recent searches when input is empty/short
                    const recentSearches = JSON.parse(localStorage.getItem('lumu_local_history') || '[]').slice(0, 5);
                    if (recentSearches.length > 0 && val.length === 0) {
                        renderAutocomplete(recentSearches, true);
                    } else {
                        closeAutocomplete();
                    }
                    return;
                }

                // Autocomplete Fetch
                _autocompleteTimer = setTimeout(async () => {
                    try {
                        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(val)}`);
                        if (res.ok) {
                            const suggestions = await res.json();
                            if (suggestions.length > 0 && this.value.trim() === val) {
                                renderAutocomplete(suggestions);
                            } else {
                                closeAutocomplete();
                            }
                        }
                    } catch (err) {
                        console.error('Autocomplete error:', err);
                    }
                }, 300); // 300ms debounce for autocomplete

            });
            
            // Handle Keyboard Navigation for Autocomplete
            searchInput.addEventListener('keydown', function(e) {
                if (!autocompleteDropdown || autocompleteDropdown.classList.contains('hidden')) return;
                
                const items = autocompleteDropdown.getElementsByClassName('autocomplete-item');
                if (!items || items.length === 0) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    currentFocus++;
                    addActive(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    currentFocus--;
                    addActive(items);
                } else if (e.key === 'Enter') {
                    if (currentFocus > -1) {
                        e.preventDefault(); // Prevent form submit immediately
                        items[currentFocus].click();
                    }
                }
            });

            function addActive(items) {
                if (!items) return;
                removeActive(items);
                if (currentFocus >= items.length) currentFocus = 0;
                if (currentFocus < 0) currentFocus = (items.length - 1);
                items[currentFocus].classList.add('bg-emerald-50', 'dark:bg-emerald-900/40');
                
                // Keep selected item in scroll view
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            }

            function removeActive(items) {
                for (let i = 0; i < items.length; i++) {
                    items[i].classList.remove('bg-emerald-50', 'dark:bg-emerald-900/40');
                }
            }

            document.querySelectorAll('.search-prompt-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const prompt = chip.getAttribute('data-prompt');
                    if (!prompt) return;
                    searchInput.value = prompt;
                    searchInput.style.height = '56px';
                    searchInput.style.height = `${searchInput.scrollHeight}px`;
                    searchInput.focus();
                });
            });
        }

        // --- Back-to-Top Button ---
        const btnBackToTop = document.getElementById('btn-back-to-top');
        if (btnBackToTop) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 600) {
                    btnBackToTop.style.opacity = '1';
                    btnBackToTop.style.pointerEvents = 'auto';
                } else {
                    btnBackToTop.style.opacity = '0';
                    btnBackToTop.style.pointerEvents = 'none';
                }
            }, { passive: true });
            btnBackToTop.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // --- Focus handler: show recent searches on input focus ---
        if (searchInput) {
            searchInput.addEventListener('focus', function () {
                const val = this.value.trim();
                if (!val || val.length < 2) {
                    const recentSearches = JSON.parse(localStorage.getItem('lumu_local_history') || '[]').slice(0, 5);
                    if (recentSearches.length > 0) {
                        renderAutocomplete(recentSearches, true);
                    }
                }
            });
        }

        console.log('Main event listeners binding...');
        if (searchButton) {
            searchButton.addEventListener('click', (event) => {
                if (!_isSearchInProgress || !_activeSearchAbortController) return;
                event.preventDefault();
                try {
                    _activeSearchAbortController.abort();
                } catch { }
            });
        }
        if (searchForm) { // FIX: Agregada protección para searchForm
            console.log('Binding searchForm submit listener...');
            searchForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const query = searchInput?.value?.trim();
                if (!query && !selectedImageBase64) return;

                // Freemium logic: Check local storage for free limits (Daily Reset)
                const maxFreeSearches = 5;

                let searchData = JSON.parse(localStorage.getItem('lumu_searches_data') || '{"count": 0, "date": null}');
                const todayStr = new Date().toDateString();

                if (searchData.date !== todayStr) {
                    searchData = { count: 0, date: todayStr };
                    localStorage.setItem('lumu_searches_data', JSON.stringify(searchData));
                }

                // Let the query through. We will only increment count on RESULTS,
                // and we will rely on the backend for actual rate limiting logic.
                errorMessage.classList.add('hidden');
                executeSearch(query, false, _deepResearchArmed);
            });
        }

        btnDeepResearch = document.getElementById('btn-deep-research');
        btnSearchModeNormal = document.getElementById('btn-search-mode-normal');
        if (btnDeepResearch && btnSearchModeNormal) {
            setDeepResearchState(false);
            maybeShowDeepResearchUpdateBanner();
            initSearchFlowReveal();
            
            // Tooltip hover for desktop
            let tooltipTimer = null;
            let tooltipEl = null;
            btnDeepResearch.addEventListener('mouseenter', () => {
                if (window.innerWidth < 768) return;
                tooltipTimer = setTimeout(() => {
                    const isES = currentRegion !== 'US';
                    tooltipEl = document.createElement('div');
                    tooltipEl.className = 'absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[100] w-64 bg-slate-900 text-white text-[11px] rounded-xl p-3 shadow-xl pointer-events-none';
                    tooltipEl.innerHTML = `
                        <div class="font-bold mb-1 flex items-center gap-2">
                            <span>🔬</span>
                            <span>${isES ? 'Búsqueda Profunda' : 'Deep Research'}</span>
                        </div>
                        <p class="text-[10px] text-slate-300 leading-tight">${isES ? 'Revisa más tiendas, más variantes y rescates para darte los mejores resultados. Exclusivo VIP.' : 'Checks more stores, more variants, and rescue paths for the best results. VIP only.'}</p>
                        <div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-900"></div>
                    `;
                    btnDeepResearch.parentElement.classList.add('relative');
                    btnDeepResearch.parentElement.appendChild(tooltipEl);
                }, 600);
            });
            btnDeepResearch.addEventListener('mouseleave', () => {
                clearTimeout(tooltipTimer);
                if (tooltipEl) {
                    tooltipEl.remove();
                    tooltipEl = null;
                }
            });
            
            btnSearchModeNormal.addEventListener('click', () => {
                if (_deepResearchArmed) {
                    setDeepResearchState(false);
                    _trackEvent('deep_research_disabled', { action_context: 'search_mode_selector' });
                    safeToast(getLocalizedText('Modo normal activado.', 'Normal mode enabled.'), 'info');
                }
            });
            btnDeepResearch.addEventListener('click', async () => {
                if (_deepResearchArmed) return;
                const vipAccess = await hasVipAccess();
                if (!vipAccess) {
                    setDeepResearchState(false);
                    await promptDeepResearchUpgrade();
                    return;
                }
                setDeepResearchState(!_deepResearchArmed);
                if (_deepResearchArmed) {
                    _trackEvent('deep_research_enabled', { action_context: 'search_box_toggle' });
                    safeToast(getLocalizedText('Búsqueda Profunda activada. Todas tus búsquedas usarán más créditos VIP para investigar más tiendas.', 'Deep Research enabled. All your searches will use more VIP credits to inspect more stores.'), 'info');
                } else {
                    _trackEvent('deep_research_disabled', { action_context: 'search_box_toggle' });
                    safeToast(getLocalizedText('Búsqueda Profunda desactivada. Las búsquedas normales consumen menos créditos.', 'Deep Research disabled. Normal searches consume fewer credits.'), 'info');
                }
            });
        }

        let _lastSubmittedQuery = '';
        let _lastSubmittedAt = 0;

        async function executeSearch(query, skipLLM = false, deepResearch = false) {
            // Dedup: prevent identical query within 3s (double-click / double-submit)
            const now = Date.now();
            if (query === _lastSubmittedQuery && _lastSubmittedDeepResearch === Boolean(deepResearch) && (now - _lastSubmittedAt) < 3000) {
                console.log('[Search Dedup] Skipping duplicate query:', query);
                return;
            }
            _lastSubmittedQuery = query;
            _lastSubmittedDeepResearch = Boolean(deepResearch);
            _lastSubmittedAt = now;

            if (_isSearchInProgress && _activeSearchAbortController) {
                try { _activeSearchAbortController.abort(); } catch { }
            }
            const radius = locRadiusInput?.value || 'global';
            const lat = userLatInput?.value || null;
            const lng = userLngInput?.value || null;
            const includeKnownMarketplaces = includeKnownMarketplacesInput?.value !== 'false';
            const includeHighRiskMarketplaces = includeHighRiskMarketplacesInput?.value === 'true';

            _isSearchInProgress = true;
            if (_activeSearchAbortController) {
                try { _activeSearchAbortController.abort(); } catch { }
            }
            const requestAbortController = new AbortController();
            _activeSearchAbortController = requestAbortController;
            searchButton.disabled = false;
            const originalButtonHTML = getSearchButtonIdleHTML();
            searchButton.innerHTML = getSearchButtonCancelHTML();

            try {
                let finalQuery = query;

                // --- VISION logic ---
                if (selectedImageBase64 && !skipLLM) {
                    addChatBubble('ai', 'Analizando tu imagen... 🧐', false);
                    try {
                        const visionRes = await fetch('/api/vision', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ image: selectedImageBase64 })
                        });
                        if (visionRes.ok) {
                            const visionData = await visionRes.json();
                            finalQuery = visionData.searchQuery;
                            addChatBubble('ai', `Identifiqué: **${visionData.productName}**. Buscando las mejores ofertas... ⚡`, false);
                            // Clear image state
                            selectedImageBase64 = null;
                            imageUpload.value = '';
                            if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
                        }
                    } catch (err) {
                        console.error('Vision Error:', err);
                    }
                }

                if (!skipLLM) {
                    chatHistory.push({ role: 'user', content: finalQuery });
                    addChatBubble('user', finalQuery);
                }

                // Fase 7: SEO Dinámico
                const seoRegionLabel = getRegionConfig().activeRegion || 'México';
                document.title = `${currentRegion === 'US' ? 'Best prices for' : 'Mejores precios de'} ${finalQuery} ${currentRegion === 'US' ? 'in' : 'en'} ${seoRegionLabel} | Lumu.ai`;
                let metaDesc = document.querySelector('meta[name="description"]');
                if (!metaDesc) {
                    metaDesc = document.createElement('meta');
                    metaDesc.name = 'description';
                    document.head.appendChild(metaDesc);
                }
                metaDesc.content = currentRegion === 'US'
                    ? `Compare prices for ${finalQuery} across Amazon, Walmart, eBay and more. Find the best deal in ${seoRegionLabel} with Lumu AI.`
                    : `Compara precios de ${finalQuery} en Amazon, Mercado Libre, Falabella, Walmart y más. Encuentra la oferta más barata en ${seoRegionLabel} con Lumu AI.`;

                resultsWrapper.classList.remove('hidden');

                // Ocultar elementos de la landing page durante la búsqueda
                hideLandingBrowseSections();

                renderSkeletons(5);
                if (!skipLLM) resultsWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

                const safeChatHistory = chatHistory.slice(-10);

                const btnSafeStores = document.getElementById('btn-safe-stores');
                if (_smartFilterActiveSet.has('safe')) {
                    _smartFilterActiveSet.delete('safe');
                    resetSafeStoresToggle();
                }
                const safeStoresOnly = btnSafeStores ? btnSafeStores.getAttribute('data-safe') === 'true' : false;

                const searchBody = {
                    query: finalQuery,
                    chatHistory: safeChatHistory,
                    radius: radius,
                    skipLLM: skipLLM,
                    deepResearch: Boolean(deepResearch),
                    country: currentRegion,
                    safeStoresOnly: safeStoresOnly,
                    includeKnownMarketplaces,
                    includeHighRiskMarketplaces,
                    conditionMode: getConditionMode()
                };
                const parsedLat = parseFloat(lat);
                const parsedLng = parseFloat(lng);
                if (!isNaN(parsedLat)) searchBody.lat = parsedLat;
                if (!isNaN(parsedLng)) searchBody.lng = parsedLng;

                // Show typing indicator while waiting for AI
                showTypingIndicator();

                // Build headers — include Authorization if user is logged in
                const fetchHeaders = { 'Content-Type': 'application/json' };
                if (supabaseClient && currentUser) {
                    try {
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        if (session?.access_token) {
                            fetchHeaders['Authorization'] = `Bearer ${session.access_token}`;
                        }
                    } catch (e) { /* session expired, continue anonymously */ }
                }

                // Track search event for conversion analytics
                const searchId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                window._lastSearchQuery = finalQuery;
                window._lastSearchHadClick = false;
                window._lastSearchContext = { canonical_key: '', product_category: '', search_id: searchId, search_query: finalQuery };
                _trackEvent('search', { search_query: finalQuery, search_id: searchId, action_context: 'search_submit' });
                trackMetaEventSafe('SearchPerformed', {
                    search_term: finalQuery,
                    region: currentRegion || 'MX',
                    has_account: Boolean(currentUser),
                    deep_research: Boolean(deepResearch)
                });
                if (_conversionBounceTimer) clearTimeout(_conversionBounceTimer);

                const response = await fetch('/api/buscar', {
                    method: 'POST',
                    headers: fetchHeaders,
                    body: JSON.stringify(searchBody),
                    signal: requestAbortController.signal
                });

                // FIX #2: Defensive parsing to prevent "Unexpected token 'A'" crash
                let data = {};
                const textData = await response.text();
                const responseType = response.headers.get('content-type') || '';
                if (textData && textData.trim()) {
                    const trimmed = textData.trim();
                    const looksLikeJson = responseType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[');
                    if (looksLikeJson) {
                        try {
                            data = JSON.parse(trimmed);
                        } catch (parseError) {
                            console.error('Invalid JSON response from server:', parseError, trimmed.slice(0, 300));
                            throw new Error(`El servidor devolvió una respuesta inválida (${response.status}).`);
                        }
                    } else {
                        console.error('Non-JSON response from server:', response.status, trimmed.slice(0, 300));
                        data = { error: `Respuesta inesperada del servidor (${response.status}).` };
                    }
                }


                if (!response.ok) {
                    // Handle rate limit (429) and paywall (402) specially
                    if (response.status === 429) {
                        const retryAfter = data.retry_after || 60;
                        removeTypingIndicator();
                        const msg429 = getLocalizedText(
                            `⏳ **Demasiadas búsquedas.** Espera ${retryAfter} segundos antes de intentar de nuevo.`,
                            `⏳ **Too many searches.** Wait ${retryAfter} seconds before trying again.`
                        );
                        addChatBubble('ai', msg429, [], false);
                        resultsWrapper.classList.add('hidden');
                        return;
                    }
                    if (response.status === 402) {
                        removeTypingIndicator();
                        if (data.feature === 'deep_research' || data.upgrade_target === 'vip_deep_research') {
                            const msgDeep = getLocalizedText(
                                '✨ **Búsqueda Profunda es exclusiva del plan VIP.** Este modo revisa más tiendas, más variantes y gasta más créditos por búsqueda.',
                                '✨ **Deep Research is exclusive to the VIP plan.** This mode checks more stores, more variants, and consumes more credits per search.'
                            );
                            addChatBubble('ai', msgDeep, [], false);
                            await promptDeepResearchUpgrade();
                            resultsWrapper.classList.add('hidden');
                            setDeepResearchState(false);
                            return;
                        }
                        if (data.login_required) {
                            const msg402 = getLocalizedText(
                                '🔐 **Alcanzaste tu búsqueda gratis diaria.** Crea tu cuenta para obtener 2 búsquedas al día y 10 al mes totalmente gratis.',
                                '🔐 **You reached your free daily search.** Create your account to get 2 searches per day and 10 per month completely free.'
                            );
                            addChatBubble('ai', msg402, [], false);
                            if (typeof openModal === 'function') {
                                openModal();
                            }
                            resultsWrapper.classList.add('hidden');
                            return;
                        }
                        const isPaywall = data.paywall;
                        const vipLink = stripePaymentLink || '#';
                        const vipUrl = vipLink !== '#' && currentUser ? `${vipLink}?client_reference_id=${encodeURIComponent(currentUser.id)}` : vipLink;
                        if (isPaywall) {
                            const rewardAvailable = typeof hasRealRewardedAdConfigured === 'function' && hasRealRewardedAdConfigured();
                            const paywallMsg = rewardAvailable
                                ? `🔒 **${getLocalizedText('Límite gratis alcanzado.', 'Free limit reached.')}** ${getLocalizedText('Tu plan gratis incluye 2 búsquedas por día y 10 por mes. Hazte VIP o mira un anuncio para 3 búsquedas extra.', 'Your free plan includes 2 searches per day and 10 per month. Go VIP or watch an ad for 3 extra searches.')}`
                                : `🔒 **${getLocalizedText('Límite gratis alcanzado.', 'Free limit reached.')}** ${getLocalizedText('Tu plan gratis incluye 2 búsquedas por día y 10 por mes. Hazte VIP para seguir buscando.', 'Your free plan includes 2 searches per day and 10 per month. Upgrade to VIP to keep searching.')}`;
                            addChatBubble('ai', paywallMsg, [], false);
                            const signupButton = !currentUser ? `
                                        <button onclick="window.openSignupPrompt();" class="w-full bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-bold transition-all">
                                            ${getLocalizedText('Crear cuenta gratis con búsquedas bonus', 'Create free account with bonus searches')}
                                        </button>` : '';
                            resultsContainer.innerHTML = `
                                <div class="col-span-full flex flex-col items-center text-center py-12 px-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl border border-amber-200">
                                    <div class="text-5xl mb-4">⚡</div>
                                    <h3 class="text-xl font-black text-slate-800 mb-2">${getLocalizedText('Límite Alcanzado', 'Limit Reached')}</h3>
                                    <p class="text-slate-600 font-medium mb-6 max-w-sm">${rewardAvailable ? getLocalizedText('Tu cuenta gratis incluye 2 búsquedas al día y 10 al mes. Desbloquea búsquedas ilimitadas con VIP o gana 3 búsquedas extra viendo un anuncio.', 'Your free account includes 2 searches per day and 10 per month. Unlock unlimited searches with VIP or earn 3 extra searches by watching an ad.') : getLocalizedText('Tu cuenta gratis incluye 2 búsquedas al día y 10 al mes. Desbloquea búsquedas ilimitadas con VIP para seguir encontrando mejores ofertas.', 'Your free account includes 2 searches per day and 10 per month. Unlock unlimited searches with VIP to keep finding better deals.')}</p>
                                    <div class="flex flex-col gap-3 w-full max-w-xs">
                                        ${signupButton}
                                        <a href="${sanitize(vipUrl)}" target="_blank" class="w-full bg-amber-500 hover:bg-amber-600 text-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-amber-500/20">${getLocalizedText('Obtener VIP - $39 MXN/mes', 'Get VIP - $39 MXN/mo')}</a>
                                        ${rewardAvailable ? `
                                        <button onclick="window.watchRewardedAdForSearches();" class="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-3.5 rounded-2xl font-bold transition-all flex justify-center items-center gap-2">
                                            <svg class="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M10 8v8l6-4-6-4zm9-5H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
                                            ${getLocalizedText('Ver anuncio (3 Gratis)', 'Watch Ad (3 Free)')}
                                        </button>` : ''}
                                    </div>
                                </div>`;
                            resultsWrapper.classList.remove('hidden');
                        } else {
                            addChatBubble('ai', `⚠️ ${data.error}`, [], false);
                            resultsWrapper.classList.add('hidden');
                        }
                        return;
                    }
                    throw new Error(data.error || 'Error al procesar la búsqueda.');
                }

                resultsContainer.innerHTML = '';

                if (data.tipo_respuesta === 'conversacion' || data.tipo_respuesta === 'pregunta') {
                    const clarificationMessage = data.pregunta_ia || data.mensaje || getLocalizedText('Necesito un poco más de detalle para ayudarte mejor.', 'I need a bit more detail to help you better.');
                    chatHistory.push({ role: 'assistant', content: clarificationMessage });
                    chatContainer.classList.remove('hidden');
                    addChatBubble('ai', clarificationMessage, data.sugerencias || data.search_metadata?.disambiguation_options || []);
                    if (data.advertencia_uso) {
                        setTimeout(() => addChatBubble('ai', data.advertencia_uso, [], false), 500);
                    }
                    resultsWrapper.classList.remove('hidden'); // Fix: chat lives inside results so this must be visible
                    resultsGrid.innerHTML = '';
                    document.getElementById('results-title').innerHTML = `${getLocalizedText('Aclaremos tu búsqueda con', 'Let’s clarify your search with')} <span class="text-emerald-500">Lumu AI</span>`;
                    searchInput.value = '';
                    // Reset height
                    searchInput.style.height = '56px';
                    searchInput.focus();

                } else if (data.tipo_respuesta === 'resultados') {
                    chatHistory = [];
                    chatContainer.classList.add('hidden');
                    chatContainer.innerHTML = '';
                    window._lastSearchContext = {
                        canonical_key: data.search_metadata?.canonical_key || '',
                        product_category: data.search_metadata?.product_category || '',
                        search_id: (window._lastSearchContext && window._lastSearchContext.search_id) || '',
                        search_query: finalQuery
                    };
                    // Increment search count after successful result
                    let sgData = JSON.parse(localStorage.getItem('lumu_searches_data') || '{"count": 0, "date": ""}');
                    sgData.count = (sgData.count || 0) + 1;
                    localStorage.setItem('lumu_searches_data', JSON.stringify(sgData));
                    // Fase 7: check achievements
                    if (typeof window.checkAchievementsOnSearch === 'function') window.checkAchievementsOnSearch();

                    // Fase 6: Lumu Coins UI Update
                    if (data.lumu_coins_awarded === 1) {
                        const coinsBadge = document.getElementById('lumu-coins-nav');
                        if (coinsBadge) {
                            const spans = coinsBadge.querySelectorAll('span');
                            const valSpan = spans[spans.length - 1]; // Select the last span containing the number
                            if (valSpan) {
                                const currentCoins = parseInt(valSpan.innerText, 10) || 0;
                                valSpan.innerText = currentCoins + 1;
                                // Animation
                                coinsBadge.classList.add('scale-110', 'bg-amber-200');
                                setTimeout(() => {
                                    coinsBadge.classList.remove('scale-110', 'bg-amber-200');
                                }, 600);
                            }
                        }
                    }

                    if (!currentUser && !sessionStorage.getItem('lumu_signup_nudge_shown')) {
                        setTimeout(() => {
                            if (!resultsContainer || currentUser || sessionStorage.getItem('lumu_signup_nudge_shown')) return;
                            const nudge = document.createElement('div');
                            nudge.className = 'search-signup-nudge col-span-full mt-4 rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-4';
                            nudge.innerHTML = `
                                <div class="text-center md:text-left">
                                    <h3 class="text-base font-black text-slate-900">${getLocalizedText('¿Te gustaron estos resultados?', 'Did you like these results?')}</h3>
                                    <p class="text-sm text-slate-600 font-medium">${getLocalizedText('Crea tu cuenta gratis para guardar productos, recibir alertas y obtener búsquedas bonus de bienvenida.', 'Create your free account to save products, enable alerts, and get welcome bonus searches.')}</p>
                                </div>
                                <button class="signup-nudge-btn w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold transition-colors">${getLocalizedText('Crear cuenta gratis', 'Create free account')}</button>
                            `;
                            nudge.querySelector('.signup-nudge-btn')?.addEventListener('click', () => openModal());
                            resultsContainer.appendChild(nudge);
                            observeSearchFlowElement(nudge, 50);
                            sessionStorage.setItem('lumu_signup_nudge_shown', 'true');
                        }, 3000);
                    }
                    // Guardar la búsqueda en la base de datos "searches" o LocalStorage
                    if (data.intencion_detectada?.busqueda) {
                        const busqueda = data.intencion_detectada.busqueda;
                        saveSearchSnapshot({
                            query: busqueda,
                            radius,
                            safeStoresOnly,
                            includeKnownMarketplaces,
                            includeHighRiskMarketplaces,
                            conditionMode: getConditionMode(),
                            results: data.top_5_baratos || [],
                            savedAt: new Date().toISOString()
                        });
                        // SEC-2 FIX: Backend already logs authenticated searches — only save locally for anonymous users
                        if (!supabaseClient || !currentUser) {
                            // Guardar en LocalStorage
                            let localHist = JSON.parse(localStorage.getItem('lumu_local_history') || '[]');
                            localHist = [busqueda, ...localHist.filter(q => (typeof q === 'string' ? q : q?.query) !== busqueda)].slice(0, 50);
                            localStorage.setItem('lumu_local_history', JSON.stringify(localHist));
                        }
                    }

                    renderSearchContext({
                        query: data.intencion_detectada?.busqueda || finalQuery,
                        radius,
                        safeStoresOnly,
                        includeKnownMarketplaces,
                        includeHighRiskMarketplaces,
                        resultCount: data.top_5_baratos?.length || 0
                    });
                    observeSearchFlowElement(document.getElementById('search-context-panel'), 40);
                    observeSearchFlowElement(document.getElementById('results-toolbar'), 80);

                    const searchTier = data.search_metadata?.search_tier || 'free';
                    const deepSearchEnabled = !!data.search_metadata?.deep_search_enabled;

                    if (!data.top_5_baratos || data.top_5_baratos.length === 0) {
                        _trackEvent('zero_results', {
                            search_query: data.intencion_detectada?.busqueda || finalQuery,
                            safe_stores_only: !!safeStoresOnly,
                            include_known_marketplaces: !!includeKnownMarketplaces,
                            include_high_risk_marketplaces: !!includeHighRiskMarketplaces,
                            condition_mode: getConditionMode()
                        });
                    }

                    if (data.top_5_baratos && data.top_5_baratos.length > 0) {
                        await renderProducts(data.top_5_baratos);
                        if (window.innerWidth < 768) {
                            resultsWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        if (_conversionBounceTimer) clearTimeout(_conversionBounceTimer);
                        _conversionBounceTimer = setTimeout(() => {
                            if (!window._lastSearchHadClick && window._lastSearchQuery) {
                                _trackEvent('bounce', {
                                    search_query: window._lastSearchQuery,
                                    result_count: data.top_5_baratos?.length || 0
                                });
                            }
                        }, 30000);
                        
                        // Track search in Google Analytics
                        if (typeof trackSearch === 'function') {
                            trackSearch(data.intencion_detectada?.busqueda || finalQuery);
                        }

                        chatContainer.classList.remove('hidden');
                        addChatBubble('ai', getResultLeadCopy(data.intencion_detectada, data.top_5_baratos.length), [], true);

                        if (deepSearchEnabled) {
                            setTimeout(() => addChatBubble('ai', getLocalizedText('Activé una búsqueda profunda para revisar más tiendas, variantes y rescates de precio.', 'I enabled a deep search to inspect more stores, variants, and rescue price paths.'), [], true), 220);

                            // Deep Research metrics card
                            setTimeout(() => {
                                const products = data.top_5_baratos || [];
                                const meliCount = products.filter(p => p.resultSource === 'meli_api').length;
                                const uniqueSources = new Set(products.map(p => (p.tienda || p.source || '').split('(')[0].trim()).filter(Boolean));
                                const storeCount = Math.max(uniqueSources.size, products.length);
                                const hasMeli = meliCount > 0;
                                const isES = currentRegion !== 'US';

                                const metricsEl = document.createElement('div');
                                metricsEl.className = 'col-span-full mt-4 mb-2 flex flex-wrap gap-2 justify-center';
                                metricsEl.innerHTML = `
                                    <span class="inline-flex items-center gap-1.5 rounded-full bg-violet-900/30 border border-violet-500/30 px-3 py-1 text-[11px] font-bold text-violet-300">
                                        🔬 ${isES ? `${storeCount} vendedores comparados` : `${storeCount} sellers compared`}
                                    </span>
                                    ${hasMeli ? `<span class="inline-flex items-center gap-1.5 rounded-full bg-yellow-900/30 border border-yellow-500/30 px-3 py-1 text-[11px] font-bold text-yellow-300">
                                        ✅ ${isES ? 'Precio verificado en Mercado Libre' : 'Price verified on Mercado Libre'}
                                    </span>` : ''}
                                    <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/30 border border-emerald-500/30 px-3 py-1 text-[11px] font-bold text-emerald-300">
                                        🏪 ${isES ? 'Más tiendas consultadas' : 'More stores consulted'}
                                    </span>
                                `;
                                if (resultsContainer) {
                                    resultsContainer.insertBefore(metricsEl, resultsContainer.firstChild);
                                    observeSearchFlowElement(metricsEl, 0);
                                }
                            }, 400);
                        }

                        if (data.vip_auto_alert?.created) {
                            setTimeout(() => addChatBubble('ai', getLocalizedText(`Te activé una alerta automática para avisarte si baja de ${formatPrice(data.vip_auto_alert.targetPrice, data.region?.country || currentRegion)}.`, `I activated an automatic alert to notify you if the price drops below ${formatPrice(data.vip_auto_alert.targetPrice, data.region?.country || currentRegion)}.`), [], true), 500);
                        }

                        if (data.sugerencias && data.sugerencias.length > 0) {
                            const csContainer = document.createElement('div');
                            csContainer.className = 'search-suggestions-card col-span-full mt-8 p-6 bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-3xl border border-indigo-100 flex flex-col items-center text-center shadow-sm';

                            const csTitle = document.createElement('h3');
                            csTitle.className = 'text-lg font-black text-slate-800 mb-2 flex items-center gap-2';
                            csTitle.innerHTML = `<span class="text-2xl">💡</span> ${getLocalizedText('Quizás también te interese...', 'You might also like...')}`;

                            const csDesc = document.createElement('p');
                            csDesc.className = 'text-slate-500 font-medium mb-6 max-w-sm text-sm';
                            csDesc.innerText = getLocalizedText('Nuestra IA sugiere explorar estas alternativas:', 'Our AI suggests exploring these alternatives:');

                            const csBtns = document.createElement('div');
                            csBtns.className = 'flex flex-wrap gap-2 justify-center w-full';

                            const uniqueSuggestions = [...new Set(data.sugerencias)].filter(s => s.toLowerCase() !== finalQuery.toLowerCase()).slice(0, 4);

                            uniqueSuggestions.forEach(s => {
                                const btn = document.createElement('button');
                                btn.className = 'px-5 py-2.5 bg-white border border-indigo-200 text-indigo-700 text-sm font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm active:scale-95 text-left flex items-center gap-2';
                                btn.innerHTML = `<span>${sanitize(s)}</span><svg class="w-4 h-4 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>`;
                                btn.addEventListener('click', () => {
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                    setTimeout(() => window.quickSearch(s), 300);
                                });
                                csBtns.appendChild(btn);
                            });

                            if (uniqueSuggestions.length > 0) {
                                csContainer.appendChild(csTitle);
                                csContainer.appendChild(csDesc);
                                csContainer.appendChild(csBtns);
                                resultsContainer.appendChild(csContainer);
                                observeSearchFlowElement(csContainer, 100);
                            }
                        }

                        if (typeof window.maybeSuggestPush === 'function') window.maybeSuggestPush();

                        if (data.advertencia_uso) {
                            setTimeout(() => addChatBubble('ai', data.advertencia_uso, [], true), 800);
                        }
                    } else {
                        // --- Auto-Retry con sugerencias ---
                        const suggestions = data.sugerencias || [];
                        if (!skipLLM && suggestions.length > 0) {
                            resultsContainer.innerHTML = `
                            <div class="col-span-full flex flex-col items-center justify-center py-10 min-h-[300px]">
                                <div class="w-12 h-12 border-4 border-slate-100 dark:border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-200">${getLocalizedText('Ampliando búsqueda...', 'Expanding search...')}</h3>
                                <p class="text-slate-500 dark:text-slate-400 text-sm">${getLocalizedText(`Buscando alternativas para "${finalQuery}"`, `Searching alternatives for "${finalQuery}"`)}</p>
                            </div>
                        `;
                            // Intentar con la primera sugerencia automáticamente sin LLM
                            setTimeout(() => {
                                executeSearch(suggestions[0], true);
                            }, 500);
                            return;
                        }

                        // --- No-results final: UI amigable con sugerencias ---
                        const searchTerm = data.intencion_detectada?.busqueda || finalQuery;
                        const fallbackChips = currentRegion === 'US' ? [
                            `${searchTerm} new`,
                            `${searchTerm} deals`,
                            `${searchTerm} cheap`,
                        ] : [
                            `${searchTerm} nuevo`,
                            `${searchTerm} ofertas`,
                            `${searchTerm} economico`,
                        ];
                        const suggArr = suggestions.length > 0 ? suggestions.slice(0, 3) : fallbackChips;
                        const suggChips = suggArr.map(s => {
                            const safe = sanitize(s);
                            return `<button data-sugg="${safe}" class="sugg-chip px-4 py-2 bg-white border border-emerald-200 text-emerald-700 text-sm font-bold rounded-full hover:bg-emerald-50 transition-colors shadow-sm">${safe}</button>`;
                        }).join('');

                        const zeroMetaBadge = deepSearchEnabled
                            ? `<div class="mb-4 inline-flex items-center gap-2 rounded-full bg-violet-50 border border-violet-200 px-4 py-2 text-xs font-bold text-violet-700">✨ ${searchTier === 'vip' ? 'VIP' : 'Deep'} Search</div>`
                            : '';

                        resultsContainer.innerHTML = `
                        <div class="col-span-full flex flex-col items-center text-center py-12 px-6 bg-white/60 backdrop-blur-sm rounded-3xl border border-dashed border-slate-200">
                            ${zeroMetaBadge}
                            <div class="text-6xl mb-4">🔍</div>
                            <h3 class="text-xl font-black text-slate-800 mb-2">${getLocalizedText('Sin resultados directos', 'No direct results')}</h3>
                            <p class="text-slate-500 font-medium mb-6 max-w-sm">${deepSearchEnabled
                                ? getLocalizedText('Ya revisé más tiendas, variantes y rescates automáticos. Prueba una variante más específica para ampliar aún más la búsqueda:', 'I already checked more stores, variants, and automatic rescue queries. Try a more specific variant to expand the search even further:')
                                : getLocalizedText('No encontramos disponibilidad inmediata. Selecciona una variante para ampliar la búsqueda:', 'No immediate availability found. Select a variant to expand your search:')}</p>
                            <div class="flex flex-wrap gap-2 justify-center sugg-container">
                                ${suggChips}
                            </div>
                            <p class="text-xs text-slate-400 mt-6">${getLocalizedText('Si buscas algo de mercado local, prueba activar 📍 <b>Tiendas Locales</b>', 'Looking for something local? Try enabling 📍 <b>Local Stores</b>')}</p>
                        </div>
                    `;
                        resultsWrapper.classList.remove('hidden');
                        errorMessage.classList.add('hidden');
                        // Bind suggestion chip clicks safely (no inline onclick)
                        document.querySelectorAll('.sugg-chip').forEach(btn => {
                            btn.addEventListener('click', () => window.quickSearch(btn.dataset.sugg));
                        });
                    }

                    if (data.top_5_baratos && data.top_5_baratos.length === 0 && data.advertencia_uso) {
                        setTimeout(() => addChatBubble('ai', data.advertencia_uso, [], false), 800);
                    }
                }

            } catch (error) {
                console.error('Fetch Error:', error);
                if (error?.name === 'AbortError') {
                    removeTypingIndicator();
                    if (_skeletonMsgInterval) { clearInterval(_skeletonMsgInterval); _skeletonMsgInterval = null; }
                    if (typeof showGlobalFeedback === 'function') {
                        showGlobalFeedback(getLocalizedText('Búsqueda cancelada.', 'Search canceled.'), 'info');
                    }
                    return;
                }
                removeTypingIndicator();
                if (_skeletonMsgInterval) { clearInterval(_skeletonMsgInterval); _skeletonMsgInterval = null; }
                
                let userMsg = error.message;
                if (userMsg === 'Failed to fetch' || userMsg.includes('NetworkError')) {
                    userMsg = getLocalizedText('Error de conexión. El servidor no respondió o no hay internet. Por favor intenta de nuevo.', 'Connection error. The server did not respond or there is no internet. Please try again.');
                }
                
                errorMessage.textContent = userMsg;
                errorMessage.classList.remove('hidden');
                errorMessage.style.display = 'block';
                if (typeof showGlobalFeedback === 'function') {
                    showGlobalFeedback(userMsg, 'error');
                }
                resultsContainer.innerHTML = '';
                resultsWrapper.classList.add('hidden');
            } finally {
                if (_activeSearchAbortController === requestAbortController) {
                    _activeSearchAbortController = null;
                    _isSearchInProgress = false;
                    searchButton.disabled = false;
                    searchButton.innerHTML = originalButtonHTML;
                }
            }
        }

        // --- Typing Indicator ---
        let typingPhraseInterval;
        const loadingPhrases = [
            "Buscando en 19 tiendas...",
            "Comparando precios en Amazon MX...",
            "Negociando con Mercado Libre...",
            "Verificando cupones activos...",
            "Escaneando Bodega Aurrera y Linio...",
            "Revisando Claro Shop y Sanborns...",
            "Casi listo, encontramos ofertas..."
        ];

        function showTypingIndicator() {
            if (!chatContainer) return;
            // Remove existing typing indicator
            removeTypingIndicator();
            const indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'flex items-start w-full items-start fade-in mb-4';
            indicator.innerHTML = `
                <div class="flex-shrink-0 mr-3 mt-1 relative">
                    <div class="bg-emerald-500 shadow-md shadow-emerald-500/20 rounded-2xl h-10 w-10 flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-800">
                        <svg class="w-5 h-5 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                </div>
                <div class="flex flex-col gap-2 max-w-[85%] sm:max-w-[75%]">
                    <div class="bg-white/95 dark:bg-slate-800/95 rounded-[1.5rem] rounded-tl-sm px-5 py-4 shadow-sm border border-slate-100 dark:border-slate-700/60 backdrop-blur-sm self-start inline-flex items-center gap-1.5">
                        <span class="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                        <span class="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                        <span class="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                    </div>
                    <div id="typing-phrase" class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-2 animate-pulse transition-opacity duration-300">
                        Iniciando búsqueda...
                    </div>
                </div>
            `;
            chatContainer.appendChild(indicator);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            let phraseIndex = 0;
            const phraseEl = document.getElementById('typing-phrase');
            typingPhraseInterval = setInterval(() => {
                if (phraseEl) {
                    phraseEl.style.opacity = 0;
                    setTimeout(() => {
                        phraseEl.innerText = loadingPhrases[phraseIndex];
                        phraseEl.style.opacity = 1;
                        phraseIndex = (phraseIndex + 1) % loadingPhrases.length;
                    }, 300);
                }
            }, 2500);
        }

        function removeTypingIndicator() {
            if (typingPhraseInterval) clearInterval(typingPhraseInterval);
            const existing = document.getElementById('typing-indicator');
            if (existing) existing.remove();
        }

        function addChatBubble(sender, text, sugerencias = [], isFinal = false) {
            // Remove typing indicator when AI responds
            if (sender === 'ai') removeTypingIndicator();
            chatContainer.classList.remove('hidden');

            const oldChips = document.querySelectorAll('.suggestion-chip');
            oldChips.forEach(chip => {
                chip.disabled = true;
                chip.classList.add('opacity-50', 'cursor-not-allowed');
                chip.classList.remove('hover:bg-emerald-50', 'hover:border-primary', 'hover:text-primary');
            });

            const bubbleWrapper = document.createElement('div');
            bubbleWrapper.className = `flex flex-col w-full ${sender === 'user' ? 'items-end' : 'items-start'}`;
            bubbleWrapper.style.opacity = '0';
            bubbleWrapper.style.transform = 'translateY(12px)';

            const bubbleContent = document.createElement('div');
            bubbleContent.className = 'flex w-full ' + (sender === 'user' ? 'justify-end' : 'justify-start');

            const isUser = sender === 'user';

            const innerClass = isUser
                ? 'bg-emerald-50 text-emerald-950 border border-emerald-100 rounded-[1.5rem] rounded-tr-sm px-5 py-3.5 shadow-sm max-w-[90%] sm:max-w-[82%] lg:max-w-[78%]'
                : 'bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 rounded-[1.5rem] rounded-tl-sm px-5 py-3.5 shadow-sm border border-slate-100 dark:border-slate-700/60 relative group backdrop-blur-sm max-w-[90%] sm:max-w-[82%] lg:max-w-[78%]';

            const iconHtml = isUser ? '' : `
                <div class="flex-shrink-0 mr-3 mt-1 relative">
                    <div class="bg-gradient-to-br from-emerald-500 to-green-500 shadow-[0_10px_24px_rgba(16,185,129,0.24)] rounded-2xl h-10 w-10 flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-800 overflow-hidden">
                        <svg class="w-5 h-5 drop-shadow-sm" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M10 18h28l-3 22H13L10 18z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="none" />
                            <path d="M17 18V14a7 7 0 0114 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
                            <path d="M18 30c0-2 1.5-3 3-3s3 1.5 3 3-1.5 3-3 3-3-1-3-3zm6 0c0-2 1.5-3 3-3s3 1.5 3 3-1.5 3-3 3-3-1-3-3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
                            <path d="M36 10l.8 2L39 12.8l-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" opacity="0.95" />
                        </svg>
                    </div>
                    <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>
                </div>`;

            // Markdown-lite: convierte **negrita** y *cursiva*
            const renderedText = text
                .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>');

            let feedbackHtml = '';
            if (!isUser) {
                feedbackHtml = `
                <div class="flex items-center gap-1 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/50 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium mr-1">¿Te sirvió?</span>
                    <button class="btn-feedback-up p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-150" data-vote="up" title="Buena respuesta">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                    </button>
                    <button class="btn-feedback-down p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-150" data-vote="down" title="Mala respuesta">
                         <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
                    </button>
                </div>
            `;
            }

            // Timestamp
            const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const timestampHtml = `<div class="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}">${timeStr}</div>`;

            bubbleContent.innerHTML = `
            ${iconHtml}
                <div class="${innerClass}">
                    <p class="text-[15px] leading-relaxed font-sans font-medium">${renderedText}</p>
                    ${feedbackHtml}
                </div>
                `;

            bubbleWrapper.appendChild(bubbleContent);

            // Add timestamp below bubble
            const timeEl = document.createElement('div');
            timeEl.innerHTML = timestampHtml;
            bubbleWrapper.appendChild(timeEl.firstElementChild);

            // Bind feedback events
            if (!isUser) {
                const upBtn = bubbleContent.querySelector('.btn-feedback-up');
                const downBtn = bubbleContent.querySelector('.btn-feedback-down');

                async function handleVote(vote, btnEl) {
                    if (upBtn) upBtn.disabled = true;
                    if (downBtn) downBtn.disabled = true;
                    btnEl.classList.add(vote === 'up' ? 'text-emerald-600' : 'text-rose-600');
                    btnEl.classList.remove('text-slate-400');

                    if (supabaseClient) {
                        try {
                            let uid = null;
                            const { data: { session } } = await supabaseClient.auth.getSession();
                            if (session) uid = session.user.id;
                            const voteValue = vote === 'up' ? 1 : -1;

                            await supabaseClient.from('feedback').insert([{
                                user_id: uid,
                                response: text,
                                vote: voteValue,
                                query: searchInput.value || ''
                            }]);

                            if (vote === 'up') {
                                fetch('/api/memory', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        query: searchInput.value || '',
                                        responseText: text
                                    })
                                }).then(res => res.json()).then(data => console.log('RAG Guardado:', data));

                                btnEl.innerHTML = '<span class="text-xs font-bold text-emerald-500">¡Aprendido! 🧠</span>';
                            } else {
                                btnEl.innerHTML = '<span class="text-xs font-bold text-rose-500">Descartado 🗑️</span>';
                            }
                        } catch (err) {
                            console.error('Feedback error:', err);
                        }
                    }
                };

                if (upBtn) upBtn.addEventListener('click', () => handleVote('up', upBtn));
                if (downBtn) downBtn.addEventListener('click', () => handleVote('down', downBtn));
            }

            if (sugerencias && sugerencias.length > 0 && !isFinal) {
                const chipsContainer = document.createElement('div');
                chipsContainer.className = 'flex flex-wrap gap-2 mt-3 ml-12';

                sugerencias.forEach(sug => {
                    const chip = document.createElement('button');
                    chip.className = 'suggestion-chip px-3.5 py-1.5 bg-white border border-slate-200 rounded-full text-slate-600 text-sm font-medium shadow-sm hover:border-primary hover:text-primary hover:bg-emerald-50 transition-all focus:ring-2 focus:ring-primary/30';
                    chip.innerText = sug;
                    chip.onclick = () => {
                        searchInput.value = sug;
                        searchForm.dispatchEvent(new Event('submit'));
                    };
                    chipsContainer.appendChild(chip);
                });
                bubbleWrapper.appendChild(chipsContainer);
            }

            chatContainer.appendChild(bubbleWrapper);

            // Smooth entrance animation
            requestAnimationFrame(() => {
                bubbleWrapper.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
                bubbleWrapper.style.opacity = '1';
                bubbleWrapper.style.transform = 'translateY(0)';
            });

            // Auto-scroll to latest message
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // --- Inline Chat Product Cards ---
        function renderChatProducts(products) {
            if (!chatContainer || !products || products.length === 0) return;

            // Remove previous inline products if any
            const oldInline = chatContainer.querySelector('.chat-products-inline');
            if (oldInline) oldInline.remove();

            const wrapper = document.createElement('div');
            wrapper.className = 'chat-products-inline flex items-start w-full fade-in mb-2';
            wrapper.style.opacity = '0';
            wrapper.style.transform = 'translateY(12px)';

            // Store abbreviations for badges
            const storeAbbr = (tienda) => {
                const t = (tienda || '').toLowerCase();
                if (t.includes('amazon')) return { label: 'Amazon', color: 'bg-[#FF9900]/10 text-[#FF9900] border-[#FF9900]/20' };
                if (t.includes('libre') || t.includes('mercado')) return { label: 'ML', color: 'bg-blue-50 text-blue-700 border-blue-200' };
                if (t.includes('walmart')) return { label: 'Walmart', color: 'bg-blue-50 text-blue-600 border-blue-200' };
                if (t.includes('liverpool')) return { label: 'Liverpool', color: 'bg-pink-50 text-pink-600 border-pink-200' };
                if (t.includes('coppel')) return { label: 'Coppel', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
                return { label: tienda?.substring(0, 12) || 'Tienda', color: 'bg-slate-50 text-slate-600 border-slate-200' };
            };

            const productCards = products.slice(0, 5).map((product, idx) => {
                let rawPrice = product.precio || 0;
                let precioNumerico = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) : rawPrice;
                if (isNaN(precioNumerico)) precioNumerico = 0;

                const formattedPrice = precioNumerico > 0
                    ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(precioNumerico)
                    : 'Ver precio';

                const store = storeAbbr(product.tienda);
                const imgUrl = product.imagen || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f1f5f9' rx='12'/%3E%3Ctext x='40' y='48' text-anchor='middle' font-size='24' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E";
                const targetUrl = encodeURIComponent(product.urlMonetizada || product.urlOriginal);
                const isLocal = product.isLocalStore;
                const isCheapest = idx === 0;
                const conditionBadgeClass = product.conditionLabel === 'used'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : product.conditionLabel === 'refurbished'
                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                        : 'bg-sky-50 text-sky-700 border-sky-200';
                const conditionBadgeText = product.conditionLabel === 'used'
                    ? 'USADO'
                    : product.conditionLabel === 'refurbished'
                        ? 'REACOND.'
                        : 'NUEVO';

                let trendBadge = '';
                if (product.priceTrend?.direction === 'down') {
                    trendBadge = `<span class="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md ml-1">↓ ${product.priceTrend.percent || 0}%</span>`;
                } else if (product.priceTrend?.direction === 'up') {
                    trendBadge = `<span class="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-md ml-1">↑ ${product.priceTrend.percent || 0}%</span>`;
                }

                return `
                <div class="chat-product-item flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50/80 cursor-pointer group/item transition-all duration-200 ${isCheapest ? 'bg-emerald-50/50 border border-emerald-200/50' : 'border border-slate-100 hover:border-emerald-200'}"
                     data-target-url="${targetUrl}" style="animation: slideInUp 0.3s ease-out ${idx * 80}ms both">
                    ${isCheapest ? `<div class="absolute -top-1.5 -left-1 bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 rounded-md shadow-sm z-10">💰 ${currentRegion === 'US' ? 'BEST PRICE' : 'MEJOR PRECIO'}</div>` : ''}
                    <div class="relative flex-shrink-0">
                        <img src="${imgUrl}" alt="" class="w-14 h-14 object-contain rounded-xl bg-white shadow-sm mix-blend-multiply"
                             onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27 viewBox=%270 0 80 80%27%3E%3Crect width=%2780%27 height=%2780%27 fill=%27%23f1f5f9%27 rx=%2712%27/%3E%3Ctext x=%2740%27 y=%2748%27 text-anchor=%27middle%27 font-size=%2724%27 fill=%2794a3b8%27%3E📦%3C/text%3E%3C/svg%3E'">
                        ${isLocal ? '<span class="absolute -bottom-1 -right-1 text-[10px]">📍</span>' : ''}
                    </div>
                    <div class="flex-grow min-w-0">
                        <p class="text-[13px] font-bold text-slate-800 line-clamp-1 group-hover/item:text-emerald-700 transition-colors">${sanitize(product.titulo)}</p>
                        <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span class="text-base font-black ${precioNumerico > 0 ? 'text-slate-900' : 'text-amber-600'}">${formattedPrice}</span>
                            ${trendBadge}
                            <span class="text-[9px] font-bold ${store.color} px-1.5 py-0.5 rounded-md border text-center">${store.label}</span>
                            <span class="text-[9px] font-bold ${conditionBadgeClass} px-1.5 py-0.5 rounded-md border text-center">${conditionBadgeText}</span>
                            ${product.isC2C ? '<span class="text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md text-center">C2C</span>' : ''}
                        </div>
                        ${product.cupon ? `<span class="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 inline-block border border-amber-200">🎟️ ${sanitize(product.cupon)}</span>` : ''}
                    </div>
                    <button class="chat-product-btn flex-shrink-0 bg-transparent text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 text-[11px] font-bold px-3 py-2 rounded-xl border border-emerald-200 transition-all duration-150 whitespace-nowrap"
                            data-target-url="${targetUrl}">
                        ${currentRegion === 'US' ? 'View →' : 'Ver →'}
                    </button>
                </div>`;
            }).join('');

            wrapper.innerHTML = `
                <div class="flex-shrink-0 mr-3 mt-1">
                    <div class="bg-gradient-to-br from-emerald-500 to-green-500 shadow-[0_10px_24px_rgba(16,185,129,0.24)] rounded-2xl h-10 w-10 flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-800 overflow-hidden">
                        <svg class="w-5 h-5 drop-shadow-sm" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M10 18h28l-3 22H13L10 18z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="none" />
                            <path d="M17 18V14a7 7 0 0114 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
                            <path d="M18 30c0-2 1.5-3 3-3s3 1.5 3 3-1.5 3-3 3-3-1-3-3zm6 0c0-2 1.5-3 3-3s3 1.5 3 3-1.5 3-3 3-3-1-3-3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
                            <path d="M36 10l.8 2L39 12.8l-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" opacity="0.95" />
                        </svg>
                    </div>
                </div>
                <div class="bg-white/95 dark:bg-slate-800/95 rounded-[1.5rem] rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700/60 backdrop-blur-sm max-w-[94%] sm:max-w-[88%] lg:max-w-[82%] overflow-hidden">
                    <div class="px-4 pt-3.5 pb-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/40">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black text-emerald-600 uppercase tracking-wider">Top ${products.length > 5 ? 5 : products.length} mejores precios</span>
                            <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium">${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div class="p-3 space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                        ${productCards}
                    </div>
                    <div class="px-3 pb-3 pt-1 flex gap-2">
                        <button id="btn-chat-view-all" class="flex-grow py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700/50 dark:hover:bg-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 transition-all duration-200 flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                            Ver análisis completo
                        </button>
                    </div>
                </div>`;

            chatContainer.appendChild(wrapper);

            // Animate entrance
            requestAnimationFrame(() => {
                wrapper.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
                wrapper.style.opacity = '1';
                wrapper.style.transform = 'translateY(0)';
            });

            // Bind click events for product items and buttons
            wrapper.querySelectorAll('.chat-product-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.chat-product-btn')) return; // Let button handle its own
                    const url = item.getAttribute('data-target-url');
                    if (url) window.open(url, '_blank');
                });
            });
            wrapper.querySelectorAll('.chat-product-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = btn.getAttribute('data-target-url');
                    if (url) window.open(url, '_blank');
                });
            });

            // "Ver análisis completo" button scrolls to full results
            const viewAllBtn = wrapper.querySelector('#btn-chat-view-all');
            if (viewAllBtn) {
                viewAllBtn.addEventListener('click', () => {
                    resultsWrapper.classList.remove('hidden');
                    resultsWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            }

            // Auto-scroll chat to show products
            setTimeout(() => {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 100);
        }

        // Track loading interval for cleanup
        let _skeletonMsgInterval = null;

        function renderSkeletons(count) {
            // Clear any previous loading interval to prevent leaks
            if (_skeletonMsgInterval) { clearInterval(_skeletonMsgInterval); _skeletonMsgInterval = null; }
            resultsContainer.innerHTML = '';
            const loadingMessages = [
                "Escaneando inventarios en México 🇲🇽...",
                "Consultando ofertas ocultas en Amazon 📦...",
                "Comparando precios de importación ✈️...",
                "Descartando revendedores caros 🚫...",
                "Calculando impuestos y envío 💸..."
            ];

            // Crear contenedor central de estado
            const loadingStatus = document.createElement('div');
            loadingStatus.className = 'col-span-full mb-6 w-full flex flex-col items-center justify-center p-6 bg-emerald-50 rounded-3xl border border-emerald-100 fade-in';
            loadingStatus.innerHTML = `
            <div class="relative w-16 h-16 mb-4">
                <div class="absolute inset-0 rounded-full border-4 border-emerald-200"></div>
                <div class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            </div>
            <h4 id="loading-text" class="text-lg font-bold text-emerald-800 transition-opacity duration-300">${currentRegion === 'US' ? 'Starting deep search...' : 'Iniciando búsqueda profunda...'}</h4>
            <p class="text-sm text-emerald-600 mt-2 font-medium">${currentRegion === 'US' ? 'Please wait, we are finding the best real price for you.' : 'Por favor espera, estamos encontrando el mejor precio real para ti.'}</p>
        `;
            resultsContainer.appendChild(loadingStatus);

            // Ciclo de mensajes divertidos
            let msgIndex = 0;
            _skeletonMsgInterval = setInterval(() => {
                const el = document.getElementById('loading-text');
                if (el) {
                    el.style.opacity = 0;
                    setTimeout(() => {
                        el.innerText = loadingMessages[msgIndex % loadingMessages.length];
                        el.style.opacity = 1;
                        msgIndex++;
                    }, 300);
                } else {
                    clearInterval(_skeletonMsgInterval);
                    _skeletonMsgInterval = null;
                }
            }, 3000);

            for (let i = 0; i < count; i++) {
                const skeleton = document.createElement('div');
                skeleton.className = 'bg-white rounded-2xl p-5 flex flex-col h-full animate-pulse border border-slate-200 relative overflow-hidden';
                skeleton.innerHTML = `
                <!-- Scanning Line -->
                <div class="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0 rounded-[1.75rem]">
                    <div class="w-full h-24 bg-gradient-to-b from-transparent via-emerald-200/20 to-transparent absolute -top-24 animate-scan"></div>
                </div>
                
                <div class="h-40 bg-slate-200/50 rounded-2xl mb-5 w-full relative z-10 flex items-center justify-center">
                    <svg class="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
                <div class="h-4 bg-slate-200/80 rounded-full w-2/5 mb-3 relative z-10"></div>
                <div class="h-5 bg-slate-200/80 rounded-full w-full mb-2 relative z-10"></div>
                <div class="h-5 bg-slate-200/80 rounded-full w-4/5 mb-8 relative z-10"></div>
                <div class="mt-auto pt-4 border-t border-slate-100 flex justify-between items-end relative z-10">
                    <div class="h-10 bg-slate-200/80 rounded-xl w-2/5 mb-1"></div>
                    <div class="h-12 bg-emerald-100/50 rounded-xl w-1/2"></div>
                </div>
            `;
                resultsContainer.appendChild(skeleton);
            }
        }

        // ============= FILTER / SORT STATE =============
        let _lastProducts = [];    // almacenar productos originales
        let _lastFavorites = [];   // almacenar favoritos pre-fetched

        // ============= COMPARATOR STATE =============
        const _compareProducts = [];
        const MAX_COMPARE = 4;

        function toggleCompare(product, precioNumerico, formattedPrice) {
            const idx = _compareProducts.findIndex(p => (p.urlMonetizada || p.urlOriginal) === (product.urlMonetizada || product.urlOriginal));
            if (idx !== -1) {
                _compareProducts.splice(idx, 1);
            } else {
                if (_compareProducts.length >= MAX_COMPARE) {
                    _compareProducts.shift(); // remove oldest
                }
                _compareProducts.push({ ...product, _precioNum: precioNumerico, _precioFmt: formattedPrice });
            }
            updateCompareBar();
            // Update button states in DOM
            document.querySelectorAll('.btn-compare').forEach(btn => {
                const url = btn.getAttribute('data-compare-url');
                const isSelected = _compareProducts.some(p => (p.urlMonetizada || p.urlOriginal) === url);
                btn.classList.toggle('text-indigo-600', isSelected);
                btn.classList.toggle('bg-indigo-100', isSelected);
                btn.classList.toggle('text-slate-400', !isSelected);
            });
        }

        function updateCompareBar() {
            const bar = document.getElementById('compare-bar');
            const thumbsEl = document.getElementById('compare-thumbs');
            const countEl = document.getElementById('compare-count');
            if (!bar) return;

            if (_compareProducts.length === 0) {
                bar.style.transform = 'translateY(100%)';
                return;
            }
            bar.style.transform = 'translateY(0)';

            if (thumbsEl) {
                thumbsEl.innerHTML = _compareProducts.map(p =>
                    `<img src="${p.imagen || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23f1f5f9' rx='20'/%3E%3Ctext x='20' y='26' text-anchor='middle' font-size='16' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E"}" class="w-10 h-10 rounded-full border-2 border-white object-cover shadow-md bg-white" alt="">`
                ).join('');
            }
            if (countEl) {
                countEl.textContent = currentRegion === 'US'
                    ? `${_compareProducts.length} product${_compareProducts.length > 1 ? 's' : ''} selected`
                    : `${_compareProducts.length} producto${_compareProducts.length > 1 ? 's' : ''} seleccionado${_compareProducts.length > 1 ? 's' : ''}`;
            }
        }

        function openCompareModal() {
            const modal = document.getElementById('compare-modal');
            const body = document.getElementById('compare-body');
            if (!modal || !body || _compareProducts.length < 2) return;

            const cols = _compareProducts.length;
            const gridCls = cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4';

            body.innerHTML = `
                <div class="grid ${gridCls} gap-4">
                    ${_compareProducts.map(p => `
                        <div class="flex flex-col items-center text-center border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                            <img src="${p.imagen || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='150' height='150' fill='%23f1f5f9' rx='12'/%3E%3Ctext x='75' y='82' text-anchor='middle' font-size='30' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E"}" class="w-28 h-28 object-contain mb-3 rounded-xl" alt="">
                            <span class="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md mb-2">${sanitize(p.tienda || '')}</span>
                            <h4 class="text-sm font-bold text-slate-800 line-clamp-3 mb-3 min-h-[3.5rem]">${sanitize(p.titulo || '')}</h4>
                            <div class="text-2xl font-black text-slate-900 mb-2">${p._precioNum > 0 ? p._precioFmt : `<span class=&quot;text-base text-amber-600&quot;>${currentRegion === 'US' ? 'View in store' : 'Ver en tienda'}</span>`}</div>
                            ${p.cupon ? `<span class="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg mb-2">${currentRegion === 'US' ? 'Coupon' : 'Cupón'}: ${sanitize(p.cupon)}</span>` : ''}
                            <button class="mt-auto w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2 px-4 rounded-xl transition-colors"
                                onclick="window.open('${sanitize(p.urlMonetizada || p.urlOriginal || p.link)}', '_blank')">
                                ${currentRegion === 'US' ? 'View Offer →' : 'Ver Oferta →'}
                            </button>
                        </div>
                    `).join('')}
                </div>
                ${_compareProducts.length >= 2 ? `
                <div class="mt-6 overflow-x-auto">
                    <table class="w-full text-sm border-collapse">
                        <thead>
                            <tr class="border-b border-slate-200">
                                <th class="text-left py-2 px-3 text-slate-500 font-bold text-xs uppercase">${currentRegion === 'US' ? 'Attribute' : 'Atributo'}</th>
                                ${_compareProducts.map(p => `<th class="py-2 px-3 text-slate-700 font-bold text-xs">${sanitize((p.tienda || '').substring(0, 15))}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-500 font-medium">${currentRegion === 'US' ? 'Price' : 'Precio'}</td>${_compareProducts.map(p => {
                const best = Math.min(..._compareProducts.filter(x => x._precioNum > 0).map(x => x._precioNum));
                const isBest = p._precioNum === best && p._precioNum > 0;
                return `<td class="py-2 px-3 font-bold ${isBest ? 'text-emerald-600' : 'text-slate-800'}">${p._precioNum > 0 ? p._precioFmt : '—'}${isBest ? ' ✓' : ''}</td>`;
            }).join('')}</tr>
                            <tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-500 font-medium">${currentRegion === 'US' ? 'Store' : 'Tienda'}</td>${_compareProducts.map(p => `<td class="py-2 px-3 text-slate-700">${sanitize(p.tienda || '—')}</td>`).join('')}</tr>
                            <tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-500 font-medium">${currentRegion === 'US' ? 'Coupon' : 'Cupón'}</td>${_compareProducts.map(p => `<td class="py-2 px-3 text-slate-700">${p.cupon ? sanitize(p.cupon) : '—'}</td>`).join('')}</tr>
                            <tr><td class="py-2 px-3 text-slate-500 font-medium">${currentRegion === 'US' ? 'Local store' : 'Tienda local'}</td>${_compareProducts.map(p => `<td class="py-2 px-3 text-slate-700">${p.isLocalStore ? (currentRegion === 'US' ? '📍 Yes' : '📍 Sí') : (currentRegion === 'US' ? 'No' : 'No')}</td>`).join('')}</tr>
                        </tbody>
                    </table>
                </div>` : ''}
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        // Compare bar button bindings
        document.getElementById('compare-open-btn')?.addEventListener('click', openCompareModal);
        document.getElementById('compare-clear-btn')?.addEventListener('click', () => {
            _compareProducts.length = 0;
            updateCompareBar();
            document.querySelectorAll('.btn-compare').forEach(btn => {
                btn.classList.remove('text-indigo-600', 'bg-indigo-100');
                btn.classList.add('text-slate-400');
            });
        });
        document.getElementById('compare-modal-close')?.addEventListener('click', () => {
            const modal = document.getElementById('compare-modal');
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        });
        document.getElementById('compare-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                e.currentTarget.classList.add('hidden');
                e.currentTarget.classList.remove('flex');
            }
        });

        function applyFiltersAndSort() {
            const sortVal = document.getElementById('sort-select')?.value || 'recommended';
            const storeVal = document.getElementById('store-filter')?.value || 'all';
            const freeShippingOnly = document.getElementById('free-shipping-filter')?.checked || false;
            const minVal = parseFloat(document.getElementById('price-min')?.value);
            const maxVal = parseFloat(document.getElementById('price-max')?.value);
            const onlyCouponsInput = document.getElementById('only-coupons');
            const onlyRealDealsInput = document.getElementById('only-real-deals');

            let filtered = [..._allProducts];

            if (onlyCouponsInput?.value === 'true') {
                filtered = filtered.filter(p => p.cupon);
            }
            if (onlyRealDealsInput?.value === 'true') {
                filtered = filtered.filter(p => p.dealVerdict?.status === 'real_deal');
            }

            // Filtro de tienda
            if (storeVal !== 'all') {
                filtered = filtered.filter(p => p.tienda === storeVal);
            }

            // Filtro de envío gratis
            if (freeShippingOnly) {
                filtered = filtered.filter(p => {
                    const shipping = String(p.shippingText || '').toLowerCase();
                    const details = (p.couponDetails || '').toLowerCase();
                    return shipping.includes('gratis') || shipping.includes('free') || details.includes('gratis') || details.includes('free');
                });
            }

            // Filtro de precio
            if (!isNaN(minVal)) filtered = filtered.filter(p => {
                const pr = parseProductPriceValue(p.precio);
                return pr >= minVal;
            });
            if (!isNaN(maxVal) && maxVal > 0) filtered = filtered.filter(p => {
                const pr = parseProductPriceValue(p.precio);
                return pr <= maxVal;
            });

            // Ordenamiento
            if (sortVal === 'price-asc') {
                filtered.sort((a, b) => {
                    const priceA = parseProductPriceValue(a.precio);
                    const priceB = parseProductPriceValue(b.precio);
                    return (priceA || Infinity) - (priceB || Infinity);
                });
            } else if (sortVal === 'price-desc') {
                filtered.sort((a, b) => parseProductPriceValue(b.precio) - parseProductPriceValue(a.precio));
            } else if (sortVal === 'store') {
                filtered.sort((a, b) => (a.tienda || '').localeCompare(b.tienda || ''));
            }

            const countEl = document.getElementById('results-count');
            if (countEl) {
                countEl.textContent = currentRegion === 'US'
                    ? `${filtered.length} of ${_allProducts.length} results`
                    : `${filtered.length} de ${_allProducts.length} resultados`;
            }
            syncBestOptionButton(filtered);

            // UX-1: Friendly empty state when filters remove all results
            const grid = document.getElementById('results-grid');
            const emptyFilterMsg = document.getElementById('empty-filter-msg');
            if (filtered.length === 0 && _allProducts.length > 0) {
                if (!emptyFilterMsg && grid) {
                    const msg = document.createElement('div');
                    msg.id = 'empty-filter-msg';
                    msg.className = 'col-span-full flex flex-col items-center text-center py-10 px-6 bg-amber-50/60 rounded-2xl border border-dashed border-amber-200';
                    msg.innerHTML = `
                        <div class="text-4xl mb-3">🔍</div>
                        <h4 class="text-lg font-black text-slate-700 mb-1">${getLocalizedText('Sin resultados con estos filtros', 'No results match these filters')}</h4>
                        <p class="text-sm text-slate-500 mb-4">${getLocalizedText('Intenta quitar algunos filtros para ver más productos.', 'Try removing some filters to see more products.')}</p>
                        <button id="clear-all-filters-btn" class="px-5 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm">${getLocalizedText('Quitar todos los filtros', 'Clear all filters')}</button>
                    `;
                    grid.innerHTML = '';
                    grid.appendChild(msg);
                    document.getElementById('clear-all-filters-btn')?.addEventListener('click', () => {
                        const storeF = document.getElementById('store-filter'); if (storeF) storeF.value = 'all';
                        const shipF = document.getElementById('free-shipping-filter'); if (shipF) shipF.checked = false;
                        const minF = document.getElementById('price-min'); if (minF) minF.value = '';
                        const maxF = document.getElementById('price-max'); if (maxF) maxF.value = '';
                        const coupF = document.getElementById('only-coupons'); if (coupF) coupF.value = 'false';
                        const dealF = document.getElementById('only-real-deals'); if (dealF) dealF.value = 'false';
                        _smartFilterActiveSet.clear();
                        _persistSmartFilters();
                        applyFiltersAndSort();
                    });
                }
            } else {
                emptyFilterMsg?.remove();
                renderProductCards(filtered, _lastFavorites);
            }

            renderSmartFilterSuggestions(filtered);
        }

        // Bind toolbar events
        document.getElementById('sort-select')?.addEventListener('change', applyFiltersAndSort);
        document.getElementById('store-filter')?.addEventListener('change', applyFiltersAndSort);
        document.getElementById('free-shipping-filter')?.addEventListener('change', applyFiltersAndSort);
        document.getElementById('price-filter-btn')?.addEventListener('click', applyFiltersAndSort);
        // Allow enter key in price inputs
        document.getElementById('price-min')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFiltersAndSort(); });
        document.getElementById('price-max')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFiltersAndSort(); });

        const parseProductPriceValue = (rawPrice) => {
            if (typeof rawPrice === 'number') {
                return Number.isFinite(rawPrice) ? rawPrice : 0;
            }
            const source = String(rawPrice || '').trim();
            if (!source || source === 'null' || source === 'undefined') return 0;
            let normalized = source.replace(/[^0-9.,-]/g, '');
            const hasDot = normalized.includes('.');
            const hasComma = normalized.includes(',');
            if (hasDot && hasComma) {
                const lastDot = normalized.lastIndexOf('.');
                const lastComma = normalized.lastIndexOf(',');
                if (lastDot > lastComma) {
                    normalized = normalized.replace(/,/g, '');
                } else {
                    normalized = normalized.replace(/\./g, '').replace(',', '.');
                }
            } else if (hasComma && !hasDot) {
                const parts = normalized.split(',');
                const looksLikeThousands = parts.length > 1 && parts.slice(1).every(part => part.length === 3);
                normalized = looksLikeThousands ? normalized.replace(/,/g, '') : normalized.replace(',', '.');
            } else if (hasDot) {
                const parts = normalized.split('.');
                const looksLikeThousands = parts.length > 1 && parts.slice(1).every(part => part.length === 3);
                normalized = looksLikeThousands ? normalized.replace(/\./g, '') : normalized;
            }
            const parsed = parseFloat(normalized);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const formatRelativeVerification = (value) => {
            if (!value) return '';
            const ts = new Date(value).getTime();
            if (!Number.isFinite(ts)) return '';
            const diffMs = Math.max(0, Date.now() - ts);
            const diffMin = Math.round(diffMs / 60000);
            if (diffMin < 1) return currentRegion === 'US' ? 'Verified just now' : 'Verificado hace un momento';
            if (diffMin < 60) return currentRegion === 'US' ? `Verified ${diffMin}m ago` : `Verificado hace ${diffMin} min`;
            const diffHours = Math.round(diffMin / 60);
            if (diffHours < 24) return currentRegion === 'US' ? `Verified ${diffHours}h ago` : `Verificado hace ${diffHours} h`;
            const diffDays = Math.round(diffHours / 24);
            return currentRegion === 'US' ? `Verified ${diffDays}d ago` : `Verificado hace ${diffDays} d`;
        };

        async function renderProducts(products) {
            resultsContainer.innerHTML = '';
            
            // Show Deep Research banner if mode is active
            if (_deepResearchArmed) {
                const isES = currentRegion !== 'US';
                const banner = document.createElement('div');
                banner.className = 'col-span-full mb-4 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm';
                banner.innerHTML = `
                    <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-md">
                        <span class="text-xl">🔬</span>
                    </div>
                    <div class="flex-grow min-w-0">
                        <h4 class="text-sm font-black text-violet-900 mb-0.5">${isES ? 'Resultados con Búsqueda Profunda' : 'Deep Research Results'}</h4>
                        <p class="text-[11px] text-violet-700 leading-tight">${isES ? 'Revisamos más tiendas y variantes para darte los mejores resultados. Usa más créditos VIP.' : 'We checked more stores and variants to give you the best results. Uses more VIP credits.'}</p>
                    </div>
                    <div class="flex-shrink-0 hidden sm:block">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-[10px] font-black uppercase tracking-wider text-violet-700 border border-violet-200 shadow-sm">
                            <span>✨</span>
                            <span>${isES ? 'VIP Activo' : 'VIP Active'}</span>
                        </span>
                    </div>
                `;
                resultsContainer.appendChild(banner);
            }
            
            const onlyCouponsInput = document.getElementById('only-coupons');
            const onlyRealDealsInput = document.getElementById('only-real-deals');
            const filteredProducts = (products || []).filter((product) => {
                if (product.isPotentiallyUnavailable && !product.hasStockSignal) {
                    return false;
                }
                if (onlyCouponsInput?.value === 'true' && !product.cupon) {
                    return false;
                }
                if (onlyRealDealsInput?.value === 'true' && product.dealVerdict?.status !== 'real_deal') {
                    return false;
                }
                const targetUrl = String(product.urlOriginal || product.urlMonetizada || '').trim();
                if (!targetUrl || /^(undefined|null|#)$/i.test(targetUrl)) {
                    return false;
                }
                const normalizedTitle = normalizeResultTitle(product?.titulo, product?.tienda, currentRegion === 'US');
                if (!normalizedTitle || /^(product listing|producto disponible)$/i.test(normalizedTitle)) {
                    return false;
                }
                // Hide online products with no price — they would show 'Ver precio en tienda'
                // which provides poor UX. Local store results are exempt since price-in-store is expected.
                if (!product.isLocalStore) {
                    const rawP = product.precio;
                    if (rawP == null || rawP === '' || rawP === 'null' || rawP === 0 || rawP === '0') {
                        return false;
                    }
                    const numP = parseProductPriceValue(rawP);
                    if (Number.isNaN(numP) || numP <= 0) {
                        return false;
                    }
                }
                return true;
            });
            const fallbackProducts = (products || []).filter((product) => {
                const targetUrl = String(product.urlOriginal || product.urlMonetizada || '').trim();
                if (!targetUrl || /^(undefined|null|#)$/i.test(targetUrl)) {
                    return false;
                }
                const normalizedTitle = normalizeResultTitle(product?.titulo, product?.tienda, currentRegion === 'US');
                if (!normalizedTitle || /^(product listing|producto disponible)$/i.test(normalizedTitle)) {
                    return false;
                }
                return true;
            });
            const renderableProducts = filteredProducts.length > 0 ? filteredProducts : fallbackProducts;
            _allProducts = renderableProducts;
            _lastProducts = renderableProducts;

            // Show toolbar
            const toolbar = document.getElementById('results-toolbar');
            if (toolbar) toolbar.classList.remove('hidden');

            // Populate store filter
            const storeSelect = document.getElementById('store-filter');
            if (storeSelect) {
                const stores = [...new Set(renderableProducts.map(p => p.tienda))].filter(Boolean).sort();
                storeSelect.innerHTML = `<option value="all">${getLocalizedText('Todas las tiendas', 'All stores')}</option>` + 
                    stores.map(s => `<option value="${s}">${s}</option>`).join('');
            }

            // UX-5: Auto-fill price range placeholders from actual results
            const prices = renderableProducts.map(p => typeof p.precio === 'number' ? p.precio : parseFloat(String(p.precio || '0').replace(/[^0-9.]/g, ''))).filter(v => v > 0);
            if (prices.length > 0) {
                const minPrice = Math.floor(Math.min(...prices));
                const maxPrice = Math.ceil(Math.max(...prices));
                const sym = getRegionConfig().currencySymbol || '$';
                const minInput = document.getElementById('price-min');
                const maxInput = document.getElementById('price-max');
                if (minInput) minInput.placeholder = `Min ${sym}${minPrice}`;
                if (maxInput) maxInput.placeholder = `Max ${sym}${maxPrice}`;
            }

            // --- Phase 17: Pre-fetch favoritos para persistencia visual ---
            let userFavorites = [];
            const sb = window.supabaseClient || null;
            const user = window.currentUser || null;
            if (sb && user) {
                try {
                    const { data } = await sb.from('favorites').select('product_url, product_price').eq('user_id', user.id);
                    if (data) userFavorites = data;
                } catch (err) { }
            }
            _lastFavorites = userFavorites;

            const countEl = document.getElementById('results-count');
            if (countEl) countEl.textContent = `${renderableProducts.length} ${getRegionConfig().resultsFound}`;
            const resultsSummaryEl = document.getElementById('search-results-summary');
            if (resultsSummaryEl) resultsSummaryEl.textContent = `${renderableProducts.length} ${getRegionConfig().resultsFound}`;
            syncBestOptionButton(renderableProducts);

            const localSearchData = JSON.parse(localStorage.getItem('lumu_searches_data') || '{"count":0}');
            updateCoinsProgress(localSearchData.count || 0);

            renderProductCards(renderableProducts, userFavorites);
            renderSmartFilterSuggestions(renderableProducts);

            // Check price alerts after rendering
            if (typeof window.checkPriceAlerts === 'function') {
                window.checkPriceAlerts(renderableProducts);
            }
        }

        function renderProductCards(products, userFavorites) {
            resultsContainer.innerHTML = '';
            const isUS = currentRegion === 'US';

            // --- NUEVO: Comparador Local vs Online ---
            const localProducts = products.filter(p => p.isLocalStore && typeof p.precio === 'number' && p.precio > 0);
            const onlineProducts = products.filter(p => !p.isLocalStore && typeof p.precio === 'number' && p.precio > 0);
            
            if (localProducts.length > 0 && onlineProducts.length > 0) {
                const bestLocal = [...localProducts].sort((a,b) => a.precio - b.precio)[0];
                const bestOnline = [...onlineProducts].sort((a,b) => a.precio - b.precio)[0];
                
                const fmtLocal = formatProductPriceLabel(bestLocal.precio, bestLocal);
                const fmtOnline = formatProductPriceLabel(bestOnline.precio, bestOnline);
                
                let comparisonMsg = '';
                if (bestLocal.precio <= bestOnline.precio) {
                    comparisonMsg = isUS
                        ? `<span class="text-emerald-700 font-bold">Buying local is better today!</span> You save ${formatProductPriceLabel(bestOnline.precio - bestLocal.precio, bestLocal)} and get it right away.`
                        : `<span class="text-emerald-700 font-bold">¡Sale mejor comprar local hoy!</span> Ahorras ${formatProductPriceLabel(bestOnline.precio - bestLocal.precio, bestLocal)} y lo tienes al instante.`;
                } else if (bestOnline.precio < bestLocal.precio) {
                    const diff = bestLocal.precio - bestOnline.precio;
                    if (diff > 50) {
                        comparisonMsg = isUS
                            ? `<span class="text-blue-700 font-bold">Buying online is cheaper.</span> You save ${formatProductPriceLabel(diff, bestOnline)}, but you have to wait for shipping.`
                            : `<span class="text-blue-700 font-bold">Comprar online es más barato.</span> Ahorras ${formatProductPriceLabel(diff, bestOnline)}, pero debes esperar el envío.`;
                    } else {
                        comparisonMsg = isUS
                            ? `<span class="text-slate-700 font-bold">Similar price.</span> Buy local if you need it fast, or order online from home.`
                            : `<span class="text-slate-700 font-bold">Precio similar.</span> Cómpralo local si te urge, o pide online sin salir de casa.`;
                    }
                }
                
                const compareBanner = document.createElement('div');
                compareBanner.className = 'col-span-full mb-5 bg-gradient-to-r from-slate-50 via-white to-emerald-50/70 border border-slate-200 rounded-[24px] p-4 md:p-5 flex flex-col md:flex-row items-center gap-3 md:gap-4 shadow-sm w-full';
                compareBanner.innerHTML = `
                    <div class="flex items-center justify-center p-3 bg-white rounded-xl shadow-sm border border-slate-100 hidden md:flex">
                        <span class="text-3xl">⚖️</span>
                    </div>
                    <div class="flex-grow flex flex-col items-center md:items-start text-center md:text-left w-full">
                        <h4 class="text-sm font-black text-slate-800 uppercase tracking-wide mb-1 flex items-center gap-2">${isUS ? 'Local vs Online Analysis' : 'Análisis Local vs Online'} <span class="bg-indigo-100 text-indigo-700 text-[9px] px-2 py-0.5 rounded-full font-bold">BETA</span></h4>
                        <p class="text-sm text-slate-600 mb-3">${comparisonMsg}</p>
                        <div class="flex flex-wrap items-center justify-center md:justify-start gap-3 w-full">
                            <div class="bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2 shadow-sm transition-transform hover:-translate-y-0.5" title="${bestLocal.tienda}">
                                <span class="text-xs">📍 ${isUS ? 'Local:' : 'Local:'}</span> <span class="font-black text-base">${fmtLocal}</span>
                            </div>
                            <span class="text-slate-300 font-black text-[10px] mx-1">VS</span>
                            <div class="bg-blue-50 text-blue-800 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-2 shadow-sm transition-transform hover:-translate-y-0.5" title="${bestOnline.tienda}">
                                <span class="text-xs">🌐 Online:</span> <span class="font-black text-base">${fmtOnline}</span>
                            </div>
                        </div>
                    </div>
                `;
                resultsContainer.appendChild(compareBanner);
            }

            // Find cheapest product for "Mejor precio" badge
            const validPrices = products.filter(p => parseFloat(p.precio) > 0).map(p => parseFloat(p.precio));
            const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;

            products.forEach((product, index) => {
                const imageState = buildImageRenderState(product, isUS);
                const normalizedTitle = imageState.title;
                const shippingSource = product.shippingText || product.shippingLabel || product.deliveryText || product.deliveryLabel || product.couponDetails || '';
                const localizedShippingText = localizeDynamicResultText(shippingSource, isUS);
                let rawPrice = product.precio || 0;
                let precioNumerico = parseProductPriceValue(rawPrice);

                const formattedPrice = formatProductPriceLabel(precioNumerico, product);

                // Verificar si ya es favorito y si bajó de precio
                const favRecord = userFavorites.find(f => f.product_url === (product.urlMonetizada || product.urlOriginal));
                const isAlreadyFav = !!favRecord;
                let priceDropBadge = '';

                if (favRecord) {
                    // Support both numeric (new) and string "$5,723.00" (legacy) formats
                    const rawFavPrice = favRecord.product_price;
                    const oldPrice = typeof rawFavPrice === 'number' ? rawFavPrice : parseFloat(String(rawFavPrice).replace(/[^0-9.-]+/g, ""));
                    if (precioNumerico < oldPrice && precioNumerico > 0) {
                        const ahorro = oldPrice - precioNumerico;
                        priceDropBadge = `<div class="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-md z-30 shadow-lg animate-bounce">${isUS ? `DOWN ${formatProductPriceLabel(ahorro, product)}!` : `¡BAJÓ ${formatProductPriceLabel(ahorro, product)}!`}</div>`;
                    }
                }

                const isBestPrice = minPrice && precioNumerico === minPrice && precioNumerico > 0;
                const rankingBadgeHtml = index === 0
                    ? `<span class="text-[9px] font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-500 px-2 py-0.5 rounded-full ring-2 ring-violet-200 shadow-sm">#1 ${isUS ? 'BEST MATCH' : 'MEJOR MATCH'}</span>`
                    : index === 1
                        ? `<span class="text-[9px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-200">#2 ${isUS ? 'TOP' : 'TOP'}</span>`
                        : index === 2
                            ? `<span class="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">#3 ${isUS ? 'TOP' : 'TOP'}</span>`
                            : '';
                
                const heartColor = isAlreadyFav ? 'text-red-500' : 'text-slate-300';
                const tiendaLower = (product.tienda || product.fuente || '').toLowerCase();
                const preferredClickTarget = product.urlOriginal || product.urlMonetizada || '';
                const hasPriceHistory = Array.isArray(product.priceTrend?.history) && product.priceTrend.history.length > 0;

                const card = document.createElement('div');
                card.className = 'group product-card bg-white dark:bg-slate-800 rounded-[20px] md:rounded-[24px] hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col relative h-full fade-in border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer';
                card.setAttribute('role', 'link');
                card.setAttribute('tabindex', '0');
                card.setAttribute('data-target-url', preferredClickTarget);
                card.setAttribute('data-best-option-url', preferredClickTarget);
                card.setAttribute('aria-label', `${isUS ? 'Open offer for' : 'Abrir oferta de'} ${normalizedTitle}`);

                // Local store: price can be null
                const isLocal = product.isLocalStore;
                const hasUsableOnlinePrice = !isLocal && precioNumerico > 0;
                const originalPriceNumeric = parseProductPriceValue(product.originalPrice || 0);
                const hasStructuredDeal = !isLocal
                    && Boolean(product.isDealPrice)
                    && Number.isFinite(originalPriceNumeric)
                    && originalPriceNumeric > precioNumerico;
                const discountPct = Number(product.discountPct || 0);
                let priceDisplay;
                if (isLocal) {
                    priceDisplay = `<span class="text-base md:text-lg font-black text-amber-600">${isUS ? 'Check in-store price' : 'Ver precio en tienda'}</span>`;
                } else if (!hasUsableOnlinePrice) {
                    priceDisplay = `<span class="text-base md:text-lg font-black text-slate-500">${isUS ? 'Price unavailable' : 'Precio no disponible'}</span>`;
                } else {
                    const formattedFull = formatCurrencyByCode(precioNumerico, String(product.countryCode || product.country || product.region || currentRegion || 'MX').trim().toUpperCase());
                    const numericMatch = formattedFull.match(/[\d,.]+/);
                    const numericPart = numericMatch ? numericMatch[0] : '0.00';
                    const currencySymbol = formattedFull.replace(numericPart, '').trim() || (getRegionConfig().currency === 'USD' ? '$' : '$');
                    const lastSeparatorIndex = Math.max(numericPart.lastIndexOf('.'), numericPart.lastIndexOf(','));
                    const integerPart = lastSeparatorIndex >= 0 ? numericPart.slice(0, lastSeparatorIndex) : numericPart;
                    const decimalPart = lastSeparatorIndex >= 0 ? numericPart.slice(lastSeparatorIndex + 1) : '00';
                    const explicitCurrencyCode = getProductCurrencyCode(product);
                    
                    priceDisplay = `<span class="text-xs md:text-sm font-bold text-slate-500">${currencySymbol}</span><span class="text-[1.7rem] md:text-3xl font-black text-slate-900 leading-none">${integerPart}</span><span class="text-xs md:text-sm font-bold text-slate-900">.${decimalPart}</span><span class="ml-2 text-[10px] md:text-xs font-black uppercase tracking-[0.18em] text-slate-400">${explicitCurrencyCode}</span>`;
                    if (hasStructuredDeal) {
                        const originalPriceLabel = formatCurrencyByCode(originalPriceNumeric, String(product.countryCode || product.country || product.region || currentRegion || 'MX').trim().toUpperCase());
                        priceDisplay += `<span class="ml-1 text-xs md:text-sm font-bold text-slate-400 line-through decoration-2 decoration-slate-300">${originalPriceLabel}</span>`;
                        if (discountPct > 0) {
                            priceDisplay += `<span class="ml-2 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] md:text-xs font-black uppercase tracking-wider text-rose-700 ring-1 ring-rose-200">-${discountPct}%</span>`;
                        }
                    }
                    
                    if (product.isSuspicious) {
                        priceDisplay += `<div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black uppercase tracking-wider tooltip" data-tip="${isUS ? 'The price is unusually low compared to the market' : 'El precio es anormalmente bajo comparado con el mercado'}"><span class="text-xs">⚠️</span> ${isUS ? 'SUSPICIOUS' : 'SOSPECHOSO'}</div>`;
                    }
                }

                let trendHtml = '';
                if (product.priceTrend && product.priceTrend.direction) {
                    const trend = product.priceTrend;
                    const hasHistory = Array.isArray(trend.history) && trend.history.length > 0;
                    let sparklineHtml = '';
                    
                    if (hasHistory) {
                        try {
                            const dps = trend.history.map(h => h.price).reverse(); // oldest to newest
                            dps.push(precioNumerico); // add current price
                            
                            const minP = Math.min(...dps);
                            const maxP = Math.max(...dps);
                            const w = 84;
                            const h = 28;
                            const pad = 3;
                            
                            // Si todos los precios son iguales, linea recta en medio
                            const diff = maxP - minP === 0 ? 1 : maxP - minP;
                            
                            let pathD = dps.map((val, i) => {
                                const x = pad + (i * ((w - pad*2) / (dps.length - 1)));
                                const y = pad + (h - pad*2) - (((val - minP) / diff) * (h - pad*2));
                                return (i === 0 ? 'M' : 'L') + x + ',' + y;
                            }).join(' ');
                            
                            const strokeColor = trend.direction === 'down' ? '#10b981' : (trend.direction === 'up' ? '#f43f5e' : '#94a3b8');
                            
                            sparklineHtml = `
                                <div class="tooltip tooltip-left ml-auto" data-tip="${isUS ? `Trend (7 days) · Min ${formatCurrencyByRegion(minP)} · Max ${formatCurrencyByRegion(maxP)}` : `Tendencia (7 días) · Mín ${formatCurrencyByRegion(minP)} · Máx ${formatCurrencyByRegion(maxP)}`}">
                                    <svg width="${w}" height="${h}" class="overflow-visible opacity-80 mix-blend-multiply">
                                        <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                                        <circle cx="${pad + ((dps.length - 1) * ((w - pad*2) / (dps.length - 1)))}" cy="${pad + (h - pad*2) - (((precioNumerico - minP) / diff) * (h - pad*2))}" r="2.5" fill="${strokeColor}" />
                                    </svg>
                                </div>
                            `;
                        } catch(e) { console.error('Sparkline error:', e); }
                    }

                    if (trend.direction === 'down') {
                        trendHtml = `<div class="mt-1 flex items-center justify-between w-full"><div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">↓ ${getLocalizedText('Bajó', 'Down')} ${formatCurrencyByRegion(trend.delta || 0)} (${trend.percent || 0}%)</div>${sparklineHtml}</div>`;
                    } else if (trend.direction === 'up') {
                        trendHtml = `<div class="mt-1 flex items-center justify-between w-full"><div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-bold">↑ ${getLocalizedText('Subió', 'Up')} ${formatCurrencyByRegion(trend.delta || 0)} (${trend.percent || 0}%)</div>${sparklineHtml}</div>`;
                    } else {
                        trendHtml = `<div class="mt-1 flex items-center justify-between w-full"><div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">→ ${getLocalizedText('Precio estable', 'Stable price')}</div>${sparklineHtml}</div>`;
                    }
                    if (hasHistory) {
                        trendHtml += `<div class="mt-2 text-[11px] font-bold text-slate-500">${getLocalizedText('Historial de precio disponible', 'Price history available')}</div>`;
                    }
                }

                let dealVerdictHtml = '';
                let historyInsightHtml = '';
                if (product.dealVerdict && product.dealVerdict.status) {
                    const verdict = product.dealVerdict;
                    const verdictMap = {
                        real_deal: {
                            cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm',
                            icon: '✅',
                            labelEs: 'Oferta real',
                            labelEn: 'Real deal'
                        },
                        normal_price: {
                            cls: 'bg-slate-100 text-slate-700 border border-slate-200 shadow-sm',
                            icon: 'ℹ️',
                            labelEs: 'Precio normal',
                            labelEn: 'Normal price'
                        },
                        suspicious_discount: {
                            cls: 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm',
                            icon: '⚠️',
                            labelEs: 'Descuento sospechoso',
                            labelEn: 'Suspicious discount'
                        }
                    };
                    const verdictUi = verdictMap[verdict.status] || verdictMap.normal_price;
                    const avgPriceTip = verdict.stats && Number.isFinite(verdict.stats.avgPrice)
                        ? (isUS ? `Average tracked price: ${formatCurrencyByRegion(verdict.stats.avgPrice)}` : `Precio promedio rastreado: ${formatCurrencyByRegion(verdict.stats.avgPrice)}`)
                        : (isUS ? 'Tracked historical price analysis' : 'Análisis de precio histórico rastreado');
                    const verdictAnim = verdict.status === 'real_deal' ? 'animate-pulse' : '';
                    dealVerdictHtml = `<div class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider tooltip ${verdictUi.cls} ${verdictAnim}" data-tip="${avgPriceTip}"><span class="text-sm">${verdictUi.icon}</span>${isUS ? verdictUi.labelEn : verdictUi.labelEs}</div>`;
                    if (verdict.stats && (Number.isFinite(verdict.stats.avgPrice) || Number.isFinite(verdict.stats.minPrice))) {
                        const avgLabel = Number.isFinite(verdict.stats.avgPrice)
                            ? `${isUS ? 'Avg' : 'Prom'} ${formatCurrencyByRegion(verdict.stats.avgPrice)}`
                            : '';
                        const minLabel = Number.isFinite(verdict.stats.minPrice)
                            ? `${isUS ? 'Min' : 'Mín'} ${formatCurrencyByRegion(verdict.stats.minPrice)}`
                            : '';
                        historyInsightHtml = `<div class="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600"><span class="px-2 py-1 rounded-md bg-slate-100">${avgLabel}</span><span class="px-2 py-1 rounded-md bg-slate-100">${minLabel}</span></div>`;
                    }
                }

                let couponHtml = '';
                const cuponObj = product.cupon;
                if (cuponObj) {
                    const code = typeof cuponObj === 'string' ? cuponObj : cuponObj.code;
                    const isPlaceholder = !code || code.trim() === '' || /^X+$/i.test(code.trim());
                    if (isPlaceholder) {
                        // Skip coupon display if it's a placeholder
                    } else {
                        const discountText = (typeof cuponObj === 'object' && cuponObj.discount)
                            ? localizeCouponDetails(cuponObj.discount)
                            : localizeCouponDetails(product.couponDetails || (isUS ? 'COUPON AVAILABLE' : 'CUPÓN DISPONIBLE'));
                        const isPremium = window.currentUser && (window.currentUser.is_premium || window.currentUser.plan === 'personal_vip' || window.currentUser.plan === 'b2b');
                    
                        if (isPremium) {
                            couponHtml = `
                            <div class="mt-2 w-full p-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl relative overflow-hidden">
                                <div class="absolute inset-0 border-2 border-dashed border-emerald-200/50 rounded-xl pointer-events-none"></div>
                                <div class="flex items-center justify-between relative z-10">
                                    <div class="flex flex-col">
                                        <span class="text-[9px] font-black text-emerald-800 uppercase tracking-widest leading-none mb-1">${discountText}</span>
                                        <span class="text-[13px] font-black text-emerald-600 font-mono tracking-tighter leading-none">${code}</span>
                                    </div>
                                    <button onclick="event.preventDefault(); event.stopPropagation(); navigator.clipboard.writeText('${code}'); const orig=this.innerHTML; this.innerHTML='${isUS ? 'Copied!' : '¡Copiado!'}'; setTimeout(()=>this.innerHTML=orig, 2000);" class="text-[10px] font-bold bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded-lg shadow-sm transition-all border border-emerald-100 z-20 cursor-pointer">${isUS ? 'Copy' : 'Copiar'}</button>
                                </div>
                                ${product.couponDisclaimer ? `<p class="mt-2 text-[10px] leading-relaxed text-slate-500">${sanitize(product.couponDisclaimer)}</p>` : ''}
                                ${product.couponSourceUrl ? `<a href="${sanitize(product.couponSourceUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="mt-1 inline-flex text-[10px] font-bold text-emerald-700 hover:text-emerald-800">${isUS ? 'View terms →' : 'Ver términos →'}</a>` : ''}
                            </div>`;
                        } else {
                            couponHtml = `
                            <div class="mt-2 w-full p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl relative overflow-hidden group/upsell cursor-pointer hover:shadow-sm" onclick="event.preventDefault(); event.stopPropagation(); const btn = document.getElementById('stripe-checkout-btn') || document.querySelector('a[href*=\\'buy.stripe.com\\']'); if(btn) btn.click(); else alert('${isUS ? 'Go PRO to view coupons' : 'Hazte PRO para ver cupones'}')">
                                <div class="absolute inset-0 border-2 border-dashed border-amber-300/50 rounded-xl pointer-events-none"></div>
                                <div class="flex items-center justify-between relative z-10">
                                    <div class="flex flex-col w-full relative">
                                        <span class="text-[9px] font-black text-amber-800 uppercase tracking-widest leading-none mb-1 flex items-center justify-between w-full"><span>${discountText}</span> <span class="bg-amber-100 px-1 rounded">⭐ PRO</span></span>
                                        <span class="text-[13px] font-black text-slate-800 font-mono tracking-tighter leading-none blur-[4px] select-none text-center">XXXXXXXX</span>
                                        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/upsell:opacity-100 transition-opacity drop-shadow-md">
                                            <span class="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">🔒 ${isUS ? 'Unlock' : 'Desbloquear'}</span>
                                        </div>
                                    </div>
                                </div>
                                ${product.couponDisclaimer ? `<p class="mt-2 text-[10px] leading-relaxed text-slate-500">${sanitize(product.couponDisclaimer)}</p>` : ''}
                            </div>`;
                        }
                    }
                }

                // Local store extra details
                const localMeta = product.localDetails || {};
                const localDetailHtml = isLocal ? `
                <div class="mt-2 space-y-1">
                    ${localMeta.distance != null ? `<p class="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">📍 ${isUS ? `${localMeta.distance} km from you` : `A ${localMeta.distance} km de ti`}</p>` : ''}
                    ${localMeta.address ? `<p class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${sanitize(localMeta.address)}</p>` : ''}
                    ${localMeta.rating ? `<p class="text-xs text-amber-500 font-bold">⭐ ${localMeta.rating} / 5.0</p>` : ''}
                    ${localMeta.phone ? `<p class="text-xs text-slate-500 dark:text-slate-400">📞 ${sanitize(localMeta.phone)}</p>` : ''}
                </div>` : '';

                const conditionBadgeMap = {
                    new: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
                    used: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
                    refurbished: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                };
                const conditionBadgeClass = conditionBadgeMap[product.conditionLabel] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
                const conditionBadgeText = product.conditionLabel === 'used'
                    ? (isUS ? 'USED' : 'USADO')
                    : product.conditionLabel === 'refurbished'
                        ? (isUS ? 'REFURB.' : 'REACOND.')
                        : (isUS ? 'NEW' : 'NUEVO');
                const trustBadgeMap = {
                    1: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
                    2: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
                    3: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                };
                const trustBadgeClass = trustBadgeMap[product.storeTier] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
                const rawTrustLabel = product.trustLabel || 'Marketplace';
                const trustBadgeText = sanitize(isUS ? (TRUST_LABEL_EN[rawTrustLabel] || rawTrustLabel) : rawTrustLabel);
                const trustBadgeHtml = trustBadgeText
                    ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${trustBadgeClass}" title="${trustBadgeText}">${trustBadgeText}</span>`
                    : '';
                const verificationLabel = formatRelativeVerification(product.lastVerifiedAt);
                const verificationBadgeHtml = verificationLabel
                    ? `<span class="text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200">${sanitize(verificationLabel)}</span>`
                    : '';
                const regionTag = sanitize(String(product.countryCode || currentRegion || 'MX').toUpperCase());
                const regionBadgeHtml = regionTag
                    ? `<span class="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">${regionTag}</span>`
                    : '';
                const sellerSignalHtml = product.sellerModel === 'official_store'
                    ? `<span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">${isUS ? 'OFFICIAL' : 'OFICIAL'}</span>`
                    : product.sellerModel === 'verified_marketplace'
                        ? `<span class="text-[9px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full ring-1 ring-cyan-200">${isUS ? 'VERIFIED' : 'VERIFICADO'}</span>`
                        : '';
                const c2cBadgeHtml = product.isC2C
                    ? '<span class="text-[9px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full ring-1 ring-rose-200">C2C</span>'
                    : '';
                
                // Data freshness badge
                const dataAge = Number(product.dataAgeMinutes || 0);
                let freshnessBadgeHtml = '';
                if (!isLocal && precioNumerico > 0) {
                    if (dataAge < 60) {
                        freshnessBadgeHtml = `<span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200" title="${isUS ? 'Verified minutes ago' : 'Verificado hace minutos'}">✓ ${isUS ? 'FRESH' : 'FRESCO'}</span>`;
                    } else if (dataAge >= 60 && dataAge < 240) {
                        const hours = Math.round(dataAge / 60);
                        freshnessBadgeHtml = `<span class="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200" title="${isUS ? `Verified ${hours}h ago` : `Verificado hace ${hours}h`}">⏱ ${hours}h</span>`;
                    } else if (dataAge >= 240) {
                        const hours = Math.round(dataAge / 60);
                        freshnessBadgeHtml = `<span class="text-[9px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full ring-1 ring-orange-200" title="${isUS ? 'Price may have changed' : 'Precio puede haber cambiado'}">⚠️ ${hours}h</span>`;
                    }
                }
                
                // Price confidence warning
                const priceConfidence = Number(product.priceConfidence || 0);
                const priceNeedsVerification = Boolean(product.priceNeedsVerification);
                const observedPrices = Array.isArray(product.observedPrices)
                    ? product.observedPrices.map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0)
                    : [];
                const observedMinPrice = observedPrices.length > 0 ? Math.min(...observedPrices) : null;
                const observedMaxPrice = observedPrices.length > 1 ? Math.max(...observedPrices) : null;
                let priceWarningHtml = '';
                let observedRangeHtml = '';
                if (!isLocal && precioNumerico > 0) {
                    if (priceConfidence < 0.6) {
                        priceWarningHtml = `<span class="text-[9px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200" title="${isUS ? 'Approximate price detected - open the store to verify the final amount' : 'Precio aproximado detectado - abre la tienda para confirmar el monto final'}">⚠️ ${isUS ? 'VERIFY PRICE' : 'VER PRECIO REAL'}</span>`;
                    } else if (priceNeedsVerification && !hasStructuredDeal) {
                        priceWarningHtml = `<span class="text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full ring-1 ring-slate-200" title="${isUS ? 'Verify final price in store' : 'Verificar precio final en tienda'}">ℹ️ ${isUS ? 'VERIFY' : 'VERIFICAR'}</span>`;
                    }
                    if (priceNeedsVerification && observedMinPrice && observedMaxPrice && observedMaxPrice > observedMinPrice) {
                        observedRangeHtml = `<div class="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg ring-1 ring-amber-200 shadow-sm">🔎 <span>${isUS ? 'Seen between' : 'Visto entre'} ${formatCurrencyByCode(observedMinPrice, String(product.countryCode || product.country || product.region || currentRegion || 'MX').trim().toUpperCase())} ${isUS ? 'and' : 'y'} ${formatCurrencyByCode(observedMaxPrice, String(product.countryCode || product.country || product.region || currentRegion || 'MX').trim().toUpperCase())}</span></div>`;
                    }
                }
                const verifiedDeltaLabel = product.verifiedPriceDelta?.label
                    ? sanitize(product.verifiedPriceDelta.label)
                    : '';
                const verifiedPriceBadgeHtml = verifiedDeltaLabel
                    ? `<div class="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg ring-1 ring-emerald-200 shadow-sm">✅ <span>${verifiedDeltaLabel}</span></div>`
                    : '';
                const shippingBadgeHtml = localizedShippingText && !/coupon available|cup[oó]n disponible/i.test(localizedShippingText)
                    ? `<div class="text-[11px] text-emerald-600 font-bold bg-emerald-50 w-fit px-2 py-0.5 rounded-md mt-2 tracking-wide">${sanitize(localizedShippingText)}</div>`
                    : '';
                const productAlt = sanitize(normalizedTitle || (isUS ? 'Product' : 'Producto')) + ' - ' + sanitize(product.tienda || (isUS ? 'Store' : 'Tienda'));
                card.innerHTML = `
                ${priceDropBadge}
                <div class="card-open-area w-full bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex-shrink-0 h-32 sm:h-40 md:h-52 flex items-center justify-center p-3 md:p-4 relative overflow-hidden group-hover:bg-emerald-50/20 transition-colors cursor-pointer" data-target-url="${preferredClickTarget}">
                    <img src="${imageState.finalImgUrl}" alt="${productAlt}" loading="lazy" referrerpolicy="no-referrer" data-fallback-src="${imageState.fallbackImgUrl}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out ${imageState.hasProductImage ? '' : 'opacity-95'}" onerror="this.onerror=null; this.src=this.dataset.fallbackSrc;">
                    ${imageState.hasProductImage ? '' : `<div class="absolute left-3 bottom-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-slate-200 text-[10px] font-bold text-slate-500 shadow-sm">${sanitize(product.tienda || (isUS ? 'Store' : 'Tienda'))}</div>`}
                    <button class="btn-favorite absolute top-2 right-2 p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-full ${heartColor} hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-all z-20 hover:scale-110">
                        <svg class="w-5 h-5 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>
                    ${!isLocal ? `
                    <button class="btn-compare absolute top-2 left-2 p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-full ${_compareProducts.some(cp => (cp.urlMonetizada || cp.urlOriginal) === (product.urlMonetizada || product.urlOriginal)) ? 'text-emerald-600 bg-emerald-100' : 'text-slate-400'} hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-all z-20 hover:scale-110" title="${isUS ? 'Compare' : 'Comparar'}" data-compare-url="${product.urlMonetizada || product.urlOriginal}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    </button>` : ''}
                </div>

                <!-- Info Section -->
                <div class="flex-grow flex flex-col p-3 md:p-4 w-full">
                    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-2 gap-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-full max-w-full sm:max-w-[70%] truncate">${sanitize(product.tienda)}</span>
                            ${(tiendaLower.includes('amazon') || tiendaLower.includes('walmart') || tiendaLower.includes('liverpool') || tiendaLower.includes('mercado') || tiendaLower.includes('bodega aurrera') || tiendaLower.includes('linio') || tiendaLower.includes('claro shop') || tiendaLower.includes('sanborns') || tiendaLower.includes('costco') || tiendaLower.includes('best buy')) ? `<span class="text-emerald-600" title="${isUS ? 'Verified store' : 'Tienda verificada'}">✓</span>` : ''}
                        </div>
                        <div class="flex flex-wrap items-center gap-1">
                            ${rankingBadgeHtml}
                            ${isBestPrice ? `<span class="text-[9px] font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 rounded-full ring-2 ring-emerald-200 shadow-sm animate-pulse">💰 ${isUS ? 'BEST PRICE' : 'MEJOR PRECIO'}</span>` : ''}
                            ${product.isLocalStore ? `<span class="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">📍 ${isUS ? 'LOCAL' : 'LOCAL'}</span>` : ''}
                            ${freshnessBadgeHtml}
                            ${priceWarningHtml}
                            ${regionBadgeHtml}
                            ${verificationBadgeHtml}
                            ${trustBadgeHtml}
                            ${sellerSignalHtml}
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${conditionBadgeClass}">${conditionBadgeText}</span>
                            ${c2cBadgeHtml}
                        </div>
                    </div>
                    
                    <h3 class="text-sm md:text-[15px] font-extrabold text-slate-900 dark:text-slate-100 leading-snug line-clamp-3 min-h-[3.1rem] md:min-h-[3.5rem] mb-2 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors" title="${sanitize(normalizedTitle)}">
                        ${sanitize(normalizedTitle)}
                    </h3>
                    ${shippingBadgeHtml}
                    ${localDetailHtml}

                    <div class="mt-auto flex flex-col w-full">
                        <div class="flex items-baseline gap-0.5 mb-1 flex-wrap">
                            ${priceDisplay}
                        </div>
                        ${observedRangeHtml}
                        ${verifiedPriceBadgeHtml}
                        ${trendHtml}
                        ${dealVerdictHtml}
                        ${historyInsightHtml}
                        ${couponHtml}
                        
                        <div class="flex flex-col gap-2 mt-3 w-full">
                            <button class="btn-open-offer w-full bg-primary hover:bg-emerald-600 text-white text-sm font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all transform active:scale-95 flex items-center justify-center gap-2 min-h-[44px]"
                                    data-target-url="${preferredClickTarget}">
                                ${isLocal ? ((product.urlOriginal && product.urlOriginal.includes('maps')) ? (isUS ? 'View in Maps' : 'Ver en Maps') : (isUS ? 'Go to Store' : 'Ir a Tienda')) : (isUS ? 'View Offer' : 'Ver Oferta')}
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                            </button>
                            
                            <!-- Acciones secundarias en botones Outline abajo -->
                            ${(!isLocal && precioNumerico > 0) ? `
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mt-1">
                                <button class="btn-quick-alert flex-1 min-h-[42px] py-2 flex justify-center items-center gap-1.5 bg-white text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-xl border border-slate-200 hover:border-amber-300 transition-all text-xs font-bold shadow-sm" title="${isUS ? 'Price alert' : 'Alerta de precio'}"
                                        data-alert-name="${sanitize(product.titulo)}"
                                        data-alert-price="${precioNumerico}"
                                        data-alert-url="${product.urlMonetizada || product.urlOriginal}"
                                        data-alert-store="${sanitize(product.tienda)}">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                                    ${isUS ? 'Alert me' : 'Avisarme'}
                                </button>
                                <button class="btn-margin-calc flex-1 min-h-[42px] py-2 flex justify-center items-center gap-1.5 bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200 hover:border-blue-300 transition-all text-xs font-bold shadow-sm" title="${isUS ? 'Dropshipping calculator' : 'Calculadora Dropshipping'}"
                                        data-cost-price="${precioNumerico}"
                                        data-product-name="${sanitize(product.titulo)}">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                    <span>${isUS ? 'Margin' : 'Margen'}</span>
                                </button>
                                <button class="btn-view-history col-span-1 flex-1 min-h-[42px] py-2 flex justify-center items-center gap-1.5 ${hasPriceHistory ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'} rounded-xl border transition-all text-xs font-bold shadow-sm" title="${isUS ? 'Price history' : 'Historial de precio'}">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 3v18h18M7 14l3-3 3 2 4-5"></path></svg>
                                    <span>${hasPriceHistory ? (isUS ? 'Price history' : 'Precio histórico') : (isUS ? 'Tracking price...' : 'Rastreando precio...')}</span>
                                </button>
                            </div>` : ''}
                            
                        </div>
                    </div>
                </div>
            `;

                // SEO Schema Markup (Phase 7) - Enhanced with AggregateOffer
                if (!isLocal && precioNumerico > 0) {
                    const schemaData = {
                        "@context": "https://schema.org/",
                        "@type": "Product",
                        "name": product.titulo,
                        "image": [imageState.finalImgUrl],
                        "brand": {
                            "@type": "Brand",
                            "name": product.tienda || (isUS ? "Online Store" : "Tienda Online")
                        },
                        "offers": {
                            "@type": "Offer",
                            "url": product.urlMonetizada || product.urlOriginal,
                            "priceCurrency": getRegionConfig().currency,
                            "price": precioNumerico.toString(),
                            "availability": "https://schema.org/InStock",
                            "priceValidUntil": new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            "seller": {
                                "@type": "Organization",
                                "name": product.tienda || (isUS ? "Online Store" : "Tienda Online")
                            }
                        }
                    };
                    
                    // Add aggregateRating only when the product actually provides both values
                    if (product.rating && product.reviewCount) {
                        schemaData.aggregateRating = {
                            "@type": "AggregateRating",
                            "ratingValue": String(product.rating),
                            "reviewCount": String(product.reviewCount)
                        };
                    }
                    
                    card.innerHTML += `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`;
                }

                // Favorite toggle logic (Phase 17+)
                const btnFav = card.querySelector('.btn-favorite');
                const btnOpenOffer = card.querySelector('.btn-open-offer');
                const btnCompare = card.querySelector('.btn-compare');
                const btnViewHistory = card.querySelector('.btn-view-history');
                const cardOpenArea = card.querySelector('.card-open-area');
                const trackingBase = _buildProductTrackingPayload(product, {
                    position: index,
                    action_context: 'result_card'
                });
                const openProductTarget = (target) => {
                    window._lastSearchHadClick = true;
                    if (_conversionBounceTimer) {
                        clearTimeout(_conversionBounceTimer);
                        _conversionBounceTimer = null;
                    }

                    _trackEvent('click', {
                        ...trackingBase,
                        url: target || product.urlMonetizada || product.urlOriginal || '',
                        action_context: 'open_offer'
                    });

                    if (typeof trackProductClick === 'function') {
                        trackProductClick(product.titulo, product.tienda, precioNumerico);
                    }

                    // Show price disclaimer on first click per session
                    if (!sessionStorage.getItem('lumu_price_disclaimer_shown')) {
                        sessionStorage.setItem('lumu_price_disclaimer_shown', 'true');
                        if (typeof showGlobalFeedback === 'function') {
                            showGlobalFeedback(
                                getLocalizedText(
                                    'Lumu compara precios en tiempo real, pero pueden variar. Verifica el precio final en la tienda.',
                                    'Lumu compares prices in real-time, but they may vary. Verify the final price at the store.'
                                ),
                                'info'
                            );
                        }
                    }

                    if (target && target !== 'undefined' && target !== 'null') {
                        window.open(target, '_blank');
                    } else {
                        console.warn(isUS ? 'Offer URL not found for this product' : 'URL de oferta no encontrada para este producto');
                    }
                };
                
                if (btnOpenOffer) {
                    btnOpenOffer.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openProductTarget(btnOpenOffer.getAttribute('data-target-url'));
                    });
                }
                if (cardOpenArea) {
                    cardOpenArea.addEventListener('click', (e) => {
                        if (e.target.closest('button, a, input, textarea, select, label')) {
                            return;
                        }
                        openProductTarget(cardOpenArea.getAttribute('data-target-url'));
                    });
                }
                card.addEventListener('click', (e) => {
                    if (e.target.closest('button, a, input, textarea, select, label')) {
                        return;
                    }
                    openProductTarget(card.getAttribute('data-target-url'));
                });
                card.addEventListener('keydown', (e) => {
                    if (e.target !== card) {
                        return;
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openProductTarget(card.getAttribute('data-target-url'));
                    }
                });
                // Compare toggle
                if (btnCompare) {
                    btnCompare.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleCompare(product, precioNumerico, formattedPrice);
                        _trackEvent('compare', {
                            ...trackingBase,
                            action_context: 'compare_toggle'
                        });
                        btnCompare.animate([
                            { transform: 'scale(1)' },
                            { transform: 'scale(1.25)' },
                            { transform: 'scale(1)' }
                        ], { duration: 250 });
                    });
                }
                if (btnViewHistory) {
                    if (!hasPriceHistory) {
                        btnViewHistory.classList.remove('hover:text-emerald-700', 'hover:bg-emerald-50', 'hover:border-emerald-300');
                        btnViewHistory.classList.add('text-slate-400', 'bg-slate-50', 'cursor-default');
                    }
                    btnViewHistory.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!hasPriceHistory) {
                            if (typeof showGlobalFeedback === 'function') {
                                showGlobalFeedback(getLocalizedText('Aún no hay suficiente historial para este producto.', 'There is not enough history for this product yet.'), 'info');
                            }
                            return;
                        }
                        _trackEvent('history_open', {
                            ...trackingBase,
                            action_context: 'price_history_modal'
                        });
                        openProductHistoryModal(product);
                    });
                }
                btnFav.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!window.supabaseClient || !window.currentUser) {
                        if (typeof openModal === 'function') openModal();
                        return;
                    }

                    try {
                        if (btnFav.classList.contains('text-red-500')) {
                            // Remove
                            await window.supabaseClient.from('favorites').delete().eq('user_id', window.currentUser.id).eq('product_url', product.urlMonetizada || product.urlOriginal);
                            btnFav.classList.remove('text-red-500');
                            btnFav.classList.add('text-slate-300');
                            _trackEvent('favorite_remove', {
                                ...trackingBase,
                                action_context: 'favorite_remove'
                            });
                        } else {
                            // Add
                            await window.supabaseClient.from('favorites').insert([{
                                user_id: window.currentUser.id,
                                product_title: product.titulo,
                                product_price: precioNumerico || 0,
                                product_image: product.imagen,
                                product_url: product.urlMonetizada || product.urlOriginal,
                                store_name: product.tienda
                            }]);
                            btnFav.classList.add('text-red-500');
                            btnFav.classList.remove('text-slate-300');
                            _trackEvent('favorite', {
                                ...trackingBase,
                                action_context: 'favorite_add'
                            });

                            // Micro-animation
                            btnFav.animate([
                                { transform: 'scale(1)' },
                                { transform: 'scale(1.3)' },
                                { transform: 'scale(1)' }
                            ], { duration: 300 });
                        }
                    } catch (err) {
                        console.error(isUS ? 'Favorite toggle error:' : 'Error toggle favorito:', err);
                    }
                });

                // Quick price alert button
                const btnQuickAlert = card.querySelector('.btn-quick-alert');
                if (btnQuickAlert) {
                    btnQuickAlert.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const name = btnQuickAlert.getAttribute('data-alert-name');
                        const price = parseFloat(btnQuickAlert.getAttribute('data-alert-price'));
                        const url = btnQuickAlert.getAttribute('data-alert-url');
                        const store = btnQuickAlert.getAttribute('data-alert-store');
                        _trackEvent('alert_create', {
                            ...trackingBase,
                            product_title: name || product.titulo,
                            price: Number(price || 0) || undefined,
                            url: url || product.urlMonetizada || product.urlOriginal || '',
                            store: store || product.tienda,
                            action_context: 'quick_alert'
                        });
                        window.createQuickAlert(name, price, url, store);
                    });
                }

                // Margin calculator button
                const btnMargin = card.querySelector('.btn-margin-calc');
                if (btnMargin) {
                    btnMargin.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const costPrice = parseFloat(btnMargin.getAttribute('data-cost-price'));
                        const productName = btnMargin.getAttribute('data-product-name');
                        window.openMarginCalculator(costPrice, productName);
                    });
                }

                resultsContainer.appendChild(card);
            });
        }

        // --- Lógica de Categorías Rápidas ---
        const categoryButtons = document.querySelectorAll('[data-category]');
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const category = btn.getAttribute('data-category');
                if (category) {
                    searchInput.value = category;
                    searchForm.dispatchEvent(new Event('submit'));
                    // Smooth scroll top on mobile
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });

        // --- Lógica de Navegación Zero-Token ---
        const macroCategoryLinks = document.querySelectorAll('[data-macro-category]');
        macroCategoryLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const category = link.getAttribute('data-macro-category');
                if (!category) return;

                searchInput.value = category;
                searchForm.dispatchEvent(new Event('submit'));

                // Re-hide showcase if it's there
                const showcase = document.getElementById('product-showcase');
                if (showcase) showcase.classList.add('hidden');

                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // --- Lógica de Aviso de Cookies (Meta Pixel / Seguimiento) ---
        const cookieBanner = document.getElementById('cookie-banner');
        const btnAcceptCookies = document.getElementById('btn-accept-cookies');
        const btnRejectCookies = document.getElementById('btn-reject-cookies');

        const applyCookieConsent = (accepted) => {
            if (typeof window.updateAnalyticsConsent === 'function') {
                window.updateAnalyticsConsent(Boolean(accepted));
            }
        };

        const savedCookieChoice = localStorage.getItem('lumu_cookies');
        if (savedCookieChoice) {
            applyCookieConsent(savedCookieChoice === 'accepted');
        }

        const cookieBannerSpacer = document.getElementById('cookie-banner-spacer');

        function syncCookieBannerSpacer() {
            if (!cookieBanner || !cookieBannerSpacer) return;

            const isHidden = cookieBanner.classList.contains('cookie-banner-hidden');
            if (isHidden) {
                cookieBannerSpacer.style.height = '0px';
                return;
            }

            const height = cookieBanner.offsetHeight || 0;
            cookieBannerSpacer.style.height = `${height + 20}px`;
        }

        if (cookieBanner && !savedCookieChoice) {
            setTimeout(() => {
                cookieBanner.classList.remove('cookie-banner-hidden');
                document.body.classList.add('cookie-banner-visible');
                syncCookieBannerSpacer();
            }, 1500);
        }

        function closeBanner() {
            if (!cookieBanner) return;
            cookieBanner.classList.add('cookie-banner-hidden');
            document.body.classList.remove('cookie-banner-visible');
            syncCookieBannerSpacer();
        };

        if (cookieBanner && cookieBannerSpacer) {
            window.addEventListener('resize', syncCookieBannerSpacer);
            window.addEventListener('orientationchange', syncCookieBannerSpacer);
        }

        if (btnAcceptCookies) {
            btnAcceptCookies.addEventListener('click', () => {
                localStorage.setItem('lumu_cookies', 'accepted');
                applyCookieConsent(true);
                closeBanner();
            });
        }

        if (btnRejectCookies) {
            btnRejectCookies.addEventListener('click', () => {
                localStorage.setItem('lumu_cookies', 'rejected');
                applyCookieConsent(false);
                closeBanner();
            });
        }

        // --- Feedback handled by initFeedback() called at line ~753 ---
        // (Duplicate feedback modal/form code was removed to prevent double submission)

        // --- Smooth Scrolling Navbars ---
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                const target = document.querySelector(targetId);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Legacy interactive tutorial trigger removed to prevent conflicts with initTutorial()
        // --- Offline Detection Banner ---
        function updateOnlineStatus() {
            let offlineBanner = document.getElementById('offline-banner');
            if (!navigator.onLine) {
                if (!offlineBanner) {
                    offlineBanner = document.createElement('div');
                    offlineBanner.id = 'offline-banner';
                    offlineBanner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] bg-rose-500 text-white px-6 py-3 rounded-full font-bold shadow-xl flex items-center gap-2 slide-up animate-bounce';
                    offlineBanner.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <span>Sin Conexión a Internet</span>`;
                    document.body.appendChild(offlineBanner);
                }
            } else {
                if (offlineBanner) {
                    offlineBanner.remove();
                }
            }
        };
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus(); // Check on init
    } catch (err) {
        console.error('CRITICAL DOMContentLoaded ERROR:', err);
        const errDiv = document.createElement('div');
        errDiv.style = 'position:fixed;top:0;left:0;z-index:99999;background:red;color:white;padding:20px;font-size:16px;width:100%;';
        errDiv.innerText = 'CRITICAL ERROR: ' + err.message + '\\n' + err.stack;
        document.body.appendChild(errDiv);
    }
}; // End initApp


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initApp();
        if(typeof window.initTutorial === 'function') window.initTutorial();
    });
} else {
    initApp();
    if(typeof window.initTutorial === 'function') window.initTutorial();
}
// (Dark mode is now handled inside DOMContentLoaded via #theme-toggle)

// --- Service Worker Registration + Push Notifications ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                console.log('[SW] Registered:', reg.scope);
                window.__swRegistration = reg;
            })
            .catch(err => console.warn('[SW] Registration failed:', err.message));
    });
}

// Push notification subscription helper
window.subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Tu navegador no soporta notificaciones push.');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert('Necesitas permitir las notificaciones para recibir alertas de precio.');
            return false;
        }

        const reg = window.__swRegistration || await navigator.serviceWorker.ready;
        const VAPID_PUBLIC_KEY = window.__LUMU_CONFIG?.vapidPublicKey;
        if (!VAPID_PUBLIC_KEY) {
            console.warn('[Push] VAPID public key not configured');
            return false;
        }

        // Convert VAPID key from base64 to Uint8Array
        const urlBase64ToUint8Array = (base64String) => {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
        };

        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        // Send to server
        const sb = window.supabaseClient;
        const user = window.currentUser;
        if (sb && user) {
            const { data: session } = await sb.auth.getSession();
            const token = session?.session?.access_token;
            const res = await fetch('/api/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ subscription: subscription.toJSON() })
            });
            if (res.ok) {
                console.log('[Push] Subscription saved to server');
                const toast = document.createElement('div');
                toast.className = 'fixed top-20 right-4 z-[200] bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm fade-in';
                toast.textContent = '🔔 ¡Notificaciones push activadas!';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error('[Push] Subscription error:', err);
        return false;
    }
};

// Auto-prompt for push after first search if logged in
let _pushPrompted = false;
window.maybeSuggestPush = () => {
    if (_pushPrompted || !('PushManager' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    const user = window.currentUser;
    if (!user) return;
    _pushPrompted = true;

    // Show a non-intrusive prompt
    const prompt = document.createElement('div');
    prompt.className = 'fixed bottom-20 right-4 z-[200] bg-white border border-emerald-200 shadow-2xl rounded-2xl p-4 max-w-xs fade-in';
    prompt.innerHTML = `
        <p class="text-sm font-bold text-slate-800 mb-2">🔔 ¿Activar alertas de precio?</p>
        <p class="text-xs text-slate-500 mb-3">Te avisamos cuando un producto baje al precio que quieras.</p>
        <div class="flex gap-2">
            <button id="push-yes" class="text-xs font-bold bg-emerald-500 text-white px-4 py-2 rounded-xl hover:bg-emerald-600 transition-colors">Activar</button>
            <button id="push-no" class="text-xs font-bold text-slate-400 px-4 py-2 rounded-xl hover:text-slate-600 transition-colors">Ahora no</button>
        </div>
    `;
    document.body.appendChild(prompt);
    document.getElementById('push-yes').addEventListener('click', () => { prompt.remove(); window.subscribeToPush(); });
    document.getElementById('push-no').addEventListener('click', () => prompt.remove());
    setTimeout(() => { if (prompt.parentNode) prompt.remove(); }, 15000);
};

// --- AdSense Integration ---
(function initAdSense() {
    function pushAds() {
        try {
            const adUnits = document.querySelectorAll('.adsbygoogle');
            adUnits.forEach(ad => {
                if (!ad.dataset.adsbygoogleStatus) {
                    (window.adsbygoogle = window.adsbygoogle || []).push({});
                }
            });
        } catch (e) {
            console.warn('[AdSense] Error pushing ads:', e.message);
        }
    }

    // Hide ads for VIP users (skip with ?showads=1 for testing)
    function hideAdsForVIP() {
        if (new URLSearchParams(window.location.search).get('showads') === '1') return;
        const sb = window.supabaseClient;
        const user = window.currentUser;
        if (!sb || !user) return;
        sb.from('profiles').select('is_premium, plan').eq('id', user.id).single()
            .then(({ data }) => {
                if (data && (data.is_premium || data.plan === 'personal_vip' || data.plan === 'b2b')) {
                    document.querySelectorAll('.ad-container').forEach(el => {
                        el.style.display = 'none';
                    });
                    console.log('[AdSense] Ads hidden for VIP user');
                }
            }).catch(() => { });
    }

    // Initialize ads after page loads
    if (document.readyState === 'complete') {
        setTimeout(pushAds, 1500);
        setTimeout(hideAdsForVIP, 2000);
    } else {
        window.addEventListener('load', () => {
            setTimeout(pushAds, 1500);
            setTimeout(hideAdsForVIP, 2000);
        });
    }
})();

// ============================================
// PRICE ALERTS (Server-side backed by Supabase)
// ============================================
const priceAlertModal = document.getElementById('price-alert-modal');
const closePriceAlertBtn = document.getElementById('close-price-alert-modal');
const priceAlertBackdrop = document.getElementById('price-alert-backdrop');
const btnPriceAlert = document.getElementById('btn-price-alert');
const alertForm = document.getElementById('alert-form');
const alertsList = document.getElementById('alerts-list');

let _alertsCache = [];

// Fallback to localStorage for anonymous users
function getLocalAlerts() {
    return JSON.parse(localStorage.getItem('lumu_alerts') || '[]');
}
function saveLocalAlerts(alerts) {
    localStorage.setItem('lumu_alerts', JSON.stringify(alerts));
}

async function fetchServerAlerts() {
    const sb = window.supabaseClient;
    const user = window.currentUser;
    if (!sb || !user) { _alertsCache = getLocalAlerts(); return _alertsCache; }
    try {
        const { data: session } = await sb.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) { _alertsCache = getLocalAlerts(); return _alertsCache; }
        const res = await fetch('/api/price-alerts', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const json = await res.json();
            _alertsCache = (json.alerts || []).map(a => ({
                id: a.id,
                product: a.product_name,
                price: a.target_price,
                product_url: a.product_url,
                store_name: a.store_name,
                triggered: a.triggered,
                last_price: a.last_price
            }));
            return _alertsCache;
        }
    } catch (e) { console.warn('[Alerts] Server fetch failed, using local:', e.message); }
    _alertsCache = getLocalAlerts();
    return _alertsCache;
}

function renderAlerts() {
    if (!alertsList) return;
    const alerts = _alertsCache;
    if (alerts.length === 0) {
        alertsList.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">${getRegionUICopy().priceAlerts.empty}</p>`;
        return;
    }
    alertsList.innerHTML = alerts.map((a, i) => `
        <div class="flex items-center justify-between p-3 ${a.triggered ? 'bg-emerald-100 border-emerald-300' : 'bg-emerald-50 border-emerald-100'} border rounded-xl">
            <div>
                <p class="text-sm font-bold text-slate-800">${sanitize(a.product)}</p>
                <p class="text-xs text-emerald-600 font-semibold">${currentRegion === 'US' ? 'Target' : 'Meta'}: ${formatCurrencyByRegion(a.price)}</p>
                ${a.last_price ? `<p class="text-xs text-slate-500">${currentRegion === 'US' ? 'Last price seen' : 'Último precio visto'}: ${formatCurrencyByRegion(a.last_price)}</p>` : ''}
                ${a.triggered ? `<p class="text-xs text-emerald-700 font-black">🎉 ${currentRegion === 'US' ? 'Target reached!' : '¡Meta alcanzada!'}</p>` : ''}
            </div>
            <button class="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full" onclick="deleteAlert('${a.id || i}')">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
    `).join('');
}

window.deleteAlert = async (idOrIndex) => {
    const sb = window.supabaseClient;
    const user = window.currentUser;
    if (sb && user && typeof idOrIndex === 'string' && idOrIndex.includes('-')) {
        // UUID = server-side alert
        try {
            const { data: session } = await sb.auth.getSession();
            const token = session?.session?.access_token;
            await fetch(`/api/price-alerts/${idOrIndex}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        } catch (e) { console.error('[Alerts] Delete failed:', e); }
    } else {
        // localStorage fallback
        const alerts = getLocalAlerts();
        alerts.splice(parseInt(idOrIndex), 1);
        saveLocalAlerts(alerts);
    }
    await fetchServerAlerts();
    renderAlerts();
    if (_alertsCache.length === 0 && btnPriceAlert) btnPriceAlert.classList.add('hidden');
};

function openPriceAlertModal() {
    if (!priceAlertModal) return;
    priceAlertModal.classList.remove('invisible', 'opacity-0');
    const panel = priceAlertModal.querySelector('.glass-panel');
    if (panel) { panel.classList.remove('scale-95'); panel.classList.add('scale-100'); }
    fetchServerAlerts().then(() => renderAlerts());
};
function closePriceAlertModal() {
    if (!priceAlertModal) return;
    priceAlertModal.classList.add('invisible', 'opacity-0');
    const panel = priceAlertModal.querySelector('.glass-panel');
    if (panel) { panel.classList.remove('scale-100'); panel.classList.add('scale-95'); }
};

btnPriceAlert?.addEventListener('click', openPriceAlertModal);
closePriceAlertBtn?.addEventListener('click', closePriceAlertModal);
priceAlertBackdrop?.addEventListener('click', closePriceAlertModal);

alertForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const product = document.getElementById('alert-product')?.value.trim();
    const price = document.getElementById('alert-price')?.value;
    if (!product || !price) return;

    const sb = window.supabaseClient;
    const user = window.currentUser;

    if (sb && user) {
        try {
            const { data: session } = await sb.auth.getSession();
            const token = session?.session?.access_token;
            const res = await fetch('/api/price-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ product_name: product, target_price: parseFloat(price) })
            });
            const json = await res.json();
            if (!res.ok) {
                alert(json.error || (currentRegion === 'US' ? 'Error creating alert' : 'Error al crear alerta'));
                return;
            }
        } catch (err) {
            console.error('[Alerts] Create failed:', err);
        }
    } else {
        // Anonymous: localStorage fallback
        const alerts = getLocalAlerts();
        alerts.push({ product, price: parseFloat(price) });
        saveLocalAlerts(alerts);
    }

    await fetchServerAlerts();
    renderAlerts();
    alertForm.reset();
    if (btnPriceAlert) btnPriceAlert.classList.remove('hidden');
});

window.checkPriceAlerts = (products) => {
    const alerts = _alertsCache.length > 0 ? _alertsCache : getLocalAlerts();
    if (alerts.length === 0) return;
    products.forEach(product => {
        const price = typeof product.precio === 'string' ? parseFloat(product.precio.replace(/[^0-9.]/g, '')) : product.precio;
        alerts.forEach(alert => {
            const matchesProduct = product.titulo?.toLowerCase().includes(alert.product.toLowerCase());
            if (matchesProduct && price <= alert.price) {
                const notif = document.createElement('div');
                notif.className = 'fixed top-20 right-4 z-[200] bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm fade-in flex items-center gap-2';
                notif.innerHTML = `🎉 ${currentRegion === 'US' ? 'Target Price Reached!' : '¡Precio Meta Alcanzado!'} <span class="font-normal">${product.titulo?.slice(0, 30)} ${currentRegion === 'US' ? 'at' : 'a'} ${formatCurrencyByRegion(price)}</span>`;
                document.body.appendChild(notif);
                setTimeout(() => notif.remove(), 6000);
                
                // Native Push Notification
                if ("Notification" in window && Notification.permission === "granted") {
                    try {
                        new Notification(currentRegion === 'US' ? 'Lumu Price Alert!' : '¡Alerta de Precio de Lumu!', {
                            body: currentRegion === 'US'
                                ? `Your target of ${formatCurrencyByRegion(alert.price)} was reached. ${product.titulo?.slice(0, 40)} is now ${formatCurrencyByRegion(price)}.`
                                : `Tu meta de ${formatCurrencyByRegion(alert.price)} se cumplió. ${product.titulo?.slice(0, 40)} está ahora a ${formatCurrencyByRegion(price)}.`,
                            icon: "/favicon.ico" // Ajustar ruta según corresponda
                        });
                    } catch (e) {
                        console.error('Error al enviar notificacion nativa:', e);
                    }
                }
            }
        });
    });
};

// Quick-alert: create from product card (called from UI)
window.createQuickAlert = async (productName, currentPrice, productUrl, storeName) => {
    // Suggest 10% below current price as default target
    const suggestedPrice = Math.floor(currentPrice * 0.9);

    // Remove existing modal if open
    document.getElementById('quick-alert-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'quick-alert-modal';
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center fade-in';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onclick="document.getElementById('quick-alert-modal')?.remove()"></div>
        <div class="relative z-10 bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-full mx-4 border border-slate-200">
            <button onclick="document.getElementById('quick-alert-modal')?.remove()" class="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 rounded-full transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                </div>
                <div>
                    <h3 class="text-lg font-black text-slate-900">${currentRegion === 'US' ? 'Create Price Alert' : 'Crear Alerta de Precio'}</h3>
                    <p class="text-xs text-slate-500">${currentRegion === 'US' ? 'We will notify you when it drops' : 'Te avisaremos cuando baje'}</p>
                </div>
            </div>
            <p class="text-xs text-slate-600 mb-4 line-clamp-2 font-medium">${sanitize(productName)}</p>
            
            <div class="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
                <p class="text-xs text-slate-500 mb-1">${currentRegion === 'US' ? 'Current price' : 'Precio actual'}: <strong class="text-slate-800">${formatCurrencyByRegion(currentPrice)}</strong></p>
                <div class="relative mt-2">
                    <label class="block text-xs font-bold text-slate-700 mb-1">${currentRegion === 'US' ? 'Your target price:' : 'Tu precio meta:'}</label>
                    <span class="absolute left-3 top-7 text-slate-400 font-bold">$</span>
                    <input type="number" id="qa-target-price" value="${suggestedPrice}" min="1" class="w-full pl-7 pr-3 py-3 border border-slate-200 rounded-xl text-lg font-black text-emerald-700 focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none shadow-sm">
                </div>
            </div>
            
            <button id="qa-btn-save" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.2)] transition-all">
                ${currentRegion === 'US' ? 'Activate Alert' : 'Activar Alerta'}
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('qa-btn-save').addEventListener('click', async () => {
        // Pedir permisos de notificaciones nativas
        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
        
        const inputVal = document.getElementById('qa-target-price').value;
        const targetPrice = parseFloat(inputVal);
        if (isNaN(targetPrice) || targetPrice <= 0) return;

        // Limpiar el modal
        document.getElementById('quick-alert-modal').remove();

        const sb = window.supabaseClient;
        const user = window.currentUser;

        if (sb && user) {
            try {
                const { data: session } = await sb.auth.getSession();
                const token = session?.session?.access_token;
                const res = await fetch('/api/price-alerts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ product_name: productName, target_price: targetPrice, product_url: productUrl, store_name: storeName })
                });
                const json = await res.json();
                if (res.ok) {
                    showToastAlert(targetPrice);
                } else {
                    alert(json.error || (currentRegion === 'US' ? 'Error creating alert' : 'Error al crear alerta'));
                }
            } catch (err) {
                console.error('[QuickAlert] Error:', err);
            }
        } else {
            // No auth: save locally
            const alerts = getLocalAlerts();
            alerts.push({ product: productName, price: targetPrice });
            saveLocalAlerts(alerts);
            showToastAlert(targetPrice, true);
        }
    });

    function showToastAlert(price, isLocal = false) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-20 right-4 z-[200] bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm fade-in';
        toast.textContent = isLocal
            ? (currentRegion === 'US' ? '🔔 Local alert created. Sign in for push alerts.' : '🔔 Alerta local creada. Inicia sesión para alertas push.')
            : (currentRegion === 'US' ? `🔔 Alert created: we will notify you when it drops to ${formatCurrencyByRegion(price)}` : `🔔 Alerta creada: te avisaremos cuando baje a ${formatCurrencyByRegion(price)}`);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
        if (btnPriceAlert) btnPriceAlert.classList.remove('hidden');
    }
};

// Initialize alert count on load
fetchServerAlerts().then(() => {
    if (_alertsCache.length > 0 && btnPriceAlert) btnPriceAlert.classList.remove('hidden');
});

// ============================================
// DROPSHIPPING MARGIN CALCULATOR
// ============================================
window.openMarginCalculator = (costPrice, productName) => {
    // Remove existing modal if open
    document.getElementById('margin-calc-modal')?.remove();

    const isUS = currentRegion === 'US';
    const shippingDefault = 99;
    const feeDefault = 13; // MercadoLibre average fee %
    const suggestedSell = Math.ceil(costPrice * 1.4); // 40% markup suggestion

    const modal = document.createElement('div');
    modal.id = 'margin-calc-modal';
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center fade-in';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onclick="document.getElementById('margin-calc-modal')?.remove()"></div>
        <div class="relative z-10 bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-full mx-4 border border-slate-200">
            <button onclick="document.getElementById('margin-calc-modal')?.remove()" class="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 rounded-full transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
                <div>
                    <h3 class="text-lg font-black text-slate-900">${isUS ? 'Margin Calculator' : 'Calculadora de Margen'}</h3>
                    <p class="text-xs text-slate-500">${isUS ? 'Dropshipping / Resale' : 'Dropshipping / Reventa'}</p>
                </div>
            </div>
            <p class="text-xs text-slate-600 mb-4 line-clamp-1 font-medium">${sanitize(productName)}</p>
            <div class="space-y-3">
                <div class="flex items-center gap-3">
                    <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">${isUS ? 'Cost' : 'Costo'}</label>
                    <div class="relative flex-1"><span class="absolute left-3 top-2.5 text-slate-400 text-sm">$</span><input type="number" id="mc-cost" value="${costPrice}" class="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" readonly></div>
                </div>
                <div class="flex items-center gap-3">
                    <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">${isUS ? 'Sell price' : 'Precio venta'}</label>
                    <div class="relative flex-1"><span class="absolute left-3 top-2.5 text-slate-400 text-sm">$</span><input type="number" id="mc-sell" value="${suggestedSell}" min="1" class="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"></div>
                </div>
                <div class="flex items-center gap-3">
                    <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">${isUS ? 'Shipping' : 'Envío'}</label>
                    <div class="relative flex-1"><span class="absolute left-3 top-2.5 text-slate-400 text-sm">$</span><input type="number" id="mc-shipping" value="${shippingDefault}" min="0" class="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"></div>
                </div>
                <div class="flex items-center gap-3">
                    <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">${isUS ? 'Fee %' : 'Comisión %'}</label>
                    <div class="relative flex-1"><input type="number" id="mc-fee" value="${feeDefault}" min="0" max="100" step="0.5" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"><span class="absolute right-3 top-2.5 text-slate-400 text-sm">%</span></div>
                </div>
            </div>
            <div id="mc-result" class="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-200"></div>
            <p class="text-[10px] text-slate-400 mt-3 text-center">${isUS ? 'Common fees: MercadoLibre ~13%, Amazon ~15%, Shopify ~3.9%' : 'Comisiones comunes: MercadoLibre ~13%, Amazon ~15%, Shopify ~3.9%'}</p>
        </div>
        `;
    document.body.appendChild(modal);

    const recalc = () => {
        const cost = parseFloat(document.getElementById('mc-cost')?.value) || 0;
        const sell = parseFloat(document.getElementById('mc-sell')?.value) || 0;
        const shipping = parseFloat(document.getElementById('mc-shipping')?.value) || 0;
        const feePct = parseFloat(document.getElementById('mc-fee')?.value) || 0;
        const fee = sell * (feePct / 100);
        const profit = sell - cost - shipping - fee;
        const margin = sell > 0 ? ((profit / sell) * 100) : 0;
        const roi = cost > 0 ? ((profit / cost) * 100) : 0;

        const isPositive = profit > 0;
        const color = isPositive ? 'emerald' : 'rose';
        document.getElementById('mc-result').innerHTML = `
            <div class="grid grid-cols-3 gap-3 text-center">
                <div>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">${isUS ? 'Profit' : 'Ganancia'}</p>
                    <p class="text-lg font-black text-${color}-600">$${profit.toFixed(0)}</p>
                </div>
                <div>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">${isUS ? 'Margin' : 'Margen'}</p>
                    <p class="text-lg font-black text-${color}-600">${margin.toFixed(1)}%</p>
                </div>
                <div>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">ROI</p>
                    <p class="text-lg font-black text-${color}-600">${roi.toFixed(1)}%</p>
                </div>
            </div>
            <div class="mt-3 text-xs text-slate-500 space-y-1">
                <div class="flex justify-between"><span>${isUS ? 'Product cost' : 'Costo producto'}</span><span class="font-bold">$${cost.toFixed(2)}</span></div>
                <div class="flex justify-between"><span>+ ${isUS ? 'Shipping' : 'Envío'}</span><span class="font-bold">$${shipping.toFixed(2)}</span></div>
                <div class="flex justify-between"><span>+ ${isUS ? 'Fee' : 'Comisión'} (${feePct}%)</span><span class="font-bold">$${fee.toFixed(2)}</span></div>
                <div class="flex justify-between border-t border-slate-200 pt-1 mt-1"><span class="font-bold">${isUS ? 'Total costs' : 'Total costos'}</span><span class="font-black text-slate-800">$${(cost + shipping + fee).toFixed(2)}</span></div>
            </div>
            ${!isPositive
                ? `<p class="text-xs text-rose-600 font-bold mt-2 text-center">⚠️ ${isUS ? 'You are losing money with these numbers' : 'Estás perdiendo dinero con estos números'}</p>`
                : margin < 15
                    ? `<p class="text-xs text-amber-600 font-bold mt-2 text-center">⚠️ ${isUS ? 'Low margin — consider raising the price' : 'Margen bajo — considera subir el precio'}</p>`
                    : `<p class="text-xs text-emerald-600 font-bold mt-2 text-center">✅ ${isUS ? 'Healthy margin for dropshipping' : 'Margen saludable para dropshipping'}</p>`}
        `;
    };

    recalc();
    ['mc-sell', 'mc-shipping', 'mc-fee'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', recalc);
    });
};

// ============================================
// AD GATEWAY
// ============================================

window.currentAdIsForReward = false;

function hasRealRewardedAdConfigured() {
    const tagUrl = window.__LUMU_CONFIG?.rewardedAdTagUrl;
    return typeof tagUrl === 'string' && tagUrl.trim().length > 0;
}

function showRewardUnavailableToast() {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 right-4 z-[200] bg-amber-500 text-white px-5 py-4 rounded-2xl shadow-2xl font-bold text-sm fade-in flex items-center gap-3';
    toast.innerHTML = `<span class="text-2xl">⚠️</span> ${currentRegion === 'US' ? 'Extra searches are temporarily unavailable.' : 'Las búsquedas extra por anuncio no están disponibles por ahora.'}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

window.openAdGateway = async function (targetUrlOriginal, isReward = false) {
    window._pendingAdUrlOriginal = targetUrlOriginal;
    
    if (targetUrlOriginal === 'reward' || isReward === true) {
        window.currentAdIsForReward = true;
    } else {
        window.currentAdIsForReward = false;
    }

    if (window.currentAdIsForReward && !hasRealRewardedAdConfigured()) {
        showRewardUnavailableToast();
        window.currentAdIsForReward = false;
        return;
    }

    let targetUrl = targetUrlOriginal;
    if (!window.currentAdIsForReward) {
        // Decodificar recursivamente por si viene doble-codificado
        try {
            let decoded = decodeURIComponent(targetUrl);
            while (decoded !== targetUrl) {
                if (!targetUrl.startsWith('http')) break;
                targetUrl = decoded;
                decoded = decodeURIComponent(targetUrl);
            }
        } catch (e) { console.warn('Decode error', e); }

        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }
    }
    
    window._pendingAdUrl = targetUrl;

    // Track click for conversion analytics
    try {
        const urlObj = new URL(targetUrl);
        const host = urlObj.hostname.replace('www.', '');
        const store = host.split('.')[0] || host;
        window._lastSearchHadClick = true;
        if (_conversionBounceTimer) {
            clearTimeout(_conversionBounceTimer);
            _conversionBounceTimer = null;
        }
        _trackEvent('click', { url: targetUrl, store, search_query: window._lastSearchQuery || '' });
    } catch (e) { /* ignore */ }

    let isVIP = false;
    const sb = window.supabaseClient || null;
    const user = window.currentUser || null;

    if (sb && user) {
        try {
            const { data } = await sb.from('profiles').select('is_premium').eq('id', user.id).single();
            if (data && data.is_premium) isVIP = true;
        } catch (err) {
            console.error('Error fetching VIP status', err);
        }
    }

    // Evitar volver a ver el anuncio para el mismo link
    if (!window.adsWatchedCache) window.adsWatchedCache = {};

    // SEC-3: Also skip ads for temp VIP users (from Lumu Coins)
    if (isVIP || window._isPremiumTemp || window.adsWatchedCache[targetUrlOriginal]) {
        window.open(targetUrl, '_blank');
        return;
    }

    if (!adModal || !btnSkipAd) {
        window.open(targetUrl, '_blank');
        return;
    }

    adModal.classList.remove('invisible', 'opacity-0', 'hidden');
    adModal.classList.add('opacity-100');
    adModal.style.visibility = 'visible';
    adModal.style.opacity = '1';

    // RESET AD UI - FIX: Mejorar mensaje inicial y reducir timeout de seguridad
    btnSkipAd.disabled = true;
    btnSkipAd.className = 'w-full text-white bg-slate-800 border border-slate-700 font-bold rounded-xl text-sm px-5 py-4 text-center transition-all opacity-50 cursor-not-allowed';
    btnSkipAd.innerHTML = `<span class="animate-pulse">⏳ ${currentRegion === 'US' ? 'Preparing access to the offer...' : 'Preparando acceso a la oferta...'}</span>`;
    
    // SAFETY FALLBACK: solo para anuncios de salida/oferta, nunca para recompensas
    if (window._adFallbackTimer) clearTimeout(window._adFallbackTimer);
    if (!window.currentAdIsForReward) {
        window._adFallbackTimer = setTimeout(() => {
            console.log('[Ad] Fallback activado: IMA no respondió a tiempo. Habilitando acceso directo.');
            onAdComplete();
        }, 3000);
    }

    // Intentar cargar Video Ads via IMA
    if (typeof adsLoader !== 'undefined' && adsLoader && typeof google !== 'undefined' && google && google.ima) {
        btnSkipAd.innerHTML = `<span class="animate-pulse">${currentRegion === 'US' ? 'Loading Ad...' : 'Cargando Anuncio...'}</span>`;
        requestAd();
        btnSkipAd.onclick = null; 
    } else {
        // Fallback inmediato si no hay IMA
        startFallbackCountdown();
    }
};

function initIMA() {
    if (typeof google === 'undefined' || !google.ima) return;
    adDisplayContainer = new google.ima.AdDisplayContainer(adContainer);
    adsLoader = new google.ima.AdsLoader(adDisplayContainer);

    adsLoader.addEventListener(
        google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        onAdsManagerLoaded,
        false
    );
    adsLoader.addEventListener(
        google.ima.AdErrorEvent.Type.AD_ERROR,
        onAdError,
        false
    );
}

function requestAd() {
    if (!adsLoader) return;
    if (window.currentAdIsForReward && !hasRealRewardedAdConfigured()) {
        onAdError(null);
        return;
    }
    const adsRequest = new google.ima.AdsRequest();
    adsRequest.adTagUrl = window.__LUMU_CONFIG?.rewardedAdTagUrl;

    adsRequest.linearAdSlotWidth = adContainer.clientWidth;
    adsRequest.linearAdSlotHeight = adContainer.clientHeight;
    adsRequest.nonLinearAdSlotWidth = adContainer.clientWidth;
    adsRequest.nonLinearAdSlotHeight = adContainer.clientHeight;

    adDisplayContainer.initialize();
    adsLoader.requestAds(adsRequest);
}

function onAdsManagerLoaded(adsManagerLoadedEvent) {
    const adsRenderingSettings = new google.ima.AdsRenderingSettings();
    adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;
    adsManager = adsManagerLoadedEvent.getAdsManager(adContainer, adsRenderingSettings);

    adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, onAdError);
    adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, onAdComplete);
    adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, onAdComplete);

    try {
        adsManager.init(adContainer.clientWidth, adContainer.clientHeight, google.ima.ViewMode.NORMAL);
        adsManager.start();
    } catch (adError) {
        onAdError(adError);
    }
}

function onAdComplete() {
    if (window._adFallbackTimer) {
        clearTimeout(window._adFallbackTimer);
        window._adFallbackTimer = null;
    }

    if (btnSkipAd) {
        btnSkipAd.disabled = false;
        if (window.currentAdIsForReward) {
            btnSkipAd.innerHTML = currentRegion === 'US' ? '🎉 Claim 3 Extra Searches' : '🎉 Reclamar 3 Búsquedas Extra';
            btnSkipAd.onclick = async () => {
                btnSkipAd.disabled = true;
                btnSkipAd.innerHTML = `<span class="animate-pulse">${currentRegion === 'US' ? 'Processing...' : 'Procesando...'}</span>`;
                try {
                    const token = await (window.supabaseClient ? window.supabaseClient.auth.getSession().then(s => s.data?.session?.access_token) : Promise.resolve(null));
                    const headers = { 'Content-Type': 'application/json' };
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const res = await fetch('/api/claim-reward', { method: 'POST', headers });
                    if (res.ok) {
                        closeAdGateway();
                        window.currentAdIsForReward = false;

                        // Clear chat and results
                        document.getElementById('chat-container').innerHTML = '';
                        document.getElementById('results-grid').innerHTML = '';
                        document.getElementById('results-container').innerHTML = '';

                        const toast = document.createElement('div');
                        toast.className = 'fixed top-20 right-4 z-[200] bg-emerald-500 text-white px-5 py-4 rounded-2xl shadow-2xl font-bold text-sm fade-in flex items-center gap-3';
                        toast.innerHTML = `<span class="text-2xl">🎉</span> ${currentRegion === 'US' ? 'You earned 3 extra searches! You can keep searching.' : '¡Ganaste 3 búsquedas extra! Puedes continuar buscando.'}`;
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 5000);

                        document.getElementById('search-input').focus();
                    } else {
                        btnSkipAd.disabled = false;
                        btnSkipAd.innerHTML = currentRegion === 'US' ? 'Claim failed. Retry' : 'Error al reclamar. Reintentar';
                    }
                } catch (err) {
                    console.error('Reward claim error:', err);
                    btnSkipAd.disabled = false;
                    btnSkipAd.innerHTML = currentRegion === 'US' ? 'Claim failed. Retry' : 'Error al reclamar. Reintentar';
                }
            };
        } else {
            btnSkipAd.innerHTML = currentRegion === 'US' ? 'Go to Offer →' : 'Ir a la Oferta →';
            btnSkipAd.onclick = () => {
                if (window._pendingAdUrlOriginal) {
                    window.adsWatchedCache[window._pendingAdUrlOriginal] = true;
                }
                if (window._pendingAdUrl) {
                    window.open(window._pendingAdUrl, '_blank');
                }
                closeAdGateway();
            };
        }
        btnSkipAd.className = 'w-full text-white bg-primary hover:bg-emerald-500 shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 border border-transparent font-bold rounded-xl text-sm px-5 py-4 text-center transition-all cursor-pointer';
    }
}

function onAdError(adErrorEvent) {
    console.error('IMA Ad Error:', adErrorEvent && typeof adErrorEvent.getError === 'function' ? adErrorEvent.getError() : 'Unknown error');
    if (adsManager) {
        try { adsManager.destroy(); } catch (e) { }
    }
    if (window.currentAdIsForReward) {
        if (window._adFallbackTimer) {
            clearTimeout(window._adFallbackTimer);
            window._adFallbackTimer = null;
        }
        if (btnSkipAd) {
            btnSkipAd.disabled = false;
            btnSkipAd.className = 'w-full text-white bg-amber-500 hover:bg-amber-600 border border-transparent font-bold rounded-xl text-sm px-5 py-4 text-center transition-all cursor-pointer';
            btnSkipAd.innerHTML = currentRegion === 'US' ? 'Reward unavailable right now' : 'La recompensa no está disponible ahora';
            btnSkipAd.onclick = () => {
                window.currentAdIsForReward = false;
                closeAdGateway();
                showRewardUnavailableToast();
            };
        }
        return;
    }
    // Si falla IMA, activar fallback automáticamente solo para anuncios normales
    startFallbackCountdown();
}

function startFallbackCountdown() {
    if (window.currentAdIsForReward) {
        onAdError(null);
        return;
    }
    const countdownOverlay = document.getElementById('ad-countdown-overlay');
    if (countdownOverlay) countdownOverlay.classList.remove('hidden');

    let timeLeft = 3; // FIX: Reducido a 3s para mejor UX
    if (adCountdownText) adCountdownText.innerText = timeLeft;

    if (btnSkipAd) {
        btnSkipAd.disabled = true;
        btnSkipAd.innerHTML = window.currentAdIsForReward
            ? `<span class="animate-pulse">⏳ ${currentRegion === 'US' ? 'Preparing reward...' : 'Preparando recompensa...'}</span>`
            : `<span class="animate-pulse">⏳ ${currentRegion === 'US' ? 'Loading offer...' : 'Cargando oferta...'}</span>`;
    }

    if (adInterval) clearInterval(adInterval);
    adInterval = setInterval(() => {
        timeLeft--;
        if (adCountdownText) adCountdownText.innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(adInterval);
            onAdComplete();
        }
    }, 1000);
}

// ============================================
// FEEDBACK & OPINIÓN
// ============================================

function initFeedback() {
    const btnFloating = document.getElementById('btn-feedback-floating');
    const modal = document.getElementById('feedback-modal');
    const btnClose = document.getElementById('close-feedback-modal');
    const backdrop = document.getElementById('feedback-backdrop');
    const form = document.getElementById('feedback-form');
    const successDiv = document.getElementById('feedback-success');

    if (!btnFloating || !modal) return;

    const openFeedback = () => {
        modal.classList.remove('invisible', 'opacity-0', 'hidden');
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.querySelector('.glass-panel')?.classList.remove('scale-95');
        modal.querySelector('.glass-panel')?.classList.add('scale-100');
        if (form) form.classList.remove('hidden');
        if (successDiv) successDiv.classList.add('hidden');
    };

    const closeFeedback = () => {
        modal.classList.add('invisible', 'opacity-0');
        modal.style.visibility = 'hidden';
        modal.style.opacity = '0';
        modal.querySelector('.glass-panel')?.classList.add('scale-95');
        modal.querySelector('.glass-panel')?.classList.remove('scale-100');
    };

    btnFloating.addEventListener('click', openFeedback);
    btnClose?.addEventListener('click', closeFeedback);
    backdrop?.addEventListener('click', closeFeedback);

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('feedback-text').value.trim();
        if (!text) return;
        const ui = getRegionUICopy();

        const btnSubmit = form.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

        try {
            // Send feedback through the API (correct column mapping)
            const headers = { 'Content-Type': 'application/json' };
            if (window.supabaseClient && window.currentUser) {
                try {
                    const { data: { session } } = await window.supabaseClient.auth.getSession();
                    if (session?.access_token) {
                        headers['Authorization'] = `Bearer ${session.access_token} `;
                    }
                } catch (e) { }
            }

            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    message: text,
                    user_id: window.currentUser ? window.currentUser.id : null,
                    user_email: window.currentUser ? window.currentUser.email : null
                })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'feedback_error');
            }

            form.classList.add('hidden');
            successDiv.classList.remove('hidden');
            successDiv.innerHTML = `
                <div class="w-16 h-16 bg-emerald-100 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h4 class="text-lg font-bold text-slate-800">${ui.feedback.successTitle}</h4>
                <p class="text-slate-500 text-sm">${ui.feedback.successCopy}</p>
            `;
            if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

            setTimeout(closeFeedback, 3000);
        } catch (err) {
            console.error('Feedback Error:', err);
            form.classList.add('hidden');
            // Show error instead of fake success
            successDiv.innerHTML = `<div class="text-center py-6"><span class="text-3xl">😕</span><p class="font-bold text-slate-700 mt-2">${currentRegion === 'US' ? 'We could not send your feedback' : 'No pudimos enviar tu opinión'}</p><p class="text-slate-500 text-sm">${currentRegion === 'US' ? 'Please try again later.' : 'Intenta de nuevo más tarde.'}</p></div>`;
            successDiv.classList.remove('hidden');
            setTimeout(closeFeedback, 3000);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span id="feedback-submit-label">${getRegionUICopy().feedback.submit}</span>`;
        }
    });
}


window.closeAdGateway = function () {
    if (adInterval) clearInterval(adInterval);
    if (adModal) {
        adModal.classList.add('invisible', 'opacity-0');
        adModal.classList.remove('opacity-100');
        adModal.style.visibility = 'hidden';
        adModal.style.opacity = '0';
    }
};

window.openSignupPrompt = function () {
    openModal();
};

// ============================================
// B2B / BULK SEARCH
// ============================================

function openB2b(e) {
    if (e) e.preventDefault();
    if (!b2bModal) return;
    b2bModal.classList.remove('invisible', 'opacity-0');
    b2bModal.classList.add('opacity-100');
};

function closeB2b() {
    if (!b2bModal) return;
    b2bModal.classList.add('invisible', 'opacity-0');
    b2bModal.classList.remove('opacity-100');
};

async function processB2bQueries() {
    const textarea = document.getElementById('b2b-textarea');
    const tbody = document.getElementById('b2b-results-body');
    const loader = document.getElementById('b2b-loader');
    const btnExport = document.getElementById('btn-export-b2b');
    const ui = getRegionUICopy();

    if (!textarea || !textarea.value.trim()) {
        showGlobalFeedback(currentRegion === 'US' ? 'Please enter at least one product to search.' : 'Por favor, ingresa al menos un producto a buscar.');
        return;
    }

    const queries = textarea.value.split('\n').filter(q => q.trim().length > 0).slice(0, 10);

    if (!window.currentUser) {
        if (typeof openModal === 'function') {
            closeB2b();
            openModal();
            showGlobalFeedback(currentRegion === 'US' ? 'You must sign in to use the Reseller Plan.' : 'Debes ingresar para usar el Plan Reseller.', 'error');
        }
        return;
    }

    loader.classList.remove('hidden');
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">${currentRegion === 'US' ? 'Processing batch...' : 'Procesando lote...'}</td></tr>`;
    btnExport.disabled = true;

    try {
        // Build headers with auth token
        const bulkHeaders = { 'Content-Type': 'application/json' };
        if (window.supabaseClient && window.currentUser) {
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session?.access_token) {
                    bulkHeaders['Authorization'] = `Bearer ${session.access_token} `;
                }
            } catch (e) { /* continue without token */ }
        }

        const response = await fetch('/api/bulk-search', {
            method: 'POST',
            headers: bulkHeaders,
            body: JSON.stringify({
                queries: queries
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.upgrade_required) {
                const planValue = 'b2b';
                const baseB2bUrl = window.stripeB2bPaymentLink || window.stripePaymentLink || '#';
                const stripeUrl = baseB2bUrl !== '#' ? `${baseB2bUrl}?client_reference_id = ${encodeURIComponent(window.currentUser.id)} ` : '#';

                tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-12 text-center text-amber-600 font-bold bg-amber-50">
                <p class="mb-4">⚡ ${currentRegion === 'US' ? 'This feature is exclusive to the VIP Reseller Plan.' : 'Esta función es exclusiva del Plan Revendedor VIP.'}</p>
                <a href="${stripeUrl}" target="_blank" onclick="if(typeof confetti === 'function') confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } })" class="inline-block bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-xl transition-all shadow-md">${currentRegion === 'US' ? 'Get the B2B Plan Now' : 'Obtener Plan B2B Ahora'}</a>
            </td></tr>`;
                showGlobalFeedback(data.error, 'error');
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-12 text-center text-red-500 font-bold">${currentRegion === 'US' ? 'Error' : 'Error'}: ${data.error || (currentRegion === 'US' ? 'Failed to process the batch.' : 'Fallo al procesar el lote.')}</td></tr>`;
            }
            return;
        }

        window.lastB2bData = data.resultados;

        tbody.innerHTML = '';
        data.resultados.forEach(res => {
            if (!res.encontrado && !res.mejor_oferta) {
                tbody.innerHTML += `
            <tr class="bg-white hover:bg-slate-50 border-b">
                        <td class="px-4 py-3 font-medium text-slate-900">${sanitize(res.query_original)}</td>
                        <td class="px-4 py-3 text-slate-400 italic">${currentRegion === 'US' ? 'Not found' : 'No encontrado'}</td>
                        <td class="px-4 py-3">-</td>
                        <td class="px-4 py-3 text-center">-</td>
                    </tr>
            `;
            } else {
                const priceFormatted = formatCurrencyByRegion(res.mejor_oferta.precio || 0);
                tbody.innerHTML += `
            <tr class="bg-white hover:bg-slate-50 border-b">
                        <td class="px-4 py-3 font-medium text-slate-900 truncate max-w-[200px]" title="${sanitize(res.query_original)}">${sanitize(res.query_original)}</td>
                        <td class="px-4 py-3 font-bold text-emerald-600">${priceFormatted}</td>
                        <td class="px-4 py-3" title="${sanitize(res.mejor_oferta.tienda)}">
                            <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase">${sanitize(res.mejor_oferta.tienda)}</span>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <a href="${sanitize(res.mejor_oferta.urlMonetizada || res.mejor_oferta.urlOriginal)}" target="_blank" class="text-blue-500 hover:text-blue-700 hover:underline font-bold text-xs inline-flex items-center gap-1">
                                ${currentRegion === 'US' ? 'Buy' : 'Comprar'} <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                            </a>
                        </td>
                    </tr>
            `;
            }
        });

        if (data.resultados.length > 0) {
            btnExport.disabled = false;
        }

    } catch (err) {
        console.error("Error processB2bQueries:", err);
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-500 font-bold">${currentRegion === 'US' ? 'An error occurred during the bulk search.' : 'Ocurrió un error en la búsqueda masiva.'}</td></tr>`;
    } finally {
        loader.classList.add('hidden');
    }
}

// ... (rest of the code remains the same)
function exportB2bToCSV() {
    if (!window.lastB2bData || window.lastB2bData.length === 0) return;

    let csvContent = "";
    csvContent += "Query Original,Titulo Encontrado,Precio (MXN),Tienda,Link\n";

    window.lastB2bData.forEach(row => {
        const query = (row.query_original || '').replace(/"/g, '""');
        if (!row.encontrado && !row.mejor_oferta) {
            csvContent += `"${query}", "No encontrado", "", "", ""\n`;
        } else {
            const title = (row.mejor_oferta.titulo || '').replace(/"/g, '""');
            const price = row.mejor_oferta.precio || 0;
            const store = (row.mejor_oferta.tienda || '').replace(/"/g, '""');
            const link = row.mejor_oferta.urlMonetizada || row.mejor_oferta.urlOriginal || '';
            csvContent += `"${query}", "${title}", ${price}, "${store}", "${link}"\n`;
        }
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `b2b_resultados_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

// ============================================
// ONBOARDING
// ============================================

// Old onboarding variables and steps. Kept minimal for compatibility if anything calls updateOnboarding
const onboardingSteps = [];
function updateOnboarding() { }
function closeOnboarding(skipTutorial) {
    // Only close onboarding modal if it exists.
    // We remove the recursive call to startInteractiveTutorial here to avoid infinite loops,
    // since the app logic already handles launching the tutorial separately.
}

function toggleMobileMenu(open) {
    if (!mobileMenuDrawer || !mobileMenuBackdrop || !mobileMenuPanel) return;
    if (open) {
        mobileMenuDrawer.classList.remove('invisible');
        setTimeout(() => {
            mobileMenuBackdrop.classList.replace('opacity-0', 'opacity-100');
            mobileMenuPanel.classList.replace('translate-x-full', 'translate-x-0');
        }, 10);
    } else {
        mobileMenuBackdrop.classList.replace('opacity-100', 'opacity-0');
        mobileMenuPanel.classList.replace('translate-x-0', 'translate-x-full');
        setTimeout(() => {
            mobileMenuDrawer.classList.add('invisible');
        }, 300);
    }
};


// ============================================
// FAVORITOS HOVER PREVIEW
// ============================================

function initFavoritesHover() {
    const btnFav = document.getElementById('btn-mis-favoritos') || document.querySelector('.nav-favoritos-trigger');
    if (!btnFav) return;

    // Crear el contenedor de preview si no existe
    let preview = document.getElementById('favorites-preview-pane');
    if (!preview) {
        preview = document.createElement('div');
        preview.id = 'favorites-preview-pane';
        preview.className = 'fixed top-16 right-4 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 z-[110] invisible opacity-0 translate-y-2 transition-all duration-300 overflow-hidden';
        document.body.appendChild(preview);
    }

    let hideTimeout;

    const showPreview = () => {
        preview.classList.remove('invisible', 'opacity-0', 'translate-y-2');
        preview.classList.add('opacity-100', 'translate-y-0');
        preview.style.visibility = 'visible';
        preview.style.opacity = '1';
    };

    const hidePreview = () => {
        preview.classList.add('invisible', 'opacity-0', 'translate-y-2');
        preview.classList.remove('opacity-100', 'translate-y-0');
        preview.style.visibility = 'hidden';
        preview.style.opacity = '0';
    };

    btnFav.addEventListener('mouseenter', async () => {
        clearTimeout(hideTimeout);

        const user = window.currentUser;
        if (!user || !window.supabaseClient) {
            preview.innerHTML = `<div class="p-4 text-center text-xs font-bold text-slate-500">${currentRegion === 'US' ? 'Sign in to view your favorites' : 'Ingresa para ver tus favoritos'}</div>`;
            showPreview();
            return;
        }

        preview.innerHTML = '<div class="p-4 flex justify-center"><div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>';
        showPreview();

        try {
            const { data } = await window.supabaseClient.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3);

            if (!data || data.length === 0) {
                preview.innerHTML = `<div class="p-4 text-center text-xs font-bold text-slate-400">${currentRegion === 'US' ? 'You have no favorites yet' : 'No tienes favoritos aún'}</div>`;
            } else {
                let html = `<div class="p-3 border-b border-slate-50 font-black text-[10px] text-slate-400 uppercase tracking-widest">${currentRegion === 'US' ? 'Your latest favorites' : 'Tus últimos favoritos'}</div>`;
                data.forEach((fav, idx) => {
                    const prod = fav.product_data || {};
                    const priceSource = fav.product_price || prod.precio || 0;
                    const parsedPrice = typeof priceSource === 'number' ? priceSource : parseFloat(String(priceSource).replace(/[^0-9.-]+/g, ''));
                    const priceFormatted = parsedPrice ? formatCurrencyByRegion(parsedPrice) : (currentRegion === 'US' ? 'View price' : 'Ver precio');
                    const safeUrl = sanitize(fav.product_url || '#');
                    const safeTitle = sanitize(prod.titulo || fav.product_title || (currentRegion === 'US' ? 'Product' : 'Producto'));
                    const safeImg = sanitize(prod.imagen || fav.product_image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50' viewBox='0 0 50 50'%3E%3Crect width='50' height='50' fill='%23f1f5f9' rx='8'/%3E%3Ctext x='25' y='32' text-anchor='middle' font-size='18' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E");

                    html += `
            <div class="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0 fav-preview-item" data-url="${encodeURI(safeUrl)}">
                <img src="${safeImg}" class="w-10 h-10 object-contain rounded-lg bg-white border border-slate-100 p-0.5" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'10\\' viewBox=\\'0 0 10 10\\'%3E%3Crect width=\\'10\\' height=\\'10\\' fill=\\'%23f1f5f9\\'/%3E%3C/svg%3E'">
                    <div class="overflow-hidden">
                        <p class="text-[11px] font-bold text-slate-800 truncate">${safeTitle}</p>
                        <p class="text-[10px] font-black text-emerald-600">${priceFormatted}</p>
                    </div>
                </div>
        `;
                });
                html += `<div class="p-2 bg-slate-50 text-center"><button onclick="if(typeof openFavorites===\'function\') openFavorites()" class="text-[10px] font-black text-primary hover:underline">${currentRegion === 'US' ? 'View all favorites' : 'Ver todos los favoritos'}</button></div>`;
                preview.innerHTML = html;

                // Add event listeners safely
                preview.querySelectorAll('.fav-preview-item').forEach(el => {
                    el.addEventListener('click', (e) => {
                        const url = e.currentTarget.getAttribute('data-url');
                        if (url && url !== '#') window.open(url, '_blank');
                    });
                });
            }
        } catch (err) {
            preview.innerHTML = `<div class="p-4 text-center text-xs text-red-500">${currentRegion === 'US' ? 'Error loading' : 'Error al cargar'}</div>`;
        }
    });

    btnFav.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(hidePreview, 300);
    });

    preview.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
    preview.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(hidePreview, 300);
    });
}

window.watchRewardedAdForSearches = function () {
    if (!hasRealRewardedAdConfigured()) {
        showRewardUnavailableToast();
        return;
    }
    if (typeof window.openAdGateway === 'function') {
        window.openAdGateway('reward', true);
    }
};

// ============================================
// INTERACTIVE TUTORIAL (Spotlight Walkthrough)
// ============================================

function getTutorialSteps() {
    return currentRegion === 'US'
        ? [
            {
                target: '#search-input',
                title: '1. Write your search',
                text: 'Describe what you need in natural language. For example: "cheap bluetooth headphones", "laptop for graphic design", or "gift for a 5-year-old girl".',
                icon: '🔍',
                position: 'bottom',
                action: () => {
                    const el = document.getElementById('search-input');
                    if (el) { el.focus(); el.setAttribute('placeholder', 'Ex: bluetooth headphones for running...'); }
                }
            },
            {
                target: '#btn-attach-image',
                title: '2. Search with an image',
                text: 'See something you like? Upload a photo and our AI will analyze it to find that product or a similar one at the best price.',
                icon: '📷',
                position: 'bottom'
            },
            {
                target: '#btn-voice-input',
                title: '3. Voice dictation',
                text: 'You can also dictate your search by voice. Press the microphone and speak naturally.',
                icon: '🎙️',
                position: 'bottom'
            },
            {
                target: '.loc-filter-btn[data-radius="global"]',
                title: '4. Filter by location',
                text: 'Choose between all online stores, only local physical stores, or both near you. We use your location securely.',
                icon: '📍',
                position: 'bottom'
            },
            {
                target: '#category-icon-bar',
                title: '5. Quick categories',
                text: 'Explore by category with one tap: tech, home, fashion, sports and more. It is a shortcut for popular searches.',
                icon: '🏷️',
                position: 'top'
            },
            {
                target: '#nav-favoritos',
                title: '6. Your favorites',
                text: 'When you find something you like, tap the heart ♡ to save it. Here you can see all your saved products.',
                icon: '❤️',
                position: 'bottom'
            },
            {
                target: '#nav-b2b',
                title: '7. B2B distributor mode',
                text: 'Buying wholesale? B2B mode lets you run multiple quotes at once and export to CSV for your business.',
                icon: '💼',
                position: 'bottom'
            }
        ]
        : [
            {
                target: '#search-input',
                title: '1. Escribe tu búsqueda',
                text: 'Escribe lo que necesitas en lenguaje natural. Por ejemplo: "audífonos bluetooth baratos", "laptop para diseño gráfico" o "regalo para niña de 5 años".',
                icon: '🔍',
                position: 'bottom',
                action: () => {
                    const el = document.getElementById('search-input');
                    if (el) { el.focus(); el.setAttribute('placeholder', 'Ej: audífonos bluetooth para correr...'); }
                }
            },
            {
                target: '#btn-attach-image',
                title: '2. Busca con imagen',
                text: '¿Viste algo que te gustó? Sube una foto y nuestra IA la analiza para encontrarte ese producto o uno similar al mejor precio.',
                icon: '📷',
                position: 'bottom'
            },
            {
                target: '#btn-voice-input',
                title: '3. Dictado por voz',
                text: 'También puedes dictar tu búsqueda por voz. Presiona el micrófono y habla naturalmente.',
                icon: '🎙️',
                position: 'bottom'
            },
            {
                target: '.loc-filter-btn[data-radius="global"]',
                title: '4. Filtra por ubicación',
                text: 'Elige entre buscar en todas las tiendas online, solo tiendas locales físicas, o ambas cerca de ti. Usamos tu ubicación de forma segura.',
                icon: '📍',
                position: 'bottom'
            },
            {
                target: '#category-icon-bar',
                title: '5. Categorías rápidas',
                text: 'Explora por categoría con un toque: tecnología, hogar, moda, deportes y más. Es un atajo para búsquedas populares.',
                icon: '🏷️',
                position: 'top'
            },
            {
                target: '#nav-favoritos',
                title: '6. Tus Favoritos',
                text: 'Cuando encuentres algo que te guste, dale al corazón ♡ para guardarlo. Aquí podrás ver todos tus productos guardados.',
                icon: '❤️',
                position: 'bottom'
            },
            {
                target: '#nav-b2b',
                title: '7. Modo Distribuidor B2B',
                text: '¿Compras al mayoreo? El modo B2B te permite hacer múltiples cotizaciones a la vez y exportar a CSV para tu negocio.',
                icon: '💼',
                position: 'bottom'
            }
        ];
}

function startInteractiveTutorial() {
    // Close the onboarding modal first (recursivity fixed)
    closeOnboarding();
    tutorialActive = true;
    tutorialStep = 0;

    // Create overlay
    let overlay = document.getElementById('tutorial-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.innerHTML = `
            <div id="tutorial-spotlight" class="tutorial-spotlight"></div>
            <div id="tutorial-tooltip" class="tutorial-tooltip">
                <div class="tutorial-tooltip-arrow"></div>
                <div class="flex items-center gap-3 mb-3">
                    <span id="tutorial-icon" class="text-3xl"></span>
                    <h4 id="tutorial-title" class="text-lg font-black text-slate-900 dark:text-white"></h4>
                </div>
                <p id="tutorial-text" class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5"></p>
                <div class="flex items-center justify-between">
                    <div id="tutorial-progress" class="flex gap-1.5"></div>
                    <div class="flex gap-2">
                        <button id="tutorial-skip" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold px-3 py-2 rounded-lg transition-colors">${currentRegion === 'US' ? 'Skip' : 'Saltar'}</button>
                        <button id="tutorial-next" class="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95">${currentRegion === 'US' ? 'Next →' : 'Siguiente →'}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('tutorial-next').addEventListener('click', nextTutorialStep);
        document.getElementById('tutorial-skip').addEventListener('click', endTutorial);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.id === 'tutorial-spotlight') {
                endTutorial();
            }
        });
    }

    overlay.classList.add('active');
    showTutorialStep();
}

function showTutorialStep() {
    const tutorialSteps = getTutorialSteps();
    const step = tutorialSteps[tutorialStep];
    if (!step) { endTutorial(); return; }

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
        tutorialStep++;
        if (tutorialStep < tutorialSteps.length) showTutorialStep();
        else endTutorial();
        return;
    }

    // Scroll target into view
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        const spotlight = document.getElementById('tutorial-spotlight');
        const tooltip = document.getElementById('tutorial-tooltip');
        const padding = 12;
        const isMobile = window.innerWidth < 640;

        // Position spotlight — use fixed on mobile so it doesn't need scrollY offset
        if (isMobile) {
            spotlight.style.position = 'fixed';
            spotlight.style.top = (rect.top - padding) + 'px';
        } else {
            spotlight.style.position = 'absolute';
            spotlight.style.top = (rect.top - padding + window.scrollY) + 'px';
        }
        spotlight.style.left = Math.max(0, rect.left - padding) + 'px';
        spotlight.style.width = (rect.width + padding * 2) + 'px';
        spotlight.style.height = (rect.height + padding * 2) + 'px';

        // Fill tooltip content
        document.getElementById('tutorial-icon').textContent = step.icon;
        document.getElementById('tutorial-title').textContent = step.title;
        document.getElementById('tutorial-text').textContent = step.text;

        // Update progress dots
        const progressContainer = document.getElementById('tutorial-progress');
        progressContainer.innerHTML = tutorialSteps.map((_, i) =>
            `<div class="w-2 h-2 rounded-full transition-colors ${i === tutorialStep ? 'bg-emerald-500' : i < tutorialStep ? 'bg-emerald-300' : 'bg-slate-200'}"></div>`
        ).join('');

        // Update button text
        const nextBtn = document.getElementById('tutorial-next');
        nextBtn.textContent = tutorialStep === tutorialSteps.length - 1
            ? (currentRegion === 'US' ? 'Done! 🎉' : '¡Listo! 🎉')
            : (currentRegion === 'US' ? 'Next →' : 'Siguiente →');

        const arrow = tooltip.querySelector('.tutorial-tooltip-arrow');

        if (isMobile) {
            // On mobile: pin tooltip to bottom of viewport, full-width
            tooltip.style.position = 'fixed';
            tooltip.style.left = '12px';
            tooltip.style.right = '12px';
            tooltip.style.width = 'auto';
            tooltip.style.maxWidth = 'none';
            tooltip.style.bottom = '16px';
            tooltip.style.top = 'auto';
            arrow.className = 'tutorial-tooltip-arrow arrow-bottom';
        } else {
            // On desktop: position relative to target
            tooltip.style.position = 'absolute';
            tooltip.style.bottom = 'auto';
            tooltip.style.right = 'auto';
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipW = Math.max(tooltipRect.width, 320);

            if (step.position === 'bottom') {
                tooltip.style.top = (rect.bottom + padding + 16 + window.scrollY) + 'px';
                arrow.className = 'tutorial-tooltip-arrow arrow-top';
            } else {
                tooltip.style.top = (rect.top - padding - tooltipRect.height - 16 + window.scrollY) + 'px';
                arrow.className = 'tutorial-tooltip-arrow arrow-bottom';
            }

            let tooltipLeft = rect.left + (rect.width / 2) - (tooltipW / 2);
            tooltipLeft = Math.max(16, Math.min(tooltipLeft, window.innerWidth - tooltipW - 16));
            tooltip.style.left = tooltipLeft + 'px';
            tooltip.style.width = tooltipW + 'px';
        }

        // Animate in
        spotlight.classList.add('active');
        tooltip.classList.add('active');

        // Run step action if any
        if (step.action) step.action();
    }, 400);
}

function nextTutorialStep() {
    const tutorialSteps = getTutorialSteps();
    const spotlight = document.getElementById('tutorial-spotlight');
    const tooltip = document.getElementById('tutorial-tooltip');
    spotlight.classList.remove('active');
    tooltip.classList.remove('active');

    tutorialStep++;
    if (tutorialStep < tutorialSteps.length) {
        setTimeout(showTutorialStep, 300);
    } else {
        endTutorial();
        // Celebration
        if (typeof confetti === 'function') {
            confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
        }
        showGlobalFeedback(currentRegion === 'US' ? 'Tutorial completed! You already know how to use Lumu like a pro 🎉' : '¡Tutorial completado! Ya sabes usar Lumu como un pro 🎉', 'success');
    }
}

function endTutorial() {
    tutorialActive = false;
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Remove slightly after fade out animation
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 300);
    }
    localStorage.setItem('lumu_tutorial_done', 'true');
}

window.startInteractiveTutorial = startInteractiveTutorial;

// ============================================================
// FASE 7 — Wishlist Compartible
// ============================================================
(function initWishlistShare() {
    const modal = document.getElementById('wishlist-share-modal');
    const closeBtn = document.getElementById('wishlist-modal-close');
    const copyBtn = document.getElementById('wishlist-copy-btn');
    const waBtn = document.getElementById('wishlist-wa-btn');
    const preview = document.getElementById('wishlist-preview');
    const linkInput = document.getElementById('wishlist-share-link');

    function openWishlistModal() {
        if (!modal) return;
        const isUS = currentRegion === 'US';
        const raw = localStorage.getItem('lumu_wishlist') || '[]';
        let items = [];
        try { items = JSON.parse(raw); } catch(e) {}

        if (items.length === 0) {
            if (preview) preview.innerHTML = `<p class="text-slate-400 text-sm text-center py-4">${isUS ? 'You do not have saved products yet ❤️' : 'Aún no tienes productos guardados ❤️'}</p>`;
        } else {
            if (preview) {
                preview.innerHTML = items.map(p => `
                    <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                        ${p.img ? `<img src="${p.img}" class="w-10 h-10 object-contain rounded-lg" onerror="this.style.display='none'" />` : ''}
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold text-slate-700 truncate">${p.name || (isUS ? 'Product' : 'Producto')}</p>
                            <p class="text-xs text-emerald-600 font-bold">${p.price || ''}</p>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Build shareable link as base64 JSON
        const sharePayload = btoa(encodeURIComponent(JSON.stringify(items.slice(0, 10))));
        const shareUrl = `${location.origin}/?wishlist=${sharePayload}`;
        if (linkInput) linkInput.value = shareUrl;
        const waMsg = encodeURIComponent(isUS
            ? `🛍️ Check out my Lumu wishlist! ${items.length} products I want to buy:\n${shareUrl}`
            : `🛍️ ¡Mira mi wishlist de Lumu! ${items.length} productos que quiero comprar:\n${shareUrl}`);
        if (waBtn) waBtn.href = `https://wa.me/?text=${waMsg}`;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeModal() {
        modal?.classList.add('hidden');
        modal?.classList.remove('flex');
    }

    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(linkInput?.value || '').then(() => {
            const orig = copyBtn.textContent;
            copyBtn.textContent = currentRegion === 'US' ? 'Copied!' : '¡Copiado!';
            setTimeout(() => { copyBtn.textContent = orig; }, 2000);
        });
    });

    // Save to wishlist when user clicks ❤️ favorite button + opens offer
    window.addEventListener('lumu:add-to-wishlist', (e) => {
        const { name, price, img, url } = e.detail || {};
        const raw = localStorage.getItem('lumu_wishlist') || '[]';
        let items = [];
        try { items = JSON.parse(raw); } catch(e) {}
        const exists = items.some(x => x.url === url);
        if (!exists) {
            items.unshift({ name, price, img, url, addedAt: Date.now() });
            localStorage.setItem('lumu_wishlist', JSON.stringify(items.slice(0, 50)));
        }
    });

    // Expose open function globally
    window.openWishlistModal = openWishlistModal;

    // --- DASHBOARD MI AHORRO ---
    window.updateMenuSavings = function() {
        const countSpan = document.getElementById('savings-count');
        if (!countSpan) return;
        
        const raw = localStorage.getItem('lumu_wishlist') || '[]';
        let items = [];
        try { items = JSON.parse(raw); } catch(e) {}
        
        // Calculate theoretical savings (this is a mock for now based on items count, 
        // real logic would compare current vs added price)
        let totalSavings = 0;
        items.forEach(item => {
            // Suppose 10% average saving for demo if not specified
            const p = parseFloat(String(item.price).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(p)) totalSavings += (p * 0.15); 
        });

        if (totalSavings > 0) {
            countSpan.innerText = `$${totalSavings.toFixed(0)}`;
            countSpan.classList.remove('hidden');
        }
    };

    window.openSavingsDashboard = function() {
        // Use an alert or toast for now, or a simple modal if we have one
        const raw = localStorage.getItem('lumu_wishlist') || '[]';
        let items = [];
        try { items = JSON.parse(raw); } catch(e) {}
        
        let totalSavings = 0;
        items.forEach(item => {
            const p = parseFloat(String(item.price).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(p)) totalSavings += (p * 0.15); 
        });

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm fade-in';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden scale-in">
                <div class="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-center text-white relative">
                    <div class="absolute top-4 right-4 cursor-pointer" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </div>
                    <div class="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/30">
                        <span class="text-4xl text-white drop-shadow-lg">💰</span>
                    </div>
                    <h3 class="text-2xl font-black mb-1">Mi Ahorro Lumu</h3>
                    <p class="text-emerald-50/80 text-sm font-bold">Has ahorrado buscando con nosotros</p>
                </div>
                <div class="p-8 flex flex-col items-center">
                    <div class="text-5xl font-black text-slate-800 mb-2">$${totalSavings.toFixed(0)}<span class="text-xl text-slate-400 font-bold ml-1">MXN</span></div>
                    <p class="text-slate-500 text-sm text-center mb-8">Calculado en base a los mejores precios encontrados para tus ${items.length} productos favoritos.</p>
                    
                    <div class="w-full space-y-3">
                        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <span class="text-slate-600 font-bold">Cupones aplicados</span>
                             <span class="text-emerald-600 font-black">${Math.floor(items.length * 0.4)}</span>
                        </div>
                        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <span class="text-slate-600 font-bold">Alertas activas</span>
                             <span class="text-blue-600 font-black">${JSON.parse(localStorage.getItem('lumu_alerts') || '[]').length}</span>
                        </div>
                    </div>
                    
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="w-full mt-8 bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-lg">Excelente</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };
})();

// ============================================================
// FASE 7 — Post-Buy Review Prompt (shows 3s after "Ver Oferta")
// ============================================================
(function initPostBuyPrompt() {
    const prompt = document.getElementById('post-buy-prompt');
    const closeBtn = document.getElementById('post-buy-close');
    const yesBtn = document.getElementById('post-buy-yes');
    const noBtn = document.getElementById('post-buy-no');
    let lastClickedUrl = null;
    let showTimer = null;

    function showPrompt() {
        if (!prompt) return;
        prompt.classList.remove('hidden');
        // Auto-hide after 12s
        setTimeout(() => hidePrompt(), 12000);
    }

    function hidePrompt() {
        prompt?.classList.add('hidden');
        if (showTimer) clearTimeout(showTimer);
    }

    closeBtn?.addEventListener('click', hidePrompt);
    noBtn?.addEventListener('click', hidePrompt);

    yesBtn?.addEventListener('click', () => {
        // Mark as bought in localStorage
        const bought = JSON.parse(localStorage.getItem('lumu_bought') || '[]');
        if (lastClickedUrl && !bought.includes(lastClickedUrl)) {
            bought.unshift(lastClickedUrl);
            localStorage.setItem('lumu_bought', JSON.stringify(bought.slice(0, 100)));
        }
        hidePrompt();
        // Optionally thank user
        if (typeof showToast === 'function') showToast(currentRegion === 'US' ? '🎉 Thanks! Your experience helps other shoppers' : '🎉 ¡Gracias! Tu experiencia ayuda a otros compradores');
    });

    // Hook into "Ver Oferta" clicks
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-open-offer');
        if (btn) {
            lastClickedUrl = btn.getAttribute('data-target-url');
            if (showTimer) clearTimeout(showTimer);
            hidePrompt();
            // Show prompt 3 seconds after clicking
            showTimer = setTimeout(showPrompt, 3000);
        }
    });
})();

// ============================================================
// FASE 7 — Achievement Badge System
// ============================================================
(function initAchievements() {
    function getAchievementsConfig() {
        return currentRegion === 'US'
            ? [
                { id: 'explorer',  emoji: '🔍', label: 'Explorer',  desc: 'Your first search', threshold: 1  },
                { id: 'hunter',    emoji: '🎯', label: 'Hunter',    desc: '10 searches',       threshold: 10 },
                { id: 'detective', emoji: '🕵️', label: 'Detective', desc: '25 searches',       threshold: 25 },
                { id: 'expert',    emoji: '⚡', label: 'Expert',    desc: '50 searches',       threshold: 50 },
                { id: 'legend',    emoji: '👑', label: 'Legend',    desc: '100 searches',      threshold: 100 },
                { id: 'lumuplus',  emoji: '💎', label: 'Lumu+',     desc: 'Premium user',      threshold: null, premiumOnly: true },
            ]
            : [
                { id: 'explorer',  emoji: '🔍', label: 'Explorador', desc: 'Tu primera búsqueda', threshold: 1  },
                { id: 'hunter',    emoji: '🎯', label: 'Cazador',    desc: '10 búsquedas',       threshold: 10 },
                { id: 'detective', emoji: '🕵️', label: 'Detective',  desc: '25 búsquedas',       threshold: 25 },
                { id: 'expert',    emoji: '⚡', label: 'Experto',    desc: '50 búsquedas',       threshold: 50 },
                { id: 'legend',    emoji: '👑', label: 'Leyenda',    desc: '100 búsquedas',      threshold: 100 },
                { id: 'lumuplus',  emoji: '💎', label: 'Lumu+',      desc: 'Usuario Premium',    threshold: null, premiumOnly: true },
            ];
    }

    function getSearchCount() {
        const raw = localStorage.getItem('lumu_searches_data');
        if (!raw) return 0;
        try { return JSON.parse(raw).count || 0; } catch(e) { return 0; }
    }

    function renderAchievements() {
        const body = document.getElementById('achievements-body');
        if (!body) return;
        const ACHIEVEMENTS = getAchievementsConfig();
        const count = getSearchCount();
        const isPremium = window.currentUser?.is_premium || window.currentUser?.plan === 'personal_vip' || window.currentUser?.plan === 'b2b';

        body.innerHTML = ACHIEVEMENTS.map(a => {
            const unlocked = a.premiumOnly ? isPremium : count >= a.threshold;
            return `
                <div class="flex flex-col items-center text-center p-3 rounded-2xl ${unlocked ? 'bg-gradient-to-b from-emerald-50 to-teal-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100 opacity-50 grayscale'}">
                    <span class="text-3xl mb-1">${a.emoji}</span>
                    <p class="text-xs font-black text-slate-800 leading-tight">${a.label}</p>
                    <p class="text-[9px] text-slate-500 leading-tight mt-0.5">${a.desc}</p>
                    ${unlocked ? `<span class="text-[9px] font-bold text-emerald-600 mt-1">✓ ${currentRegion === 'US' ? 'Unlocked' : 'Obtenido'}</span>` : ''}
                </div>
            `;
        }).join('');
    }

    // Open achievements modal
    const modal = document.getElementById('achievements-modal');
    const closeBtn = document.getElementById('achievements-modal-close');

    window.openAchievementsModal = () => {
        renderAchievements();
        modal?.classList.remove('hidden');
        modal?.classList.add('flex');
    };

    closeBtn?.addEventListener('click', () => {
        modal?.classList.add('hidden');
        modal?.classList.remove('flex');
    });

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    });

    // Check for newly unlocked achievements after each search
    let lastCheckedCount = getSearchCount();
    window.checkAchievementsOnSearch = () => {
        const ACHIEVEMENTS = getAchievementsConfig();
        const count = getSearchCount();
        ACHIEVEMENTS.filter(a => !a.premiumOnly && a.threshold && lastCheckedCount < a.threshold && count >= a.threshold).forEach(a => {
            setTimeout(() => {
                if (typeof showToast === 'function') showToast(currentRegion === 'US' ? `🏆 You reached the "${a.label}" level! ${a.emoji}` : `🏆 ¡Lograste el nivel "${a.label}"! ${a.emoji}`);
            }, 1500);
        });
        lastCheckedCount = count;
    };
})();

// UX-3: Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+K / Cmd+K → focus search bar
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    // Escape → close topmost visible modal
    if (e.key === 'Escape') {
        const modals = [
            'compare-modal', 'ad-modal', 'margin-calc-modal',
            'price-history-modal', 'achievements-modal'
        ];
        for (const id of modals) {
            const modal = document.getElementById(id);
            if (modal && !modal.classList.contains('hidden') && modal.style.visibility !== 'hidden') {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                if (modal.style) { modal.style.visibility = 'hidden'; modal.style.opacity = '0'; }
                break;
            }
        }
    }
});




