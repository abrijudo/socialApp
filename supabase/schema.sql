create extension if not exists pgcrypto;

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id text primary key,
  username text not null unique,
  display_name text not null,
  avatar_url text null,
  bio text not null default '',
  status text not null default 'online' check (status in ('online', 'idle', 'dnd')),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'mod', 'member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  type text not null check (type in ('text', 'voice')),
  name text not null check (char_length(name) between 2 and 40),
  position int not null default 1,
  is_archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id text not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  message_type text not null default 'text' check (message_type in ('text','image','video','audio')),
  media_data text null,
  media_mime text null,
  media_name text null,
  media_duration_ms int null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null
);

create index if not exists idx_channels_server on public.channels(server_id, position);
create index if not exists idx_messages_channel_time on public.messages(channel_id, created_at);

create table if not exists public.channel_permissions (
  channel_id uuid not null references public.channels(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'mod', 'member')),
  can_send_message boolean null,
  can_join_voice boolean null,
  can_use_webcam boolean null,
  can_share_screen boolean null,
  can_manage_channel boolean null,
  can_moderate_voice boolean null,
  updated_at timestamptz not null default now(),
  primary key (channel_id, role)
);

create index if not exists idx_channel_permissions_channel on public.channel_permissions(channel_id);

alter table public.servers enable row level security;
alter table public.profiles enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.channel_permissions enable row level security;

drop policy if exists "members_can_read_servers" on public.servers;
create policy "members_can_read_servers" on public.servers
  for select using (
    exists (
      select 1 from public.server_members sm
      where sm.server_id = public.servers.id
    )
  );

drop policy if exists "read_profiles" on public.profiles;
create policy "read_profiles" on public.profiles
  for select using (true);

drop policy if exists "members_can_read_channels" on public.channels;
create policy "members_can_read_channels" on public.channels
  for select using (
    exists (
      select 1 from public.server_members sm
      where sm.server_id = public.channels.server_id
    )
  );

drop policy if exists "members_can_read_messages" on public.messages;
create policy "members_can_read_messages" on public.messages
  for select using (
    exists (
      select 1
      from public.channels c
      join public.server_members sm on sm.server_id = c.server_id
      where c.id = public.messages.channel_id
    )
  );

drop policy if exists "members_can_read_channel_permissions" on public.channel_permissions;
create policy "members_can_read_channel_permissions" on public.channel_permissions
  for select using (
    exists (
      select 1
      from public.channels c
      join public.server_members sm on sm.server_id = c.server_id
      where c.id = public.channel_permissions.channel_id
    )
  );
