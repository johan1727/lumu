# Lumu Tech Stack

## Core Technologies

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Node.js | 18+ | Server runtime |
| Framework | Express | 4.x | Web framework |
| Database | PostgreSQL (Supabase) | 15 | Primary data store |
| Cache | Redis | 7+ | Fast cache layer |
| Auth | Supabase Auth | - | JWT-based auth |
| Payments | Stripe | Latest | Subscriptions |

## Frontend

### No Framework Approach
- Pure vanilla JavaScript (no React/Vue/Angular)
- Single-file architecture: `public/app.js` (~9000 lines)
- State management: Global variables + localStorage

### Styling
- **Tailwind CSS** - Utility-first CSS
- **Lucide Icons** - SVG icon library
- Custom CSS variables for theming

### Key Libraries (CDN)
```html
<!-- Loaded in index.html -->
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

## Backend Dependencies

### Production
```json
{
  "express": "^4.18.2",
  "axios": "^1.6.0",
  "stripe": "^14.0.0",
  "@supabase/supabase-js": "^2.38.0",
  "cheerio": "^1.0.0-rc.12",
  "node-cron": "^3.0.3",
  "uuid": "^9.0.0"
}
```

### Development
```json
{
  "nodemon": "^3.0.1",
  "playwright": "^1.40.0"
}
```

## External Services

| Service | Purpose | Critical? |
|---------|---------|-----------|
| Serper | Google Shopping API | Yes |
| Mercado Libre API | Mexican marketplace | Yes |
| Gemini/Anthropic | Query analysis | Yes |
| Stripe | Payments | For monetization |
| Supabase | Database + Auth | Yes |
| Vercel | Hosting | Yes |

## Build & Deploy

### Local Development
```bash
npm install
npm run dev  # nodemon server.js
```

### Production Deploy (Vercel)
```bash
# Auto-deploy on git push to main
vercel --prod
```

### Environment Files
- `.env` - Local development
- `.env.production` - Production (set in Vercel dashboard)

## Testing Strategy

### Current State
- ❌ No unit tests
- ❌ No integration tests  
- ✅ Manual testing in production
- 🔄 Playwright tests (planned)

### Recommended Addition
```bash
npm install --save-dev @playwright/test
npx playwright install
```

## Performance Considerations

1. **Serverless**: Vercel functions timeout at 60s
2. **Memory**: 1024MB default, can increase to 3008MB
3. **Cache**: Multi-layer to reduce API calls
4. **Parallel requests**: Shopping + ML API run in parallel
5. **AbortController**: Master timeout at 45s for search
