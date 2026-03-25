const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabaseAuth = null;
function getSupabaseAuth() {
  if (supabaseAuth) return supabaseAuth;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY para verificar JWT.');
  }
  supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAuth;
}

/** Obtiene el token de Authorization header o de body.token (para sendBeacon) */
function getToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return body.token || null;
}

/** Middleware que verifica el JWT de Supabase y establece req.userId */
async function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
  }
  try {
    const sb = getSupabaseAuth();
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }
    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Error al verificar sesión.' });
  }
}

/** Middleware opcional: si hay token, establece req.userId; si no, continúa sin él */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return next();
  }
  try {
    const sb = getSupabaseAuth();
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (!error && user) req.userId = user.id;
  } catch (_) {}
  next();
}

module.exports = { requireAuth, optionalAuth };
