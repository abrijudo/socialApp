-- Un solo perfil por nombre de usuario (coincide con la validación previa al registro).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);
