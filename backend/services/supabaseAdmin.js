const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;

function getSupabaseAdmin() {
  if (supabase) return supabase;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY).');
  }

  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

module.exports = { getSupabaseAdmin };
