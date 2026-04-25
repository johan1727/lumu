# Deploy Workflow

## Pre-Deploy Checklist

```bash
# 1. Pull latest changes
git pull origin main

# 2. Run syntax check
node --check src/controllers/searchController.js
node --check src/services/shoppingService.js
node --check src/services/cacheService.js

# 3. Check for obvious issues
git diff --name-only
# Review changed files

# 4. Test locally (if possible)
npm run dev
# Test 2-3 searches with different queries
```

## Deploy to Production

### Option A: Vercel CLI
```bash
# Install Vercel CLI if not already
npm i -g vercel

# Deploy to production
vercel --prod
```

### Option B: Git Push (Auto-deploy)
```bash
# Commit all changes
git add -A
git commit -m "feat: descriptive message"

# Push triggers auto-deploy
git push origin main
```

### Option C: Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Select `lumu` project
3. Click "Redeploy" on latest commit

## Post-Deploy Verification

```bash
# 1. Check deployment status
vercel --version
# Or check dashboard

# 2. Test critical flows
curl -X POST https://lumu.dev/api/buscar \
  -H "Content-Type: application/json" \
  -d '{"query": "iphone 15"}'

# 3. Verify in browser
# - Search works
# - Filters work
# - Cache not returning empty
```

## Rollback (if needed)

```bash
# Find previous working commit
git log --oneline -10

# Revert to specific commit
git revert <commit-hash>
git push origin main

# Or force deploy previous version
vercel --prod --force
```

## Environment Variables

Ensure these are set in Vercel dashboard:
- [ ] `SERPER_API_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`
- [ ] `SCRAPER_PROXIES` (optional but recommended)

## Common Deploy Issues

### Issue: Build fails
**Symptom**: Vercel shows red X on build
**Fix**: Check `package.json` scripts, ensure `vercel-build` or `build` script exists

### Issue: API returns 500
**Symptom**: Search doesn't work after deploy
**Fix**: 
1. Check Vercel Functions logs
2. Verify env vars are set
3. Check for missing `require()` statements

### Issue: Cache returns empty
**Symptom**: "0 resultados" for all searches
**Fix**: 
1. Check if `search_cache` table exists in Supabase
2. Verify `cacheService.js` is not saving empty results
3. Clear cache: `DELETE FROM search_cache;`

## Quick Health Check

After deploy, run these in browser console:
```javascript
// Test search
fetch('/api/buscar', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({query: 'test'})
}).then(r => r.json()).then(console.log)

// Should return: {tipo_respuesta: 'resultados', top_5_baratos: [...]}
```
