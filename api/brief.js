export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const AI_PROMPT = `You are the DEVCON × Sui MOU Compliance Agent for 2026.

FACTS: Grant ₱1,120,000 FULLY PAID. 5 code camps needed by Jun 30, 2026.
COMPLETED: Manila × Letran — Mar 28 ✓
UPCOMING: Tacloban (TBC May/Jun), Iloilo × CPU (May 16), Bukidnon × BSU (May 6), Pampanga × CCA (Jun 24)
RISKS: Tacloban date TBC. DeepSurge not created. Manila BIR liquidation pending. DEVCON Kids ₱50k BIR invoice needed. Dom umbrella ₱8,239.92 pending reimbursement.
FINANCE: Total spent ~₱461k of ₱1,000,000 subtotal. Remaining ~₱539k.

Write a concise DSU-format daily brief (200 words max) for Jedd and Dom. Structure:
FOR APPROVAL (if any) → CRITICAL TODAY → TOP 3 PRIORITIES → DATES TO REMEMBER
Use ₱ amounts. Be direct and tactical. No padding.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: AI_PROMPT }]
      })
    });
    const d = await r.json();
    const text = d.content?.find(b => b.type === 'text')?.text || 'No response.';
    return res.status(200).json({ ok: true, text });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
