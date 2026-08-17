create table if not exists public.deal_post_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_item_id uuid references public.deal_schedule_items(id) on delete set null,
  posting_group_id uuid not null references public.deal_posting_groups(id) on delete restrict,
  schedule_date date not null,
  schedule_hour smallint not null check (schedule_hour between 7 and 19),
  asin text check (asin is null or asin ~ '^[A-Z0-9]{10}$'),
  parent_asin text check (parent_asin is null or parent_asin ~ '^[A-Z0-9]{10}$'),
  product_title text,
  price_at_posting numeric(12, 4) check (price_at_posting is null or price_at_posting >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  affiliate_url text,
  post_body text not null default '' check (char_length(post_body) <= 10000),
  comment_text text not null default '' check (char_length(comment_text) <= 10000),
  posted_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  check (
    (voided_at is null and void_reason is null)
    or voided_at is not null
  )
);

create unique index if not exists deal_post_events_one_active_per_schedule_item_idx
  on public.deal_post_events (schedule_item_id)
  where voided_at is null;

create index if not exists deal_post_events_user_posted_at_idx
  on public.deal_post_events (user_id, posted_at desc);

create index if not exists deal_post_events_asin_posted_at_idx
  on public.deal_post_events (asin, posted_at desc)
  where asin is not null;

alter table public.deal_post_events enable row level security;

revoke all privileges on table public.deal_post_events from anon, authenticated;
grant select on public.deal_post_events to authenticated;

create policy "Users can read their own post events"
  on public.deal_post_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
