export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    console.error('❌ Missing KV env vars');
    return res.status(500).json({ ok: false, error: 'Missing KV credentials' });
  }

  try {
    const { tasks, risks, chapters, budget } = req.body;

    if (!tasks || !risks || !chapters) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Ensure backlog exists
    if (tasks && !tasks.backlog) tasks.backlog = [];

    const results = await Promise.all([
      kvSet('tasks',    tasks,    KV_REST_API_URL, KV_REST_API_TOKEN),
      kvSet('risks',    risks,    KV_REST_API_URL, KV_REST_API_TOKEN),
      kvSet('chapters', chapters, KV_REST_API_URL, KV_REST_API_TOKEN),
      kvSet('synced_at', new Date().toISOString(), KV_REST_API_URL, KV_REST_API_TOKEN),
      ...(budget ? [kvSet('budget', budget, KV_REST_API_URL, KV_REST_API_TOKEN)] : []),
    ]);

    console.log('✅ Sync complete at', new Date().toISOString());
    return res.status(200).json({ ok: true, synced_at: new Date().toISOString() });

  } catch (err) {
    console.error('❌ Sync error:', err.message, err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function kvSet(key, value, url, token) {
  const r = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
  const result = await r.json();
  if (!r.ok) {
    throw new Error(`KV write failed for "${key}": ${JSON.stringify(result)}`);
  }
  console.log(`✅ KV write OK: ${key}`);
  return result;
}
