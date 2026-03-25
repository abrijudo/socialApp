const { getSupabaseAdmin } = require('./supabaseAdmin');

const BUCKET = 'messages-media';
const MAX_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = ['image/', 'video/', 'audio/', 'application/pdf'];

async function ensureBucket() {
  const sb = getSupabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some(b => b.name === BUCKET)) return;
  const { error } = await sb.storage.createBucket(BUCKET, { public: true });
  if (error && !error.message?.includes('already exists')) throw error;
}

async function uploadMedia({ buffer, mimeType, fileName, userId }) {
  await ensureBucket();
  const sb = getSupabaseAdmin();
  const ext = (fileName || '').split('.').pop() || 'bin';
  const safeName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await sb.storage
    .from(BUCKET)
    .upload(safeName, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    });

  if (error) throw error;
  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

module.exports = { uploadMedia, BUCKET, MAX_SIZE, ALLOWED_TYPES };
