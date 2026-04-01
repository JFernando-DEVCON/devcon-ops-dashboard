export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ ok: false, error: 'Bot token not configured' });

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const d = await r.json();
    return res.status(200).json(d);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
