const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function dbSet(key, value) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      key,
      value,
      updated_at: new Date().toISOString()
    })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DB write failed for "${key}": ${err}`);
  }
  console.log(`✅ DB write OK: ${key}`);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Missing Supabase credentials' });
  }
  try {
    const { tasks, risks, chapters, budget, meetings } = req.body;
    if (!tasks || !risks || !chapters) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }
    if (tasks && !tasks.backlog) tasks.backlog = [];

    const ops = [
      dbSet('tasks',     tasks),
      dbSet('risks',     risks),
      dbSet('chapters',  chapters),
      dbSet('synced_at', new Date().toISOString()),
    ];
    if (budget)   ops.push(dbSet('budget',   budget));
    if (meetings) ops.push(dbSet('meetings', meetings));

    await Promise.all(ops);
    console.log('✅ Sync complete at', new Date().toISOString());
    return res.status(200).json({ ok: true, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('❌ Sync error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
