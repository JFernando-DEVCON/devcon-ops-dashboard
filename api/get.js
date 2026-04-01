export default async function handler(req, res) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  try {
    const r = await fetch(`${KV_REST_API_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });
    const data = await r.json();
    if (!data.result) return res.status(200).json({ data: null });

    // Consistent parse — always one level of JSON.parse
    let parsed = data.result;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    if (Array.isArray(parsed)) parsed = parsed[0];
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch {}
    }

    return res.status(200).json({ data: parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
