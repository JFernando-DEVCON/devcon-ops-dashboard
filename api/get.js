export default async function handler(req, res) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  const key = req.query.key;

  if (!key) return res.status(400).json({ error: 'Missing key' });
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Missing KV credentials' });
  }

  try {
    const r = await fetch(`${KV_REST_API_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });
    const data = await r.json();

    if (!data.result) return res.status(200).json({ data: null });

    let parsed = data.result;
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    if (Array.isArray(parsed)) parsed = parsed[0];
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    if (parsed && typeof parsed === 'object' && 'value' in parsed && Object.keys(parsed).length === 1) {
      parsed = parsed.value;
      while (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { break; }
      }
    }

    // Safety: ensure backlog always exists on tasks
    if (key === 'tasks' && parsed && typeof parsed === 'object') {
      if (!parsed.backlog) parsed.backlog = [];
    }

    return res.status(200).json({ data: parsed });
  } catch (err) {
    console.error(`❌ Get error for key "${key}":`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
