export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

  try {
    const { tasks, risks, chapters } = req.body;

    await Promise.all([
      upstashSet('tasks',     JSON.stringify(tasks),    KV_REST_API_URL, KV_REST_API_TOKEN),
      upstashSet('risks',     JSON.stringify(risks),    KV_REST_API_URL, KV_REST_API_TOKEN),
      upstashSet('chapters',  JSON.stringify(chapters), KV_REST_API_URL, KV_REST_API_TOKEN),
      upstashSet('synced_at', new Date().toISOString(), KV_REST_API_URL, KV_REST_API_TOKEN),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function upstashSet(key, value, url, token) {
  const r = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([value])
  });
  return r.json();
}
