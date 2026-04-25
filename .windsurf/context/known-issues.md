# Known Issues & Technical Debt

## Active Issues

### 🔴 High Priority

#### 1. Cache Empty Response Bug
- **Status**: Fixed in commit c02932f
- **Issue**: Cache returning `[]` was treated as valid hit
- **Impact**: Users saw "0 resultados" without actual search
- **Fix**: Validate filtered cache has results before using

#### 2. Store Filter Canonicalization Mismatch
- **Status**: Under investigation
- **Issue**: Frontend sends `preferredStoreKeys: ["amazon", "mercado libre"]` but backend may not canonicalize correctly
- **Impact**: Filters exclude valid results
- **Workaround**: User cleared filters to get results
- **Fix needed**: Ensure `normalizeExplicitStoreKeys()` matches frontend keys

#### 3. Rescue Queries Only Trigger When Results < 3
- **Status**: By design, but may be too strict
- **Issue**: If initial search returns 4+ results from non-preferred stores, rescue for Amazon/ML never runs
- **Impact**: User doesn't see preferred store results even when available
- **Fix needed**: Always run rescue if preferred stores missing from results

### 🟡 Medium Priority

#### 4. Mercado Libre API Rate Limiting
- **Status**: Handled with retries, but could be smoother
- **Issue**: 429 errors from ML API not always gracefully handled
- **Impact**: Some searches miss ML results

#### 5. Price Confidence Inconsistency
- **Status**: Ongoing
- **Issue**: Direct scrapers return estimated prices (confidence 0.4-0.6) vs API prices (0.9+)
- **Impact**: Ranking may prefer wrong results
- **Fix**: Better calibration of confidence scores

#### 6. Memory Leak in Long Sessions
- **Status**: Unconfirmed
- **Issue**: `app.js` global state grows over time
- **Impact**: Browser slowdown after extended use

### 🟢 Low Priority

#### 7. Missing Unit Tests
- **Status**: Technical debt
- **Impact**: Regressions only caught in production
- **Files needing tests**: `searchController.js`, `shoppingService.js`

#### 8. Console Warning Spam
- **Status**: Cleanup needed
- **Issue**: Debug logs in production code
- **Files**: `searchController.js` has many `console.log` statements

## Recently Fixed

### ✅ Cache Validation (c02932f)
- Added `hasValidCache` check
- Added `cacheStatus` metadata
- Skip cache save if no valid results

### ✅ Preferred Store Ranking (543664c)
- Added `compareCheapestRelevant()` comparator
- MELI API and Amazon now prioritized
- Price vs match score balancing

### ✅ Store Rescue Logic (c02932f)
- Added detection for missing key stores
- Forces `site:` operator queries when ML/Amazon missing

## Wishlist / Feature Ideas

1. **Smart Cache Warming** - Pre-cache popular queries during low traffic
2. **A/B Test for Ranking** - Test different score weights
3. **Price Drop Alerts** - Track products and notify users
4. **Historical Price Charts** - Show price trends over time
5. **ML-based Relevance** - Train model on click data

## Performance Notes

### Current Benchmarks
- Average search time: 3-8 seconds
- Cache hit: <100ms
- LLM analysis: 1-3 seconds
- Parallel API calls: 2-5 seconds

### Bottlenecks
1. Serper API latency (external)
2. LLM call for query analysis
3. Sequential rescue queries (not parallel enough)

## Monitoring Gaps

Missing metrics that would help debug issues:
- [ ] Cache hit/miss rate by query type
- [ ] API failure rates by provider
- [ ] Average results per search
- [ ] User click-through rate
- [ ] Conversion rate (search → favorite → purchase)
