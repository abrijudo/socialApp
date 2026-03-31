-- Alinea el CHECK con POST /presence/offline y profiles/upsert (status 'offline').
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY['online'::text, 'idle'::text, 'dnd'::text, 'offline'::text]));
