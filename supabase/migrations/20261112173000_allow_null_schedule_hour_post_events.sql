-- Sequential posting groups have no schedule hour, so post events recorded
-- for them must be able to store a null schedule_hour. Migration
-- 20260817180244_add_unplanned_post_events.sql already dropped the NOT NULL
-- constraint on this column for unplanned events; re-assert that here so the
-- sequential-group case is covered even if the earlier migration was never
-- applied. This is a no-op on databases where the column is already nullable.
-- The existing 7-19 range check still applies to non-null values (a NULL
-- value does not fail a CHECK constraint), so hourly groups are unaffected.
alter table public.deal_post_events
  alter column schedule_hour drop not null;
