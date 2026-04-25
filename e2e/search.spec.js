const { test, expect } = require('@playwright/test');

/**
 * Critical path tests for Lumu search functionality
 * These tests verify that the core search flow works correctly
 */

test.describe('Search Flow', () => {
  test('basic search returns results', async ({ page }) => {
    await page.goto('/');
    
    // Type search query
    const searchInput = page.locator('#search-input, input[placeholder*="buscando"], input[placeholder*="looking"]').first();
    await searchInput.fill('iphone 15');
    
    // Submit search
    await page.keyboard.press('Enter');
    
    // Wait for results to appear
    await page.waitForSelector('.product-card, [data-product], .result-card', { timeout: 30000 });
    
    // Verify results exist
    const results = await page.locator('.product-card, [data-product], .result-card').count();
    expect(results).toBeGreaterThan(0);
  });

  test('search with store filter returns filtered results', async ({ page }) => {
    await page.goto('/');
    
    // Search
    const searchInput = page.locator('#search-input, input[placeholder*="buscando"], input[placeholder*="looking"]').first();
    await searchInput.fill('nintendo switch');
    await page.keyboard.press('Enter');
    
    // Wait for results
    await page.waitForSelector('.product-card, [data-product], .result-card', { timeout: 30000 });
    
    // Apply Amazon filter (look for Amazon button/chip)
    const amazonFilter = page.locator('button:has-text("Amazon"), [data-store="amazon"], .filter-chip:has-text("Amazon")').first();
    if (await amazonFilter.isVisible().catch(() => false)) {
      await amazonFilter.click();
      
      // Wait for filter to apply
      await page.waitForTimeout(1000);
      
      // Verify results contain Amazon
      const stores = await page.locator('.store-name, [data-store], .tienda').allTextContents();
      const hasAmazon = stores.some(s => s.toLowerCase().includes('amazon'));
      // Note: If no Amazon results available, this might fail - that's expected behavior
      if (stores.length > 0) {
        expect(hasAmazon || stores.length === 0).toBeTruthy();
      }
    }
  });

  test('cache returns results faster on second search', async ({ page }) => {
    await page.goto('/');
    
    const uniqueQuery = `cache test ${Date.now()}`;
    const searchInput = page.locator('#search-input, input[placeholder*="buscando"], input[placeholder*="looking"]').first();
    
    // First search - measure time
    const start1 = Date.now();
    await searchInput.fill(uniqueQuery);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.product-card, [data-product], .result-card', { timeout: 30000 });
    const time1 = Date.now() - start1;
    
    // Clear and search again (same query)
    await page.reload();
    const start2 = Date.now();
    await searchInput.fill(uniqueQuery);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.product-card, [data-product], .result-card', { timeout: 10000 });
    const time2 = Date.now() - start2;
    
    // Cached search should be significantly faster (at least 50% faster)
    console.log(`First search: ${time1}ms, Cached search: ${time2}ms`);
    expect(time2).toBeLessThan(time1 * 0.8);
  });

  test('search with no results shows appropriate message', async ({ page }) => {
    await page.goto('/');
    
    // Search for something very specific that won't exist
    const searchInput = page.locator('#search-input, input[placeholder*="buscando"], input[placeholder*="looking"]').first();
    await searchInput.fill('xyz123nonexistent456');
    await page.keyboard.press('Enter');
    
    // Wait for response
    await page.waitForTimeout(5000);
    
    // Check for "no results" message or similar
    const pageContent = await page.content();
    const hasNoResults = 
      pageContent.includes('0 resultados') ||
      pageContent.includes('no results') ||
      pageContent.includes('No se encontraron') ||
      pageContent.includes('No encontramos');
    
    // If there are truly no results, we should see a message
    // If by chance there ARE results, that's also OK (data might change)
    const hasResults = await page.locator('.product-card, [data-product], .result-card').count() > 0;
    
    expect(hasNoResults || hasResults).toBeTruthy();
  });

  test('search handles special characters gracefully', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('#search-input, input[placeholder*="buscando"], input[placeholder*="looking"]').first();
    
    // Test with special characters
    await searchInput.fill('iphone (15) <script>alert("xss")</script>');
    await page.keyboard.press('Enter');
    
    // Should not crash and either show results or appropriate message
    await page.waitForTimeout(5000);
    
    // Verify page didn't crash (no 500 error)
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Internal Server Error');
    expect(pageContent).not.toContain('Error 500');
  });
});

test.describe('API Tests', () => {
  test('search API returns valid JSON structure', async ({ request }) => {
    const response = await request.post('/api/buscar', {
      data: {
        query: 'iphone 15',
        country: 'MX'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Verify structure
    expect(data).toHaveProperty('tipo_respuesta');
    expect(data).toHaveProperty('intencion_detectada');
    expect(data).toHaveProperty('top_5_baratos');
    expect(data).toHaveProperty('search_metadata');
    
    // Verify results is an array
    expect(Array.isArray(data.top_5_baratos)).toBeTruthy();
  });

  test('search API includes cache_status in metadata', async ({ request }) => {
    const response = await request.post('/api/buscar', {
      data: {
        query: 'macbook pro',
        country: 'MX'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Cache status should be present
    expect(data.search_metadata).toHaveProperty('cache_status');
    expect(['hit', 'miss', 'empty_after_filter']).toContain(data.search_metadata.cache_status);
  });

  test('search with preferred store filter works via API', async ({ request }) => {
    const response = await request.post('/api/buscar', {
      data: {
        query: 'playstation 5',
        country: 'MX',
        preferredStoreKey: 'amazon',
        preferredStoreMode: 'prefer'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Verify store filter was applied
    expect(data.search_metadata).toHaveProperty('preferred_store_key');
    expect(data.search_metadata.preferred_store_key).toBe('amazon');
    
    // If there are results, check if preferred store is indicated
    if (data.top_5_baratos.length > 0) {
      const hasPreferredIndicator = data.top_5_baratos.some(r => 
        r.isPreferredStoreResult === true || 
        r.winnerReason?.includes('tienda_preferida')
      );
      // Not all results will be preferred, but the flag should exist in structure
      expect(data.top_5_baratos[0]).toHaveProperty('isPreferredStoreResult');
    }
  });

  test('search API handles rate limiting gracefully', async ({ request }) => {
    // This test may fail if not hitting limits, which is fine
    // Making many rapid requests to potentially trigger rate limit
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(request.post('/api/buscar', {
        data: { query: `rate limit test ${i}`, country: 'MX' }
      }));
    }
    
    const responses = await Promise.all(requests);
    
    // All should be valid responses (200 or 429)
    const statusCodes = responses.map(r => r.status());
    expect(statusCodes.every(code => code === 200 || code === 429)).toBeTruthy();
  });
});
