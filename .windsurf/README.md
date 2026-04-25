# Lumu Project Context

This directory contains project-specific documentation and workflows for Cascade/Windsurf to maintain context across sessions.

## Structure

```
.windsurf/
├── context/              # Project knowledge
│   ├── architecture.md   # System architecture & design decisions
│   ├── tech-stack.md     # Technology stack details
│   ├── api-contracts.md  # API specifications
│   └── known-issues.md   # Active bugs and technical debt
├── workflows/            # Process documentation
│   ├── deploy.md         # Deployment procedures
│   └── test.md           # Testing procedures
├── session-notes/        # Per-session notes (manual)
│   └── YYYY-MM-DD.md     # Notes from each session
└── README.md             # This file
```

## Quick Reference

### Before Starting Work
1. Read `context/known-issues.md` for active bugs
2. Check `session-notes/` for recent session context
3. Review `workflows/deploy.md` if planning to deploy

### During Development
- Update `known-issues.md` when discovering new bugs
- Add notes to `session-notes/` for complex changes
- Refer to `api-contracts.md` when modifying endpoints

### Before Deploy
1. Run `npm run lint` (syntax check)
2. Run `npm run test:e2e` (if Playwright installed)
3. Review `workflows/deploy.md` checklist
4. Commit with descriptive message

## Key Concepts

### Search Flow
1. User query → LLM analysis
2. Cache check (multi-layer: RAM → Redis → Supabase)
3. Parallel API calls (Serper + Mercado Libre)
4. Deduplication & filtering
5. Ranking (bestBuyScore)
6. Response with metadata

### Store Trust System
- Stores classified into tiers (1-3)
- Canonical store names for consistent filtering
- Mexican market: Mercado Libre gets priority boost

### Cache Strategy
- TTL: 4-24 hours based on price volatility
- Key: query + radius + lat + lng + country + policy hash
- Empty results are NOT cached (fixed bug)

## Environment

Required env vars (see `.env`):
- `SERPER_API_KEY`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`

## Commands

```bash
# Development
npm run dev

# Testing
npm run test:e2e          # Run Playwright tests
npm run test:e2e:ui       # Run with UI mode
npm run lint              # Syntax check

# Deploy
git push origin main      # Auto-deploy to Vercel
```

## Troubleshooting

### "0 resultados" issue
- Check `cache_status` in response metadata
- Verify store filters canonicalize correctly
- Check rescue queries triggered for missing stores

### Slow search
- Check cache hit rate
- Verify Serper API latency
- Consider reducing deep search timeout

### Deploy failures
- Run `npm run lint` first
- Check all env vars set in Vercel dashboard
- Review Vercel Functions logs
