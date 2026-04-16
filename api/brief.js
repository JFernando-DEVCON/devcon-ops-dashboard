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

    const AI_PROMPT = `You are the DEVCON × Sui MOU Compliance Agent for 2026.

LIVE DATA as of today:
- Days to Q2 deadline (Jun 30): ${days}
- Code camps done: ${doneCamps}/5
- Grant: ₱1,120,000 FULLY PAID
- Budget spent: ₱${totalSpent.toLocaleString()} of ₱1,000,000 subtotal
- Remaining: ₱${(1000000 - totalSpent).toLocaleString()}

CRITICAL TASKS: ${criticalTasks || 'none'}
HIGH TASKS: ${highTasks || 'none'}
BACKLOG (overdue): ${backlogTasks || 'none'}
OPEN RISKS: ${openRisks || 'none'}

UPCOMING CAMPS:
- Bukidnon × BSU: May 6
- Iloilo × CPU: May 16
- Tacloban × LNU: TBC (May or Jun)
- Pampanga × CCA: Jun 24

Write a concise DSU-format daily brief (200 words max) for Jedd and Dom.
Structure: FOR APPROVAL (if any) → CRITICAL TODAY → TOP 3 PRIORITIES → DATES TO REMEMBER
Use ₱ amounts. Be direct and tactical. No padding.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
