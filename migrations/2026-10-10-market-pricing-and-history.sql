-- Keep subscription and price history facts scoped to the market and currency.
-- Safe to apply when the March roadmap migration has already run.

alter table public.price_history
  add column if not exists country_code text,
  add column if not exists currency text,
  add column if not exists price_source text,
  add column if not exists price_confidence numeric(4,3);

update public.price_history
set country_code = case
  when query_key like 'ct_MX_%' or query_key like 'ctc_MX_%' then 'MX'
  when query_key like 'ct_US_%' or query_key like 'ctc_US_%' then 'US'
  when query_key like 'ct_CL_%' or query_key like 'ctc_CL_%' then 'CL'
  when query_key like 'ct_CO_%' or query_key like 'ctc_CO_%' then 'CO'
  when query_key like 'ct_AR_%' or query_key like 'ctc_AR_%' then 'AR'
  when query_key like 'ct_PE_%' or query_key like 'ctc_PE_%' then 'PE'
  when query_key like 'ct_BR_%' or query_key like 'ctc_BR_%' then 'BR'
  else coalesce(nullif(country_code, ''), 'MX')
end
where country_code is null or btrim(country_code) = '';

update public.price_history
set currency = case country_code
  when 'MX' then 'MXN'
  when 'US' then 'USD'
  when 'CL' then 'CLP'
  when 'CO' then 'COP'
  when 'AR' then 'ARS'
  when 'PE' then 'PEN'
  when 'BR' then 'BRL'
  else coalesce(nullif(currency, ''), 'MXN')
end
where currency is null or btrim(currency) = '';

create index if not exists idx_price_history_market_currency_created
  on public.price_history (country_code, currency, created_at desc);

alter table public.subscriptions
  add column if not exists billing_country text,
  add column if not exists presentment_currency text,
  add column if not exists plan_code text;

update public.subscriptions
set billing_country = coalesce(nullif(billing_country, ''), 'MX')
where billing_country is null or btrim(billing_country) = '';

update public.subscriptions
set presentment_currency = lower(coalesce(nullif(presentment_currency, ''), currency, 'mxn'))
where presentment_currency is null or btrim(presentment_currency) = '';

update public.subscriptions
set plan_code = coalesce(nullif(plan_code, ''), nullif(plan, ''), 'personal_vip')
where plan_code is null or btrim(plan_code) = '';
