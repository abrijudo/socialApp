-- Ejecuta en Supabase SQL Editor - muestra todos los diagnósticos en una tabla

SELECT * FROM (
  SELECT 1 as orden, 'Mensajes sin id' as check_name, count(*)::text as problemas
  FROM public.messages WHERE id IS NULL
  UNION ALL
  SELECT 2, 'Mensajes con autor inexistente en profiles', count(*)::text
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.user_id = m.author_id
  WHERE p.user_id IS NULL
  UNION ALL
  SELECT 3, 'Canales sin id', count(*)::text
  FROM public.channels WHERE id IS NULL
  UNION ALL
  SELECT 4, 'Servers sin id', count(*)::text
  FROM public.servers WHERE id IS NULL
  UNION ALL
  SELECT 5, 'server_members con user_id nulo', count(*)::text
  FROM public.server_members WHERE user_id IS NULL
  UNION ALL
  SELECT 6, 'Profiles con user_id nulo', count(*)::text
  FROM public.profiles WHERE user_id IS NULL
) t ORDER BY orden;
