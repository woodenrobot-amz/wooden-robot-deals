-- Multiple comments per scheduled post, with independent ASIN tracking and immutable post-event snapshots.
create table if not exists public.deal_schedule_comments (
  id uuid primary key default gen_random_uuid(),
  schedule_item_id uuid not null references public.deal_schedule_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  comment_text text not null default '' check (char_length(comment_text) <= 10000),
  asin text check (asin is null or asin ~ '^[A-Z0-9]{10}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_item_id, position)
);

create index if not exists deal_schedule_comments_user_idx
  on public.deal_schedule_comments (user_id);
create index if not exists deal_schedule_comments_asin_idx
  on public.deal_schedule_comments (asin) where asin is not null;

alter table public.deal_schedule_comments enable row level security;
grant select, insert, update, delete on public.deal_schedule_comments to authenticated;

create policy "Users can read their own scheduled comments"
  on public.deal_schedule_comments for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own scheduled comments"
  on public.deal_schedule_comments for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own scheduled comments"
  on public.deal_schedule_comments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own scheduled comments"
  on public.deal_schedule_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.deal_post_event_comments (
  id uuid primary key default gen_random_uuid(),
  post_event_id uuid not null references public.deal_post_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  comment_text text not null default '' check (char_length(comment_text) <= 10000),
  asin text check (asin is null or asin ~ '^[A-Z0-9]{10}$'),
  parent_asin text check (parent_asin is null or parent_asin ~ '^[A-Z0-9]{10}$'),
  product_title text,
  price_at_posting numeric(12, 4) check (price_at_posting is null or price_at_posting >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  affiliate_url text,
  created_at timestamptz not null default now(),
  unique (post_event_id, position)
);

create index if not exists deal_post_event_comments_user_idx
  on public.deal_post_event_comments (user_id);
create index if not exists deal_post_event_comments_asin_idx
  on public.deal_post_event_comments (asin, created_at desc) where asin is not null;

alter table public.deal_post_event_comments enable row level security;
revoke all privileges on table public.deal_post_event_comments from anon, authenticated;
grant select on public.deal_post_event_comments to authenticated;
create policy "Users can read their own post event comments"
  on public.deal_post_event_comments for select to authenticated
  using ((select auth.uid()) = user_id);

-- Preserve every existing single-comment slot/event as Comment 1.
insert into public.deal_schedule_comments (
  schedule_item_id, user_id, position, comment_text, asin, created_at, updated_at
)
select id, user_id, 1, comment_text, asin, created_at, updated_at
from public.deal_schedule_items
where btrim(comment_text) <> '' or asin is not null
on conflict (schedule_item_id, position) do nothing;

insert into public.deal_post_event_comments (
  post_event_id, user_id, position, comment_text, asin, parent_asin,
  product_title, price_at_posting, currency_code, affiliate_url, created_at
)
select id, user_id, 1, comment_text, asin, parent_asin,
  product_title, price_at_posting, currency_code, affiliate_url, created_at
from public.deal_post_events
where btrim(comment_text) <> '' or asin is not null
on conflict (post_event_id, position) do nothing;
