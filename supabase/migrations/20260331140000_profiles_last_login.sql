-- Último acceso a la app (bootstrap); sincronizado desde el backend.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login timestamptz;
COMMENT ON COLUMN public.profiles.last_login IS 'Última vez que el usuario cargó la app (bootstrap) o refrescó sesión.';
