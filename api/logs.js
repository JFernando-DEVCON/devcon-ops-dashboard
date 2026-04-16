const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAX_LOGS = 100;

async function dbGet(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=eq.${key}&select=value`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  const rows = await r.json();
  if (!rows || rows.length === 0) return null;
  return rows[0].value;
}

async function dbSet(key, value) {
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
  return r.ok;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Missing Supabase credentials' });
  }

  if (req.method === 'GET') {
    const logs = await dbGet('bot_logs') || [];
    return res.status(200).json({ ok: true, logs });
  }

  if (req.method === 'POST') {
    const { level, command, user, message, chatId } = req.body;
    const logs = await dbGet('bot_logs') || [];
    logs.unshift({
      ts:      new Date().toISOString(),
      level:   level   || 'info',
      command: command || '—',
      user:    user    || '—',
      chatId:  chatId  || '—',
      message: message || '—',
    });
    if (logs.length > MAX_LOGS) logs.splice(MAX_LOGS);
    await dbSet('bot_logs', logs);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await dbSet('bot_logs', []);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
