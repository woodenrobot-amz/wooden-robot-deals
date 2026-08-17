alter table public.deal_post_events
  drop constraint if exists deal_post_events_unplanned_required_fields_check;

alter table public.deal_post_events
  add constraint deal_post_events_unplanned_required_fields_check check (
    source <> 'unplanned'
    or asin is not null
  );
