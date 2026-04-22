-- Amistades: solicitudes (pending) y aceptadas (accepted).
-- Par único (sin importar el orden) vía Least / Greatest sobre sender y receiver.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'friendship_status') then
    create type public.friendship_status as enum ('pending', 'accepted');
  end if;
end $$;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null references public.profiles (user_id) on delete cascade,
  receiver_id text not null references public.profiles (user_id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_sender_not_receiver check (sender_id <> receiver_id)
);

create unique index if not exists friendships_pair_undirected
  on public.friendships (least(sender_id, receiver_id), greatest(sender_id, receiver_id));

create index if not exists friendships_sender_idx on public.friendships (sender_id);
create index if not exists friendships_receiver_idx on public.friendships (receiver_id);

-- updated_at
create or replace function public.set_friendships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_friendships_updated_at on public.friendships;
create trigger trg_friendships_updated_at
  before update on public.friendships
  for each row
  execute function public.set_friendships_updated_at();

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_participants" on public.friendships;
create policy "friendships_select_participants"
  on public.friendships
  for select
  to authenticated
  using (auth.uid()::text = sender_id or auth.uid()::text = receiver_id);

drop policy if exists "friendships_insert_outgoing" on public.friendships;
create policy "friendships_insert_outgoing"
  on public.friendships
  for insert
  to authenticated
  with check (auth.uid()::text = sender_id);

drop policy if exists "friendships_update_participants" on public.friendships;
create policy "friendships_update_participants"
  on public.friendships
  for update
  to authenticated
  using (auth.uid()::text = sender_id or auth.uid()::text = receiver_id)
  with check (auth.uid()::text = sender_id or auth.uid()::text = receiver_id);

drop policy if exists "friendships_delete_participants" on public.friendships;
create policy "friendships_delete_participants"
  on public.friendships
  for delete
  to authenticated
  using (auth.uid()::text = sender_id or auth.uid()::text = receiver_id);

alter table public.friendships replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;
