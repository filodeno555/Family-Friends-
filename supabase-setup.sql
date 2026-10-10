-- Family Friends: Tabelle für die Daten jedes Kontos.
-- Im Supabase-Dashboard unter „SQL Editor“ → „New query“ einfügen und auf „Run“ klicken.

create table if not exists public.app_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Jede Person darf nur ihre eigenen Daten sehen und ändern.
alter table public.app_data enable row level security;

drop policy if exists "Eigene Daten lesen" on public.app_data;
create policy "Eigene Daten lesen" on public.app_data
  for select using (auth.uid() = user_id);

drop policy if exists "Eigene Daten anlegen" on public.app_data;
create policy "Eigene Daten anlegen" on public.app_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene Daten ändern" on public.app_data;
create policy "Eigene Daten ändern" on public.app_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
