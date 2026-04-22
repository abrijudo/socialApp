-- Realtime: Postgres Changes necesita estas tablas en la publicación `supabase_realtime`.
-- Sin esto, el cliente nunca recibe INSERT/UPDATE/DELETE aunque el código suscriba.

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
END $$;
