alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists media_data text null;
alter table public.messages add column if not exists media_mime text null;
alter table public.messages add column if not exists media_name text null;
alter table public.messages add column if not exists media_duration_ms int null;

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'video', 'audio'));
