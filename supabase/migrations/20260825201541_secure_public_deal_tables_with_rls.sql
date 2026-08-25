-- Lock down tables currently exposed through the public schema.
-- Server-side service_role access continues to bypass RLS.

alter table public.categories enable row level security;
alter table public.deals enable row level security;
alter table public.deal_candidates enable row level security;
alter table public.deal_clicks enable row level security;
alter table public.discovery_streams enable row level security;
alter table public.brand_tiers enable row level security;

-- Remove broad Data API privileges inherited from the project's historical defaults.
revoke all privileges on table public.categories from anon, authenticated;
revoke all privileges on table public.deals from anon, authenticated;
revoke all privileges on table public.deal_candidates from anon, authenticated;
revoke all privileges on table public.deal_clicks from anon, authenticated;
revoke all privileges on table public.discovery_streams from anon, authenticated;
revoke all privileges on table public.brand_tiers from anon, authenticated;
revoke all privileges on table public.project_heartbeat from anon, authenticated;

-- Current UI requirements: the signed-in admin can add deals and read/add brand tiers.
grant insert on table public.deals to authenticated;
grant select, insert on table public.brand_tiers to authenticated;

create policy "admin can insert deals"
on public.deals
for insert
to authenticated
with check ((select auth.uid()) = '4f6c44fc-7f80-4ee4-8dd0-ed9e26f36cc4'::uuid);

create policy "admin can read brand tiers"
on public.brand_tiers
for select
to authenticated
using ((select auth.uid()) = '4f6c44fc-7f80-4ee4-8dd0-ed9e26f36cc4'::uuid);

create policy "admin can insert brand tiers"
on public.brand_tiers
for insert
to authenticated
with check ((select auth.uid()) = '4f6c44fc-7f80-4ee4-8dd0-ed9e26f36cc4'::uuid);

-- Explicit deny policies keep these server-only tables closed to Data API users
-- while avoiding the advisor's "RLS enabled, no policy" informational finding.
create policy "no direct client access"
on public.categories
for all
to anon, authenticated
using (false)
with check (false);

create policy "no direct client access"
on public.deal_candidates
for all
to anon, authenticated
using (false)
with check (false);

create policy "no direct client access"
on public.deal_clicks
for all
to anon, authenticated
using (false)
with check (false);

create policy "no direct client access"
on public.discovery_streams
for all
to anon, authenticated
using (false)
with check (false);

create policy "no direct client access"
on public.project_heartbeat
for all
to anon, authenticated
using (false)
with check (false);
