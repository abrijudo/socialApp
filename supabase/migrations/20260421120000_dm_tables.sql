-- Mensajes directos: crear tablas si no existen (corrige "Could not find the table public.dm_participants").
-- Ejecutar vía `supabase db push` o pegar en Supabase → SQL Editor.

create table if not exists public.dm_channels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.dm_participants (
  dm_channel_id uuid not null references public.dm_channels(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  primary key (dm_channel_id, user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  dm_channel_id uuid not null references public.dm_channels(id) on delete cascade,
  author_id text not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'video', 'audio', 'file')),
  media_data text null,
  media_mime text null,
  media_name text null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null
);

create index if not exists idx_dm_messages_channel on public.dm_messages(dm_channel_id, created_at);

alter table public.dm_channels enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "members_read_dm" on public.dm_channels;
create policy "members_read_dm" on public.dm_channels for select using (
  exists (select 1 from public.dm_participants dp where dp.dm_channel_id = id)
);

drop policy if exists "members_read_dm_participants" on public.dm_participants;
create policy "members_read_dm_participants" on public.dm_participants for select using (true);

drop policy if exists "members_read_dm_messages" on public.dm_messages;
create policy "members_read_dm_messages" on public.dm_messages for select using (
  exists (select 1 from public.dm_participants dp where dp.dm_channel_id = dm_channel_id)
);
