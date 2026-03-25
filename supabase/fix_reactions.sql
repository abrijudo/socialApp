-- Ejecuta esto en Supabase: SQL Editor → New query → pegar y Run
-- Crea la tabla de reacciones si no existe

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 10),
  primary key (message_id, user_id, emoji)
);
create index if not exists idx_reactions_message on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;
drop policy if exists "read_reactions" on public.message_reactions;
create policy "read_reactions" on public.message_reactions for select using (true);
