const { z } = require('zod');

const idSchema = z.string().min(2).max(80);
const channelTypeSchema = z.enum(['text', 'voice']);
const roleSchema = z.enum(['owner', 'admin', 'mod', 'member']);
const actionSchema = z.enum(['send_message', 'join_voice', 'use_webcam', 'share_screen', 'manage_channel', 'moderate_voice']);

function handleError(res, err) {
  const message = err?.message || 'Error interno';
  return res.status(400).json({ error: message });
}

module.exports = { idSchema, channelTypeSchema, roleSchema, actionSchema, handleError };
