# Contributing to Lumu

Thank you for considering contributing to Lumu! We welcome developers, designers, and anyone passionate about making shopping smarter.

---

## 🎯 How to Contribute

### Before You Start

1. **Check existing issues** — Don't duplicate work
   - [GitHub Issues](https://github.com/johan1727/lumu/issues)
   - [GitHub Discussions](https://github.com/johan1727/lumu/discussions)

2. **Read our guidelines** — Know what we value
   - Code style: See [CLAUDE.md](CLAUDE.md)
   - Project vision: See [README.md](README.md)

3. **Ask first for big changes**
   - Create a Discussion thread
   - Discuss approach before coding
   - Saves wasted effort

---

## 🚀 Quick Start for Contributors

### Setup

```bash
# 1. Fork the repository
# https://github.com/johan1727/lumu/fork

# 2. Clone YOUR fork
git clone https://github.com/YOUR-USERNAME/lumu.git
cd lumu

# 3. Add upstream remote
git remote add upstream https://github.com/johan1727/lumu.git

# 4. Create a feature branch
git checkout -b feature/your-feature-name

# 5. Install dependencies
npm install

# 6. Set up environment
cp .env.example .env.local
# Add your API keys for testing

# 7. Start development
npm run dev
```

### Make Your Changes

```bash
# Edit files as needed
# Keep changes focused on ONE issue/feature

# Test locally
npm run dev

# Verify no errors
npm run lint  # (if available)
```

### Commit & Push

```bash
# Stage your changes
git add .

# Commit with clear message
git commit -m "feat: add Colombia store integration

- Integrated Falabella Colombia API
- Added currency conversion COP
- Updated region detection logic
- All tests passing"

# Push to your fork
git push origin feature/your-feature-name
```

### Create Pull Request

1. Go to [github.com/johan1727/lumu](https://github.com/johan1727/lumu)
2. Click "New Pull Request"
3. Select your fork & branch
4. Fill in the template (see below)
5. Submit!

---

## 📋 Pull Request Template

```markdown
## Description
What problem does this solve? What feature does this add?

## Type of Change
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation
- [ ] Performance improvement

## How to Test
1. Do this...
2. Then do this...
3. You should see...

## Screenshots (if applicable)
Paste screenshots here

## Checklist
- [ ] I followed the style guide in CLAUDE.md
- [ ] I tested locally (npm run dev)
- [ ] I updated documentation if needed
- [ ] My code has no console errors
- [ ] I did not add sensitive info (.env, keys, etc.)
```

---

## 🎯 Priority Areas

### 🔴 High Priority (We Need This)

#### 1. Store Integrations
```
Target: Colombia, Chile, Argentina, USA

What to add:
- New API integration
- Price scraping (if API unavailable)
- Currency handling
- Region detection

Example: 
- [ ] Falabella Colombia
- [ ] Jumbo Chile
- [ ] Amazon USA optimization
- [ ] Walmart USA
```

#### 2. Performance
```
What to improve:
- Search latency (target: <1.5s)
- PWA offline experience
- localStorage optimization
- Image optimization

Current bottlenecks:
- Serper API calls (slow)
- localStorage quota limits
- Service Worker cache strategy
```

#### 3. AI Recommendations
```
What to improve:
- Quality score accuracy
- Deal detection (spam filter)
- Product similarity matching
- Seasonal deal alerts

Current gaps:
- Too many fake deals shown
- Quality scoring is basic
- No trend analysis
```

#### 4. Mobile Experience
```
What to improve:
- Responsive design
- Touch interaction
- Offline functionality
- Loading states

Current issues:
- Desktop-optimized
- Some buttons < 44px
- Slow on 3G
```

### 🟡 Medium Priority (Nice to Have)

- [ ] Email price alerts
- [ ] Browser extension
- [ ] Advanced filters (brand, rating, warranty)
- [ ] Comparison sharing/lists
- [ ] Wishlist functionality
- [ ] User reviews aggregation
- [ ] Trending products widget
- [ ] Blog content expansion

### 🟢 Low Priority (Future)

- [ ] Mobile app (React Native)
- [ ] B2B merchant dashboard
- [ ] Price prediction with ML
- [ ] Integration with personal assistants (Alexa, Google Home)

---

## 📝 Code Guidelines

### Follow CLAUDE.md

Read [CLAUDE.md](CLAUDE.md) first. It covers:

- **Dark mode** — Always assume dark mode
- **Variables** — `const/let`, `UPPER_SNAKE_CASE` for constants
- **Functions** — `camelCase`, descriptive names
- **Errors** — Explicit error handling, no silent failures
- **Logging** — `console.log('[Module] message')`
- **localStorage** — Compress data, check QuotaExceededError
- **Supabase** — Always check for errors, use RLS
- **Comments** — Only explain WHY, not WHAT

### Example: Good Code

```javascript
// ❌ Bad
var x = 5;
try {
  localStorage.setItem('data', data);
} catch (e) {
  // nope
}

// ✅ Good
const MAX_RETRIES = 5;
try {
  localStorage.setItem('lumu_search', JSON.stringify(data));
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    pruneOldData();
    retry();
  }
}
```

---

## 🧪 Testing

### Manual Testing (Before PR)

```bash
# 1. Test locally
npm run dev

# 2. Test on mobile (Chrome DevTools)
# Ctrl+Shift+I → Toggle device toolbar

# 3. Test offline
# DevTools → Network → Offline

# 4. Test in production URL
# Visit https://www.lumu.dev
```

### Areas to Test

- [ ] Search works for your region
- [ ] Prices match actual stores
- [ ] Offline mode caches results
- [ ] No console errors (F12)
- [ ] Dark mode looks good
- [ ] Mobile responsive
- [ ] PWA installs
- [ ] Stripe integration (if payment-related)

---

## 🔐 Security

### Never Commit

- `.env` files (environment variables)
- API keys or secrets
- Passwords or tokens
- PII (personal info)
- `node_modules/` (use .gitignore)

### Security Checklist

- [ ] No hardcoded API keys
- [ ] No eval() or innerHTML with user data
- [ ] Inputs validated/sanitized
- [ ] CORS configured (if backend change)
- [ ] Rate limiting considered

---

## 💬 Communication

### How We Discuss

- **Small issues/features** → GitHub Issues
- **Design decisions** → GitHub Discussions
- **Quick questions** → Reply in issue comments
- **Breaking changes** → Create RFC discussion first

### Be Respectful

- Assume good intent
- Explain your reasoning
- Listen to feedback
- No spam/harassment

---

## 🎓 Development Tips

### Use Claude Code AI Skills

We have 8 advanced AI skills for development:

```bash
# In VS Code with Claude Code extension:

# 1. Plan architecture
"Usa Superpers para planificar esto: quiero agregar X feature"

# 2. Code with design
"Crea componente con Frontend Design skill"

# 3. Divide large tasks
"Taskmaster AI: divide esto en micro-tareas"

# 4. Test automatically
"Playwright: prueba el nuevo search endpoint"

# 5. Investigate topics
"Deep Research: investiga precios en Walmart México"
```

See [.claude/SKILLS_GUIDE.md](.claude/SKILLS_GUIDE.md) for details.

### Useful Commands

```bash
# Development
npm run dev          # Start dev server

# View logs
npm run logs         # (if available)

# Check environment
npm run check-env    # Verify all vars set

# Build
npm run build        # (if available)
```

---

## 📚 Documentation

Help us document:

- [ ] Add comments to complex functions
- [ ] Update README when features change
- [ ] Add examples for new APIs
- [ ] Create guides for new integrations
- [ ] Fix typos in docs

**Good documentation = more contributors**

---

## 🚀 Your First PR Checklist

- [ ] I created a feature branch
- [ ] I made focused changes (1 issue = 1 PR)
- [ ] I tested locally (npm run dev)
- [ ] I didn't break anything
- [ ] I followed CLAUDE.md conventions
- [ ] I didn't commit .env or secrets
- [ ] I wrote a clear commit message
- [ ] I created a PR with description
- [ ] I responded to review feedback

---

## ❓ Questions?

- **Issues with setup?** → [Create an issue](https://github.com/johan1727/lumu/issues/new)
- **Feature idea?** → [Start a discussion](https://github.com/johan1727/lumu/discussions/new)
- **Direct question?** → Email [jhonatanvillagomez38@gmail.com](mailto:jhonatanvillagomez38@gmail.com)

---

## 🎉 Thank You!

Every contribution helps Lumu become better. Whether it's code, ideas, testing, or documentation — **your effort matters**.

We're building something special for millions of shoppers in Latin America.

**Let's build together! 🛒**

---

**Last Updated:** June 2026  
**Maintained by:** @johan1727
