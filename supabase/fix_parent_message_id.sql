-- Ejecuta esto en Supabase: SQL Editor → New query → pegar y Run

-- Columna para hilos (respuestas)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
