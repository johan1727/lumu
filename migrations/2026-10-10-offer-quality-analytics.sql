begin;

-- Keep the database allowlist aligned with the API tracking schema.
alter table public.click_events
  drop constraint if exists click_events_event_type_check;

alter table public.click_events
  add constraint click_events_event_type_check
  check (
    event_type = any (array[
      'click'::text,
      'ad_view'::text,
      'ad_skip'::text,
      'search'::text,
      'favorite'::text,
      'favorite_remove'::text,
      'alert_create'::text,
      'compare'::text,
      'history_open'::text,
      'feedback_positive'::text,
      'feedback_negative'::text,
      'offer_issue'::text,
      'zero_results'::text,
      'bounce'::text,
      'auth_modal_open'::text,
      'auth_modal_dismiss'::text,
      'signup_complete'::text,
      'signup_bonus'::text,
      'page_view'::text,
      'pricing_view'::text,
      'checkout_click'::text,
      'purchase'::text
    ])
  );

commit;
