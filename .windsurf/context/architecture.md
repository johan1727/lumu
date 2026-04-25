# Lumu Architecture

## Overview
Lumu is an AI-powered price comparison and product search platform for Mexico and LATAM markets.

## Core Components

### Frontend
- **Stack**: Vanilla JavaScript (no framework), Tailwind CSS, Lucide Icons
- **Location**: `public/app.js`, `public/index.html`
- **Key Features**: Search UI, filters, results display, favorites, history

### Backend API
- **Stack**: Node.js, Express
- **Location**: `src/controllers/`, `src/services/`, `src/routes/`
- **Key Endpoints**:
  - `POST /api/buscar` - Main search endpoint
  - `POST /api/vision` - Image recognition
  - `POST /api/webhook/stripe` - Payment processing

### Database
- **Primary**: Supabase (PostgreSQL)
- **Cache**: In-memory RAM cache + Redis + Supabase `search_cache` table
- **Key Tables**:
  - `searches` - Search history
  - `favorites` - User wishlists
  - `search_cache` - Cached search results
  - `rate_limits` - Usage tracking

### External APIs
1. **Serper** - Google Shopping API
2. **Mercado Libre API** - Direct product search
3. **Gemini/Anthropic** - LLM for query analysis
4. **Stripe** - Payments and subscriptions
5. **Supabase** - Auth and database

## Search Flow Architecture

```
User Query
    ↓
LLM Analysis (intent, category, condition)
    ↓
Cache Check (query_key + canonical_key)
    ↓
Parallel Search:
  - Serper Shopping API
  - Mercado Libre API
  - Direct Scrapers (if proxy available)
    ↓
Deduplication (by URL + MELI item ID)
    ↓
Filtering (policy filters, quality filters)
    ↓
Ranking (bestBuyScore with store priority)
    ↓
Coupon Injection
    ↓
Response with metadata
```

## Key Design Decisions

### Store Trust System
- Classifies stores into tiers (1-3) based on reliability
- Canonical store names for consistent filtering
- Special handling for Mexican market (Mercado Libre priority)

### Cache Strategy
- Multi-layer: RAM → Redis → Supabase
- TTL: 4-24 hours based on price volatility
- Cache key includes: query + radius + lat + lng + country + policy hash

### Ranking Algorithm
- `buildBestBuyScore()` combines: price confidence, match score, store trust, shipping, deals
- Priority boosts for: Mercado Libre API, preferred stores, Mexican shipping
- Fallback to cheaper alternatives if savings > 8% or $150 MXN

## Known Issues / Technical Debt

1. **Cache empty responses** - Fixed in commit c02932f
2. **Store filter mismatch** - Frontend sends keys that may not canonicalize correctly
3. **Rescue queries** - Only trigger when results < 3, missing key stores
4. **Price confidence** - Some scrapers return estimated prices with low confidence

## Environment Variables

See `.env` for full list. Critical ones:
- `SERPER_API_KEY` - Required for search
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` - Database
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` - Payments
- `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` - LLM
