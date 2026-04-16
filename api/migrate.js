const KV_URL        = process.env.KV_REST_API_URL;
const KV_TOKEN      = process.env.KV_REST_API_TOKEN;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const MIGRATE_SECRET = process.env.CRON_SECRET;

// ── Read from Upstash ──
async function upstashGet(key) {
  try {
    const r = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await r.json();
    let parsed = data.result;
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    if (Array.isArray(parsed)) parsed = parsed[0];
    if (parsed && typeof parsed === 'object' && 'value' in parsed && Object.keys(parsed).length === 1) {
      parsed = parsed.value;
      while (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { break; }
      }
    }
    return parsed;
  } catch { return null; }
}

// ── Write to Supabase ──
async function supabaseSet(key, value) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Supabase write failed for "${key}": ${err}`);
  }
  return true;
}

export default async function handler(req, res) {
  // Secure with CRON_SECRET
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${MIGRATE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Missing Upstash credentials' });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase credentials' });
  }

  const keys = ['tasks', 'risks', 'chapters', 'budget', 'meetings', 'bot_logs'];
  const results = {};

  for (const key of keys) {
    try {
      console.log(`📦 Migrating "${key}"...`);
      const data = await upstashGet(key);

      if (data === null) {
        results[key] = 'skipped — no data in Upstash';
        console.log(`⚠ "${key}" — no data found, skipping`);
        continue;
      }

      await supabaseSet(key, data);
      results[key] = 'migrated ✅';
      console.log(`✅ "${key}" migrated successfully`);
    } catch (err) {
      results[key] = `error: ${err.message}`;
      console.error(`❌ "${key}" failed:`, err.message);
    }
  }

  return res.status(200).json({
    ok: true,
    migrated_at: new Date().toISOString(),
    results
  });
}
