# Lumu private MCP

Local stdio server; no HTTP listener, SQL, application API calls, file tools or database client. Product comparisons reuse `src/services/resultQuality.js`. Installed dependencies live separately from the web app, with exact versions and a lockfile.

From the repository:

```sh
npm --prefix mcp ci --ignore-scripts
node --test mcp/*.test.js
node mcp/server.js
```

`node mcp/server.js` expects an MCP client on stdin/stdout, not an interactive terminal. Stdout contains protocol messages only.

Tools: `lumu_status`, `lumu_compare_offers`, `lumu_diagnose_affiliate_link`, `lumu_search_products`. Strict schemas, max 20 supplied offers, 200-character query, 10 search results. Affiliate diagnostic returns host/tag-presence only, never tag value or commission confirmation. Comparison checks explicitly stated model/variant/capacity/condition, reports unknown stock/cost, and never uses commission for ordering. Missing attributes do not establish exact identity. Current title heuristics are not a full catalog matcher.

External search defaults off. To enable, the server process must receive both `LUMU_MCP_ENABLE_LIVE_SEARCH=1` and `SERPER_API_KEY` through its environment. No dotenv loading. Never put keys in chat, command arguments, git or this README. The provider endpoint is fixed to Serper shopping, with 10s timeout, no redirects, 1MB response maximum, 30s bounded cache, shared concurrent requests, max 3 requests/minute and 20/session. 429 establishes cooldown without retry. Limits apply per server process, not per account; restarting resets them. API quota/billing are not read from a dashboard.

Search only returns direct merchant destinations exposed by the provider. Opaque Google Shopping links are excluded; zero offers is an honest possible result. Stock/shipping are not inferred from titles or nonexistent data. Live provider access has not been verified because credentials are unavailable.

Registered through the supported Codex CLI as `lumu_private`, using absolute Node/server paths and `LUMU_MCP_ENABLE_LIVE_SEARCH=0`. Registration is reversible:

```sh
codex mcp remove lumu_private
```

The real SDK client successfully spawned the stdio server, initialized it, listed tools and invoked them. Registration does not prove this already-open task has refreshed its available tools. A new task/reload may be required. To forward credentials later, use Codex's documented `env_vars` mechanism and secure process environment; don't store a plaintext API key in config.

References: [Codex MCP](https://developers.openai.com/codex/mcp), [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server), [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
