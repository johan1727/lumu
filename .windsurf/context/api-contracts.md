# API Contracts

## Main Search Endpoint

### POST /api/buscar

**Request Body:**
```json
{
  "query": "string (required, max 200 chars)",
  "chatHistory": "array (optional, last 10 messages)",
  "radius": "string: 'global' | 'local_only' | number (km)",
  "lat": "number (optional)",
  "lng": "number (optional)",
  "skipLLM": "boolean (optional)",
  "deepResearch": "boolean (optional, VIP only)",
  "preferredStoreKey": "string (optional)",
  "preferredStoreKeys": "array<string> (optional)",
  "preferredStoreMode": "string: 'prefer' | 'exclusive' | 'compare'",
  "safeStoresOnly": "boolean (optional)",
  "includeKnownMarketplaces": "boolean (default: true)",
  "includeHighRiskMarketplaces": "boolean (default: false)",
  "conditionMode": "string: 'all' | 'new' | 'used'",
  "country": "string (optional, overrides auto-detect)"
}
```

**Response (Success):**
```json
{
  "tipo_respuesta": "'resultados' | 'conversacion' | 'pregunta'",
  "intencion_detectada": {
    "busqueda": "normalized query",
    "condicion": "'new' | 'used'",
    "modo_condicion": "conditionMode used",
    "tienda_preferida": "string | null",
    "tiendas_preferidas": "array<string>",
    "modo_tienda_preferida": "'prefer' | 'exclusive' | 'compare' | null"
  },
  "search_metadata": {
    "canonical_key": "string",
    "product_category": "string",
    "cache_status": "'hit' | 'miss' | 'empty_after_filter'",
    "estimated_cost_usd": "number",
    "search_tier": "'free' | 'vip'",
    "deep_search_enabled": "boolean",
    "preferred_store_mode": "string | null"
  },
  "top_5_baratos": [
    {
      "titulo": "string",
      "precio": "number",
      "tienda": "string",
      "urlOriginal": "string",
      "urlMonetizada": "string",
      "imagen": "string",
      "bestBuyScore": "number (0-1)",
      "bestBuyLabel": "string",
      "winnerReason": "'tienda_preferida' | 'mejor_ahorro' | 'precio_verificado' | ...",
      "isPreferredStoreResult": "boolean",
      "priceConfidenceLabel": "string"
    }
  ],
  "preferred_store_summary": {
    "has_preferred_result": "boolean",
    "best_preferred": "object | null",
    "cheaper_alternative": "object | null"
  },
  "best_buy_pick": {
    "title": "string",
    "store": "string",
    "price": "number",
    "score": "number",
    "url": "string"
  }
}
```

**Response (Ask Mode - needs clarification):**
```json
{
  "tipo_respuesta": "'conversacion'",
  "pregunta_ia": "clarifying question",
  "sugerencias": ["option1", "option2"],
  "search_metadata": { ... }
}
```

**Response (Rate Limit):**
```json
{
  "error": "string",
  "paywall": "boolean",
  "upgrade_required": "boolean"
}
```

## Vision/Image Analysis

### POST /api/vision

**Request:**
```json
{
  "image": "base64 encoded image"
}
```

**Response:**
```json
{
  "productName": "identified product",
  "searchQuery": "searchable query",
  "confidence": "number"
}
```

## Stripe Webhook

### POST /api/webhook/stripe

**Headers:**
- `Stripe-Signature`: Required for verification

**Event Types Handled:**
- `checkout.session.completed` - New subscription
- `invoice.payment_succeeded` - Recurring payment
- `customer.subscription.deleted` - Cancellation

**Response:**
- `200 OK` on success
- `400 Bad Request` on signature failure

## Internal Service Contracts

### Shopping Service

```javascript
// searchGoogleShopping(query, radius, lat, lng, intentType, abortSignal, ...)
// Returns: Promise<Array<product>>

product = {
  title: "string",
  price: "number",
  source: "store name",
  url: "product url",
  image: "image url",
  resultSource: "'shopping_api' | 'meli_api' | 'direct_scraper' | ...",
  storeTrust: "object",
  priceConfidence: "number (0-1)"
}
```

### Cache Service

```javascript
// getCachedResults(query, radius, lat, lng, countryCode, canonicalKey, ...)
// Returns: Promise<Array | null>

// saveToCache(query, radius, lat, lng, results, ...)
// Returns: Promise<void>
```

### LLM Service

```javascript
// analyzeMessage(query, chatHistory, options)
// Returns: Promise<{
//   action: "'search' | 'ask'",
//   searchQuery: "string",
//   productCategory: "string",
//   condition: "'new' | 'used'",
//   ...
// }>
```

## Error Handling

### HTTP Status Codes
- `200` - Success
- `400` - Bad request (validation error)
- `402` - Payment required (paywall)
- `429` - Too many requests
- `500` - Server error
- `504` - Gateway timeout (search took too long)

### Error Response Format
```json
{
  "error": "human-readable message",
  "details": "optional technical details (dev only)"
}
```
