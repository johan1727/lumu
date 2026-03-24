begin;

alter table if exists public.llm_analysis_log enable row level security;
alter table if exists public.dropship_products enable row level security;
alter table if exists public.dropship_orders enable row level security;
alter table if exists public.plan_prices enable row level security;
alter table if exists public.query_intent_memory enable row level security;

drop policy if exists llm_analysis_log_service_all on public.llm_analysis_log;
create policy llm_analysis_log_service_all on public.llm_analysis_log
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists dropship_products_service_all on public.dropship_products;
create policy dropship_products_service_all on public.dropship_products
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists dropship_orders_service_all on public.dropship_orders;
create policy dropship_orders_service_all on public.dropship_orders
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists plan_prices_public_read on public.plan_prices;
create policy plan_prices_public_read on public.plan_prices
    for select
    using (is_active = true);

drop policy if exists plan_prices_service_write on public.plan_prices;
create policy plan_prices_service_write on public.plan_prices
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists query_intent_memory_service_all on public.query_intent_memory;
create policy query_intent_memory_service_all on public.query_intent_memory
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop view if exists public.user_search_usage;
create view public.user_search_usage
with (security_invoker = true) as
select
    s.user_id,
    count(*)::bigint as lifetime_searches,
    count(*) filter (
        where s.created_at >= date_trunc('month', timezone('utc', now()))
    )::bigint as monthly_searches
from public.searches s
where s.user_id is not null
group by s.user_id;

grant select on public.user_search_usage to authenticated;
grant select on public.user_search_usage to anon;

commit;
