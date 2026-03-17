begin;

-- ============================================================
-- PHASE 1A: ALIGN EVENT TYPES WITH CURRENT APP USAGE
-- ============================================================

alter table public.click_events
drop constraint if exists click_events_event_type_check;

alter table public.click_events
add constraint click_events_event_type_check
check (
  event_type = any (
    array[
      'click'::text,
      'ad_view'::text,
      'ad_skip'::text,
      'search'::text,
      'favorite'::text,
      'alert_create'::text,
      'zero_results'::text,
      'bounce'::text,
      'auth_modal_open'::text,
      'auth_modal_dismiss'::text,
      'signup_complete'::text,
      'signup_bonus'::text
    ]
  )
);

-- ============================================================
-- PHASE 1B: ADD COLUMNS NEEDED FOR ROADMAP
-- ============================================================

alter table public.llm_analysis_log
  add column if not exists canonical_key text,
  add column if not exists product_category text,
  add column if not exists price_volatility text,
  add column if not exists used_rag boolean default false;

alter table public.price_history
  add column if not exists country_code text,
  add column if not exists currency text;

alter table public.subscriptions
  add column if not exists billing_country text,
  add column if not exists presentment_currency text,
  add column if not exists plan_code text,
  add column if not exists cancel_at_period_end boolean default false,
  add column if not exists trial_ends_at timestamptz;

-- Optional future-facing cache metadata.
alter table public.search_cache
  add column if not exists canonical_key text,
  add column if not exists price_volatility text,
  add column if not exists country_code text;

-- ============================================================
-- PHASE 1C: BACKFILL EASY DEFAULTS
-- ============================================================

update public.llm_analysis_log
set country_code = 'MX'
where country_code is null or btrim(country_code) = '';

update public.llm_analysis_log
set price_volatility = 'medium'
where price_volatility is null or btrim(price_volatility) = '';

update public.price_history
set country_code = case
  when query_key like 'ct_MX_%' or query_key like 'ctc_MX_%' then 'MX'
  when query_key like 'ct_US_%' or query_key like 'ctc_US_%' then 'US'
  when query_key like 'ct_CL_%' or query_key like 'ctc_CL_%' then 'CL'
  when query_key like 'ct_CO_%' or query_key like 'ctc_CO_%' then 'CO'
  when query_key like 'ct_AR_%' or query_key like 'ctc_AR_%' then 'AR'
  when query_key like 'ct_PE_%' or query_key like 'ctc_PE_%' then 'PE'
  else coalesce(country_code, 'MX')
end
where country_code is null or btrim(country_code) = '';

update public.price_history
set currency = case
  when country_code = 'MX' then 'MXN'
  when country_code = 'US' then 'USD'
  when country_code = 'CL' then 'CLP'
  when country_code = 'CO' then 'COP'
  when country_code = 'AR' then 'ARS'
  when country_code = 'PE' then 'PEN'
  else coalesce(currency, 'MXN')
end
where currency is null or btrim(currency) = '';

update public.subscriptions
set plan_code = case
  when plan_code is not null and btrim(plan_code) <> '' then plan_code
  when plan = 'vip' then 'personal_vip'
  when plan = 'personal_vip' then 'personal_vip'
  when plan = 'b2b' then 'b2b'
  when plan = 'free' then 'free'
  else lower(coalesce(plan, 'personal_vip'))
end
where plan_code is null or btrim(plan_code) = '';

update public.subscriptions
set presentment_currency = lower(coalesce(currency, 'mxn'))
where presentment_currency is null or btrim(presentment_currency) = '';

-- ============================================================
-- PHASE 1D: CLEANUP DUPLICATES BEFORE ADDING UNIQUES
-- ============================================================

-- favorites: keep oldest row per (user_id, product_url)
with ranked as (
  select id,
         row_number() over (
           partition by user_id, product_url
           order by created_at asc, id asc
         ) as rn
  from public.favorites
  where product_url is not null and btrim(product_url) <> ''
)
delete from public.favorites f
using ranked r
where f.id = r.id
  and r.rn > 1;

-- push_subscriptions: keep oldest row per endpoint
with ranked as (
  select id,
         row_number() over (
           partition by endpoint
           order by created_at asc, id asc
         ) as rn
  from public.push_subscriptions
  where endpoint is not null and btrim(endpoint) <> ''
)
delete from public.push_subscriptions p
using ranked r
where p.id = r.id
  and r.rn > 1;

-- price_alerts with URL: keep oldest row per user_id + product_url + target_price
with ranked as (
  select id,
         row_number() over (
           partition by user_id, product_url, target_price
           order by created_at asc, id asc
         ) as rn
  from public.price_alerts
  where product_url is not null and btrim(product_url) <> ''
)
delete from public.price_alerts a
using ranked r
where a.id = r.id
  and r.rn > 1;

-- price_alerts without URL: keep oldest row per logical fallback key
with ranked as (
  select id,
         row_number() over (
           partition by user_id,
                        lower(btrim(coalesce(product_name, ''))),
                        lower(btrim(coalesce(store_name, ''))),
                        target_price
           order by created_at asc, id asc
         ) as rn
  from public.price_alerts
  where product_url is null or btrim(product_url) = ''
)
delete from public.price_alerts a
using ranked r
where a.id = r.id
  and r.rn > 1;

-- ============================================================
-- PHASE 1E: INDEXES FOR PERFORMANCE
-- ============================================================

create index if not exists idx_rate_limits_ip_created_at
  on public.rate_limits (ip, created_at desc);

create index if not exists idx_searches_user_created_at
  on public.searches (user_id, created_at desc);

create index if not exists idx_searches_query
  on public.searches (query);

create index if not exists idx_click_events_event_created_at
  on public.click_events (event_type, created_at desc);

create index if not exists idx_click_events_user_created_at
  on public.click_events (user_id, created_at desc);

create index if not exists idx_click_events_search_query
  on public.click_events (search_query);

create index if not exists idx_click_events_search_event_created_at
  on public.click_events (search_query, event_type, created_at desc);

create index if not exists idx_price_history_query_url_created_at
  on public.price_history (query_key, normalized_url, created_at desc);

create index if not exists idx_price_history_country_created_at
  on public.price_history (country_code, created_at desc);

create index if not exists idx_llm_analysis_log_created_at
  on public.llm_analysis_log (created_at desc);

create index if not exists idx_llm_analysis_log_country_created_at
  on public.llm_analysis_log (country_code, created_at desc);

create index if not exists idx_llm_analysis_log_canonical_key
  on public.llm_analysis_log (canonical_key);

create index if not exists idx_search_cache_country_created_at
  on public.search_cache (country_code, created_at desc);

-- ============================================================
-- PHASE 1F: UNIQUES / STRONGER INTEGRITY
-- ============================================================

create unique index if not exists uq_favorites_user_product_url
  on public.favorites (user_id, product_url);

create unique index if not exists uq_push_subscriptions_endpoint
  on public.push_subscriptions (endpoint);

create unique index if not exists uq_price_alerts_user_url_target
  on public.price_alerts (user_id, product_url, target_price)
  where product_url is not null and btrim(product_url) <> '';

create unique index if not exists uq_price_alerts_user_name_store_target_no_url
  on public.price_alerts (
    user_id,
    lower(btrim(coalesce(product_name, ''))),
    lower(btrim(coalesce(store_name, ''))),
    target_price
  )
  where product_url is null or btrim(product_url) = '';

-- ============================================================
-- PHASE 1G: PLAN PRICES TABLE FOR LOCALIZED BILLING/DISPLAY
-- ============================================================

create table if not exists public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null,
  country_code text not null,
  currency text not null,
  amount numeric(12,2) not null,
  billing_period text not null default 'month',
  stripe_payment_link text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_plan_prices_plan_country_period
  on public.plan_prices (plan_code, country_code, billing_period);

create index if not exists idx_plan_prices_country_active
  on public.plan_prices (country_code, is_active);

insert into public.plan_prices (plan_code, country_code, currency, amount, billing_period, stripe_payment_link, is_active)
values
  ('free', 'MX', 'MXN', 0, 'lifetime', null, true),
  ('personal_vip', 'MX', 'MXN', 39, 'month', null, true),
  ('b2b', 'MX', 'MXN', 199, 'month', null, true),

  ('free', 'US', 'USD', 0, 'lifetime', null, true),
  ('personal_vip', 'US', 'USD', 3.99, 'month', null, true),
  ('b2b', 'US', 'USD', 19.99, 'month', null, true),

  ('free', 'CL', 'CLP', 0, 'lifetime', null, true),
  ('personal_vip', 'CL', 'CLP', 3900, 'month', null, true),
  ('b2b', 'CL', 'CLP', 19900, 'month', null, true),

  ('free', 'CO', 'COP', 0, 'lifetime', null, true),
  ('personal_vip', 'CO', 'COP', 15900, 'month', null, true),
  ('b2b', 'CO', 'COP', 79900, 'month', null, true),

  ('free', 'AR', 'ARS', 0, 'lifetime', null, true),
  ('personal_vip', 'AR', 'ARS', 4900, 'month', null, true),
  ('b2b', 'AR', 'ARS', 24900, 'month', null, true),

  ('free', 'PE', 'PEN', 0, 'lifetime', null, true),
  ('personal_vip', 'PE', 'PEN', 14.90, 'month', null, true),
  ('b2b', 'PE', 'PEN', 79.90, 'month', null, true)
on conflict (plan_code, country_code, billing_period)
do update set
  currency = excluded.currency,
  amount = excluded.amount,
  stripe_payment_link = coalesce(excluded.stripe_payment_link, public.plan_prices.stripe_payment_link),
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

-- ============================================================
-- PHASE 1H: QUERY INTENT MEMORY TABLE
-- ============================================================

create table if not exists public.query_intent_memory (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null,
  canonical_key text,
  country_code text not null default 'MX',
  product_category text,
  product_category_key text not null default '',
  store_name text,
  store_name_key text not null default '',
  clicked_count integer not null default 0,
  success_score numeric(12,4) not null default 0,
  last_clicked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_query_intent_memory_key
  on public.query_intent_memory (
    normalized_query,
    country_code,
    product_category_key,
    store_name_key
  );

create index if not exists idx_query_intent_memory_country_score
  on public.query_intent_memory (country_code, success_score desc, clicked_count desc);

-- ============================================================
-- PHASE 1I: BACKFILL QUERY INTENT MEMORY FROM HISTORICAL CLICKS
-- ============================================================

insert into public.query_intent_memory (
  normalized_query,
  canonical_key,
  country_code,
  product_category,
  product_category_key,
  store_name,
  store_name_key,
  clicked_count,
  success_score,
  last_clicked_at
)
select
  lower(trim(search_query)) as normalized_query,
  null::text as canonical_key,
  'MX' as country_code,
  null::text as product_category,
  '' as product_category_key,
  nullif(lower(trim(coalesce(store, ''))), '') as store_name,
  lower(trim(coalesce(store, ''))) as store_name_key,
  count(*)::integer as clicked_count,
  count(*)::numeric as success_score,
  max(created_at) as last_clicked_at
from public.click_events
where event_type = 'click'
  and search_query is not null
  and btrim(search_query) <> ''
group by lower(trim(search_query)), lower(trim(coalesce(store, '')))
on conflict (
  normalized_query,
  country_code,
  product_category_key,
  store_name_key
) do update set
  clicked_count = excluded.clicked_count,
  success_score = excluded.success_score,
  last_clicked_at = excluded.last_clicked_at,
  store_name = excluded.store_name,
  updated_at = timezone('utc', now());

-- ============================================================
-- PHASE 1J: ADD LEARNING CONTEXT COLUMNS TO CLICK_EVENTS
-- ============================================================

alter table public.click_events
  add column if not exists country_code text,
  add column if not exists product_category text,
  add column if not exists canonical_key text;

create index if not exists idx_click_events_country_created_at
  on public.click_events (country_code, created_at desc);

create index if not exists idx_click_events_canonical_key
  on public.click_events (canonical_key);

-- ============================================================
-- PHASE 1K: RPC FOR ATOMIC UPSERT OF QUERY INTENT MEMORY
-- ============================================================

create or replace function public.upsert_query_intent_memory(
  p_normalized_query text,
  p_canonical_key text,
  p_country_code text,
  p_product_category text,
  p_product_category_key text,
  p_store_name text,
  p_store_name_key text
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.query_intent_memory (
    normalized_query, canonical_key, country_code,
    product_category, product_category_key,
    store_name, store_name_key,
    clicked_count, success_score, last_clicked_at
  ) values (
    p_normalized_query, p_canonical_key, p_country_code,
    p_product_category, p_product_category_key,
    p_store_name, p_store_name_key,
    1, 1, timezone('utc', now())
  )
  on conflict (normalized_query, country_code, product_category_key, store_name_key)
  do update set
    clicked_count = query_intent_memory.clicked_count + 1,
    success_score = query_intent_memory.success_score + 1,
    canonical_key = coalesce(excluded.canonical_key, query_intent_memory.canonical_key),
    store_name = coalesce(excluded.store_name, query_intent_memory.store_name),
    product_category = coalesce(excluded.product_category, query_intent_memory.product_category),
    last_clicked_at = timezone('utc', now()),
    updated_at = timezone('utc', now());
end;
$$;

-- Index for fast ranking lookup
create index if not exists idx_query_intent_memory_query_country
  on public.query_intent_memory (normalized_query, country_code);

commit;
