const fs = require('fs');
const path = require('path');

const brainDir = "C:\\Users\\USER\\.gemini\\antigravity\\brain\\5e5f7948-bc2e-4995-9ed6-84327ba2e664";
const publicImgDir = path.join(__dirname, "public", "images");

// 1. Copy Images
const prefixes = ["promo_headphones", "promo_thermos", "promo_phonecase", "promo_charger", "promo_backpack", "promo_lamp", "hogar_robot", "hogar_coffee", "hogar_chair", "hogar_kitchen", "moda_sneakers", "moda_skincare", "moda_jacket", "moda_perfume", "moda_watch" ];

prefixes.forEach(prefix => {
  const files = fs.readdirSync(brainDir).filter(f => f.startsWith(prefix) && f.endsWith('.png'));
  if (files.length > 0) {
    const latest = files.sort((a,b) => fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs)[0];
    fs.copyFileSync(path.join(brainDir, latest), path.join(publicImgDir, prefix + '.png'));
  }
});

// 2. Read HTML
let html = fs.readFileSync('public/index.html', 'utf8');

// HELPER
function replaceBetween(str, start, end, replacement) {
    const s = str.indexOf(start);
    const e = str.indexOf(end, s);
    if (s !== -1 && e !== -1) {
        return str.substring(0, s + start.length) + "\n" + replacement + "\n" + str.substring(e);
    }
    return str;
}

// Ofertas Menos de 500
const ofertasHTML = `        <section class="w-full max-w-7xl mx-auto px-4 mt-8 mb-4 fade-in py-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl md:text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span class="text-emerald-500">🏷️</span> Ofertas por menos de $500
                </h3>
            </div>
            
            <div class="flex overflow-x-auto gap-4 pb-6 snap-x snap-[mandatory] custom-scrollbar px-1">
                <!-- Item 1 -->
                <div class="relative w-48 md:w-56 min-h-[220px] flex flex-col flex-shrink-0 snap-start bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group" onclick="document.getElementById('search-input').value='Auriculares TWS'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="absolute top-0 left-0 bg-emerald-500 text-white text-[9px] font-black px-2 py-1 rounded-tl-2xl rounded-br-xl z-10 tracking-widest uppercase">Envío Gratis</div>
                    <div class="aspect-square bg-slate-50 dark:bg-slate-700 rounded-xl mb-3 flex items-center justify-center p-3 overflow-hidden">
                        <img src="/images/promo_headphones.png" alt="Auriculares" class="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    </div>
                    <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-2 line-clamp-2">Auriculares Inalámbricos TWS Blancos</h4>
                    <div class="mt-auto">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-slate-900 dark:text-white">$299</span>
                            <span class="text-[10px] font-bold text-white bg-red-500 px-1 py-0.5 rounded">-40%</span>
                        </div>
                    </div>
                </div>
                
                <!-- Item 2 -->
                <div class="relative w-48 md:w-56 min-h-[220px] flex flex-col flex-shrink-0 snap-start bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group" onclick="document.getElementById('search-input').value='Termo Acero'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="absolute top-0 left-0 bg-blue-500 text-white text-[9px] font-black px-2 py-1 rounded-tl-2xl rounded-br-xl z-10 tracking-widest uppercase">Más Vendido</div>
                    <div class="aspect-square bg-slate-50 dark:bg-slate-700 rounded-xl mb-3 flex items-center justify-center p-3 overflow-hidden">
                        <img src="/images/promo_thermos.png" alt="Termo" class="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    </div>
                    <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-2 line-clamp-2">Termo Acero Inoxidable 1L Aislante</h4>
                    <div class="mt-auto">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-slate-900 dark:text-white">$350</span>
                            <span class="text-[10px] font-bold text-white bg-red-500 px-1 py-0.5 rounded">-15%</span>
                        </div>
                    </div>
                </div>

                <!-- Item 3 -->
                <div class="relative w-48 md:w-56 min-h-[220px] flex flex-col flex-shrink-0 snap-start bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group" onclick="document.getElementById('search-input').value='Cargador 20W'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="aspect-square bg-slate-50 dark:bg-slate-700 rounded-xl mb-3 flex items-center justify-center p-3 overflow-hidden">
                        <img src="/images/promo_charger.png" alt="Cargador" class="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    </div>
                    <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-2 line-clamp-2">Cargador Rápido 20W USB-C</h4>
                    <div class="mt-auto">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-slate-900 dark:text-white">$249</span>
                            <span class="text-[10px] font-bold text-white bg-red-500 px-1 py-0.5 rounded">-20%</span>
                        </div>
                    </div>
                </div>

                <!-- Item 4 -->
                <div class="relative w-48 md:w-56 min-h-[220px] flex flex-col flex-shrink-0 snap-start bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group" onclick="document.getElementById('search-input').value='Mochila'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="absolute top-0 left-0 bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-tl-2xl rounded-br-xl z-10 tracking-widest uppercase">Flash Sale</div>
                    <div class="aspect-square bg-slate-50 dark:bg-slate-700 rounded-xl mb-3 flex items-center justify-center p-3 overflow-hidden">
                        <img src="/images/promo_backpack.png" alt="Mochila" class="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    </div>
                    <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-2 line-clamp-2">Mochila Casual Impermeable</h4>
                    <div class="mt-auto">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-slate-900 dark:text-white">$499</span>
                            <span class="text-[10px] font-bold text-white bg-red-500 px-1 py-0.5 rounded">-30%</span>
                        </div>
                    </div>
                </div>

                <!-- Item 5 -->
                <div class="relative w-48 md:w-56 min-h-[220px] flex flex-col flex-shrink-0 snap-start bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group" onclick="document.getElementById('search-input').value='Lámpara Escritorio'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="aspect-square bg-slate-50 dark:bg-slate-700 rounded-xl mb-3 flex items-center justify-center p-3 overflow-hidden">
                        <img src="/images/promo_lamp.png" alt="Lámpara" class="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    </div>
                    <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-2 line-clamp-2">Lámpara LED de Escritorio Moderna</h4>
                    <div class="mt-auto">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-slate-900 dark:text-white">$450</span>
                        </div>
                    </div>
                </div>
            </div>`;

html = replaceBetween(html, '<!-- 1. Menos de $500 -->', '</section>', ofertasHTML);

const modaHTML = `        <section class="w-full max-w-7xl mx-auto px-4 mt-8 mb-4 fade-in relative py-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl md:text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span class="text-pink-500">✨</span> Tendencias en Moda
                </h3>
            </div>
            <div class="absolute inset-0 bg-gradient-to-r from-rose-50 dark:from-rose-900/10 to-transparent -z-10 rounded-3xl"></div>
            
            <div class="flex overflow-x-auto gap-4 pb-6 snap-x snap-[mandatory] custom-scrollbar px-1">
                <!-- Portrait Card 1 -->
                <div class="relative w-56 md:w-64 h-80 flex-shrink-0 snap-start rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group overflow-hidden" onclick="document.getElementById('search-input').value='Tenis Moda'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <img src="/images/moda_sneakers.png" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Tenis">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                    <div class="absolute inset-x-0 bottom-0 p-5">
                        <div class="bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded inline-block mb-2 uppercase tracking-wide backdrop-blur-sm">Streetwear</div>
                        <h4 class="font-bold text-white text-lg leading-tight mb-1">Tenis Urbanos</h4>
                        <span class="text-2xl font-black text-emerald-400">Desde $599</span>
                    </div>
                </div>

                <!-- Portrait Card 2 -->
                <div class="relative w-56 md:w-64 h-80 flex-shrink-0 snap-start rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group overflow-hidden" onclick="document.getElementById('search-input').value='Skincare Premium'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <img src="/images/moda_skincare.png" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Skincare">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                    <div class="absolute inset-x-0 bottom-0 p-5">
                        <div class="bg-pink-500/90 text-white text-[10px] font-bold px-2 py-1 rounded inline-block mb-2 uppercase tracking-wide backdrop-blur-sm">Cuidado Facial</div>
                        <h4 class="font-bold text-white text-lg leading-tight mb-1">Sueros Premium</h4>
                        <span class="text-2xl font-black text-pink-300">Top Choices</span>
                    </div>
                </div>

                <!-- Portrait Card 3 -->
                <div class="relative w-56 md:w-64 h-80 flex-shrink-0 snap-start rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group overflow-hidden" onclick="document.getElementById('search-input').value='Chamarra Bomber'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <img src="/images/moda_jacket.png" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Chamarra">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                    <div class="absolute inset-x-0 bottom-0 p-5">
                        <div class="bg-rose-500/90 text-white text-[10px] font-bold px-2 py-1 rounded inline-block mb-2 uppercase tracking-wide backdrop-blur-sm">Nueva Colección</div>
                        <h4 class="font-bold text-white text-lg leading-tight mb-1">Chamarras Ligeras</h4>
                        <span class="text-2xl font-black text-rose-300">Hasta 30% OFF</span>
                    </div>
                </div>
                
                <!-- Portrait Card 4 -->
                <div class="relative w-56 md:w-64 h-80 flex-shrink-0 snap-start rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group overflow-hidden" onclick="document.getElementById('search-input').value='Reloj de Lujo'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <img src="/images/moda_watch.png" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Reloj">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                    <div class="absolute inset-x-0 bottom-0 p-5">
                        <div class="bg-amber-500/90 text-white text-[10px] font-bold px-2 py-1 rounded inline-block mb-2 uppercase tracking-wide backdrop-blur-sm">Accesorios</div>
                        <h4 class="font-bold text-white text-lg leading-tight mb-1">Relojes Elite</h4>
                        <span class="text-2xl font-black text-amber-300">Envío Gratis</span>
                    </div>
                </div>
            </div>`;

html = replaceBetween(html, '<!-- 4. Moda y Cuidado Personal -->', '</section>', modaHTML);

const hogarHTML = `        <section class="w-full max-w-7xl mx-auto px-4 mt-8 mb-12 fade-in relative py-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl md:text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span class="text-orange-500">🏠</span> Para tu Hogar
                </h3>
            </div>
            <div class="absolute inset-0 bg-amber-50/30 dark:bg-amber-900/10 -z-10 rounded-3xl"></div>
            
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer text-center group flex flex-col items-center justify-center relative overflow-hidden" onclick="document.getElementById('search-input').value='Aspiradora Robot'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="absolute top-2 right-2 bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full">TOP</div>
                    <img src="/images/hogar_robot.png" class="h-28 object-contain mix-blend-multiply dark:mix-blend-normal mb-4 group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    <h4 class="font-bold text-slate-800 dark:text-white text-sm">Limpieza Inteligente</h4>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer text-center group flex flex-col items-center justify-center relative overflow-hidden" onclick="document.getElementById('search-input').value='Cafetera'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <div class="absolute top-2 right-2 bg-rose-100 text-rose-800 text-[9px] font-bold px-2 py-0.5 rounded-full">-10%</div>
                    <img src="/images/hogar_coffee.png" class="h-28 object-contain mix-blend-multiply dark:mix-blend-normal mb-4 group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    <h4 class="font-bold text-slate-800 dark:text-white text-sm">Cafeteras</h4>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer text-center group flex flex-col items-center justify-center relative overflow-hidden" onclick="document.getElementById('search-input').value='Silla Ergonomica'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <img src="/images/hogar_chair.png" class="h-28 object-contain mix-blend-multiply dark:mix-blend-normal mb-4 group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    <h4 class="font-bold text-slate-800 dark:text-white text-sm">Sillas de Oficina</h4>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer text-center group flex flex-col items-center justify-center relative overflow-hidden" onclick="document.getElementById('search-input').value='Bateria Cocina'; document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));">
                    <img src="/images/hogar_kitchen.png" class="h-28 object-contain mix-blend-multiply dark:mix-blend-normal mb-4 group-hover:scale-110 transition-transform duration-500 rounded-lg">
                    <h4 class="font-bold text-slate-800 dark:text-white text-sm">Cocina Premium</h4>
                </div>
            </div>`;

html = replaceBetween(html, '<!-- 5. Para tu Hogar -->', '</section>', hogarHTML);

// 3. Add Trust Section
const trustHTML = `
        <!-- Confianza y Seguridad -->
        <div class="w-full bg-white dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700 mt-16 py-12 fade-in">
            <div class="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-700">
                <!-- 1 -->
                <div class="pt-6 md:pt-0 md:px-6 flex flex-col items-center">
                    <div class="w-16 h-16 mb-4 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                    </div>
                    <h4 class="text-lg font-bold text-slate-900 dark:text-white mb-2">Paga como quieras</h4>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">Con Lumu puedes encontrar opciones para pagar con tarjeta, débito, efectivo o Meses sin Intereses.</p>
                </div>
                <!-- 2 -->
                <div class="pt-6 md:pt-0 md:px-6 flex flex-col items-center">
                    <div class="w-16 h-16 mb-4 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                    </div>
                    <h4 class="text-lg font-bold text-slate-900 dark:text-white mb-2">Envío rápido y seguro</h4>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">Encuentra millones de productos con envíos relámpago a todo México.</p>
                </div>
                <!-- 3 -->
                <div class="pt-6 md:pt-0 md:px-6 flex flex-col items-center">
                    <div class="w-16 h-16 mb-4 flex items-center justify-center bg-purple-50 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    </div>
                    <h4 class="text-lg font-bold text-slate-900 dark:text-white mb-2">Seguridad ante todo</h4>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">Compara opciones y realiza tus compras en las tiendas más confiables del país.</p>
                </div>
            </div>
        </div>

    </main>`;

html = html.replace('    </main>', trustHTML);

fs.writeFileSync('public/index.html', html, 'utf8');
console.log('Update HTML + copies finished');
