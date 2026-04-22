-- RLS: lectura acotada a auth.uid() en servidores, canales, mensajes, DMs, reacciones e invitaciones.
-- `read_profiles` se mantiene público (estilo Discord).
-- Las invitaciones: solo creador o admin/owner del servidor (unirse por código vía API, no listado global).

-- ---------------------------------------------------------------------------
-- Servidores, canales, permisos, mensajes
-- ---------------------------------------------------------------------------

drop policy if exists "members_can_read_servers" on public.servers;
create policy "members_can_read_servers" on public.servers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.server_members sm
      where sm.server_id = public.servers.id
        and sm.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists "members_can_read_channels" on public.channels;
create policy "members_can_read_channels" on public.channels
  for select
  to authenticated
  using (
    exists (
      select 1 from public.server_members sm
      where sm.server_id = public.channels.server_id
        and sm.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists "members_can_read_messages" on public.messages;
create policy "members_can_read_messages" on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.channels c
      join public.server_members sm
        on sm.server_id = c.server_id
       and sm.user_id = (select auth.uid()::text)
      where c.id = public.messages.channel_id
    )
  );

drop policy if exists "members_can_read_channel_permissions" on public.channel_permissions;
create policy "members_can_read_channel_permissions" on public.channel_permissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.channels c
      join public.server_members sm
        on sm.server_id = c.server_id
       and sm.user_id = (select auth.uid()::text)
      where c.id = public.channel_permissions.channel_id
    )
  );

-- ---------------------------------------------------------------------------
-- Perfiles: visibilidad pública (nombres/avatars visibles a cualquiera autenticado)
-- Recrea la política para dejar constancia; equivalente a USING (true).
-- ---------------------------------------------------------------------------

drop policy if exists "read_profiles" on public.profiles;
create policy "read_profiles" on public.profiles
  for select
  using (true);

-- ---------------------------------------------------------------------------
-- Invitaciones: crear tabla si en este proyecto nunca se aplicó 20250312_full_features.sql
-- ---------------------------------------------------------------------------

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

alter table public.invitations enable row level security;

-- ---------------------------------------------------------------------------
-- Invitaciones: solo creador o admin/owner (no listado masivo; join por código = API)
-- ---------------------------------------------------------------------------

drop policy if exists "read_invitations" on public.invitations;
create policy "invitations_select_creator_or_server_admin" on public.invitations
  for select
  to authenticated
  using (
    public.invitations.created_by = (select auth.uid()::text)
    or exists (
      select 1 from public.server_members sm
      where sm.server_id = public.invitations.server_id
        and sm.user_id = (select auth.uid()::text)
        and sm.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Reacciones: tabla (por si no existe en este proyecto)
-- ---------------------------------------------------------------------------

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 10),
  primary key (message_id, user_id, emoji)
);

create index if not exists idx_reactions_message on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;

-- ---------------------------------------------------------------------------
-- Reacciones: mismo alcance que el mensaje (canal del servidor)
-- ---------------------------------------------------------------------------

drop policy if exists "read_reactions" on public.message_reactions;
create policy "read_reactions" on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.channels c on c.id = m.channel_id
      join public.server_members sm
        on sm.server_id = c.server_id
       and sm.user_id = (select auth.uid()::text)
      where m.id = public.message_reactions.message_id
    )
  );

-- ---------------------------------------------------------------------------
-- DMs: participante actual
-- ---------------------------------------------------------------------------

drop policy if exists "members_read_dm" on public.dm_channels;
create policy "members_read_dm" on public.dm_channels
  for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants dp
      where dp.dm_channel_id = public.dm_channels.id
        and dp.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists "members_read_dm_participants" on public.dm_participants;
create policy "members_read_dm_participants" on public.dm_participants
  for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants me
      where me.dm_channel_id = public.dm_participants.dm_channel_id
        and me.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists "members_read_dm_messages" on public.dm_messages;
create policy "members_read_dm_messages" on public.dm_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants dp
      where dp.dm_channel_id = public.dm_messages.dm_channel_id
        and dp.user_id = (select auth.uid()::text)
    )
  );
