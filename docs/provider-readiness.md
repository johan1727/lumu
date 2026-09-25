# Provider readiness — 2026-09-24

A search reference is not a verified offer. Price, currency, condition, availability and observation time must come from the same provider listing. Shipping and other checkout charges remain unknown unless supplied explicitly; missing charges do not become zero. Recorded stock is an observation, not a checkout guarantee.

## Mercado Libre

Both search paths now support the server-only `MELI_ACCESS_TOKEN`. The direct Axios path uses the fixed API host and rejects redirects. BR maps to MLB rather than MX. Normalizers preserve provider currency, quantity, status and observation time; absent condition is unknown rather than new. Missing provider permalinks are not constructed from item IDs. Discount cards require the expected currency and a provided destination.

This is fixture-tested, not proof that the configured production token has valid permissions. The provider must authorize the account/application and relevant endpoints. `MERCADOLIBRE_APP_ID` plus a client secret is not evidence of access to arbitrary sellers' listings or affiliate attribution. Existing 403/cooldown handling remains. No live calls or credential changes were made in this pass.

Official price documentation: https://developers.mercadolibre.com.mx/api-de-precios (Bearer token; item-specific prices/conditions). Catalog product IDs and seller listing IDs are distinct; do not pass a `/p/` catalog ID to an item-price endpoint without resolving it through supported API data.

## Amazon

The legacy PA-API adapter has been removed. `amazonCreatorsService.js` implements the official REST OAuth flow and SearchItems/OffersV2, integrated before existing SerpApi/HTML sources. It makes no request unless enabled and fully configured. Fixtures validate the contract; no approved live account has been tested.

Required server-only configuration:

- `AMAZON_CREATORS_ENABLED=true` to opt in (absent/false means off).
- `AMAZON_CREATORS_CREDENTIAL_ID` and `AMAZON_CREATORS_CREDENTIAL_SECRET` issued by Creators API, not legacy AWS keys.
- `AMAZON_CREATORS_CREDENTIAL_VERSION`: `3.1`, `3.2` or `3.3`, exactly as issued. The token endpoint follows that version; the marketplace follows the requested country.
- `AMAZON_AFFILIATE_TAG_MX` (legacy `AMAZON_AFFILIATE_TAG` fallback) for MX and/or `AMAZON_AFFILIATE_TAG_US` for US. Missing tag disables that market. No other countries are supported by this adapter.

Redeploy after changing configuration. Access approval and tag validity must be established in Associates Central before opt-in. Old `AMAZON_PAAPI_*` variables are unused. No flag or credentials were changed during migration.

OAuth tokens are cached until shortly before expiry and coalesced during concurrent requests. Fixed endpoints, no redirects, 4.5-second requests and response-size limits constrain access. 401/403/429 enter a local cooldown with no automatic retries or credential switching. Errors exclude provider bodies/headers/secrets. Existing fallback sources remain separate.

Only the featured listing's explicit numeric price in the requested market currency is used. Prime-gated/subscription offers and mismatched destinations are excluded. Stock and condition remain unknown when absent; quantity-to-order is not stock quantity. Shipping/fees are not inferred. Provider URLs are preserved; no commission is asserted.

- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation
- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi

Account review on 2026-09-25 confirmed an Amazon rejection/closure notice dated 2026-09-19 for the historical US account (insufficient qualifying purchases in the application period). Treat that affiliation as closed, not approved. Reapplication is an account-side process; do not activate the old tag as evidence of commission or create artificial purchases.

MX and US tags are separate (`AMAZON_AFFILIATE_TAG_MX`/legacy MX fallback versus `AMAZON_AFFILIATE_TAG_US`). A US tag must not be copied to MX. Tag presence and click analytics do not demonstrate approved affiliation, attributed orders or earned commission; provider reports are needed.

## Gemini

Production previously returned a suspended-key 403. No safe key fingerprint has been established in this task; project/key display names do not identify the deployed credential. Resolve project/account restrictions and identify the production credential through secure administrative access before rotating it. Do not switch accounts to bypass suspension. Historical logs need separate exposure review.

Google now documents authorization keys and a September 2026 migration away from standard keys. Verify key type and project status in AI Studio; key migration is distinct from suspension remediation. The app accepts a server-only `GEMINI_API_KEY` and strips it from Gemini request URLs into the header. No key values appear in this report.

https://ai.google.dev/gemini-api/docs/api-key
