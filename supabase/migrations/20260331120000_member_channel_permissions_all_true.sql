-- Todos los permisos explícitos para rol `member` en cada canal (coherente con defaultPermission en API).
update public.channel_permissions set
  can_send_message = true,
  can_join_voice = true,
  can_use_webcam = true,
  can_share_screen = true,
  can_manage_channel = true,
  can_moderate_voice = true,
  updated_at = now()
where role = 'member';
