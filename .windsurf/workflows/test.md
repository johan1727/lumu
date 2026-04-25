# Testing Workflow

## Manual Testing Checklist

### Basic Search Flow
- [ ] Search "iPhone 15" → returns results
- [ ] Search "playstation 5" → returns results
- [ ] Search with special chars: "iphone (15)" → handled gracefully
- [ ] Empty search → shows error or suggestions

### Filters
- [ ] Select "Amazon" filter → only Amazon results
- [ ] Select "Mercado Libre" filter → only ML results
- [ ] Select "Tiendas seguras" → filters applied
- [ ] Multiple filters combined → works correctly
- [ ] Clear filters → all results shown

### Cache Behavior
- [ ] First search for "X" → takes 3-8 seconds
- [ ] Second search for "X" → fast (<1s)
- [ ] Check response has `cache_status: 'hit'`

### Location Features
- [ ] Search with "Cerca de mí" → uses geolocation
- [ ] Deny geolocation → falls back gracefully
- [ ] Search "todas partes" → global search

### User Features
- [ ] Anonymous search → works, limited to 2/day
- [ ] Login → favorites enabled
- [ ] Add to favorites → saves to cloud
- [ ] View favorites → loads from Supabase
- [ ] Search history → saves and displays

### Edge Cases
- [ ] Very long query (>200 chars) → truncated gracefully
- [ ] Query with HTML tags → sanitized
- [ ] Query with emojis → handled
- [ ] Timeout scenario → shows error message

## Automated Testing (Playwright)

### Setup
```bash
# Install Playwright
npm install --save-dev @playwright/test
npx playwright install

# Create test file
touch e2e/search.spec.js
```

### Critical Path Test
```javascript
// e2e/search.spec.js
const { test, expect } = require('@playwright/test');

test('search returns results', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Type search
  await page.fill('#search-input', 'iphone 15');
  await page.click('button[type="submit"]');
  
  // Wait for results
  await page.waitForSelector('[data-results]');
  
  // Verify results exist
  const results = await page.$$('[data-product]');
  expect(results.length).toBeGreaterThan(0);
});

test('store filter works', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Search
  await page.fill('#search-input', 'nintendo switch');
  await page.click('button[type="submit"]');
  
  // Wait for results
  await page.waitForSelector('[data-results]');
  
  // Apply Amazon filter
  await page.click('button:has-text("Amazon")');
  
  // Verify only Amazon results
  const stores = await page.$$eval('[data-store]', els => 
    els.map(e => e.textContent)
  );
  expect(stores.every(s => s.includes('Amazon'))).toBeTruthy();
});

test('cache returns results faster', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  const query = 'test query ' + Date.now();
  
  // First search
  const start1 = Date.now();
  await page.fill('#search-input', query);
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-results]');
  const time1 = Date.now() - start1;
  
  // Second search (same query)
  await page.reload();
  const start2 = Date.now();
  await page.fill('#search-input', query);
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-results]');
  const time2 = Date.now() - start2;
  
  // Cached should be faster
  expect(time2).toBeLessThan(time1 / 2);
});
```

### Run Tests
```bash
# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

## Load Testing (Optional)

```bash
# Using artillery.js
npm install --save-dev artillery

# Create test
# artillery.yml
config:
  target: http://localhost:3000
  phases:
    - duration: 60
      arrivalRate: 10

scenarios:
  - name: "Search flow"
    requests:
      - post:
          url: "/api/buscar"
          json:
            query: "iphone 15"

# Run
npx artillery run artillery.yml
```

## Debugging Failed Tests

### Check Logs
```bash
# Vercel function logs
vercel logs --production

# Or in dashboard: lumu → Functions → Logs
```

### Common Issues

**Test: "search returns results" fails**
- Check if `SERPER_API_KEY` is set
- Verify Supabase connection
- Look for 500 errors in logs

**Test: "store filter works" fails**
- Check if store keys canonicalize correctly
- Verify `applySearchPolicyFilters` logic
- Check response metadata

**Test: "cache faster" fails**
- Clear cache: `DELETE FROM search_cache;`
- Check if cache is being saved
- Verify `cacheStatus` in response

## Regression Testing

Before any major release, test these scenarios:

1. **New user journey**: Anonymous → Search → Login → Favorite
2. **VIP flow**: Free user → hits limit → upgrade → VIP search
3. **Mobile**: All above on mobile viewport
4. **LATAM**: Switch to CL/CO/AR region, verify currency changes
