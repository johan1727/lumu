const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('lumu_region_override', 'MX');
        localStorage.setItem('lumu_onboarding_v3', 'done');
        localStorage.setItem('lumu_cookies', 'rejected');
    });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.pathname === '/api/config') return route.fulfill({json:{detectedCountry:'MX',supabaseUrl:'',supabaseAnonKey:''}});
        if (url.pathname.startsWith('/api/')) return route.fulfill({json:{deals:[],products:[],coupons:[],suggestions:[]}});
        return route.continue();
    });
});

test('search is named, focusable and does not overflow on mobile', async ({ page }) => {
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/', {waitUntil:'domcontentloaded'});
    const input=page.getByRole('textbox',{name:'¿Qué producto buscas?'});
    await expect(input).toBeVisible(); await input.fill('Audífonos para trabajar');
    await expect(input).toHaveValue('Audífonos para trabajar');
    await expect(page.locator('#search-assistant-copy')).toBeVisible();
    await expect(page.locator('#ticker-msg')).toContainText('Compara el precio final');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    const buttonBox=await page.locator('#search-button').boundingBox();
    expect(buttonBox.y+buttonBox.height).toBeLessThanOrEqual(page.viewportSize().height);
    if(test.info().project.name==='tablet-local') await expect(page.locator('#btn-mobile-menu')).toBeVisible();
    await input.fill(''); await input.blur();
    await page.screenshot({path: process.env.UI_SCREENSHOT_DIR ? `${process.env.UI_SCREENSHOT_DIR}/lumu-${test.info().project.name}.png` : test.info().outputPath('home.png'),fullPage:false});
});

test('keyboard skip link reaches main content; filters open', async ({ page }) => {
    await page.goto('/', {waitUntil:'domcontentloaded'});
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.locator('#btn-toggle-filters').click();
    await expect(page.locator('#btn-toggle-filters')).toHaveAttribute('aria-expanded','true');
});

 test('store choices disclose by keyboard; consent controls GA events; motion stays reduced', async ({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/');
    const options=page.locator('#store-options');
    await expect(options).not.toHaveAttribute('open','');
    await page.locator('#store-options-label').focus();await page.keyboard.press('Enter');
    await expect(options).toHaveAttribute('open','');
    await expect(page.locator('#store-focus-chip-bar')).toBeVisible();
    await page.evaluate(()=>{window.dataLayer=[];trackProductClick('Phone','Amazon',100,'MXN');});
    expect(await page.evaluate(()=>window.dataLayer.length)).toBe(0);
    const events=await page.evaluate(()=>{localStorage.setItem('lumu_cookies','accepted');trackProductClick('Phone','Amazon',100,'MXN');return window.dataLayer.map(x=>Array.from(x));});
    expect(events.map(x=>x[1])).toEqual(['select_item','affiliate_click']);
    expect(events[0][2].items[0].item_name).toBe('Phone');
    expect(events.some(x=>x[1]==='purchase')).toBe(false);
    expect(await page.locator('#search-button').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 });

test('offer cards disclose unknown cost, availability and affiliate commission',async({page})=>{
 await page.route('**/api/buscar',route=>route.fulfill({json:{tipo_respuesta:'resultados',region:{country:'MX',currency:'MXN'},top_5_baratos:[{titulo:'iPhone 15 128GB',tienda:'Amazon',precio:10000,urlOriginal:'https://amazon.com.mx/dp/TEST',urlMonetizada:'https://amazon.com.mx/dp/TEST',availabilityEvidence:{state:'unknown',source:null,observedAt:null},totalCost:null,affiliateDisclosure:'Algunos enlaces pueden generar una comisión para Lumu. La comisión no determina el orden.'}]}}));
 await page.goto('/');await page.getByRole('textbox',{name:'¿Qué producto buscas?'}).fill('iPhone 15 128GB');await page.locator('#search-button').click();
 await expect(page.getByText('Disponibilidad sin confirmar.',{exact:true}).first()).toBeVisible({timeout:15000});
 await expect(page.getByText('Envío y cargos: total sin confirmar.',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Algunos enlaces pueden generar una comisión para Lumu. La comisión no determina el orden.',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('direct merchant reference survives missing price without inventing a bargain',async({page})=>{
 await page.route('**/api/buscar',route=>route.fulfill({json:{tipo_respuesta:'resultados',region:{country:'MX',currency:'MXN'},top_5_baratos:[{titulo:'iPhone 15 128GB',tienda:'Telcel',precio:null,isMerchantReference:true,urlOriginal:'https://www.telcel.com/tienda/producto/telefonos-y-smartphones/apple-iphone-15-black-128gb/70022695',availabilityEvidence:{state:'unknown'},totalCost:null}]}}));
 await page.goto('/');await page.getByRole('textbox',{name:'¿Qué producto buscas?'}).fill('iPhone 15 128GB');await page.locator('#search-button').click();
 await expect(page.getByText('Página del producto — confirma el precio en la tienda',{exact:true}).first()).toBeVisible({timeout:15000});
 await expect(page.getByText('Precio no disponible',{exact:true}).first()).toBeVisible();
 await expect(page.locator('#best-option-summary')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
