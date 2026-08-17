create index if not exists deal_post_events_posting_group_idx
  on public.deal_post_events (posting_group_id)
  where posting_group_id is not null;
