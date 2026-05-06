const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID     = process.env.TELEGRAM_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function kvGet(key) {
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

async function sendTg(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const [tasks, risks, budget, scoutData] = await Promise.all([
    kvGet('tasks'), kvGet('risks'), kvGet('budget'), kvGet('scout_grants')
  ]);

  if (!tasks || !risks || !budget) {
    return res.status(500).json({ error: 'Failed to load data' });
  }

  if (!tasks.backlog) tasks.backlog = [];

  const now     = new Date();
  const days    = Math.ceil((new Date('2026-06-30') - now) / 864e5);
  const dateStr = now.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Manila'
  });

  const critTasks = (tasks.critical || []).filter(t => !t.done);
  const highTasks = (tasks.high     || []).filter(t => !t.done);
  const medTasks  = (tasks.medium   || []).filter(t => !t.done);
  const backlog   = (tasks.backlog  || []).filter(t => !t.done);
  const openRisks = risks.filter(r => r.status === 'open');
  const critRisks = openRisks.filter(r => r.sev === 'critical');
  const highRisks = openRisks.filter(r => r.sev === 'high');
  const medRisks  = openRisks.filter(r => r.sev === 'medium');

  const totalSpent = budget.filter(l => !l.vat).reduce((s, l) => s + l.spent, 0);
  const remaining  = 1000000 - totalSpent;
  const pctUsed    = Math.round(totalSpent / 1000000 * 100);

  // ── MESSAGE 1: HQ Programs and Ops Tasks Summary ──
  const totalOpen = critTasks.length + highTasks.length + medTasks.length + backlog.length;

  let msg1 = `📋 <b>DEVCON OPS DSU — ${dateStr}</b>\n\n`;
  msg1 += `<b>6.1 HQ PROGRAMS &amp; OPS TASKS</b>\n`;
  msg1 += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg1 += `📊 ${days} days to Q2 deadline (Jun 30)\n\n`;

  if (critTasks.length) {
    msg1 += `🔴 <b>CRITICAL (${critTasks.length})</b>\n`;
    critTasks.forEach(t => msg1 += `• ${t.text} <i>(${t.assign}${t.due ? ' · ' + t.due : ''})</i>\n`);
    msg1 += '\n';
  }

  if (highTasks.length) {
    msg1 += `🟠 <b>HIGH PRIORITY (${highTasks.length})</b>\n`;
    highTasks.forEach(t => msg1 += `• ${t.text} <i>(${t.assign}${t.due ? ' · ' + t.due : ''})</i>\n`);
    msg1 += '\n';
  }

  if (medTasks.length) {
    msg1 += `🟡 <b>THIS WEEK (${medTasks.length})</b>\n`;
    medTasks.forEach(t => msg1 += `• ${t.text} <i>(${t.assign}${t.due ? ' · ' + t.due : ''})</i>\n`);
    msg1 += '\n';
  }

  if (backlog.length) {
    msg1 += `📦 <b>BACKLOGS — OVERDUE (${backlog.length})</b>\n`;
    backlog.forEach(t => msg1 += `• ${t.text} <i>(${t.assign})</i>\n`);
    msg1 += '\n';
  }

  if (!totalOpen) msg1 += `✅ No open tasks. All clear.\n\n`;

  msg1 += `⚠️ <b>RISKS TO MANAGE</b>\n`;
  if (critRisks.length) {
    critRisks.forEach(r => msg1 += `🔴 ${r.title}\n   → ${r.action}\n`);
  }
  if (highRisks.length) {
    highRisks.forEach(r => msg1 += `🟠 ${r.title}\n   → ${r.action}\n`);
  }
  if (medRisks.length) {
    medRisks.slice(0,3).forEach(r => msg1 += `🟡 ${r.title}\n   → ${r.action}\n`);
  }
  if (!openRisks.length) msg1 += `✅ No open risks.\n`;

  // ── MESSAGE 2: Budget, CA Tracking & Liquidation ──
  const caLines   = budget.filter(l => !l.vat && l.spent > 0);
  const overLines = budget.filter(l => !l.vat && l.spent > l.alloc);

  let msg2 = `💰 <b>6.2 BUDGET, CA &amp; LIQUIDATION</b>\n`;
  msg2 += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg2 += `<b>Budget Summary</b>\n`;
  msg2 += `Grant: ✅ ₱1,120,000 PAID\n`;
  msg2 += `Spent: ₱${totalSpent.toLocaleString()} / ₱1,000,000 (${pctUsed}% used)\n`;
  msg2 += `Remaining: <b>₱${remaining.toLocaleString()}</b>\n`;
  if (overLines.length) {
    msg2 += `⚠️ Lines over budget: ${overLines.map(l => `Line ${l.num}`).join(', ')}\n`;
  }
  msg2 += '\n';

  msg2 += `<b>Cash Advance Summary</b>\n`;
  caLines.forEach(l => {
    const pct = Math.round(l.spent / l.alloc * 100);
    const bar = pct >= 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢';
    msg2 += `${bar} Line ${l.num} — ${l.name}\n`;
    msg2 += `   ₱${l.spent.toLocaleString()} / ₱${l.alloc.toLocaleString()} (${pct}%)\n`;
  });
  msg2 += '\n';

  msg2 += `<b>Liquidation To-Do</b>\n`;
  const finKeywords = ['bir','liquidat','reimburs','invoice','vat','receipt'];
  const finTasks = [...critTasks, ...highTasks, ...backlog].filter(t =>
    finKeywords.some(kw => t.text.toLowerCase().includes(kw))
  );
  if (finTasks.length) {
    finTasks.forEach(t => msg2 += `• ${t.text} <i>(${t.assign})</i>\n`);
  } else {
    msg2 += `✅ No pending liquidation tasks.\n`;
  }

  // ── MESSAGE 3: Fundraising Scout Bot Summary ──
  const grants      = scoutData?.grants || [];
  const highGrants  = grants.filter(g => g.score >= 80);
  const googleGrant = grants.find(g =>
    g.name.toLowerCase().includes('google') ||
    g.funder.toLowerCase().includes('google')
  );
  const genAt = scoutData?.generated_at
    ? new Date(scoutData.generated_at).toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric', timeZone: 'Asia/Manila'
      })
    : 'Not yet run';

  let msg3 = `🔍 <b>6.3 FUNDRAISING SCOUT</b>\n`;
  msg3 += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg3 += `Last Scout: ${genAt} · ${grants.length} grants found · ${highGrants.length} high match (80+)\n\n`;

  if (highGrants.length) {
    msg3 += `<b>Top Matches</b>\n`;
    highGrants.slice(0,4).forEach(g => {
      const bar = g.score >= 90 ? '🟢' : '🟡';
      msg3 += `${bar} <b>${g.name}</b> — ${g.funder}\n`;
      msg3 += `   ${g.amount} · Due: ${g.deadline}\n`;
    });
    msg3 += '\n';
  }

  msg3 += `<b>Priority To-Do</b>\n`;
  if (googleGrant) {
    msg3 += `🎯 <b>Google AI Grant — HIGH POTENTIAL</b>\n`;
    msg3 += `   ${googleGrant.name} · ${googleGrant.funder}\n`;
    msg3 += `   ${googleGrant.amount} · Due: ${googleGrant.deadline}\n`;
    msg3 += `   → Prepare application. Strongest fit for DEVCON AI education programs.\n\n`;
  } else {
    msg3 += `🎯 Google AI Grant — Search and identify open cycle. High potential for DEVCON AI education programs.\n\n`;
  }

  msg3 += `📌 <b>Q4 2026 Pipeline</b>\n`;
  msg3 += `• Stellar Development Foundation — Flag as target if Sui MOU does not renew post-Jun 2026.\n`;
  msg3 += `  Similar web3 + education focus. Start relationship building Q3.\n\n`;

  msg3 += `<i>Scout auto-runs every Monday 10am PHT · /scout to run manually</i>`;

  // Send all 3 messages
  await sendTg(msg1);
  await delay(1500);
  await sendTg(msg2);
  await delay(1500);
  await sendTg(msg3);

  return res.status(200).json({ ok: true, sent: 3 });
}
