// Pre-push local UI smoke test: bell visibility, Telegram slots, demo CTA.
// Requires the local server running (npm start). Run: node scripts/local-ui-test.js
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const outDir = require('path').join(__dirname, '..', 'tmp-screenshots');
    require('fs').mkdirSync(outDir, { recursive: true });

    const errors = [];
    page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    try { await page.click('#btn-accept-cookies', { timeout: 1500 }); } catch {}
    try { await page.click('#welcome-onboarding-skip', { timeout: 1500 }); } catch {}
    await page.waitForTimeout(500);

    const checks = {};

    // 1. Bell button visible (was hidden without alerts)
    checks.bellVisible = await page.evaluate(() => {
        const b = document.getElementById('btn-price-alert');
        return !!b && !b.classList.contains('hidden') && b.offsetParent !== null;
    });

    // 2. Alerts modal opens without crashing (regression test for the recursion bug)
    checks.alertModalOpens = await page.evaluate(() => {
        try { openPriceAlertModal(); return true; } catch (e) { return 'ERROR: ' + e.message; }
    });
    await page.waitForTimeout(800);

    // 3. Telegram banner rendered inside alerts modal (anonymous → connect CTA visible)
    checks.telegramBannerInAlertsModal = await page.evaluate(() => {
        const slot = document.querySelector('#price-alert-modal [data-telegram-slot]');
        return !!slot && slot.innerHTML.includes('Telegram');
    });
    await page.screenshot({ path: `${outDir}/local-01-alerts-modal.png` });
    await page.evaluate(() => closePriceAlertModal());

    // 4. Quick-alert modal includes Telegram slot
    await page.evaluate(() => window.createQuickAlert('iPhone 15 128GB', 12999, 'https://example.com/p', 'Amazon'));
    await page.waitForTimeout(800);
    checks.telegramBannerInQuickModal = await page.evaluate(() => {
        const slot = document.querySelector('#quick-alert-modal [data-telegram-slot]');
        return !!slot && slot.innerHTML.includes('Telegram');
    });
    await page.screenshot({ path: `${outDir}/local-02-quick-alert.png` });
    await page.evaluate(() => document.getElementById('quick-alert-modal')?.remove());

    // 5. Demo section CTA exists and is clickable
    checks.demoCtaExists = await page.evaluate(() => {
        const cta = document.getElementById('demo-preview-cta');
        return !!cta && typeof window.quickSearch === 'function';
    });

    // 6. Pricing banner shows regional price + annual mention
    checks.pricingBanner = await page.evaluate(() => {
        const t = document.getElementById('pricing-title')?.textContent || '';
        const c = document.getElementById('pricing-copy')?.textContent || '';
        return { title: t.slice(0, 80), copy: c.slice(0, 110) };
    });

    console.log(JSON.stringify(checks, null, 2));
    console.log('JS errors:', errors.length ? errors.join(' | ') : 'none');
    await browser.close();
    process.exit(errors.length > 0 ? 1 : 0);
})();
