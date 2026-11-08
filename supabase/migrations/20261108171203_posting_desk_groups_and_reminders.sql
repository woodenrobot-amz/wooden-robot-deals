update public.deal_posting_groups
set name = 'Dads', sort_order = 20, updated_at = now()
where slug = 'dad-deals';

insert into public.deal_posting_groups (name, slug, accent, sort_order)
values ('Makers', 'makers', 'emerald', 30)
on conflict (slug) do update set is_active = true, name = excluded.name, sort_order = excluded.sort_order;

update public.deal_posting_groups
set is_active = false, updated_at = now()
where slug in ('lowes', 'woodworking-page') and is_active;

alter table public.deal_posting_groups
  add column owner_id uuid references auth.users(id) on delete cascade;

drop policy "Authenticated users can read posting groups" on public.deal_posting_groups;
create policy "Users can read shared and own posting groups"
  on public.deal_posting_groups for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create unique index deal_posting_groups_owner_name_idx
  on public.deal_posting_groups (owner_id, lower(name)) where owner_id is not null;

create index deal_schedule_items_latest_post_idx
  on public.deal_schedule_items (user_id, posted_at desc)
  where status = 'posted' and posted_at is not null;

create table public.posting_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  time_zone text not null,
  created_at timestamptz not null default now(),
  notified_posted_at timestamptz
);

alter table public.posting_push_subscriptions enable row level security;
revoke all on public.posting_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.posting_push_subscriptions to service_role;

create or replace function public.claim_posting_reminders()
returns table (
  endpoint text, p256dh text, auth text, posted_at timestamptz,
  expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select s.endpoint, p.posted_at,
           (local_clock.posted::date + time '20:00') at time zone s.time_zone as expires_at
    from public.posting_push_subscriptions s
    cross join lateral (
      select i.posted_at
      from public.deal_schedule_items i
      where i.user_id = s.user_id and i.status = 'posted' and i.posted_at is not null
      order by i.posted_at desc
      limit 1
    ) p
    cross join lateral (
      select p.posted_at at time zone s.time_zone as posted,
             now() at time zone s.time_zone as current_time_local
    ) local_clock
    where p.posted_at + interval '1 hour' <= now()
      and s.created_at <= p.posted_at + interval '1 hour'
      and local_clock.posted::date = local_clock.current_time_local::date
      and local_clock.posted::time >= time '07:00'
      and local_clock.current_time_local::time < time '20:00'
      and (s.notified_posted_at is null or s.notified_posted_at < p.posted_at)
  )
  update public.posting_push_subscriptions s
  set notified_posted_at = due.posted_at
  from due
  where s.endpoint = due.endpoint
    and (s.notified_posted_at is null or s.notified_posted_at < due.posted_at)
  returning s.endpoint, s.p256dh, s.auth, due.posted_at, due.expires_at;
$$;

revoke all on function public.claim_posting_reminders() from public, anon, authenticated;
grant execute on function public.claim_posting_reminders() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('posting-desk-reminders', '* * * * *', $job$
  select net.http_post(
    url := rtrim(origin.decrypted_secret, '/') || '/api/automation/posting-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret.decrypted_secret),
    timeout_milliseconds := 25000
  )
  from vault.decrypted_secrets origin
  cross join vault.decrypted_secrets secret
  where origin.name = 'posting_reminder_app_url'
    and secret.name = 'posting_reminder_automation_secret'
    and exists (select 1 from public.posting_push_subscriptions);
$job$);
