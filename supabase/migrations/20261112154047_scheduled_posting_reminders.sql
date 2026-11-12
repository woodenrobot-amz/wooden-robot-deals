create table public.posting_reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  times text[] not null default array['07:30','08:30','09:30','10:30','11:30','12:45','14:15','15:45','17:15','19:20','20:00','20:40','21:30'],
  updated_at timestamptz not null default now(),
  constraint valid_reminder_times check (
    cardinality(times) <= 48 and array_position(times, null) is null
    and array_to_string(times, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*)?$'
  )
);
alter table public.posting_reminder_settings enable row level security;
revoke all on public.posting_reminder_settings from public, anon, authenticated;
grant select, insert, update on public.posting_reminder_settings to authenticated;
grant all on public.posting_reminder_settings to service_role;
create policy "Users read own reminder schedule" on public.posting_reminder_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users insert own reminder schedule" on public.posting_reminder_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own reminder schedule" on public.posting_reminder_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Keep the existing return shape and claim column for rolling deployment compatibility.
-- posted_at now identifies a scheduled occurrence, independent of deal posts.
create or replace function public.claim_posting_reminders()
returns table (endpoint text, p256dh text, auth text, posted_at timestamptz, expires_at timestamptz)
language sql security invoker set search_path = '' as $$
  with due as (
    select s.endpoint, occurrence.due_at
    from public.posting_push_subscriptions s
    left join public.posting_reminder_settings settings on settings.user_id = s.user_id
    cross join lateral (
      select max(((now() at time zone 'America/New_York')::date + slot::time)
        at time zone 'America/New_York') as due_at
      from unnest(coalesce(settings.times,
        array['07:30','08:30','09:30','10:30','11:30','12:45','14:15','15:45','17:15','19:20','20:00','20:40','21:30'])) slot
      where ((now() at time zone 'America/New_York')::date + slot::time)
        at time zone 'America/New_York' <= now()
    ) occurrence
    where occurrence.due_at > now() - interval '5 minutes'
      and s.created_at <= occurrence.due_at
      and (s.notified_posted_at is null or s.notified_posted_at < occurrence.due_at)
  )
  update public.posting_push_subscriptions s
  set notified_posted_at = due.due_at
  from due
  where s.endpoint = due.endpoint
    and (s.notified_posted_at is null or s.notified_posted_at < due.due_at)
  returning s.endpoint, s.p256dh, s.auth, due.due_at, due.due_at + interval '5 minutes';
$$;
revoke all on function public.claim_posting_reminders() from public, anon, authenticated;
grant execute on function public.claim_posting_reminders() to service_role;
