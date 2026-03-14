console.log('SCRIPT TOP: app.js is starting...');
// --- Global State ---
let supabaseClient = null;
let stripePaymentLink = null;
let currentUser = null;

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
            showGlobalFeedback('Error de conexión. Verifica tu internet e intenta de nuevo.', 'error');
        }
    }
});

// --- DOM Elements (initialized in DOMContentLoaded) ---
let authContainer, authModal, closeModalBtn, modalBackdrop, btnGoogleLogin;
let historyModal, closeHistoryBtn, historyBackdrop, historyList;
let favoritesModal, closeFavoritesBtn, favoritesBackdrop, navFavoritos, favoritesList;
let profileModal, closeProfileBtn, profileBackdrop;
let feedbackModal, closeFeedbackBtn, feedbackBackdrop, btnFeedback, feedbackForm, feedbackSuccess;
let searchForm, searchInput, searchButton, errorMessage;
let chatContainer, resultsWrapper, resultsGrid, resultsContainer;
let adModal, adCountdownText, btnSkipAd;
let b2bModal, closeB2bModal, b2bBackdrop, navB2b, btnProcessB2b, btnExportB2b;
let mobileMenuDrawer, mobileMenuBackdrop, mobileMenuPanel, btnMobileMenu, btnCloseMobileMenu, mobileAuthContainer;
let adsLoader, adsManager, adsDone = false, adContainer, adDisplayContainer;
let imageUpload, btnAttachImage, imagePreviewContainer, imagePreview, btnRemoveImage;
let btnVoiceInput, isRecording = false;
let selectedImageBase64 = null;
// Location inputs (global so they're accessible in submit handler)
let locRadiusInput, userLatInput, userLngInput;
let currentRegion = 'MX';

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

// --- State ---
let chatHistory = [];
let adInterval = null;
window._pendingAdUrl = null;
window._pendingAdUrlOriginal = null;
let lastB2bData = null;
let currentPhoneAttempt = '';
let currentStep = 1;
const totalSteps = 3;

// --- Conversion Analytics ---
const _detectDevice = () => /Mobi|Android/i.test(navigator.userAgent) ? (/iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'mobile') : 'desktop';
function _trackEvent(event_type, extra = {}) {
    try {
        const body = { event_type, device: _detectDevice(), ...extra };
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
    authModal.classList.remove('invisible', 'opacity-0');
    const panel = authModal.querySelector('.glass-panel');
    if (panel) {
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }
};

function closeModal() {
    if (!authModal) return;
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

function formatCurrencyByRegion(amount) {
    const config = getRegionConfig();
    return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency
    }).format(Number(amount || 0));
}

function detectRegion() {
    const lang = (navigator.language || '').toLowerCase();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (lang.includes('en-us') || tz.includes('America/New_York') || tz.includes('America/Chicago') || tz.includes('America/Denver') || tz.includes('America/Los_Angeles')) {
        return 'US';
    }
    return 'MX';
}

function applyRegionalCopy() {
    currentRegion = detectRegion();
    const config = getRegionConfig();

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

    const globalBtn = document.getElementById('filter-global');
    const localBtn = document.getElementById('filter-local-only');
    const nearbyBtn = document.getElementById('filter-nearby');
    const safeBtn = document.getElementById('btn-safe-stores');

    if (globalBtn) globalBtn.textContent = config.filters.global;
    if (localBtn) localBtn.textContent = config.filters.local_only;
    if (nearbyBtn) nearbyBtn.textContent = config.filters.nearby;
    if (safeBtn) {
        const icon = safeBtn.querySelector('svg')?.outerHTML || '';
        safeBtn.innerHTML = `${icon} ${config.filters.safe}`;
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

    const freeShippingLabel = document.querySelector('label[for="free-shipping-filter"] span');
    if (freeShippingLabel && config.toolbar) {
        freeShippingLabel.textContent = config.toolbar.freeShipping;
    }

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
                ${getSearchButtonLabel()}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-corner-down-left"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
            `;
}

function getLocalizedText(spanish, english) {
    return currentRegion === 'US' ? english : spanish;
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
    const productShowcase = document.getElementById('product-showcase');
    const extraSections = document.getElementById('extra-sections');
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
    productShowcase?.classList.remove('hidden');
    extraSections?.classList.remove('hidden');
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
        resultsTitle.innerHTML = `Análisis completado. <span class="text-slate-500 font-medium">Mejores opciones seguras:</span>`;
    }
    removeTypingIndicator();
}

// --- RECONSTRUCTED FUNCTIONS ---
async function renderFavoritesList() {
    if (!favoritesList) return;
    const sb = window.supabaseClient || null;
    const user = window.currentUser || null;
    if (!sb || !user) {
        favoritesList.innerHTML = '<p class="text-slate-400 text-center py-8">Inicia sesión para ver tus favoritos.</p>';
        return;
    }

    favoritesList.innerHTML = '<div class="col-span-full flex justify-center py-8"><div class="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div></div>';

    try {
        const { data, error } = await sb.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            favoritesList.innerHTML = '<p class="text-slate-400 text-center py-8">Aún no tienes productos guardados.</p>';
            return;
        }

        favoritesList.innerHTML = data.map(item => {
            const favPrice = typeof item.product_price === 'number' ? item.product_price : parseFloat(String(item.product_price || '0').replace(/[^0-9.-]+/g, ''));
            const safeTitle = sanitize(item.product_title || 'Producto sin título');
            const safeUrl = sanitize(item.product_url || '#');
            const safeImage = sanitize(item.product_image || '');
            return `
                <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div class="flex gap-4">
                        <div class="w-20 h-20 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0">
                            <img src="${safeImage}" class="w-full h-full object-contain" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%27100%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f1f5f9%27/%3E%3Ctext x=%2750%27 y=%2755%27 text-anchor=%27middle%27 font-size=%2730%27 fill=%27%2394a3b8%27%3E📦%3C/text%3E%3C/svg%3E'">
                        </div>
                        <div class="flex-grow min-w-0">
                            <h4 class="font-bold text-slate-800 text-sm mb-1 truncate">${safeTitle}</h4>
                            <p class="text-emerald-600 font-black text-lg mb-2">$${Number(favPrice || 0).toLocaleString('es-MX')} <span class="text-[10px] text-slate-400 font-bold uppercase">MXN</span></p>
                            <div class="flex gap-2">
                                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="flex-grow bg-slate-900 text-white text-[11px] font-black py-2 rounded-lg text-center hover:bg-emerald-600 transition-colors">Ver Producto</a>
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
        favoritesList.innerHTML = '<p class="text-rose-500 text-center py-8">Error cargando favoritos.</p>';
    }
};

window.renderMiniFavorites = async () => {
    const list = document.getElementById('mini-favorites-list');
    if (!list) return;

    if (list.getAttribute('data-loaded') === 'true') return;

    const sb = window.supabaseClient || null;
    const user = window.currentUser || null;

    if (!sb || !user) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4 font-medium">Inicia sesión para ver tus favoritos.</p>';
        return;
    }

    list.innerHTML = '<div class="flex justify-center py-4"><div class="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div></div>';

    try {
        const { data, error } = await sb.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4);
        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4 font-medium">Aún no tienes productos guardados.</p>';
            list.setAttribute('data-loaded', 'true');
            return;
        }

        list.innerHTML = data.map(item => {
            const favPrice = typeof item.product_price === 'number' ? item.product_price : parseFloat(String(item.product_price || '0').replace(/[^0-9.-]+/g, ''));
            const safeTitle = sanitize(item.product_title || 'Producto sin título');
            const safeUrl = sanitize(item.product_url || '#');
            const safeImage = sanitize(item.product_image || '');
            return `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="flex gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors group">
                    <div class="w-12 h-12 bg-white border border-slate-100 rounded-lg overflow-hidden flex-shrink-0 p-1">
                        <img src="${safeImage}" class="w-full h-full object-contain" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2750%27 height=%2750%27 viewBox=%270 0 50 50%27%3E%3Crect width=%2750%27 height=%2750%27 fill=%27%23f1f5f9%27/%3E%3Ctext x=%2725%27 y=%2730%27 text-anchor=%27middle%27 font-size=%2715%27 fill=%27%2394a3b8%27%3E📦%3C/text%3E%3C/svg%3E'">
                    </div>
                    <div class="flex flex-col justify-center min-w-0">
                        <h4 class="font-bold text-slate-800 text-[11px] mb-0.5 truncate group-hover:text-primary transition-colors">${safeTitle}</h4>
                        <p class="text-emerald-600 font-extrabold text-xs">$${Number(favPrice || 0).toLocaleString('es-MX')} MXN</p>
                    </div>
                </a>
            `;
        }).join('');

        list.setAttribute('data-loaded', 'true');
    } catch (err) {
        console.error('Error rendering mini favorites:', err);
        list.innerHTML = '<p class="text-xs text-rose-500 text-center py-4 font-medium">Error cargando favoritos.</p>';
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
                if (config.supabaseUrl && window.supabase) {
                    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
                    window.supabaseClient = supabaseClient; // Polyfill for the rest of the app
                }
                if (config.stripePaymentLink) stripePaymentLink = config.stripePaymentLink;
                if (config.stripeB2bPaymentLink) window.stripeB2bPaymentLink = config.stripeB2bPaymentLink;
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
        const flashDealsSection = document.getElementById('flash-deals-section');
        const tendenciasSection = document.getElementById('tendencias-section');
        const productShowcase = document.getElementById('product-showcase');
        const extraSections = document.getElementById('extra-sections');
        iconSun = document.getElementById('icon-sun');
        locRadiusInput = document.getElementById('loc-radius');
        userLatInput = document.getElementById('user-lat');
        userLngInput = document.getElementById('user-lng');
        const locFilterBtns = document.querySelectorAll('.loc-filter-btn');
        applyRegionalCopy();
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
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');

        // 2. Location Filters
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
            });
        }

        if (homeLogoLink) {
            homeLogoLink.addEventListener('click', (e) => {
                if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')) {
                    e.preventDefault();
                    restoreHomeSections();
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

        if (btnMobileMenu) btnMobileMenu.addEventListener('click', () => toggleMobileMenu(true));
        if (btnCloseMobileMenu) btnCloseMobileMenu.addEventListener('click', () => toggleMobileMenu(false));
        if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', () => toggleMobileMenu(false));

        // --- Pricing Section Buttons ---
        const btnPricingVip = document.getElementById('btn-pricing-vip');
        if (btnPricingVip) btnPricingVip.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Inicia sesión primero para suscribirte', 'info');
                if (authModal) authModal.classList.remove('hidden');
                return;
            }
            if (stripePaymentLink) {
                window.open(`${stripePaymentLink}?client_reference_id=${encodeURIComponent(currentUser.id)}`, '_blank');
            } else {
                showToast('Link de pago no disponible. Intenta más tarde.', 'error');
            }
        });
        const btnPricingB2b = document.getElementById('btn-pricing-b2b');
        if (btnPricingB2b) btnPricingB2b.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Inicia sesión primero para suscribirte', 'info');
                if (authModal) authModal.classList.remove('hidden');
                return;
            }
            if (window.stripeB2bPaymentLink) {
                window.open(`${window.stripeB2bPaymentLink}?client_reference_id=${encodeURIComponent(currentUser.id)}`, '_blank');
            } else {
                showToast('Contacta a ventas: hola@lumu.dev', 'info');
            }
        });

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

        if (btnVoiceInput) {
            btnVoiceInput.addEventListener('click', () => {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    alert('Tu navegador no soporta reconocimiento de voz.');
                    return;
                }

                if (isRecording) return;

                const recognition = new SpeechRecognition();
                recognition.lang = 'es-MX';
                recognition.interimResults = false;

                recognition.onstart = () => {
                    console.log('Voice recognition started');
                };

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    searchInput.value = transcript;
                    // Trigger resize
                    searchInput.dispatchEvent(new Event('input'));
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    stopRecording();
                };

                recognition.onend = () => {
                    stopRecording();
                };

                function stopRecording() {
                    isRecording = false;
                    btnVoiceInput.classList.remove('text-rose-500', 'animate-pulse');
                    btnVoiceInput.classList.add('text-slate-400');
                }

                // Feedback inmediato al hacer clic
                isRecording = true;
                btnVoiceInput.classList.add('text-rose-500', 'animate-pulse');
                btnVoiceInput.classList.remove('text-slate-400');

                recognition.start();
            });
        }

        // Close menu on nav link click
        document.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', () => toggleMobileMenu(false));
        });

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

        // --- Removed duplicate listener bindings for favorites ---


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

            let searchData = JSON.parse(localStorage.getItem('lumu_searches_data') || '{"count": 0, "date": null}');
            const today = new Date().toDateString();
            if (searchData.date !== today) {
                searchData = { count: 0, date: today };
                localStorage.setItem('lumu_searches_data', JSON.stringify(searchData));
            }

            let isVIP = false;
            const sb = window.supabaseClient || null;
            if (sb) {
                try {
                    const { data } = await sb.from('profiles').select('is_premium').eq('id', user.id).single();
                    if (data && data.is_premium) isVIP = true;
                } catch (e) {
                    console.error('Error fetching VIP status', e);
                }
            }

            if (planName) planName.textContent = isVIP ? 'Acceso Ilimitado' : 'Plan Básico (Gratis)';
            if (statusBadge) statusBadge.textContent = isVIP ? 'VIP' : 'Gratis';
            if (searchesLeft) searchesLeft.textContent = isVIP ? 'Búsquedas restantes: ∞ Ilimitadas' : `Búsquedas restantes: ${Math.max(0, 5 - searchData.count)}/5`;

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
                            Mis Búsquedas
                        </button>
                        <button id="btn-mis-favoritos" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-primary rounded-lg transition-colors flex items-center gap-2 mb-1">
                            <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path></svg>
                            Mis Favoritos
                        </button>
                        <button id="btn-mi-ahorro" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-emerald-600 rounded-lg transition-colors flex items-center gap-2 mb-1">
                            <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Mi Ahorro 
                            <span id="savings-count" class="ml-auto bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-black hidden">$0</span>
                        </button>
                        <button id="btn-mi-perfil" class="w-full text-left px-3 py-2 text-sm text-slate-700 font-bold hover:bg-slate-50 hover:text-primary rounded-lg transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            Mi Perfil VIP
                        </button>
                        <div class="h-px bg-slate-100 my-1"></div>
                        <button id="btn-logout" class="w-full text-left px-3 py-2 text-sm text-red-600 font-bold hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            Salir
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
                            coinsBadge.title = `${data.coins}/${data.next_goal} para VIP gratis`;
                            // Insert before pro-badge if possible, else append to authContainer
                            if (proBadge && proBadge.parentNode) {
                                proBadge.parentNode.insertBefore(coinsBadge, proBadge);
                            } else {
                                authContainer.prepend(coinsBadge);
                            }
                        }
                        coinsBadge.innerHTML = `<span class="text-base drop-shadow-sm">🪙</span> <span>${data.coins}</span>`;
                        // Auto-upgrade if temp premium
                        if (data.is_premium_temp && proBadge && proBadge.classList.contains('hidden')) {
                            proBadge.classList.remove('hidden');
                            proBadge.classList.add('flex');
                            proBadge.innerHTML = `⭐ VIP TEMPORAL`;
                        }
                    }
                }).catch(e => console.error('Error fetching coins:', e));

            } else {
                // Usuario deslogueado
                authContainer.innerHTML = `
                <button id="btn-login" class="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-1.5 rounded-lg border border-slate-200 transition-colors flex items-center gap-2 font-bold shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    Ingresar
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
                            Cerrar Sesión
                        </button>
                    `;
                    document.getElementById('btn-mobile-logout')?.addEventListener('click', async () => {
                        if (supabaseClient) await supabaseClient.auth.signOut();
                        toggleMobileMenu(false);
                    });
                } else {
                    mobileAuthContainer.innerHTML = `
                        <button id="btn-mobile-login" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                            Ingresar con Google
                        </button>
                    `;
                    document.getElementById('btn-mobile-login')?.addEventListener('click', () => {
                        toggleMobileMenu(false);
                        openModal();
                    });
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
                        setTimeout(() => {
                            confetti({
                                particleCount: 150,
                                spread: 80,
                                origin: { y: 0.6 },
                                colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899']
                            });
                        }, 500);
                        sessionStorage.setItem('lumu_confetti_fired', 'true');
                    }
                }
            });

            if (btnGoogleLogin) {
                btnGoogleLogin.addEventListener('click', async () => {
                    sessionStorage.setItem('just_logged_in', 'true');
                    await supabaseClient.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                            redirectTo: window.location.origin
                        }
                    });
                });
            }
            // Ocultar botón login si estamos logueados
            const btnLoginNav = document.getElementById('btn-login');
            if (btnLoginNav) btnLoginNav.classList.add('hidden');
        } else {
            // Fallback visual si falla Supabase
            updateAuthUI(null);
        }

        // --- Email/Password auth removed (only Google OAuth is supported) ---


        async function loadSearchHistory() {
            if (!supabaseClient || !currentUser) {
                // Fallback a LocalStorage si no hay sesión
                const localHist = JSON.parse(localStorage.getItem('lumu_local_history') || '[]');
                if (localHist.length === 0) {
                    historyList.innerHTML = '<div class="text-center py-6 text-slate-400 font-medium text-sm">No hay búsquedas recientes.</div>';
                    return;
                }
                historyList.innerHTML = '';
                localHist.slice(0, 10).forEach(qh => {
                    const btn = document.createElement('button');
                    btn.className = 'w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between group border-b border-slate-100 last:border-0';
                    btn.innerHTML = `<div class="flex items-center gap-3"><svg class="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="text-sm font-semibold text-slate-700 group-hover:text-primary transition-colors">${sanitize(qh)}</span></div>`;
                    btn.addEventListener('click', () => window.quickSearch(qh));
                    historyList.appendChild(btn);
                });
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
                    historyList.innerHTML = '<p class="text-center text-slate-400 py-8 font-medium">Aún no has realizado ninguna búsqueda guardada.</p>';
                    return;
                }

                historyList.innerHTML = '';
                data.forEach(item => {
                    const date = new Date(item.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                    const div = document.createElement('div');
                    div.className = 'group flex items-center justify-between p-3.5 bg-slate-50/50 border border-slate-100 rounded-xl hover:bg-emerald-50 hover:border-emerald-100 transition-colors cursor-pointer';
                    div.innerHTML = `
                    <div class="flex items-start gap-3 overflow-hidden">
                        <div class="mt-0.5 text-slate-300 group-hover:text-primary transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <div class="flex-grow overflow-hidden">
                            <p class="text-sm font-bold text-slate-700 truncate group-hover:text-slate-900">${sanitize(item.query)}</p>
                            <p class="text-[11px] text-slate-400 font-medium mt-0.5">${date}</p>
                        </div>
                    </div>
                `;

                    div.addEventListener('click', () => {
                        closeHistoryModal();
                        searchInput.value = item.query;
                        searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    });

                    historyList.appendChild(div);
                });

            } catch (err) {
                console.error('Error cargando historial:', err);
                historyList.innerHTML = '<p class="text-center text-red-400 py-8 font-medium">Error al cargar el historial.</p>';
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
            addChatBubble('ai', `Buscando las mejores ofertas en **${query}**... ⚡`, false);

            // Ejecutar búsqueda con skipLLM
            executeSearch(query, true);
        };


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

                if (isRecent && suggestions.length > 0) {
                    const header = document.createElement('div');
                    header.className = 'px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100';
                    header.textContent = getLocalizedText('Búsquedas recientes', 'Recent searches');
                    autocompleteDropdown.appendChild(header);
                }

                suggestions.forEach((sugg, i) => {
                    const item = document.createElement('div');
                    item.className = 'px-4 py-3 cursor-pointer hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0 autocomplete-item';
                    const icon = isRecent
                        ? '<svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
                        : '<svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>';
                    item.innerHTML = `
                        ${icon}
                        <span class="text-sm font-medium text-slate-700 truncate">${sugg}</span>
                    `;
                    item.addEventListener('click', () => {
                        searchInput.value = sugg;
                        closeAutocomplete();
                        searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    });
                    autocompleteDropdown.appendChild(item);
                });
                autocompleteDropdown.classList.remove('hidden');
            }

            function closeAutocomplete() {
                if (autocompleteDropdown) {
                    autocompleteDropdown.classList.add('hidden');
                    // We don't clear innerHTML here immediately so clicks can register
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
                executeSearch(query);
            });
        }

        async function executeSearch(query, skipLLM = false) {
            const radius = locRadiusInput?.value || 'global';
            const lat = userLatInput?.value || null;
            const lng = userLngInput?.value || null;

            searchButton.disabled = true;
            const originalButtonHTML = getSearchButtonIdleHTML();
            // Asegurar que el spinner tenga el mismo tamaño que el texto para evitar que el botón cambie de tamaño bruscamente
            searchButton.innerHTML = `<div class="flex items-center justify-center w-[52px] h-[20px]"><svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg></div>`;

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
                document.title = `Mejores precios de ${finalQuery} en México | Lumu.ai`;
                let metaDesc = document.querySelector('meta[name="description"]');
                if (!metaDesc) {
                    metaDesc = document.createElement('meta');
                    metaDesc.name = 'description';
                    document.head.appendChild(metaDesc);
                }
                metaDesc.content = `Compara precios de ${finalQuery} en Amazon, Mercado Libre, Walmart y más. Encuentra la oferta más barata en México con Lumu AI.`;

                resultsWrapper.classList.remove('hidden');

                // Ocultar elementos de la landing page durante la búsqueda
                if (categoryIconBar) categoryIconBar.classList.add('hidden');
                if (flashDealsSection) flashDealsSection.classList.add('hidden');
                if (tendenciasSection) tendenciasSection.classList.add('hidden');
                if (productShowcase) productShowcase.classList.add('hidden');
                if (extraSections) extraSections.classList.add('hidden');

                renderSkeletons(5);
                if (!skipLLM) resultsWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

                const safeChatHistory = chatHistory.slice(-10);

                const btnSafeStores = document.getElementById('btn-safe-stores');
                const safeStoresOnly = btnSafeStores ? btnSafeStores.getAttribute('data-safe') === 'true' : false;

                const searchBody = {
                    query: finalQuery,
                    chatHistory: safeChatHistory,
                    radius: radius,
                    skipLLM: skipLLM,
                    safeStoresOnly: safeStoresOnly
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
                _trackEvent('search', { search_query: finalQuery });
                window._lastSearchQuery = finalQuery;

                const response = await fetch('/api/buscar', {
                    method: 'POST',
                    headers: fetchHeaders,
                    body: JSON.stringify(searchBody)
                });

                // FIX #2: Defensive parsing to prevent "Unexpected token 'A'" crash
                let data;
                try {
                    const textData = await response.text();
                    data = JSON.parse(textData);
                } catch (parseError) {
                    console.error('Invalid JSON response from server:', parseError);
                    throw new Error('El servidor devolvió un error inesperado. Por favor, intenta de nuevo.');
                }


                if (!response.ok) {
                    // Handle rate limit (429) and paywall (402) specially
                    if (response.status === 429) {
                        const retryAfter = data.retry_after || 60;
                        removeTypingIndicator();
                        addChatBubble('ai', `⏳ **Demasiadas búsquedas.** Espera ${retryAfter} segundos antes de intentar de nuevo.`, [], false);
                        resultsWrapper.classList.add('hidden');
                        return;
                    }
                    if (response.status === 402) {
                        removeTypingIndicator();
                        const isPaywall = data.paywall;
                        const vipLink = stripePaymentLink || '#';
                        const vipUrl = vipLink !== '#' && currentUser ? `${vipLink}?client_reference_id=${encodeURIComponent(currentUser.id)}` : vipLink;
                        if (isPaywall) {
                            addChatBubble('ai', `🔒 **Límite de búsquedas gratuitas alcanzado.** Hazte VIP para búsquedas ilimitadas o mira un anuncio para 3 búsquedas gratis.`, [], false);
                            resultsContainer.innerHTML = `
                                <div class="col-span-full flex flex-col items-center text-center py-12 px-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl border border-amber-200">
                                    <div class="text-5xl mb-4">⚡</div>
                                    <h3 class="text-xl font-black text-slate-800 mb-2">Límite Alcanzado</h3>
                                    <p class="text-slate-600 font-medium mb-6 max-w-sm">Desbloquea búsquedas ilimitadas con VIP o gana 3 búsquedas hoy patrocinadas por anuncios.</p>
                                    <div class="flex flex-col gap-3 w-full max-w-xs">
                                        <a href="${sanitize(vipUrl)}" target="_blank" class="w-full bg-amber-500 hover:bg-amber-600 text-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-amber-500/20">Obtener VIP - $39 MXN/mes</a>
                                        <button onclick="window.currentAdIsForReward = true; window.openAdGateway('reward');" class="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-3.5 rounded-2xl font-bold transition-all flex justify-center items-center gap-2">
                                            <svg class="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M10 8v8l6-4-6-4zm9-5H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
                                            Ver anuncio (3 Gratis)
                                        </button>
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

                if (data.tipo_respuesta === 'conversacion') {
                    chatHistory.push({ role: 'assistant', content: data.pregunta_ia });
                    chatContainer.classList.remove('hidden');
                    addChatBubble('ai', data.pregunta_ia, data.sugerencias);
                    if (data.advertencia_uso) {
                        setTimeout(() => addChatBubble('ai', data.advertencia_uso, [], false), 500);
                    }
                    resultsWrapper.classList.remove('hidden'); // Fix: chat lives inside results so this must be visible
                    resultsGrid.innerHTML = '';
                    document.getElementById('results-title').innerHTML = `Conversación con <span class="text-emerald-500">Lumu AI</span>`;
                    searchInput.value = '';
                    // Reset height
                    searchInput.style.height = '56px';
                    searchInput.focus();

                } else if (data.tipo_respuesta === 'resultados') {
                    chatHistory = [];
                    chatContainer.classList.add('hidden');
                    chatContainer.innerHTML = '';
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

                    // Guardar la búsqueda en la base de datos "searches" o LocalStorage
                    if (data.intencion_detectada?.busqueda) {
                        const busqueda = data.intencion_detectada.busqueda;
                        if (supabaseClient && currentUser) {
                            supabaseClient.from('searches').insert([{
                                user_id: currentUser.id,
                                query: busqueda
                            }]).then(({ error }) => {
                                if (error) console.error('Error guardando búsqueda:', error);
                            });
                        } else {
                            // Guardar en LocalStorage
                            let localHist = JSON.parse(localStorage.getItem('lumu_local_history') || '[]');
                            localHist = [busqueda, ...localHist.filter(q => q !== busqueda)].slice(0, 50);
                            localStorage.setItem('lumu_local_history', JSON.stringify(localHist));
                        }
                    }

                    renderSearchContext({
                        query: data.intencion_detectada?.busqueda || finalQuery,
                        radius,
                        safeStoresOnly,
                        resultCount: data.top_5_baratos?.length || 0
                    });

                    if (data.top_5_baratos && data.top_5_baratos.length > 0) {
                        await renderProducts(data.top_5_baratos);

                        chatContainer.classList.remove('hidden');
                        addChatBubble('ai', getResultLeadCopy(data.intencion_detectada, data.top_5_baratos.length), [], true);

                        if (data.sugerencias && data.sugerencias.length > 0) {
                            const csContainer = document.createElement('div');
                            csContainer.className = 'col-span-full mt-8 p-6 bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-3xl border border-indigo-100 flex flex-col items-center text-center shadow-sm';

                            const csTitle = document.createElement('h3');
                            csTitle.className = 'text-lg font-black text-slate-800 mb-2 flex items-center gap-2';
                            csTitle.innerHTML = '<span class="text-2xl">💡</span> Quizás también te interese...';

                            const csDesc = document.createElement('p');
                            csDesc.className = 'text-slate-500 font-medium mb-6 max-w-sm text-sm';
                            csDesc.innerText = 'Nuestra IA sugiere explorar estas alternativas:';

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
                                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-200">Ampliando búsqueda...</h3>
                                <p class="text-slate-500 dark:text-slate-400 text-sm">Buscando alternativas para "${finalQuery}"</p>
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
                        const fallbackChips = [
                            `${searchTerm} nuevo`,
                            `${searchTerm} ofertas`,
                            `${searchTerm} economico`,
                        ];
                        const suggArr = suggestions.length > 0 ? suggestions.slice(0, 3) : fallbackChips;
                        const suggChips = suggArr.map(s => {
                            const safe = sanitize(s);
                            return `<button data-sugg="${safe}" class="sugg-chip px-4 py-2 bg-white border border-emerald-200 text-emerald-700 text-sm font-bold rounded-full hover:bg-emerald-50 transition-colors shadow-sm">${safe}</button>`;
                        }).join('');

                        resultsContainer.innerHTML = `
                        <div class="col-span-full flex flex-col items-center text-center py-12 px-6 bg-white/60 backdrop-blur-sm rounded-3xl border border-dashed border-slate-200">
                            <div class="text-6xl mb-4">🔍</div>
                            <h3 class="text-xl font-black text-slate-800 mb-2">Sin resultados directos</h3>
                            <p class="text-slate-500 font-medium mb-6 max-w-sm">No encontramos disponibilidad inmediata. Selecciona una variante para ampliar la búsqueda:</p>
                            <div class="flex flex-wrap gap-2 justify-center sugg-container">
                                ${suggChips}
                            </div>
                            <p class="text-xs text-slate-400 mt-6">Si buscas algo de mercado local, prueba activar 📍 <b>Tiendas Locales</b></p>
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
                removeTypingIndicator();
                if (_skeletonMsgInterval) { clearInterval(_skeletonMsgInterval); _skeletonMsgInterval = null; }
                
                let userMsg = error.message;
                if (userMsg === 'Failed to fetch' || userMsg.includes('NetworkError')) {
                    userMsg = 'Error de conexión. El servidor no respondió o no hay internet. Por favor intenta de nuevo.';
                }
                
                errorMessage.textContent = userMsg;
                errorMessage.classList.remove('hidden');
                resultsContainer.innerHTML = '';
                resultsWrapper.classList.add('hidden');
            } finally {
                searchButton.disabled = false;
                searchButton.innerHTML = originalButtonHTML;
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
                ? 'bg-emerald-50 text-emerald-950 border border-emerald-100 rounded-[1.5rem] rounded-tr-sm px-5 py-3.5 shadow-sm max-w-[85%] sm:max-w-[75%]'
                : 'bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 rounded-[1.5rem] rounded-tl-sm px-5 py-3.5 shadow-sm border border-slate-100 dark:border-slate-700/60 relative group backdrop-blur-sm max-w-[85%] sm:max-w-[75%]';

            const iconHtml = isUser ? '' : `
                <div class="flex-shrink-0 mr-3 mt-1 relative">
                    <div class="bg-emerald-500 shadow-md shadow-emerald-500/20 rounded-2xl h-10 w-10 flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-800">
                        <svg class="w-5 h-5 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
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

                let trendBadge = '';
                if (product.priceTrend?.direction === 'down') {
                    trendBadge = `<span class="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md ml-1">↓ ${product.priceTrend.percent || 0}%</span>`;
                } else if (product.priceTrend?.direction === 'up') {
                    trendBadge = `<span class="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-md ml-1">↑ ${product.priceTrend.percent || 0}%</span>`;
                }

                return `
                <div class="chat-product-item flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50/80 cursor-pointer group/item transition-all duration-200 ${isCheapest ? 'bg-emerald-50/50 border border-emerald-200/50' : 'border border-slate-100 hover:border-emerald-200'}"
                     data-target-url="${targetUrl}" style="animation: slideInUp 0.3s ease-out ${idx * 80}ms both">
                    ${isCheapest ? '<div class="absolute -top-1.5 -left-1 bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 rounded-md shadow-sm z-10">💰 MEJOR PRECIO</div>' : ''}
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
                        </div>
                        ${product.cupon ? `<span class="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 inline-block border border-amber-200">🎟️ ${sanitize(product.cupon)}</span>` : ''}
                    </div>
                    <button class="chat-product-btn flex-shrink-0 bg-transparent text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 text-[11px] font-bold px-3 py-2 rounded-xl border border-emerald-200 transition-all duration-150 whitespace-nowrap"
                            data-target-url="${targetUrl}">
                        Ver →
                    </button>
                </div>`;
            }).join('');

            wrapper.innerHTML = `
                <div class="flex-shrink-0 mr-3 mt-1">
                    <div class="bg-emerald-500 shadow-md shadow-emerald-500/20 rounded-2xl h-10 w-10 flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-800">
                        <svg class="w-5 h-5 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                    </div>
                </div>
                <div class="bg-white/95 dark:bg-slate-800/95 rounded-[1.5rem] rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700/60 backdrop-blur-sm max-w-[92%] sm:max-w-[85%] overflow-hidden">
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
                    if (url) window.openAdGateway(url);
                });
            });
            wrapper.querySelectorAll('.chat-product-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = btn.getAttribute('data-target-url');
                    if (url) window.openAdGateway(url);
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
            <h4 id="loading-text" class="text-lg font-bold text-emerald-800 transition-opacity duration-300">Iniciando búsqueda profunda...</h4>
            <p class="text-sm text-emerald-600 mt-2 font-medium">Por favor espera, estamos encontrando el mejor precio real para ti.</p>
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
                countEl.textContent = `${_compareProducts.length} producto${_compareProducts.length > 1 ? 's' : ''} seleccionado${_compareProducts.length > 1 ? 's' : ''}`;
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
                            <div class="text-2xl font-black text-slate-900 mb-2">${p._precioNum > 0 ? p._precioFmt : '<span class=&quot;text-base text-amber-600&quot;>Ver en tienda</span>'}</div>
                            ${p.cupon ? `<span class="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg mb-2">Cupón: ${sanitize(p.cupon)}</span>` : ''}
                            <button class="mt-auto w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2 px-4 rounded-xl transition-colors"
                                onclick="window.openAdGateway('${encodeURIComponent(p.urlMonetizada || p.urlOriginal || p.link)}')">
                                Ver Oferta →
                            </button>
                        </div>
                    `).join('')}
                </div>
                ${_compareProducts.length >= 2 ? `
                <div class="mt-6 overflow-x-auto">
                    <table class="w-full text-sm border-collapse">
                        <thead>
                            <tr class="border-b border-slate-200">
                                <th class="text-left py-2 px-3 text-slate-500 font-bold text-xs uppercase">Atributo</th>
                                ${_compareProducts.map(p => `<th class="py-2 px-3 text-slate-700 font-bold text-xs">${sanitize((p.tienda || '').substring(0, 15))}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-500 font-medium">Precio</td>${_compareProducts.map(p => {
                const best = Math.min(..._compareProducts.filter(x => x._precioNum > 0).map(x => x._precioNum));
                const isBest = p._precioNum === best && p._precioNum > 0;
                return `<td class="py-2 px-3 font-bold ${isBest ? 'text-emerald-600' : 'text-slate-800'}">${p._precioNum > 0 ? p._precioFmt : '—'}${isBest ? ' ✓' : ''}</td>`;
            }).join('')}</tr>
                            <tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-500 font-medium">Tienda</td>${_compareProducts.map(p => `<td class="py-2 px-3 text-slate-700">${sanitize(p.tienda || '—')}</td>`).join('')}</tr>
                            <tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-500 font-medium">Cupón</td>${_compareProducts.map(p => `<td class="py-2 px-3 text-slate-700">${p.cupon ? sanitize(p.cupon) : '—'}</td>`).join('')}</tr>
                            <tr><td class="py-2 px-3 text-slate-500 font-medium">Tienda local</td>${_compareProducts.map(p => `<td class="py-2 px-3 text-slate-700">${p.isLocalStore ? '📍 Sí' : 'No'}</td>`).join('')}</tr>
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
            const sortVal = document.getElementById('sort-select')?.value || 'price-asc';
            const storeVal = document.getElementById('store-filter')?.value || 'all';
            const freeShippingOnly = document.getElementById('free-shipping-filter')?.checked || false;
            const minVal = parseFloat(document.getElementById('price-min')?.value);
            const maxVal = parseFloat(document.getElementById('price-max')?.value);

            let filtered = [..._lastProducts];

            // Filtro de tienda
            if (storeVal !== 'all') {
                filtered = filtered.filter(p => p.tienda === storeVal);
            }

            // Filtro de envío gratis
            if (freeShippingOnly) {
                filtered = filtered.filter(p => {
                    const title = (p.titulo || '').toLowerCase();
                    const details = (p.couponDetails || '').toLowerCase();
                    return title.includes('gratis') || details.includes('gratis') || details.includes('free');
                });
            }

            // Filtro de precio
            if (!isNaN(minVal)) filtered = filtered.filter(p => {
                const pr = typeof p.precio === 'number' ? p.precio : parseFloat(String(p.precio || '0').replace(/[^0-9.]/g, ''));
                return pr >= minVal;
            });
            if (!isNaN(maxVal) && maxVal > 0) filtered = filtered.filter(p => {
                const pr = typeof p.precio === 'number' ? p.precio : parseFloat(String(p.precio || '0').replace(/[^0-9.]/g, ''));
                return pr <= maxVal;
            });

            // Ordenamiento
            if (sortVal === 'price-asc') {
                filtered.sort((a, b) => (parseFloat(a.precio) || Infinity) - (parseFloat(b.precio) || Infinity));
            } else if (sortVal === 'price-desc') {
                filtered.sort((a, b) => (parseFloat(b.precio) || 0) - (parseFloat(a.precio) || 0));
            } else if (sortVal === 'store') {
                filtered.sort((a, b) => (a.tienda || '').localeCompare(b.tienda || ''));
            }

            const countEl = document.getElementById('results-count');
            if (countEl) {
                countEl.textContent = currentRegion === 'US'
                    ? `${filtered.length} of ${_lastProducts.length} results`
                    : `${filtered.length} de ${_lastProducts.length} resultados`;
            }

            renderProductCards(filtered, _lastFavorites);
        }

        // Bind toolbar events
        document.getElementById('sort-select')?.addEventListener('change', applyFiltersAndSort);
        document.getElementById('store-filter')?.addEventListener('change', applyFiltersAndSort);
        document.getElementById('free-shipping-filter')?.addEventListener('change', applyFiltersAndSort);
        document.getElementById('price-filter-btn')?.addEventListener('click', applyFiltersAndSort);
        // Allow enter key in price inputs
        document.getElementById('price-min')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFiltersAndSort(); });
        document.getElementById('price-max')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFiltersAndSort(); });

        async function renderProducts(products) {
            resultsContainer.innerHTML = '';
            _lastProducts = products;

            // Show toolbar
            const toolbar = document.getElementById('results-toolbar');
            if (toolbar) toolbar.classList.remove('hidden');

            // Populate store filter
            const storeSelect = document.getElementById('store-filter');
            if (storeSelect) {
                const stores = [...new Set(products.map(p => p.tienda))].filter(Boolean).sort();
                storeSelect.innerHTML = `<option value="all">${getLocalizedText('Todas las tiendas', 'All stores')}</option>` + 
                    stores.map(s => `<option value="${s}">${s}</option>`).join('');
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
            if (countEl) countEl.textContent = `${products.length} ${getRegionConfig().resultsFound}`;

            const localSearchData = JSON.parse(localStorage.getItem('lumu_searches_data') || '{"count":0}');
            updateCoinsProgress(localSearchData.count || 0);

            renderProductCards(products, userFavorites);

            // Check price alerts after rendering
            if (typeof window.checkPriceAlerts === 'function') {
                window.checkPriceAlerts(products);
            }
        }

        function renderProductCards(products, userFavorites) {
            resultsContainer.innerHTML = '';

            // --- NUEVO: Comparador Local vs Online ---
            const localProducts = products.filter(p => p.isLocalStore && typeof p.precio === 'number' && p.precio > 0);
            const onlineProducts = products.filter(p => !p.isLocalStore && typeof p.precio === 'number' && p.precio > 0);
            
            if (localProducts.length > 0 && onlineProducts.length > 0) {
                const bestLocal = [...localProducts].sort((a,b) => a.precio - b.precio)[0];
                const bestOnline = [...onlineProducts].sort((a,b) => a.precio - b.precio)[0];
                
                const fmtLocal = formatCurrencyByRegion(bestLocal.precio);
                const fmtOnline = formatCurrencyByRegion(bestOnline.precio);
                
                let comparisonMsg = '';
                if (bestLocal.precio <= bestOnline.precio) {
                    comparisonMsg = `<span class="text-emerald-700 font-bold">¡Sale mejor comprar local hoy!</span> Ahorras ${formatCurrencyByRegion(bestOnline.precio - bestLocal.precio)} y lo tienes al instante.`;
                } else if (bestOnline.precio < bestLocal.precio) {
                    const diff = bestLocal.precio - bestOnline.precio;
                    if (diff > 50) {
                        comparisonMsg = `<span class="text-blue-700 font-bold">Comprar online es más barato.</span> Ahorras ${formatCurrencyByRegion(diff)}, pero debes esperar el envío.`;
                    } else {
                        comparisonMsg = `<span class="text-slate-700 font-bold">Precio similar.</span> Cómpralo local si te urge, o pide online sin salir de casa.`;
                    }
                }
                
                const compareBanner = document.createElement('div');
                compareBanner.className = 'col-span-full mb-5 bg-gradient-to-r from-slate-50 via-white to-emerald-50/70 border border-slate-200 rounded-[24px] p-4 md:p-5 flex flex-col md:flex-row items-center gap-3 md:gap-4 shadow-sm w-full';
                compareBanner.innerHTML = `
                    <div class="flex items-center justify-center p-3 bg-white rounded-xl shadow-sm border border-slate-100 hidden md:flex">
                        <span class="text-3xl">⚖️</span>
                    </div>
                    <div class="flex-grow flex flex-col items-center md:items-start text-center md:text-left w-full">
                        <h4 class="text-sm font-black text-slate-800 uppercase tracking-wide mb-1 flex items-center gap-2">Análisis Local vs Online <span class="bg-indigo-100 text-indigo-700 text-[9px] px-2 py-0.5 rounded-full font-bold">BETA</span></h4>
                        <p class="text-sm text-slate-600 mb-3">${comparisonMsg}</p>
                        <div class="flex flex-wrap items-center justify-center md:justify-start gap-3 w-full">
                            <div class="bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2 shadow-sm transition-transform hover:-translate-y-0.5" title="${bestLocal.tienda}">
                                <span class="text-xs">📍 Local:</span> <span class="font-black text-base">${fmtLocal}</span>
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
                let rawPrice = product.precio || 0;
                let precioNumerico = 0;

                if (typeof rawPrice === 'string') {
                    // Remove currency symbols, commas, and whitespace
                    const cleanPrice = rawPrice.replace(/[^0-9.]/g, '');
                    precioNumerico = parseFloat(cleanPrice);
                } else if (typeof rawPrice === 'number') {
                    precioNumerico = rawPrice;
                }

                if (isNaN(precioNumerico) || precioNumerico === null) {
                    precioNumerico = 0;
                }

                const formattedPrice = formatCurrencyByRegion(precioNumerico);

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
                        priceDropBadge = `<div class="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-md z-30 shadow-lg animate-bounce">¡BAJÓ $${ahorro.toFixed(0)}!</div>`;
                    }
                }

                const isBestPrice = minPrice && precioNumerico === minPrice && precioNumerico > 0;
                
                const heartColor = isAlreadyFav ? 'text-red-500' : 'text-slate-300';
                let sourceColor = 'text-slate-500';
                // Botón primario usa color Emerald
                let btnColor = 'bg-primary hover:bg-emerald-600 text-white';

                const tiendaLower = (product.tienda || product.fuente || '').toLowerCase();
                if (tiendaLower.includes('amazon')) {
                    sourceColor = 'text-slate-800 font-extrabold';
                    btnColor = 'bg-[#FF9900] hover:bg-orange-500 text-slate-900';
                } else if (tiendaLower.includes('libre')) {
                    sourceColor = 'text-blue-700 font-extrabold';
                    btnColor = 'bg-[#ffe600] hover:bg-yellow-400 text-slate-900';
                }

                const card = document.createElement('div');
                card.className = 'group product-card bg-white dark:bg-slate-800 rounded-[24px] hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col relative h-full fade-in border border-slate-200 dark:border-slate-700 shadow-sm';

                // Store-specific fallback logos when no product image
                const storeFallbacks = {
                    'amazon': 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg',
                    'mercado': 'https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.73/mercadolibre/logo_large_25years@2x.png',
                    'libre': 'https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.73/mercadolibre/logo_large_25years@2x.png',
                    'walmart': 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Walmart_logo.svg',
                    'liverpool': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Liverpool_%28store%29_logo.svg/320px-Liverpool_%28store%29_logo.svg.png',
                    'coppel': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Coppel_logo.svg/320px-Coppel_logo.svg.png',
                    'best buy': 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Best_Buy_Logo.svg',
                    'elektra': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Elektra_logo.svg/320px-Elektra_logo.svg.png',
                    'costco': 'https://upload.wikimedia.org/wikipedia/commons/5/59/Costco_Wholesale_logo_2010-10-26.svg',
                    'sam': 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Sam%27s_Club.svg'
                };
                const defaultFallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23f1f5f9'/%3E%3Ctext x='150' y='160' text-anchor='middle' font-size='40' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E";
                let imgUrl = product.imgUrl || product.imagen;
                if (!imgUrl) {
                    const matchedStore = Object.entries(storeFallbacks).find(([key]) => tiendaLower.includes(key));
                    imgUrl = matchedStore ? matchedStore[1] : defaultFallback;
                } else if (imgUrl.length > 200 || imgUrl.startsWith('data:')) {
                    // It's likely a base64 string from Serper, don't proxy it
                    imgUrl = imgUrl;
                } else if (imgUrl.startsWith('http')) {
                    // Only proxy actual http/https URLs
                    imgUrl = `/api/img-proxy?url=${encodeURIComponent(imgUrl)}`;
                }

                // Local store: price can be null
                const isLocal = product.isLocalStore;
                let priceDisplay;
                if (isLocal || precioNumerico === 0) {
                    priceDisplay = `<span class="text-base md:text-lg font-black text-amber-600">Ver precio en tienda</span>`;
                } else {
                    const formattedFull = formatCurrencyByRegion(precioNumerico);
                    const numericMatch = formattedFull.match(/[\d,.]+/);
                    const numericPart = numericMatch ? numericMatch[0] : '0.00';
                    const currencySymbol = formattedFull.replace(numericPart, '').trim() || (getRegionConfig().currency === 'USD' ? '$' : '$');
                    const lastSeparatorIndex = Math.max(numericPart.lastIndexOf('.'), numericPart.lastIndexOf(','));
                    const integerPart = lastSeparatorIndex >= 0 ? numericPart.slice(0, lastSeparatorIndex) : numericPart;
                    const decimalPart = lastSeparatorIndex >= 0 ? numericPart.slice(lastSeparatorIndex + 1) : '00';
                    
                    priceDisplay = `<span class="text-xs md:text-sm font-bold text-slate-500">${currencySymbol}</span><span class="text-[1.7rem] md:text-3xl font-black text-slate-900 leading-none">${integerPart}</span><span class="text-xs md:text-sm font-bold text-slate-900">.${decimalPart}</span>`;
                    
                    if (product.isSuspicious) {
                        priceDisplay += `<div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black uppercase tracking-wider tooltip" data-tip="El precio es anormalmente bajo comparado con el mercado"><span class="text-xs">⚠️</span> SOSPECHOSO</div>`;
                    }
                }

                let trendHtml = '';
                if (product.priceTrend && product.priceTrend.direction) {
                    const trend = product.priceTrend;
                    let sparklineHtml = '';
                    
                    if (trend.history && trend.history.length > 0) {
                        try {
                            const dps = trend.history.map(h => h.price).reverse(); // oldest to newest
                            dps.push(precioNumerico); // add current price
                            
                            const minP = Math.min(...dps);
                            const maxP = Math.max(...dps);
                            const w = 60;
                            const h = 20;
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
                                <div class="tooltip tooltip-left ml-auto" data-tip="Tendencia (7 días)">
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
                }

                let couponHtml = '';
                const cuponObj = product.cupon;
                if (cuponObj) {
                    const code = typeof cuponObj === 'string' ? cuponObj : cuponObj.code;
                    const isPlaceholder = !code || code.trim() === '' || /^X+$/i.test(code.trim());
                    if (isPlaceholder) {
                        // Skip coupon display if it's a placeholder
                    } else {
                        const discountText = (typeof cuponObj === 'object' && cuponObj.discount) ? cuponObj.discount : (product.couponDetails || 'CUPÓN DISPONIBLE');
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
                                    <button onclick="event.preventDefault(); event.stopPropagation(); navigator.clipboard.writeText('${code}'); const orig=this.innerHTML; this.innerHTML='¡Copiado!'; setTimeout(()=>this.innerHTML=orig, 2000);" class="text-[10px] font-bold bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded-lg shadow-sm transition-all border border-emerald-100 z-20 cursor-pointer">Copiar</button>
                                </div>
                            </div>`;
                        } else {
                            couponHtml = `
                            <div class="mt-2 w-full p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl relative overflow-hidden group/upsell cursor-pointer hover:shadow-sm" onclick="event.preventDefault(); event.stopPropagation(); const btn = document.getElementById('stripe-checkout-btn') || document.querySelector('a[href*=\\'buy.stripe.com\\']'); if(btn) btn.click(); else alert('Hazte PRO para ver cupones')">
                                <div class="absolute inset-0 border-2 border-dashed border-amber-300/50 rounded-xl pointer-events-none"></div>
                                <div class="flex items-center justify-between relative z-10">
                                    <div class="flex flex-col w-full relative">
                                        <span class="text-[9px] font-black text-amber-800 uppercase tracking-widest leading-none mb-1 flex items-center justify-between w-full"><span>${discountText}</span> <span class="bg-amber-100 px-1 rounded">⭐ PRO</span></span>
                                        <span class="text-[13px] font-black text-slate-800 font-mono tracking-tighter leading-none blur-[4px] select-none text-center">XXXXXXXX</span>
                                        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/upsell:opacity-100 transition-opacity drop-shadow-md">
                                            <span class="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">🔒 Desbloquear</span>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        }
                    }
                }

                // Fase 6: FOMO Timer
                let fomoHtml = '';
                if (!isLocal && precioNumerico > 0) {
                    let hash = 0;
                    const str = sanitize(product.titulo || 'lumu');
                    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    const hours = (Math.abs(hash) % 11) + 1;
                    const mins = Math.abs(hash >> 2) % 60;
                    const secs = Math.abs(hash >> 4) % 60;
                    const pad = (n) => n.toString().padStart(2, '0');
                    fomoHtml = `
                    <div class="mt-2 w-full flex items-center justify-between p-2 bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-100/60 rounded-xl relative overflow-hidden group">
                        <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZWMwYTIiIGZpbGwtb3BhY2l0eT0iMC4yIi8+PC9zdmc+')] opacity-50"></div>
                        <span class="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5 relative z-10">
                            <svg class="w-3.5 h-3.5 animate-pulse text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Expira en
                        </span>
                        <span class="text-[11px] font-mono font-bold text-rose-700 bg-white/80 backdrop-blur px-2 py-0.5 rounded-md shadow-sm border border-rose-100/80 relative z-10">${pad(hours)}h ${pad(mins)}m ${pad(secs)}s</span>
                    </div>`;
                }

                // Local store extra details
                const localMeta = product.localDetails || {};
                const localDetailHtml = isLocal ? `
                <div class="mt-2 space-y-1">
                    ${localMeta.distance != null ? `<p class="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">📍 A ${localMeta.distance} km de ti</p>` : ''}
                    ${localMeta.address ? `<p class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${sanitize(localMeta.address)}</p>` : ''}
                    ${localMeta.rating ? `<p class="text-xs text-amber-500 font-bold">⭐ ${localMeta.rating} / 5.0</p>` : ''}
                    ${localMeta.phone ? `<p class="text-xs text-slate-500 dark:text-slate-400">📞 ${sanitize(localMeta.phone)}</p>` : ''}
                </div>` : '';

                const productAlt = sanitize(product.titulo || 'Producto') + ' - ' + sanitize(product.tienda || 'Tienda');
                card.innerHTML = `
                ${priceDropBadge}
                <!-- Image Section -->
                <div class="w-full bg-slate-50 border-b border-slate-100 flex-shrink-0 h-40 md:h-48 flex items-center justify-center p-3 md:p-4 relative overflow-hidden group-hover:bg-emerald-50/30 transition-colors">
                    <img src="${imgUrl}" alt="${productAlt}" loading="lazy" class="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-500 ease-out" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27300%27 height=%27300%27 viewBox=%270 0 300 300%27%3E%3Crect width=%27300%27 height=%27300%27 fill=%27%23f1f5f9%27/%3E%3Ctext x=%27150%27 y=%27160%27 text-anchor=%27middle%27 font-size=%2740%27 fill=%27%2394a3b8%27%3E📦%3C/text%3E%3C/svg%3E'">
                    <button class="btn-favorite absolute top-2 right-2 p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-full ${heartColor} hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-all z-20 hover:scale-110">
                        <svg class="w-5 h-5 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>
                    ${!isLocal ? `
                    <button class="btn-compare absolute top-2 left-2 p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-full ${_compareProducts.some(cp => (cp.urlMonetizada || cp.urlOriginal) === (product.urlMonetizada || product.urlOriginal)) ? 'text-emerald-600 bg-emerald-100' : 'text-slate-400'} hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-all z-20 hover:scale-110" title="Comparar" data-compare-url="${product.urlMonetizada || product.urlOriginal}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    </button>` : ''}
                </div>

                <!-- Info Section -->
                <div class="flex-grow flex flex-col p-3.5 md:p-4 w-full">
                    <div class="flex items-start justify-between mb-2 gap-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-full max-w-[70%] truncate">${sanitize(product.tienda)}</span>
                            ${(tiendaLower.includes('amazon') || tiendaLower.includes('walmart') || tiendaLower.includes('liverpool') || tiendaLower.includes('mercado') || tiendaLower.includes('bodega aurrera') || tiendaLower.includes('linio') || tiendaLower.includes('claro shop') || tiendaLower.includes('sanborns') || tiendaLower.includes('costco') || tiendaLower.includes('best buy')) ? '<span class="text-emerald-600" title="Tienda verificada">✓</span>' : ''}
                        </div>
                        <div class="flex items-center gap-1">
                            ${isBestPrice ? '<span class="text-[9px] font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 rounded-full ring-2 ring-emerald-200 shadow-sm animate-pulse">💰 MEJOR PRECIO</span>' : ''}
                            ${product.isLocalStore ? '<span class="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">📍 LOCAL</span>' : ''}
                        </div>
                    </div>
                    
                    <h3 class="text-[13px] md:text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2 min-h-[2.6rem] mb-2.5 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors" title="${sanitize(product.titulo)}">
                        ${sanitize(product.titulo)}
                    </h3>
                    ${localDetailHtml}

                    <div class="mt-auto flex flex-col w-full">
                        <div class="flex items-baseline gap-0.5 mb-1.5 flex-wrap">
                            ${priceDisplay}
                        </div>
                        ${trendHtml}
                        ${fomoHtml}
                        ${couponHtml}
                        
                        <div class="flex flex-col gap-2 mt-3 w-full">
                            <button class="btn-open-offer w-full bg-gradient-to-r from-[#00C853] to-[#00A344] hover:from-[#00A344] hover:to-[#008F3A] text-white text-sm font-bold py-2.5 rounded-xl shadow-[0_4px_12px_rgba(0,200,83,0.3)] hover:shadow-[0_6px_16px_rgba(0,200,83,0.4)] transition-all transform active:scale-95 flex items-center justify-center gap-2"
                                    data-target-url="${product.urlMonetizada || product.urlOriginal}">
                                ${isLocal ? ((product.urlOriginal && product.urlOriginal.includes('maps')) ? 'Ver en Maps' : 'Ir a Tienda') : 'Ver Oferta'}
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                            </button>
                            
                            <!-- Acciones secundarias en botones Outline abajo -->
                            ${(!isLocal && precioNumerico > 0) ? `
                            <div class="grid grid-cols-3 gap-2 w-full mt-1">
                                <button class="btn-quick-alert flex-1 py-1.5 flex justify-center items-center gap-1.5 bg-white text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-xl border border-slate-200 hover:border-amber-300 transition-all text-xs font-bold shadow-sm" title="Alerta de precio"
                                        data-alert-name="${sanitize(product.titulo)}"
                                        data-alert-price="${precioNumerico}"
                                        data-alert-url="${product.urlMonetizada || product.urlOriginal}"
                                        data-alert-store="${sanitize(product.tienda)}">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                                    Avisarme
                                </button>
                                <button class="btn-margin-calc flex-1 py-1.5 flex justify-center items-center gap-1.5 bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200 hover:border-blue-300 transition-all text-xs font-bold shadow-sm" title="Calculadora Dropshipping"
                                        data-cost-price="${precioNumerico}"
                                        data-product-name="${sanitize(product.titulo)}">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                </button>
                                <a href="https://wa.me/?text=${encodeURIComponent('¡Mira esta oferta que encontré en Lumu! 🚀\n' + product.titulo + '\nPrecio: ' + (product.precio_formateado || '$' + product.precio) + '\n\n👉 ' + (product.urlMonetizada || product.urlOriginal))}" target="_blank" rel="noopener noreferrer" class="flex-1 py-1.5 flex justify-center items-center gap-1.5 bg-white text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-slate-200 hover:border-emerald-300 transition-all text-xs font-bold shadow-sm" title="Compartir en WhatsApp">
                                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.47-1.761-1.643-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                </a>
                            </div>` : ''}
                            
                        </div>
                    </div>
                </div>
            `;

                // SEO Schema Markup (Phase 7)
                if (!isLocal && precioNumerico > 0) {
                    const schemaData = {
                        "@context": "https://schema.org/",
                        "@type": "Product",
                        "name": product.titulo,
                        "image": [imgUrl],
                        "offers": {
                            "@type": "Offer",
                            "url": product.urlMonetizada || product.urlOriginal,
                            "priceCurrency": getRegionConfig().currency,
                            "price": precioNumerico.toString(),
                            "availability": "https://schema.org/InStock",
                            "seller": {
                                "@type": "Organization",
                                "name": product.tienda || "Tienda Online"
                            }
                        }
                    };
                    card.innerHTML += `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`;
                }

                // Favorite toggle logic (Phase 17+)
                const btnFav = card.querySelector('.btn-favorite');
                const btnOpenOffer = card.querySelector('.btn-open-offer');
                const btnCompare = card.querySelector('.btn-compare');
                
                if (btnOpenOffer) {
                    btnOpenOffer.addEventListener('click', (e) => {
                        e.preventDefault();
                        const target = btnOpenOffer.getAttribute('data-target-url');
                        if (target && target !== 'undefined' && target !== 'null') {
                            if (typeof window.openAdGateway === 'function') {
                                window.openAdGateway(target);
                            } else {
                                window.open(target, '_blank');
                            }
                        } else {
                            console.warn('URL de oferta no encontrada para este producto');
                        }
                    });
                }
                // Compare toggle
                if (btnCompare) {
                    btnCompare.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleCompare(product, precioNumerico, formattedPrice);
                        btnCompare.animate([
                            { transform: 'scale(1)' },
                            { transform: 'scale(1.25)' },
                            { transform: 'scale(1)' }
                        ], { duration: 250 });
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

                            // Micro-animation
                            btnFav.animate([
                                { transform: 'scale(1)' },
                                { transform: 'scale(1.3)' },
                                { transform: 'scale(1)' }
                            ], { duration: 300 });
                        }
                    } catch (err) {
                        console.error('Error toggle favorito:', err);
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

        if (cookieBanner && !localStorage.getItem('lumu_cookies')) {
            setTimeout(() => {
                cookieBanner.classList.remove('translate-y-full');
            }, 1500); // Mostrar banner 1.5s después de cargar
        }

        function closeBanner() {
            cookieBanner.classList.add('translate-y-full');
        };

        if (btnAcceptCookies) {
            btnAcceptCookies.addEventListener('click', () => {
                localStorage.setItem('lumu_cookies', 'accepted');
                closeBanner();
                // Aquí en un futuro se inicializaría fbq('track', 'PageView');
            });
        }

        if (btnRejectCookies) {
            btnRejectCookies.addEventListener('click', () => {
                localStorage.setItem('lumu_cookies', 'rejected');
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
        alertsList.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Aún no tienes alertas configuradas.</p>';
        return;
    }
    alertsList.innerHTML = alerts.map((a, i) => `
        <div class="flex items-center justify-between p-3 ${a.triggered ? 'bg-emerald-100 border-emerald-300' : 'bg-emerald-50 border-emerald-100'} border rounded-xl">
            <div>
                <p class="text-sm font-bold text-slate-800">${sanitize(a.product)}</p>
                <p class="text-xs text-emerald-600 font-semibold">Meta: $${Number(a.price).toLocaleString('es-MX')} MXN</p>
                ${a.last_price ? `<p class="text-xs text-slate-500">Último precio visto: $${Number(a.last_price).toLocaleString('es-MX')}</p>` : ''}
                ${a.triggered ? '<p class="text-xs text-emerald-700 font-black">🎉 ¡Meta alcanzada!</p>' : ''}
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
                alert(json.error || 'Error al crear alerta');
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
                notif.innerHTML = `🎉 ¡Precio Meta Alcanzado! <span class="font-normal">${product.titulo?.slice(0, 30)} a $${price.toLocaleString('es-MX')}</span>`;
                document.body.appendChild(notif);
                setTimeout(() => notif.remove(), 6000);
                
                // Native Push Notification
                if ("Notification" in window && Notification.permission === "granted") {
                    try {
                        new Notification("¡Alerta de Precio de Lumu!", {
                            body: `Tu meta de $${alert.price} se cumplió. ${product.titulo?.slice(0, 40)} está ahora a $${price.toLocaleString('es-MX')}.`,
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
                    <h3 class="text-lg font-black text-slate-900">Crear Alerta de Precio</h3>
                    <p class="text-xs text-slate-500">Te avisaremos cuando baje</p>
                </div>
            </div>
            <p class="text-xs text-slate-600 mb-4 line-clamp-2 font-medium">${sanitize(productName)}</p>
            
            <div class="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
                <p class="text-xs text-slate-500 mb-1">Precio actual: <strong class="text-slate-800">$${currentPrice.toLocaleString('es-MX')}</strong></p>
                <div class="relative mt-2">
                    <label class="block text-xs font-bold text-slate-700 mb-1">Tu precio meta:</label>
                    <span class="absolute left-3 top-7 text-slate-400 font-bold">$</span>
                    <input type="number" id="qa-target-price" value="${suggestedPrice}" min="1" class="w-full pl-7 pr-3 py-3 border border-slate-200 rounded-xl text-lg font-black text-emerald-700 focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none shadow-sm">
                </div>
            </div>
            
            <button id="qa-btn-save" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.2)] transition-all">
                Activar Alerta
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
                    alert(json.error || 'Error al crear alerta');
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
            ? '🔔 Alerta local creada. Inicia sesión para alertas push.'
            : `🔔 Alerta creada: te avisaremos cuando baje a $${price.toLocaleString('es-MX')}`;
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

    const shippingDefault = 99;
    const feeDefault = 13; // MercadoLibre average fee %
    const suggestedSell = Math.ceil(costPrice * 1.4); // 40% markup suggestion

    const modal = document.createElement('div');
    modal.id = 'margin-calc-modal';
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center fade-in';
    modal.innerHTML = `
                < div class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onclick = "document.getElementById('margin-calc-modal')?.remove()" ></div >
                    <div class="relative z-10 bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-full mx-4 border border-slate-200">
                        <button onclick="document.getElementById('margin-calc-modal')?.remove()" class="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 rounded-full transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div class="flex items-center gap-3 mb-5">
                            <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-black text-slate-900">Calculadora de Margen</h3>
                                <p class="text-xs text-slate-500">Dropshipping / Reventa</p>
                            </div>
                        </div>
                        <p class="text-xs text-slate-600 mb-4 line-clamp-1 font-medium">${productName}</p>
                        <div class="space-y-3">
                            <div class="flex items-center gap-3">
                                <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">Costo</label>
                                <div class="relative flex-1"><span class="absolute left-3 top-2.5 text-slate-400 text-sm">$</span><input type="number" id="mc-cost" value="${costPrice}" class="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" readonly></div>
                            </div>
                            <div class="flex items-center gap-3">
                                <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">Precio venta</label>
                                <div class="relative flex-1"><span class="absolute left-3 top-2.5 text-slate-400 text-sm">$</span><input type="number" id="mc-sell" value="${suggestedSell}" min="1" class="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"></div>
                            </div>
                            <div class="flex items-center gap-3">
                                <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">Envío</label>
                                <div class="relative flex-1"><span class="absolute left-3 top-2.5 text-slate-400 text-sm">$</span><input type="number" id="mc-shipping" value="${shippingDefault}" min="0" class="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"></div>
                            </div>
                            <div class="flex items-center gap-3">
                                <label class="text-sm font-bold text-slate-700 w-28 flex-shrink-0">Comisión %</label>
                                <div class="relative flex-1"><input type="number" id="mc-fee" value="${feeDefault}" min="0" max="100" step="0.5" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"><span class="absolute right-3 top-2.5 text-slate-400 text-sm">%</span></div>
                            </div>
                        </div>
                        <div id="mc-result" class="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-200"></div>
                        <p class="text-[10px] text-slate-400 mt-3 text-center">Comisiones comunes: MercadoLibre ~13%, Amazon ~15%, Shopify ~3.9%</p>
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
            < div class="grid grid-cols-3 gap-3 text-center" >
                <div>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">Ganancia</p>
                    <p class="text-lg font-black text-${color}-600">$${profit.toFixed(0)}</p>
                </div>
                <div>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">Margen</p>
                    <p class="text-lg font-black text-${color}-600">${margin.toFixed(1)}%</p>
                </div>
                <div>
                    <p class="text-[10px] text-slate-500 font-bold uppercase">ROI</p>
                    <p class="text-lg font-black text-${color}-600">${roi.toFixed(1)}%</p>
                </div>
            </div >
            <div class="mt-3 text-xs text-slate-500 space-y-1">
                <div class="flex justify-between"><span>Costo producto</span><span class="font-bold">$${cost.toFixed(2)}</span></div>
                <div class="flex justify-between"><span>+ Envío</span><span class="font-bold">$${shipping.toFixed(2)}</span></div>
                <div class="flex justify-between"><span>+ Comisión (${feePct}%)</span><span class="font-bold">$${fee.toFixed(2)}</span></div>
                <div class="flex justify-between border-t border-slate-200 pt-1 mt-1"><span class="font-bold">Total costos</span><span class="font-black text-slate-800">$${(cost + shipping + fee).toFixed(2)}</span></div>
            </div>
            ${!isPositive ? '<p class="text-xs text-rose-600 font-bold mt-2 text-center">⚠️ Estás perdiendo dinero con estos números</p>' : margin < 15 ? '<p class="text-xs text-amber-600 font-bold mt-2 text-center">⚠️ Margen bajo — considera subir el precio</p>' : '<p class="text-xs text-emerald-600 font-bold mt-2 text-center">✅ Margen saludable para dropshipping</p>'}
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

window.openAdGateway = async function (targetUrlOriginal, isReward = false) {
    window._pendingAdUrlOriginal = targetUrlOriginal;
    
    if (targetUrlOriginal === 'reward' || isReward === true) {
        window.currentAdIsForReward = true;
    } else {
        window.currentAdIsForReward = false;
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

    if (isVIP || window.adsWatchedCache[targetUrlOriginal]) {
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
    btnSkipAd.innerHTML = '<span class="animate-pulse">⏳ Preparando acceso a la oferta...</span>';
    
    // SAFETY FALLBACK: Reducido a 3 segundos para mejor UX pero con mensaje más claro
    if (window._adFallbackTimer) clearTimeout(window._adFallbackTimer);
    window._adFallbackTimer = setTimeout(() => {
        console.log('[Ad] Fallback activado: IMA no respondió a tiempo. Habilitando acceso directo.');
        onAdComplete();
    }, 3000);

    // Intentar cargar Video Ads via IMA
    if (typeof adsLoader !== 'undefined' && adsLoader && typeof google !== 'undefined' && google && google.ima) {
        btnSkipAd.innerHTML = '<span class="animate-pulse">Cargando Anuncio...</span>';
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
    const adsRequest = new google.ima.AdsRequest();
    // Rewarded Video ad tag — set REWARDED_AD_TAG_URL in your Google Ad Manager account
    // IMPORTANT: The URL below is Google's TEST tag ($0 revenue). Replace with your production tag.
    adsRequest.adTagUrl = window.__LUMU_CONFIG?.rewardedAdTagUrl || 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';

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
            btnSkipAd.innerHTML = '🎉 Reclamar 3 Búsquedas Extra';
            btnSkipAd.onclick = async () => {
                btnSkipAd.disabled = true;
                btnSkipAd.innerHTML = '<span class="animate-pulse">Procesando...</span>';
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
                        toast.innerHTML = `<span class="text-2xl">🎉</span> ¡Ganaste 3 búsquedas extra! Puedes continuar buscando.`;
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 5000);

                        document.getElementById('search-input').focus();
                    } else {
                        btnSkipAd.disabled = false;
                        btnSkipAd.innerHTML = 'Error al reclamar. Reintentar';
                    }
                } catch (err) {
                    console.error('Reward claim error:', err);
                    btnSkipAd.disabled = false;
                    btnSkipAd.innerHTML = 'Error al reclamar. Reintentar';
                }
            };
        } else {
            btnSkipAd.innerHTML = 'Ir a la Oferta →';
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
    console.error('IMA Ad Error:', adErrorEvent ? adErrorEvent.getError() : 'Unknown error');
    if (adsManager) {
        try { adsManager.destroy(); } catch (e) { }
    }
    // Si falla IMA, activar fallback de 30s automáticamente
    startFallbackCountdown();
}

function startFallbackCountdown() {
    const countdownOverlay = document.getElementById('ad-countdown-overlay');
    window.currentAdIsForReward = false;
    if (countdownOverlay) countdownOverlay.classList.remove('hidden');

    let timeLeft = 3; // FIX: Reducido a 3s para mejor UX
    if (adCountdownText) adCountdownText.innerText = timeLeft;

    if (btnSkipAd) {
        btnSkipAd.disabled = true;
        btnSkipAd.innerHTML = '<span class="animate-pulse">⏳ Cargando oferta...</span>';
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

            form.classList.add('hidden');
            successDiv.classList.remove('hidden');
            if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

            setTimeout(closeFeedback, 3000);
        } catch (err) {
            console.error('Feedback Error:', err);
            form.classList.add('hidden');
            // Show error instead of fake success
            successDiv.innerHTML = '<div class="text-center py-6"><span class="text-3xl">😕</span><p class="font-bold text-slate-700 mt-2">No pudimos enviar tu opinión</p><p class="text-slate-500 text-sm">Intenta de nuevo más tarde.</p></div>';
            successDiv.classList.remove('hidden');
            setTimeout(closeFeedback, 3000);
        } finally {
            btnSubmit.disabled = false;
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

    if (!textarea || !textarea.value.trim()) {
        showGlobalFeedback('Por favor, ingresa al menos un producto a buscar.');
        return;
    }

    const queries = textarea.value.split('\n').filter(q => q.trim().length > 0).slice(0, 10);

    if (!window.currentUser) {
        if (typeof openModal === 'function') {
            closeB2b();
            openModal();
            showGlobalFeedback('Debes ingresar para usar el Plan Reseller.', 'error');
        }
        return;
    }

    loader.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">Procesando lote...</td></tr>';
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

                tbody.innerHTML = `< tr > <td colspan="4" class="px-4 py-12 text-center text-amber-600 font-bold bg-amber-50">
                <p class="mb-4">⚡ Esta función es exclusiva del Plan Revendedor VIP.</p>
                <a href="${stripeUrl}" target="_blank" onclick="if(typeof confetti === 'function') confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } })" class="inline-block bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-xl transition-all shadow-md">Obtener Plan B2B Ahora</a>
            </td></tr > `;
                showGlobalFeedback(data.error, 'error');
            } else {
                tbody.innerHTML = `< tr > <td colspan="4" class="px-4 py-12 text-center text-red-500 font-bold">Error: ${data.error || 'Fallo al procesar el lote.'}</td></tr > `;
            }
            return;
        }

        window.lastB2bData = data.resultados;

        tbody.innerHTML = '';
        data.resultados.forEach(res => {
            if (!res.encontrado && !res.mejor_oferta) {
                tbody.innerHTML += `
            < tr class="bg-white hover:bg-slate-50 border-b" >
                        <td class="px-4 py-3 font-medium text-slate-900">${sanitize(res.query_original)}</td>
                        <td class="px-4 py-3 text-slate-400 italic">No encontrado</td>
                        <td class="px-4 py-3">-</td>
                        <td class="px-4 py-3 text-center">-</td>
                    </tr >
            `;
            } else {
                const priceFormatted = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(res.mejor_oferta.precio || 0);
                tbody.innerHTML += `
            < tr class="bg-white hover:bg-slate-50 border-b" >
                        <td class="px-4 py-3 font-medium text-slate-900 truncate max-w-[200px]" title="${sanitize(res.query_original)}">${sanitize(res.query_original)}</td>
                        <td class="px-4 py-3 font-bold text-emerald-600">${priceFormatted}</td>
                        <td class="px-4 py-3" title="${sanitize(res.mejor_oferta.tienda)}">
                            <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase">${sanitize(res.mejor_oferta.tienda)}</span>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <a href="${sanitize(res.mejor_oferta.urlMonetizada || res.mejor_oferta.urlOriginal)}" target="_blank" class="text-blue-500 hover:text-blue-700 hover:underline font-bold text-xs inline-flex items-center gap-1">
                                Comprar <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                            </a>
                        </td>
                    </tr >
            `;
            }
        });

        if (data.resultados.length > 0) {
            btnExport.disabled = false;
        }

    } catch (err) {
        console.error("Error processB2bQueries:", err);
        tbody.innerHTML = `< tr > <td colspan="4" class="px-4 py-12 text-center text-red-500 font-bold">🚨 Error de conexión. Intenta de nuevo.</td></tr > `;
    } finally {
        loader.classList.add('hidden');
    }
}

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
            preview.innerHTML = '<div class="p-4 text-center text-xs font-bold text-slate-500">Ingresa para ver tus favoritos</div>';
            showPreview();
            return;
        }

        preview.innerHTML = '<div class="p-4 flex justify-center"><div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>';
        showPreview();

        try {
            const { data } = await window.supabaseClient.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3);

            if (!data || data.length === 0) {
                preview.innerHTML = '<div class="p-4 text-center text-xs font-bold text-slate-400">No tienes favoritos aún</div>';
            } else {
                let html = '<div class="p-3 border-b border-slate-50 font-black text-[10px] text-slate-400 uppercase tracking-widest">Tus últimos favoritos</div>';
                data.forEach((fav, idx) => {
                    const prod = fav.product_data || {};
                    const priceFormatted = fav.product_price || (prod.precio ? '$' + prod.precio : 'Ver precio');
                    const safeUrl = sanitize(fav.product_url || '#');
                    const safeTitle = sanitize(prod.titulo || fav.product_title || 'Producto');
                    const safeImg = sanitize(prod.imagen || fav.product_image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50' viewBox='0 0 50 50'%3E%3Crect width='50' height='50' fill='%23f1f5f9' rx='8'/%3E%3Ctext x='25' y='32' text-anchor='middle' font-size='18' fill='%2394a3b8'%3E📦%3C/text%3E%3C/svg%3E");

                    html += `
            < div class="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0 fav-preview-item" data - url="${encodeURI(safeUrl)}" >
                <img src="${safeImg}" class="w-10 h-10 object-contain rounded-lg bg-white border border-slate-100 p-0.5" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'10\\' viewBox=\\'0 0 10 10\\'%3E%3Crect width=\\'10\\' height=\\'10\\' fill=\\'%23f1f5f9\\'/%3E%3C/svg%3E'">
                    <div class="overflow-hidden">
                        <p class="text-[11px] font-bold text-slate-800 truncate">${safeTitle}</p>
                        <p class="text-[10px] font-black text-emerald-600">${priceFormatted}</p>
                    </div>
                </div>
        `;
                });
                html += '<div class="p-2 bg-slate-50 text-center"><button onclick="if(typeof openFavorites===\'function\') openFavorites()" class="text-[10px] font-black text-primary hover:underline">Ver todos los favoritos</button></div>';
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
            preview.innerHTML = '<div class="p-4 text-center text-xs text-red-500">Error al cargar</div>';
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
    if (!adModal || !btnSkipAd) return;

    window.currentAdIsForReward = true;

    if (errorMessage) errorMessage.classList.add('hidden');

    adModal.classList.remove('invisible', 'opacity-0');
    adModal.classList.add('opacity-100');

    btnSkipAd.disabled = true;

    const rewardUser = () => {
        let searchData = JSON.parse(localStorage.getItem('lumu_searches_data') || '{"count": 0, "date": null}');
        // Give 3 extra searches locally
        searchData.count = Math.max(0, (searchData.count || 0) - 3);
        localStorage.setItem('lumu_searches_data', JSON.stringify(searchData));

        // Also try to grant credits server-side for authenticated users
        const sb = window.supabaseClient;
        const user = window.currentUser;
        if (sb && user) {
            sb.auth.getSession().then(({ data: session }) => {
                const token = session?.session?.access_token;
                if (token) {
                    // Delete the 3 most recent search entries to "give back" credits
                    sb.from('searches')
                        .select('id')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(3)
                        .then(({ data }) => {
                            if (data && data.length > 0) {
                                const ids = data.map(d => d.id);
                                sb.from('searches').delete().in('id', ids).then(() => {
                                    console.log('[RewardAd] Server-side: removed', ids.length, 'search entries');
                                }).catch(() => { });
                            }
                        }).catch(() => { });
                }
            }).catch(() => { });
        }

        closeAdGateway();

        setTimeout(() => {
            if (searchInput) searchInput.focus();
        }, 300);
    };

    if (typeof adsLoader !== 'undefined' && adsLoader && typeof google !== 'undefined' && google && google.ima) {
        btnSkipAd.innerHTML = '<span class="animate-pulse">Cargando Anuncio...</span>';
        requestAd();
        btnSkipAd.onclick = rewardUser;
    } else {
        // Fallback inmediato
        if (typeof startFallbackCountdown === 'function') {
            startFallbackCountdown();
        } else {
            // Fallback minimalista si todo falla
            btnSkipAd.disabled = false;
            btnSkipAd.innerHTML = '🎉 Reclamar 3 Búsquedas Extra';
            btnSkipAd.onclick = rewardUser;
        }
        btnSkipAd.onclick = rewardUser;
    }
};

// ============================================
// INTERACTIVE TUTORIAL (Spotlight Walkthrough)
// ============================================

const tutorialSteps = [
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
                        <button id="tutorial-skip" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold px-3 py-2 rounded-lg transition-colors">Saltar</button>
                        <button id="tutorial-next" class="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95">Siguiente →</button>
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
    const step = tutorialSteps[tutorialStep];
    if (!step) { endTutorial(); return; }

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
        // Skip to next if element not found
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

        // Position spotlight
        spotlight.style.top = (rect.top - padding + window.scrollY) + 'px';
        spotlight.style.left = (rect.left - padding) + 'px';
        spotlight.style.width = (rect.width + padding * 2) + 'px';
        spotlight.style.height = (rect.height + padding * 2) + 'px';

        // Fill tooltip content
        document.getElementById('tutorial-icon').textContent = step.icon;
        document.getElementById('tutorial-title').textContent = step.title;
        document.getElementById('tutorial-text').textContent = step.text;

        // Update progress dots
        const progressContainer = document.getElementById('tutorial-progress');
        progressContainer.innerHTML = tutorialSteps.map((_, i) =>
            `<div class="w-2 h-2 rounded-full transition-colors ${i === tutorialStep ? 'bg-emerald-500' : i < tutorialStep ? 'bg-emerald-300' : 'bg-slate-200 dark:bg-slate-600'}"></div>`
        ).join('');

        // Update button text
        const nextBtn = document.getElementById('tutorial-next');
        nextBtn.textContent = tutorialStep === tutorialSteps.length - 1 ? '¡Listo! 🎉' : 'Siguiente →';

        // Position tooltip
        const tooltipRect = tooltip.getBoundingClientRect();
        const arrow = tooltip.querySelector('.tutorial-tooltip-arrow');

        if (step.position === 'bottom') {
            tooltip.style.top = (rect.bottom + padding + 16 + window.scrollY) + 'px';
            arrow.className = 'tutorial-tooltip-arrow arrow-top';
        } else {
            tooltip.style.top = (rect.top - padding - tooltipRect.height - 16 + window.scrollY) + 'px';
            arrow.className = 'tutorial-tooltip-arrow arrow-bottom';
        }

        // Center horizontally relative to target
        let tooltipLeft = rect.left + (rect.width / 2) - 160;
        tooltipLeft = Math.max(16, Math.min(tooltipLeft, window.innerWidth - 336));
        tooltip.style.left = tooltipLeft + 'px';

        // Animate in
        spotlight.classList.add('active');
        tooltip.classList.add('active');

        // Run step action if any
        if (step.action) step.action();
    }, 400);
}

function nextTutorialStep() {
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
        showGlobalFeedback('¡Tutorial completado! Ya sabes usar Lumu como un pro 🎉', 'success');
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
        const raw = localStorage.getItem('lumu_wishlist') || '[]';
        let items = [];
        try { items = JSON.parse(raw); } catch(e) {}

        if (items.length === 0) {
            if (preview) preview.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Aún no tienes productos guardados ❤️</p>';
        } else {
            if (preview) {
                preview.innerHTML = items.map(p => `
                    <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                        ${p.img ? `<img src="${p.img}" class="w-10 h-10 object-contain rounded-lg" onerror="this.style.display='none'" />` : ''}
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold text-slate-700 truncate">${p.name || 'Producto'}</p>
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
        const waMsg = encodeURIComponent(`🛍️ ¡Mira mi wishlist de Lumu! ${items.length} productos que quiero comprar:\n${shareUrl}`);
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
            copyBtn.textContent = '¡Copiado!';
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
        if (typeof showToast === 'function') showToast('🎉 ¡Gracias! Tu experiencia ayuda a otros compradores');
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
    const ACHIEVEMENTS = [
        { id: 'explorer',  emoji: '🔍', label: 'Explorador',  desc: 'Tu primera búsqueda',  threshold: 1  },
        { id: 'hunter',    emoji: '🎯', label: 'Cazador',     desc: '10 búsquedas',          threshold: 10 },
        { id: 'detective', emoji: '🕵️', label: 'Detective',   desc: '25 búsquedas',          threshold: 25 },
        { id: 'expert',    emoji: '⚡', label: 'Experto',     desc: '50 búsquedas',          threshold: 50 },
        { id: 'legend',    emoji: '👑', label: 'Leyenda',     desc: '100 búsquedas',         threshold: 100 },
        { id: 'lumuplus',  emoji: '💎', label: 'Lumu+',       desc: 'Usuario Premium',       threshold: null, premiumOnly: true },
    ];

    function getSearchCount() {
        const raw = localStorage.getItem('lumu_searches_data');
        if (!raw) return 0;
        try { return JSON.parse(raw).count || 0; } catch(e) { return 0; }
    }

    function renderAchievements() {
        const body = document.getElementById('achievements-body');
        if (!body) return;
        const count = getSearchCount();
        const isPremium = window.currentUser?.is_premium || window.currentUser?.plan === 'personal_vip' || window.currentUser?.plan === 'b2b';

        body.innerHTML = ACHIEVEMENTS.map(a => {
            const unlocked = a.premiumOnly ? isPremium : count >= a.threshold;
            return `
                <div class="flex flex-col items-center text-center p-3 rounded-2xl ${unlocked ? 'bg-gradient-to-b from-emerald-50 to-teal-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100 opacity-50 grayscale'}">
                    <span class="text-3xl mb-1">${a.emoji}</span>
                    <p class="text-xs font-black text-slate-800 leading-tight">${a.label}</p>
                    <p class="text-[9px] text-slate-500 leading-tight mt-0.5">${a.desc}</p>
                    ${unlocked ? '<span class="text-[9px] font-bold text-emerald-600 mt-1">✓ Obtenido</span>' : ''}
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
        const count = getSearchCount();
        ACHIEVEMENTS.filter(a => !a.premiumOnly && a.threshold && lastCheckedCount < a.threshold && count >= a.threshold).forEach(a => {
            setTimeout(() => {
                if (typeof showToast === 'function') showToast(`🏆 ¡Lograste el nivel "${a.label}"! ${a.emoji}`);
            }, 1500);
        });
        lastCheckedCount = count;
    };
})();

