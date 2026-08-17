alter table public.deal_post_events
  alter column posting_group_id drop not null,
  alter column schedule_hour drop not null;

alter table public.deal_post_events
  add column if not exists source text not null default 'queue',
  add column if not exists platform text,
  add column if not exists destination text,
  add column if not exists category text,
  add column if not exists notes text;

alter table public.deal_post_events
  add constraint deal_post_events_source_check check (source in ('queue', 'unplanned')),
  add constraint deal_post_events_platform_length_check check (platform is null or char_length(btrim(platform)) between 1 and 80),
  add constraint deal_post_events_destination_length_check check (destination is null or char_length(btrim(destination)) between 1 and 160),
  add constraint deal_post_events_category_length_check check (category is null or char_length(btrim(category)) between 1 and 120),
  add constraint deal_post_events_notes_length_check check (notes is null or char_length(notes) <= 2000),
  add constraint deal_post_events_unplanned_required_fields_check check (
    source <> 'unplanned'
    or (
      product_title is not null
      and char_length(btrim(product_title)) between 1 and 300
      and destination is not null
      and char_length(btrim(destination)) between 1 and 160
    )
  );

create index if not exists deal_post_events_user_date_idx
  on public.deal_post_events (user_id, schedule_date, posted_at desc)
  where voided_at is null;
