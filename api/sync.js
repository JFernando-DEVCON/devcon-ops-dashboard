export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  try {
    const { tasks, risks, chapters, budget } = req.body;
    const ops = [
      kvSet('tasks',     tasks,    KV_REST_API_URL, KV_REST_API_TOKEN),
      kvSet('risks',     risks,    KV_REST_API_URL, KV_REST_API_TOKEN),
      kvSet('chapters',  chapters, KV_REST_API_URL, KV_REST_API_TOKEN),
      kvSet('synced_at', new Date().toISOString(), KV_REST_API_URL, KV_REST_API_TOKEN),
    ];
    if (budget) ops.push(kvSet('budget', budget, KV_REST_API_URL, KV_REST_API_TOKEN));
    await Promise.all(ops);
    console.log('✅ Sync complete at', new Date().toISOString());
    return res.status(200).json({ ok: true, synced_at: new Date().toISOString() });
    return res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  } catch (err) {
    console.error('Sync error:', err);
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
  return r.json();
}
