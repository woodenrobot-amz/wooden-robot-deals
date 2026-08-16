create table if not exists public.deal_posting_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  accent text not null default 'amber' check (accent in ('amber', 'blue', 'emerald', 'violet', 'rose')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.deal_posting_groups (name, slug, accent, sort_order)
values
  ('Woodworking', 'woodworking', 'amber', 10),
  ('Dad Deals', 'dad-deals', 'blue', 20)
on conflict (slug) do update
set
  name = excluded.name,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

create table if not exists public.deal_schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_group_id uuid not null references public.deal_posting_groups(id) on delete restrict,
  schedule_date date not null,
  schedule_hour smallint not null check (schedule_hour between 7 and 19),
  post_body text not null default '' check (char_length(post_body) <= 10000),
  comment_text text not null default '' check (char_length(comment_text) <= 10000),
  asin text check (asin is null or asin ~ '^[A-Z0-9]{10}$'),
  status text not null default 'planned' check (status in ('planned', 'posted')),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, posting_group_id, schedule_date, schedule_hour)
);

create index if not exists deal_schedule_items_user_date_idx
  on public.deal_schedule_items (user_id, schedule_date);

create index if not exists deal_schedule_items_posting_group_idx
  on public.deal_schedule_items (posting_group_id);

create index if not exists deal_schedule_items_asin_idx
  on public.deal_schedule_items (asin)
  where asin is not null;

alter table public.deal_posting_groups enable row level security;
alter table public.deal_schedule_items enable row level security;

grant select on public.deal_posting_groups to authenticated;
grant select, insert, update, delete on public.deal_schedule_items to authenticated;

create policy "Authenticated users can read posting groups"
  on public.deal_posting_groups
  for select
  to authenticated
  using (true);

create policy "Users can read their own scheduled deals"
  on public.deal_schedule_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own scheduled deals"
  on public.deal_schedule_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own scheduled deals"
  on public.deal_schedule_items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own scheduled deals"
  on public.deal_schedule_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
