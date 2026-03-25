-- Invitaciones
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  code text not null unique,
  created_by text not null references public.profiles(user_id) on delete cascade,
  expires_at timestamptz not null,
  max_uses int null,
  uses_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_invitations_code on public.invitations(code);
create index if not exists idx_invitations_server on public.invitations(server_id);

-- DM
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
  message_type text not null default 'text' check (message_type in ('text','image','video','audio','file')),
  media_data text null,
  media_mime text null,
  media_name text null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null
);
create index if not exists idx_dm_messages_channel on public.dm_messages(dm_channel_id, created_at);

-- Hilos (parent_message_id en messages)
alter table public.messages add column if not exists parent_message_id uuid references public.messages(id) on delete cascade;
create index if not exists idx_messages_parent on public.messages(parent_message_id) where parent_message_id is not null;

-- Reacciones
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 10),
  primary key (message_id, user_id, emoji)
);
create index if not exists idx_reactions_message on public.message_reactions(message_id);

-- Tipos message y file
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text','image','video','audio','file'));

-- Status offline en perfiles
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('online', 'idle', 'dnd', 'offline'));

-- RLS para nuevas tablas
alter table public.invitations enable row level security;
alter table public.dm_channels enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;
alter table public.message_reactions enable row level security;

create policy "read_invitations" on public.invitations for select using (true);
create policy "members_read_dm" on public.dm_channels for select using (
  exists (select 1 from public.dm_participants dp where dp.dm_channel_id = id)
);
create policy "members_read_dm_participants" on public.dm_participants for select using (true);
create policy "members_read_dm_messages" on public.dm_messages for select using (
  exists (select 1 from public.dm_participants dp where dp.dm_channel_id = dm_channel_id)
);
create policy "read_reactions" on public.message_reactions for select using (true);
