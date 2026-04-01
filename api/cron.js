export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
  const KV_URL    = process.env.KV_REST_API_URL;
  const KV_TOKEN  = process.env.KV_REST_API_TOKEN;

  try {
    // Fetch live data from Upstash
    const [rawTasks, rawRisks, rawChapters] = await Promise.all([
      kvGet('tasks',    KV_URL, KV_TOKEN),
      kvGet('risks',    KV_URL, KV_TOKEN),
      kvGet('chapters', KV_URL, KV_TOKEN),
    ]);

    // Log what we got for debugging
    console.log('Raw tasks type:', typeof rawTasks);
    console.log('Raw tasks:', JSON.stringify(rawTasks)?.slice(0, 200));

    // Parse if still a string, otherwise use directly
    const tasks    = typeof rawTasks    === 'string' ? JSON.parse(rawTasks)    : rawTasks;
    const risks    = typeof rawRisks    === 'string' ? JSON.parse(rawRisks)    : rawRisks;
    const chapters = typeof rawChapters === 'string' ? JSON.parse(rawChapters) : rawChapters;

    // Null check
    if (!tasks || !risks || !chapters) {
      return res.status(500).json({
        ok: false,
        error: 'No dashboard data in Upstash. Open dashboard and make a change to sync.'
      });
    }

    // Validate structure
    if (!tasks.critical || !tasks.high || !tasks.medium) {
      return res.status(500).json({
        ok: false,
        error: 'Invalid tasks structure',
        received: JSON.stringify(tasks).slice(0, 300)
      });
    }

    const now           = new Date();
    const days          = Math.ceil((new Date('2026-06-30') - now) / 864e5);
    const criticalOpen  = tasks.critical.filter(t => !t.done);
    const highOpen      = tasks.high.filter(t => !t.done);
    const mediumOpen    = tasks.medium.filter(t => !t.done);
    const totalActive   = criticalOpen.length + highOpen.length + mediumOpen.length;
    const criticalRisks = risks.filter(r => r.status === 'open' && r.sev === 'critical');
    const highRisks     = risks.filter(r => r.status === 'open' && r.sev === 'high');
    const allOpenRisks  = risks.filter(r => r.status === 'open');
    const doneCamps     = chapters.filter(c => c.status === 'done').length;
    const upcomingCamps = chapters.filter(c => c.status !== 'done');

    // Build message
    let msg = `📝 <b>DEVCON OPS — DAILY DSU SUMMARY</b>\n`;
    msg += `${now.toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric',
      timeZone: 'Asia/Manila'
    })}\n\n`;

    if (criticalRisks.length) {
      msg += `🚨 <b>FOR APPROVAL / CRITICAL</b>\n`;
      criticalRisks.forEach(r => msg += `🔴 <b>${r.title}</b>\n   → ${r.action}\n`);
      msg += '\n';
    }

    if (highRisks.length) {
      msg += `⚠️ <b>HIGH RISKS</b>\n`;
      highRisks.slice(0, 3).forEach(r => msg += `🟠 ${r.title}\n   → ${r.action}\n`);
      msg += '\n';
    }

    msg += `✅ <b>OPEN TASKS (${totalActive} active)</b>\n`;
    if (criticalOpen.length) {
      msg += `<b>🔴 Critical:</b>\n`;
      criticalOpen.forEach(t => msg += `• ${t.text} <i>(${t.assign})</i>\n`);
    }
    if (highOpen.length) {
      msg += `<b>🟠 High Priority:</b>\n`;
      highOpen.slice(0, 4).forEach(t => msg += `• ${t.text} <i>(${t.assign})</i>\n`);
    }
    if (mediumOpen.length) {
      msg += `<b>🟡 This Week:</b>\n`;
      mediumOpen.slice(0, 3).forEach(t => msg += `• ${t.text} <i>(${t.assign})</i>\n`);
    }
    msg += '\n';

    msg += `📊 <b>KPI SNAPSHOT</b>\n`;
    msg += `Code Camps: <b>${doneCamps}/5</b> completed\n`;
    msg += `Days to Q2: <b>${days} days</b>\n`;
    msg += `Grant: ✅ PAID ₱1,120,000\n`;
    msg += `Open Risks: <b>${allOpenRisks.length}</b>\n\n`;

    if (upcomingCamps.length) {
      msg += `📅 <b>UPCOMING CAMPS</b>\n`;
      upcomingCamps.forEach(c => msg += `• ${c.name} — ${c.date} (${c.status.toUpperCase()})\n`);
      msg += '\n';
    }

    msg += `<i>DEVCON × Sui MOU · Build Beyond</i>`;

    // Send to Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: msg,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      }
    );

    const data = await response.json();
    if (!data.ok) throw new Error(data.description);

    return res.status(200).json({ ok: true, sent: true });

  } catch (err) {
    console.error('Cron error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function kvGet(key, url, token) {
  try {
    const r = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    if (!data.result) return null;

    // Parse the result
    let parsed = typeof data.result === 'string'
      ? JSON.parse(data.result)
      : data.result;

    // If double encoded, parse again
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);

    // If wrapped in array (Upstash quirk), unwrap it
    if (Array.isArray(parsed)) parsed = parsed[0];

    return parsed;
  } catch (err) {
    console.error(`kvGet error for key "${key}":`, err.message);
    return null;
  }
}
