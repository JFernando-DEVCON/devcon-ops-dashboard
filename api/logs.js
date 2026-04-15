const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const MAX_LOGS = 100;

async function kvGet(key) {
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

async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
  return r.json();
}

export default async function handler(req, res) {
  // GET — fetch logs
  if (req.method === 'GET') {
    const logs = await kvGet('bot_logs') || [];
    return res.status(200).json({ ok: true, logs });
  }

  // POST — append a log entry
  if (req.method === 'POST') {
    const { level, command, user, message, chatId } = req.body;
    const logs = await kvGet('bot_logs') || [];
    logs.unshift({
      ts:      new Date().toISOString(),
      level:   level || 'info',   // info | ok | error | warn
      command: command || '—',
      user:    user    || '—',
      chatId:  chatId  || '—',
      message: message || '—',
    });
    // Keep only last MAX_LOGS entries
    if (logs.length > MAX_LOGS) logs.splice(MAX_LOGS);
    await kvSet('bot_logs', logs);
    return res.status(200).json({ ok: true });
  }

  // DELETE — clear logs
  if (req.method === 'DELETE') {
    await kvSet('bot_logs', []);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
