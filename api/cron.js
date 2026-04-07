const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET;

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

const FINANCE_KEYWORDS = [
  'bir','liquidat','reimburs','invoice','budget','vat','payment',
  'fund','₱','peso','petty','cash','grant','sui'
];

function isFinance(text) {
  return FINANCE_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const [tasks, risks, chapters, budget] = await Promise.all([
    kvGet('tasks'), kvGet('risks'), kvGet('chapters'), kvGet('budget')
  ]);

  if (!tasks || !risks || !chapters || !budget) {
    return res.status(500).json({ error: 'Failed to load data' });
  }

  if (!tasks.backlog) tasks.backlog = [];

  const now      = new Date();
  const days     = Math.ceil((new Date('2026-06-30') - now) / 864e5);
  const dateStr  = now.toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Manila' });
  const doneCamps = chapters.filter(c => c.status === 'done').length;

  const critTasks  = (tasks.critical || []).filter(t => !t.done);
  const highTasks  = (tasks.high || []).filter(t => !t.done);
  const medTasks   = (tasks.medium || []).filter(t => !t.done);
  const backlog    = (tasks.backlog || []).filter(t => !t.done);
  const openRisks  = risks.filter(r => r.status === 'open');
  const critRisks  = openRisks.filter(r => r.sev === 'critical');
  const highRisks  = openRisks.filter(r => r.sev === 'high');

  const totalSpent = budget.filter(l => !l.vat).reduce((s, l) => s + l.spent, 0);
  const remaining  = 1000000 - totalSpent;

  // Non-finance tasks only
  const critNonFin = critTasks.filter(t => !isFinance(t.text));
  const highNonFin = highTasks.filter(t => !isFinance(t.text));
  const medNonFin  = medTasks.filter(t => !isFinance(t.text));
  const backNonFin = backlog.filter(t => !isFinance(t.text));

  // Finance tasks only
  const critFin = critTasks.filter(t => isFinance(t.text));
  const highFin = highTasks.filter(t => isFinance(t.text));
  const backFin = backlog.filter(t => isFinance(t.text));

  // ── MESSAGE 1: Program Ops DSU ──
  let msg1 = `📝 <b>DEVCON OPS — DAILY DSU</b>\n${dateStr}\n\n`;
  msg1 += `📊 <b>KPI</b>\n`;
  msg1 += `🏕 Camps: <b>${doneCamps}/5</b> · 📅 <b>${days} days</b> to Q2 · 💰 Grant ✅ PAID\n\n`;

  const upcomingCamps = chapters.filter(c => c.status !== 'done');
  if (upcomingCamps.length) {
    msg1 += `📅 <b>UPCOMING CAMPS</b>\n`;
    upcomingCamps.forEach(c => msg1 += `• ${c.name} — ${c.date} (${c.status.toUpperCase()})\n`);
    msg1 += '\n';
  }

  if (critRisks.length) {
    msg1 += `🚨 <b>CRITICAL RISKS</b>\n`;
    critRisks.forEach(r => msg1 += `🔴 ${r.title}\n   → ${r.action}\n`);
    msg1 += '\n';
  }
  if (highRisks.length) {
    msg1 += `⚠️ <b>HIGH RISKS</b>\n`;
    highRisks.slice(0,3).forEach(r => msg1 += `🟠 ${r.title}\n   → ${r.action}\n`);
    msg1 += '\n';
  }

  const totalNonFin = critNonFin.length + highNonFin.length + medNonFin.length + backNonFin.length;
  msg1 += `✅ <b>OPEN TASKS (${totalNonFin})</b>\n`;
  if (critNonFin.length) {
    msg1 += `🔴 Critical:\n`;
    critNonFin.forEach(t => msg1 += `• ${t.text} <i>(${t.assign})</i>\n`);
  }
  if (highNonFin.length) {
    msg1 += `🟠 High:\n`;
    highNonFin.slice(0,4).forEach(t => msg1 += `• ${t.text} <i>(${t.assign})</i>\n`);
  }
  if (medNonFin.length) {
    msg1 += `🟡 This Week:\n`;
    medNonFin.slice(0,3).forEach(t => msg1 += `• ${t.text} <i>(${t.assign})</i>\n`);
  }
  if (backNonFin.length) {
    msg1 += `📦 Backlog (overdue):\n`;
    backNonFin.slice(0,3).forEach(t => msg1 += `• ${t.text} <i>(${t.assign})</i>\n`);
  }
  msg1 += `\n<i>DEVCON × Sui MOU · Build Beyond</i>`;

  // ── MESSAGE 2: Per Team Tasks ──
  const TEAM_HQ       = ['Dom', 'Michael Lance', 'Jedd', 'Marica', 'RJ'];
  const TEAM_CHAPTERS = ['Precious','Rolf','Ted','Zhi','Danmel','Rejy Joash','JP Remar Serrano','Sab','Sabrinah','Christian Jake Geonzon','Reyche'];
  const TEAM_INTERNS  = ['Lady','Kien','Kenshin','Allyza','Clayton','Dale','Zendy'];
  const allPeople     = [...TEAM_HQ, ...TEAM_CHAPTERS, ...TEAM_INTERNS];
  const allOpen       = [...critTasks, ...highTasks, ...medTasks, ...backlog];

  let msg2 = `👥 <b>DEVCON OPS — TASKS BY PERSON</b>\n${dateStr}\n\n`;

  allPeople.forEach(person => {
    const myTasks = allOpen.filter(t =>
      (t.assign || '').toLowerCase().includes(person.toLowerCase().split(' ')[0])
    );
    if (myTasks.length) {
      msg2 += `👤 <b>${person}</b> (${myTasks.length})\n`;
      myTasks.forEach(t => {
        const prio = t.backlogFrom ? '📦' : tasks.critical.find(x => x.id === t.id) ? '🔴' : tasks.high.find(x => x.id === t.id) ? '🟠' : '🟡';
        msg2 += `  ${prio} ${t.text}\n`;
      });
      msg2 += '\n';
    }
  });

  // ── MESSAGE 3: Finance Internal ──
  const totalFinTasks = critFin.length + highFin.length + backFin.length;
  const finRisks = openRisks.filter(r =>
    FINANCE_KEYWORDS.some(kw => r.title.toLowerCase().includes(kw) || r.action.toLowerCase().includes(kw))
  );

  let msg3 = `💰 <b>DEVCON OPS — FINANCE INTERNAL</b>\n${dateStr}\n\n`;
  msg3 += `<b>Grant Status:</b> ✅ ₱1,120,000 PAID\n`;
  msg3 += `<b>Subtotal Spent:</b> ₱${totalSpent.toLocaleString()} / ₱1,000,000\n`;
  msg3 += `<b>Remaining:</b> ₱${remaining.toLocaleString()}\n\n`;

  if (totalFinTasks > 0) {
    msg3 += `📋 <b>FINANCE TASKS (${totalFinTasks})</b>\n`;
    if (critFin.length) {
      msg3 += `🔴 Critical:\n`;
      critFin.forEach(t => msg3 += `• <code>${t.id}</code> ${t.text} <i>(${t.assign})</i>\n`);
    }
    if (highFin.length) {
      msg3 += `🟠 High:\n`;
      highFin.forEach(t => msg3 += `• <code>${t.id}</code> ${t.text} <i>(${t.assign})</i>\n`);
    }
    if (backFin.length) {
      msg3 += `📦 Backlog (overdue):\n`;
      backFin.forEach(t => msg3 += `• <code>${t.id}</code> ${t.text} <i>(${t.assign})</i>\n`);
    }
    msg3 += '\n';
  }

  if (finRisks.length) {
    msg3 += `⚠️ <b>FINANCE RISKS</b>\n`;
    finRisks.forEach(r => {
      const icon = r.sev === 'critical' ? '🔴' : r.sev === 'high' ? '🟠' : '🟡';
      msg3 += `${icon} ${r.title}\n   → ${r.action}\n`;
    });
  }

  msg3 += `\n<i>Finance Internal · DEVCON HQ</i>`;

  // Send all 3 messages
  await sendTg(msg1);
  await delay(1500);
  await sendTg(msg2);
  await delay(1500);
  await sendTg(msg3);

  return res.status(200).json({ ok: true, sent: 3 });
}
