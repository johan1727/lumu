# 🛒 Lumu - AI Price Comparison for Latin America

> **Smart price comparison powered by AI.** Find the best deals across 19 stores. Available in Mexico, expanding to USA.

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](#)
[![Status](https://img.shields.io/badge/status-active-brightgreen)](#)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#-license)
[![Website](https://img.shields.io/badge/website-lumu.dev-blue)](https://www.lumu.dev)

---

## 🎯 What is Lumu?

Lumu is an **AI-powered price comparison engine** that helps millions of shoppers find the best prices across multiple online retailers in Mexico and Latin America.

### ✨ Key Features

- 🔍 **Multi-Store Search** — Compare prices across Amazon, Mercado Libre, Falabella, Walmart, Liverpool, Coppel, Best Buy, Sam's Club
- 🤖 **AI Analysis** — Google Gemini evaluates products to find genuine best value (not just lowest price)
- 📊 **Price History** — Track price trends over 1 year to spot seasonal deals
- 🔔 **Smart Alerts** — Price drop notifications via Telegram bot ([@LumuAlertasBot](https://t.me/LumuAlertasBot))
- 📱 **Offline Mode** — Progressive Web App with Service Worker caching
- 🌍 **Region-Aware** — Detects your country, shows local prices & retailers
- 💳 **Free + Premium** — 10 free searches/month, VIP ($39 MXN/mo) for 4× more searches
- 👥 **Referral Program** — Earn bonus searches by referring friends

---

## 📊 Status & Metrics

| Metric | Value |
|--------|-------|
| **Live Traffic** | 98 visitors/month (in revitalization phase) |
| **Historical Peak** | 1,500 daily users (May 2026) |
| **Stores Integrated** | 19 retailers (MX) |
| **Real Transactions** | ✅ Processing VIP subscriptions via Stripe |
| **Revenue Model** | Affiliate commissions + subscription fees |

**Current Phase:** Active development. First paying customer acquired May 2026 ($2 USD VIP subscription). Roadmap includes USA expansion (Q3 2026).

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Git
- Supabase account ([free tier](https://supabase.com) works fine)
- API keys:
  - [Google Gemini API](https://ai.google.dev/)
  - [Serper.dev](https://serper.dev/) (Google Search API)
  - [Stripe](https://stripe.com/) (payments)

### Installation (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/johan1727/lumu.git
cd lumu

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env

# 4. Add your API keys to .env
# SUPABASE_URL=your_supabase_url
# SUPABASE_ANON_KEY=your_anon_key
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# GEMINI_API_KEY=your_gemini_key
# SERPER_API_KEY=your_serper_key
# STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# 5. Apply Supabase migrations (via Supabase CLI or dashboard SQL editor)
supabase db push

# 6. Build CSS and start development server
npm run build:css
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)**

---

## 📁 Project Structure

```
lumu/
├── api/
│   └── index.js              # Express app entry (Vercel serverless)
│
├── public/                    # Frontend files (Vanilla JS + HTML/CSS)
│   ├── app.js                # Main application logic (~9700 lines)
│   ├── index.html            # Landing page
│   ├── sw.js                 # Service Worker (PWA)
│   ├── styles.css            # Tailwind CSS (built from src/styles/input.css)
│   └── [40+ article pages]   # SEO blog content
│
├── src/
│   ├── routes/
│   │   └── api.js            # All API route definitions
│   │
│   ├── controllers/          # Business logic
│   │   ├── searchController.js
│   │   ├── stripeController.js
│   │   ├── telegramController.js  # Telegram bot (price alerts)
│   │   └── analyticsController.js
│   │
│   └── services/
│       ├── shoppingService.js    # Store API integrations
│       ├── meliService.js        # MercadoLibre OAuth + deals
│       └── llmService.js         # Gemini AI calls
│
├── supabase/
│   └── migrations/           # PostgreSQL schema
│
├── .claude/
│   └── skills/              # Advanced Claude Code AI skills
│
├── CLAUDE.md                # Development rules & conventions
├── .env.example             # Environment variables template
└── package.json
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Vanilla JS (ES6+) + Tailwind CSS | No frameworks = blazing fast |
| **Backend** | Supabase (PostgreSQL) + Vercel Serverless | Scalable, globally distributed |
| **AI** | Google Gemini API | Price analysis & recommendations |
| **Search** | Serper.dev API | Price aggregation across stores |
| **Payments** | Stripe | VIP subscription billing |
| **Hosting** | Vercel + Supabase | Edge functions + auto-scaling |
| **PWA** | Service Worker + Manifest | Offline functionality |
| **Monetization** | Google AdSense + Affiliates | Revenue streams |

---

## 💰 Business Model

### Revenue Streams

#### 1. **Affiliate Commissions**
Earn when users buy through Lumu's affiliate links:

| Partner | Commission Rate | Category |
|---------|-----------------|----------|
| **Amazon** (US/MX) | 1-4.5% | All products |
| **Mercado Libre** (MX) | 5-16% | Varies by category |
| **Falabella** (CL/CO) | ~5% | All products |

#### 2. **VIP Subscription**
- **Price:** $39 MXN/month (~$2 USD)
- **Features:** 40 searches/month (4× free plan), price alerts, 1-year history, priority support
- **Target:** Power users, resellers, businesses

#### 3. **B2B/API Access**
- Planned for future versions
- Bulk price lookups for e-commerce platforms

---

## 🔐 Security & Privacy

- ✅ **Row Level Security (RLS)** on all database tables
- ✅ **OAuth Authentication** (Google, no password storage)
- ✅ **HTTPS Only** (enforced by Vercel)
- ✅ **CSP Headers** configured
- ✅ **No Tracking Cookies** (only essential + analytics)
- ✅ **GDPR Compliant** (privacy policy included)

See [CLAUDE.md](CLAUDE.md) for security rules.

---

## 📖 Documentation

- **[CLAUDE.md](CLAUDE.md)** — Project conventions & coding rules
- **[MEMORY.md](MEMORY.md)** — Project history & learnings
- **[.claude/SKILLS_GUIDE.md](.claude/SKILLS_GUIDE.md)** — AI development skills (8 advanced Claude Code skills)
- **[docs/guides/](docs/guides/)** — Technical documentation

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# 1. Connect GitHub repository to Vercel
# 2. Add environment variables in Vercel Settings
# 3. Deploy automatically on every push

npm run build && vercel --prod
```

### Environment Variables (Production)

Set these in Vercel Settings → Environment Variables:

```
SUPABASE_URL=prod_url
SUPABASE_ANON_KEY=prod_anon_key
SUPABASE_SERVICE_ROLE_KEY=service_role_key
GEMINI_API_KEY=key
SERPER_API_KEY=key
STRIPE_SECRET_KEY=key
STRIPE_WEBHOOK_SECRET=secret
TELEGRAM_BOT_TOKEN=token            # price alert notifications
TELEGRAM_WEBHOOK_SECRET=secret      # validates Telegram webhook calls
MERCADOLIBRE_APP_ID=app_id          # flash deals (OAuth)
MERCADOLIBRE_SECRET=secret
```

---

## 🤝 Contributing

We welcome contributions! Areas we need help with:

### 🎯 High Priority
- [ ] Add new store integrations
- [ ] Improve AI recommendations accuracy
- [ ] Performance optimizations
- [ ] Mobile responsiveness fixes

### 💡 Ideas Welcome
- Bug reports and fixes
- UI/UX improvements
- Documentation
- New features

### How to Contribute

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow [CLAUDE.md](CLAUDE.md) conventions
4. Test locally: `npm run dev`
5. Commit: `git commit -m "feat: add Colombia store integration"`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

---

## 🐛 Known Issues

### Current Limitations
- **Search Latency:** 2-3 seconds (API rate limits)
- **Store Coverage:** Limited to 8 retailers (expanding)
- **Regional:** Mexico primary, USA coming Q3 2026
- **Mobile:** Responsive but optimized for desktop
- **API Quota:** Free tier = 1000 searches/month

### Workarounds
- VIP users get priority in queue
- Use offline search from cache
- Check [GitHub Issues](https://github.com/johan1727/lumu/issues) for reported bugs

---

## 📊 Analytics & Monitoring

Track real-time data via:

- **[Vercel Analytics](https://vercel.com/analytics)** — Traffic, Core Web Vitals
- **[Supabase Dashboard](https://supabase.com/dashboard)** — Database metrics
- **[Google Search Console](https://search.google.com/search-console)** — SEO performance
- **[Stripe Dashboard](https://dashboard.stripe.com)** — Revenue & subscriptions

---

## 🎯 Roadmap

### ✅ Phase 1 (Done)
- [x] Core search functionality
- [x] Mexico marketplace integration
- [x] Stripe VIP payments
- [x] Price history tracking
- [x] Referral system
- [x] SEO optimization (40+ articles)
- [x] PWA + offline mode

### 🔄 Phase 2 (In Progress)
- [x] Telegram price alerts ([@LumuAlertasBot](https://t.me/LumuAlertasBot))
- [ ] USA marketplace expansion
- [ ] Buy/Wait verdict per product (price history powered)
- [ ] Programmatic SEO pages (/precio-hoy/{producto})
- [ ] Advanced filters & sorting
- [ ] B2B merchant dashboard

### 📅 Phase 3 (Planned)
- [ ] Colombia, Chile, Argentina expansion
- [ ] Browser extension
- [ ] AI chatbot recommendations
- [ ] Price comparison widgets
- [ ] Sharing & collaboration

---

## 📞 Support & Feedback

- **GitHub Issues:** [Report bugs](https://github.com/johan1727/lumu/issues)
- **Discussions:** [Feature requests & ideas](https://github.com/johan1727/lumu/discussions)
- **Email:** [jhonatanvillagomez38@gmail.com](mailto:jhonatanvillagomez38@gmail.com)
- **Website:** [lumu.dev](https://www.lumu.dev)

---

## 📝 License

**Proprietary — All rights reserved.** © 2026 Jhonatan Villagomez / Lumu.dev

The source code is visible for transparency and educational reference, but reproduction, modification, redistribution, or commercial use is not permitted without express written authorization. See [Términos de Servicio](https://www.lumu.dev/terminos.html).

---

## 👨‍💻 Author

**Jhonatan Villagomez**

- GitHub: [@johan1727](https://github.com/johan1727)
- Website: [lumu.dev](https://www.lumu.dev)
- Email: [jhonatanvillagomez38@gmail.com](mailto:jhonatanvillagomez38@gmail.com)

---

## 🌟 Inspiration

Lumu was born from frustration with existing price comparison tools that were slow, cluttered, and didn't help you find genuine value—just lowest price. We built Lumu to be:

- **Smart:** AI understands quality vs. price
- **Fast:** Results in seconds, not minutes
- **Simple:** Clean interface, no bloat
- **Fair:** We earn through affiliates, not data selling

---

**Made with ❤️ for smarter shoppers in Latin America**

Last Updated: June 2026 | Status: 🟢 Active Development
