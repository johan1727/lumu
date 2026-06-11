// One-off design audit: capture production surfaces to evaluate dark-mode
// consistency of modals and result cards. Run: node scripts/design-audit-screenshots.js
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const outDir = require('path').join(__dirname, '..', 'tmp-screenshots');
    require('fs').mkdirSync(outDir, { recursive: true });

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto('https://www.lumu.dev', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    // Dismiss cookie banner if present
    try { await page.click('#btn-accept-cookies', { timeout: 2000 }); } catch {}
    // Dismiss onboarding modal if present
    try { await page.click('#welcome-onboarding-skip', { timeout: 2000 }); } catch {}
    await page.waitForTimeout(800);

    await page.screenshot({ path: `${outDir}/01-home-desktop.png` });

    // Open price alert modal directly (button hidden unless alerts exist)
    await page.evaluate(() => {
        const m = document.getElementById('price-alert-modal');
        if (m) {
            m.classList.remove('invisible', 'opacity-0');
            const p = m.querySelector('.glass-panel');
            if (p) { p.classList.remove('scale-95'); p.classList.add('scale-100'); }
        }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/02-alert-modal.png` });
    await page.evaluate(() => {
        const m = document.getElementById('price-alert-modal');
        if (m) m.classList.add('invisible', 'opacity-0');
    });

    // Quick-alert modal (uses sample args purely to render the layout)
    await page.evaluate(() => {
        if (typeof window.createQuickAlert === 'function') {
            window.createQuickAlert('iPhone 15 128GB', 12999, 'https://example.com/p', 'Amazon');
        }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/03-quick-alert-modal.png` });
    await page.evaluate(() => document.getElementById('quick-alert-modal')?.remove());

    // Margin calculator modal
    await page.evaluate(() => {
        if (typeof window.openMarginCalculator === 'function') {
            window.openMarginCalculator(8500, 'iPhone 15 128GB');
        }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/04-margin-calc-modal.png` });
    await page.evaluate(() => document.getElementById('margin-calc-modal')?.remove());

    // Pricing section
    await page.evaluate(() => document.getElementById('pricing-section')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/05-pricing-section.png` });

    // Real search → result cards (consumes 1 search)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.fill('#search-input', 'iphone 15');
    await page.press('#search-input', 'Enter');
    try {
        await page.waitForSelector('.product-card', { timeout: 60000 });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${outDir}/06-results-desktop.png`, fullPage: false });
        await page.evaluate(() => document.querySelector('.product-card')?.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${outDir}/07-results-cards.png` });
    } catch (e) {
        console.log('Search results did not load:', e.message);
        await page.screenshot({ path: `${outDir}/06-results-FAILED.png` });
    }

    // Mobile pass
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await mobile.goto('https://www.lumu.dev', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobile.waitForTimeout(2000);
    try { await mobile.click('#btn-accept-cookies', { timeout: 2000 }); } catch {}
    try { await mobile.click('#welcome-onboarding-skip', { timeout: 2000 }); } catch {}
    await mobile.waitForTimeout(500);
    await mobile.screenshot({ path: `${outDir}/08-home-mobile.png` });

    await browser.close();
    console.log('Screenshots saved to', outDir);
})();
