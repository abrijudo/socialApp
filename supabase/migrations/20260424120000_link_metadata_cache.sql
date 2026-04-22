-- Caché de metadatas Open Graph para GET /api/preview (backend con service role).
-- Lectura/escritura solo desde el servidor; sin políticas de acceso a JWT (RLS activo, sin filas accesibles).

create table if not exists public.link_metadata_cache (
  url text primary key,
  -- URL final tras redirecciones (og:url / respuesta de link-preview-js); si null, usar `url` en la API.
  response_url text,
  title text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now()
);

comment on table public.link_metadata_cache is
  'Caché de preview de URLs; created_at = última actualización. TTL 7d en aplicación.';

create index if not exists idx_link_metadata_cache_created_at
  on public.link_metadata_cache (created_at);

alter table public.link_metadata_cache enable row level security;

-- Sin políticas para authenticated/anon: el cliente nunca toca esta tabla; el servicio usa la service key.
