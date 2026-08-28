alter table public.deal_posting_groups
  add column if not exists schedule_type text not null default 'hourly'
    check (schedule_type in ('hourly', 'sequential')),
  add column if not exists tracks_post_events boolean not null default true;

insert into public.deal_posting_groups (
  name, slug, accent, sort_order, schedule_type, tracks_post_events, is_active
)
values ('Lowe''s', 'lowes', 'emerald', 30, 'sequential', false, false)
on conflict (slug) do update
set
  name = excluded.name,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  schedule_type = excluded.schedule_type,
  tracks_post_events = excluded.tracks_post_events,
  is_active = false,
  updated_at = now();

alter table public.deal_schedule_items
  add column if not exists schedule_position smallint;

update public.deal_schedule_items
set schedule_position = schedule_hour
where schedule_position is null;

-- Preserve writes from the currently deployed hourly API during rollout.
create or replace function public.set_deal_schedule_position_from_hour()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.schedule_position is null and new.schedule_hour is not null then
    new.schedule_position := new.schedule_hour;
  end if;
  return new;
end;
$$;

revoke all on function public.set_deal_schedule_position_from_hour() from public, anon, authenticated;

drop trigger if exists set_deal_schedule_position_from_hour on public.deal_schedule_items;
create trigger set_deal_schedule_position_from_hour
  before insert or update of schedule_hour, schedule_position
  on public.deal_schedule_items
  for each row
  execute function public.set_deal_schedule_position_from_hour();

alter table public.deal_schedule_items
  alter column schedule_position set not null,
  alter column schedule_hour drop not null;

alter table public.deal_schedule_items
  drop constraint if exists deal_schedule_items_schedule_hour_check;

alter table public.deal_schedule_items
  add constraint deal_schedule_items_schedule_position_check
    check (schedule_position between 1 and 100),
  add constraint deal_schedule_items_schedule_hour_check
    check (schedule_hour is null or schedule_hour between 7 and 19);

create unique index if not exists deal_schedule_items_user_group_date_position_idx
  on public.deal_schedule_items (user_id, posting_group_id, schedule_date, schedule_position);
