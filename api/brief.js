const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function dbGet(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=eq.${key}&select=value`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const rows = await r.json();
    if (!rows || rows.length === 0) return null;
    return rows[0].value;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    // Pull live data from Supabase
    const [tasks, risks, budget, chapters] = await Promise.all([
      dbGet('tasks'),
      dbGet('risks'),
      dbGet('budget'),
      dbGet('chapters'),
    ]);

    const days = Math.ceil((new Date('2026-06-30') - new Date()) / 864e5);

    const criticalTasks = tasks
      ? (tasks.critical || []).filter(t => !t.done).slice(0,3).map(t => `${t.text.slice(0,60)} (${t.assign})`).join('; ')
      : 'N/A';

    const highTasks = tasks
      ? (tasks.high || []).filter(t => !t.done).slice(0,3).map(t => `${t.text.slice(0,60)} (${t.assign})`).join('; ')
      : 'N/A';

    const backlogTasks = tasks
      ? (tasks.backlog || []).filter(t => !t.done).slice(0,3).map(t => `${t.text.slice(0,40)} (${t.assign})`).join('; ')
      : 'none';

    const openRisks = risks
      ? risks.filter(r => r.status === 'open').slice(0,4).map(r => `[${r.sev.toUpperCase()}] ${r.title.slice(0,50)}`).join('; ')
      : 'N/A';

    const totalSpent = budget
      ? budget.filter(l => !l.vat).reduce((s, l) => s + l.spent, 0)
      : 461000;

    const doneCamps = chapters
      ? chapters.filter(c => c.status === 'done').length
      : 1;

    const AI_PROMPT = `DEVCON×Sui 2026 ops brief. ${days} days to Jun 30. ${doneCamps}/5 camps done. Spent ₱${totalSpent.toLocaleString()}/₱1M.
CRITICAL: ${criticalTasks || 'none'}
HIGH: ${highTasks || 'none'}
RISKS: ${openRisks || 'none'}
CAMPS: Bukidnon May6, Iloilo May16, Tacloban TBC, Pampanga Jun24.
Write 150-word DSU brief for Jedd+Dom: CRITICAL TODAY → TOP 3 → DATES. Direct, no padding.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: AI_PROMPT }]
      })
    });

    const d = await r.json();
    console.log('Anthropic response status:', r.status);
    console.log('Anthropic response:', JSON.stringify(d).slice(0, 500));
    if (!d.content || !d.content.length) {
      console.error('Empty content from Anthropic:', JSON.stringify(d));
      return res.status(200).json({ ok: false, error: d.error?.message || 'Empty response from API' });
    }
    const text = d.content.find(b => b.type === 'text')?.text || 'No response.';
    return res.status(200).json({ ok: true, text });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
