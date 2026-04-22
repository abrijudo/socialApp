-- Respuestas en DM: misma mecánica que `messages.parent_message_id` en canales.
alter table public.dm_messages
  add column if not exists parent_message_id uuid references public.dm_messages (id) on delete set null;

create index if not exists idx_dm_messages_parent on public.dm_messages (parent_message_id)
  where parent_message_id is not null;
