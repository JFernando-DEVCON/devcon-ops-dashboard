const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function dbGet(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=eq.${key}&select=value`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const rows = await r.json();
  if (!rows || rows.length === 0) return null;
  return rows[0].value;
}

export default async function handler(req, res) {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase credentials' });
  }
  try {
    let data = await dbGet(key);
    if (data === null) return res.status(200).json({ data: null });

    // Safety: ensure backlog always exists on tasks
    if (key === 'tasks' && data && typeof data === 'object') {
      if (!data.backlog)   data.backlog   = [];
      if (!data.critical)  data.critical  = [];
      if (!data.high)      data.high      = [];
      if (!data.medium)    data.medium    = [];
      if (!data.high_done) data.high_done = [];
    }

    return res.status(200).json({ data });
  } catch (err) {
    console.error(`❌ Get error for key "${key}":`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
