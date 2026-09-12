insert into public.deal_posting_groups (
  name, slug, accent, sort_order, schedule_type, tracks_post_events, is_active
)
values ('Woodworking Page', 'woodworking-page', 'rose', 15, 'hourly', true, true)
on conflict (slug) do update
set
  name = excluded.name,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  schedule_type = excluded.schedule_type,
  tracks_post_events = excluded.tracks_post_events,
  is_active = excluded.is_active,
  updated_at = now();
