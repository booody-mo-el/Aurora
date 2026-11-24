-- Aurora Database Migration 002: Persistent Admin Settings, Analytics Counters, Source Fallbacks & Guest/User Reports.
-- Safe & idempotent: preserves all existing tables and rows.
-- Apply in Supabase Dashboard → SQL Editor.

-- 1. Extend curated_sources with fallback URLs, quality variants, and completeness metadata
alter table if exists public.curated_sources
  add column if not exists fallback_urls jsonb not null default '[]'::jsonb,
  add column if not exists quality_sources jsonb not null default '[]'::jsonb,
  add column if not exists completeness text not null default 'complete' check (completeness in ('complete','incomplete')),
  add column if not exists source_verified boolean not null default true;

-- 2. Extend content_reports with reporter label (for both authenticated and guest reports routed via backend)
alter table if exists public.content_reports
  add column if not exists reporter_label text not null default 'guest';

-- 3. Persistent site/featured configuration (hero overrides, shelf title, disabled built-in source IDs)
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, public;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

drop policy if exists "Anyone can read site settings" on public.site_settings;
drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Anyone can read site settings"
  on public.site_settings for select to anon, authenticated
  using (true);
create policy "Admins manage site settings"
  on public.site_settings for all to authenticated
  using (exists (select 1 from public.admin_roles ar where ar.user_id = auth.uid() and ar.role = 'admin'))
  with check (exists (select 1 from public.admin_roles ar where ar.user_id = auth.uid() and ar.role = 'admin'));

-- 4. Persistent server analytics counters (service_role / admin access only)
create table if not exists public.analytics_counters (
  id text primary key default 'global',
  playback_starts bigint not null default 0,
  playback_completions bigint not null default 0,
  searches bigint not null default 0,
  detail_views bigint not null default 0,
  recent_events jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.analytics_counters enable row level security;
revoke all on public.analytics_counters from anon, public, authenticated;

drop policy if exists "Admins read analytics counters" on public.analytics_counters;
create policy "Admins read analytics counters"
  on public.analytics_counters for select to authenticated
  using (exists (select 1 from public.admin_roles ar where ar.user_id = auth.uid() and ar.role in ('admin','moderator')));
