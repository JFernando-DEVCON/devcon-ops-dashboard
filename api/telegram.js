export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const { chatId, text } = req.body;

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, description: 'Bot token not configured' });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const d = await r.json();
    return res.status(200).json(d);
  } catch(err) {
    return res.status(500).json({ ok: false, description: err.message });
  }
}
