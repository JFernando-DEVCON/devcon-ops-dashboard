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
    const [rawTasks, rawRisks, rawChapters] = await Promise.all([
      kvGet('tasks',    KV_URL, KV_TOKEN),
      kvGet('risks',    KV_URL, KV_TOKEN),
      kvGet('chapters', KV_URL, KV_TOKEN),
    ]);

    console.log('Raw tasks type:', typeof rawTasks);
    console.log('Raw tasks:', JSON.stringify(rawTasks)?.slice(0, 200));

    const tasks    = typeof rawTasks    === 'string' ? JSON.parse(rawTasks)    : rawTasks;
    const risks    = typeof rawRisks    === 'string' ? JSON.parse(rawRisks)    : rawRisks;
    const chapters = typeof rawChapters === 'string' ? JSON.parse(rawChapters) : rawChapters;

    if (!tasks || !risks || !chapters) {
      return res.status(500).json({
        ok: false,
        error: 'No dashboard data in Upstash. Open dashboard and make a change to sync.'
      });
    }

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
    const allOpenRisks  = risks.filter(r => r.status === 'open');
    const criticalRisks = risks.filter(r => r.status === 'open' && r.sev === 'critical');
    const highRisks     = risks.filter(r => r.status === 'open' && r.sev === 'high');
    const doneCamps     = chapters.filter(c => c.status === 'done').length;
    const upcomingCamps = chapters.filter(c => c.status !== 'done');

    const dateStr = now.toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric',
      timeZone: 'Asia/Manila'
    });

    // Finance keywords for filtering
    const financeKeywords = ['bir', 'liquidat', 'reimburs', 'invoice', 'budget', 'vat', 'payment', 'fund', '₱', 'peso', 'petty', 'cash', 'grant', 'sui'];

    const isFinanceTask = t => financeKeywords.some(k => t.text.toLowerCase().includes(k));
    const isOpsTask     = t => !isFinanceTask(t);

    const financeCritical = criticalOpen.filter(isFinanceTask);
    const financeHigh     = highOpen.filter(isFinanceTask);
    const opsCritical     = criticalOpen.filter(isOpsTask);
    const opsHigh         = highOpen.filter(isOpsTask);
    const opsTotal        = opsCritical.length + opsHigh.length + mediumOpen.length;
    const financeTotal    = financeCritical.length + financeHigh.length;

    // ─────────────────────────────────────────
    // MESSAGE 1 — PROGRAM OPS DSU
    // KPI + Camps + Non-finance tasks
    // ─────────────────────────────────────────
    let msgMain = `📝 <b>DEVCON OPS — DAILY DSU</b>\n${dateStr}\n\n`;

    msgMain += `📊 <b>KPI SNAPSHOT</b>\n`;
    msgMain += `Code Camps: <b>${doneCamps}/5</b> completed\n`;
    msgMain += `Days to Q2 deadline: <b>${days} days</b>\n`;
    msgMain += `Open Risks: <b>${allOpenRisks.length}</b>\n\n`;

    if (upcomingCamps.length) {
      msgMain += `📅 <b>UPCOMING CAMPS</b>\n`;
      upcomingCamps.forEach(c => {
        const icon = c.status === 'done'    ? '✅' :
                     c.status === 'atrisk'  ? '⚠️' :
                     c.status === 'ontrack' ? '🟢' : '📌';
        msgMain += `${icon} <b>${c.name}</b> — ${c.date}\n`;
        msgMain += `   📍 ${c.venue} · 👤 ${c.lead}\n`;
      });
      msgMain += '\n';
    }

    if (criticalRisks.length) {
      msgMain += `🚨 <b>CRITICAL — NEEDS APPROVAL</b>\n`;
      criticalRisks.forEach(r => msgMain += `🔴 <b>${r.title}</b>\n   → ${r.action}\n`);
      msgMain += '\n';
    }

    if (highRisks.length) {
      msgMain += `⚠️ <b>HIGH RISKS</b>\n`;
      highRisks.slice(0, 3).forEach(r => msgMain += `🟠 ${r.title}\n   → ${r.action}\n`);
      msgMain += '\n';
    }

    if (opsTotal > 0) {
      msgMain += `✅ <b>OPEN TASKS — PROGRAM OPS (${opsTotal} active)</b>\n`;
      if (opsCritical.length) {
        msgMain += `<b>🔴 Critical:</b>\n`;
        opsCritical.forEach(t => msgMain += `• ${t.text} <i>(${t.assign})</i>\n`);
      }
      if (opsHigh.length) {
        msgMain += `<b>🟠 High Priority:</b>\n`;
        opsHigh.forEach(t => msgMain += `• ${t.text} <i>(${t.assign})</i>\n`);
      }
      if (mediumOpen.length) {
        msgMain += `<b>🟡 This Week:</b>\n`;
        mediumOpen.forEach(t => msgMain += `• ${t.text} <i>(${t.assign})</i>\n`);
      }
    }

    msgMain += `\n<i>DEVCON × Sui MOU · Build Beyond</i>`;

    // ─────────────────────────────────────────
    // MESSAGE 2 — FOR RESPECTIVE TEAMS
    // Tasks grouped by assignee — easy to forward
    // ─────────────────────────────────────────
    const byAssignee = {};
    [...opsCritical, ...opsHigh, ...mediumOpen].forEach(t => {
      const name = t.assign || 'Unassigned';
      if (!byAssignee[name]) byAssignee[name] = [];
      byAssignee[name].push({ ...t, _prio: opsCritical.includes(t) ? 'critical' : opsHigh.includes(t) ? 'high' : 'medium' });
    });

    let msgTeams = `📌 <b>FOR RESPECTIVE TEAMS — ACTION NEEDED</b>\n${dateStr}\n\n`;

    if (Object.keys(byAssignee).length > 0) {
      Object.entries(byAssignee).forEach(([name, taskList]) => {
        msgTeams += `👤 <b>${name}</b>\n`;
        taskList.forEach(t => {
          const icon = t._prio === 'critical' ? '🔴' : t._prio === 'high' ? '🟠' : '🟡';
          msgTeams += `  ${icon} ${t.text}\n`;
        });
        msgTeams += '\n';
      });
    } else {
      msgTeams += `✅ No open ops tasks — great work team!\n\n`;
    }

    msgTeams += `<i>Please update status in the ops dashboard or reply here ✅</i>`;

    // ─────────────────────────────────────────
    // MESSAGE 3 — FINANCE OPS (INTERNAL)
    // Sui Grant + BIR + Reimbursements only
    // ─────────────────────────────────────────
    let msgFinance = `🔐 <b>DEVCON FINANCE OPS — INTERNAL</b>\n${dateStr}\n\n`;

    msgFinance += `💰 <b>SUI GRANT STATUS</b>\n`;
    msgFinance += `Grant: ✅ PAID ₱1,120,000\n`;
    msgFinance += `Total Spent: ~₱460,937\n`;
    msgFinance += `Remaining: ~₱539,063\n\n`;

    msgFinance += `🏦 <b>PETTY CASH / REIMBURSEMENTS</b>\n`;
    msgFinance += `• Dom umbrella — <b>₱8,239.92 PENDING</b> (Shopee, personal card)\n`;
    msgFinance += `• Bukidnon ₱10k seed fund — ✅ RESOLVED\n`;
    msgFinance += `• Bukidnon ₱5k additional — ✅ RESOLVED\n\n`;

    if (financeTotal > 0) {
      msgFinance += `📋 <b>FINANCE ACTION ITEMS (${financeTotal} open)</b>\n`;
      if (financeCritical.length) {
        msgFinance += `<b>🔴 Critical:</b>\n`;
        financeCritical.forEach(t => msgFinance += `• ${t.text} <i>(${t.assign})</i>\n`);
        msgFinance += '\n';
      }
      if (financeHigh.length) {
        msgFinance += `<b>🟠 High Priority:</b>\n`;
        financeHigh.forEach(t => msgFinance += `• ${t.text} <i>(${t.assign})</i>\n`);
        msgFinance += '\n';
      }
    } else {
      msgFinance += `📋 <b>FINANCE ACTION ITEMS</b>\n✅ No open finance tasks\n\n`;
    }

    const financeRisks = allOpenRisks.filter(r =>
      financeKeywords.some(k =>
        r.title.toLowerCase().includes(k) ||
        r.action.toLowerCase().includes(k)
      )
    );

    if (financeRisks.length) {
      msgFinance += `⚠️ <b>FINANCE RISKS</b>\n`;
      financeRisks.forEach(r => {
        msgFinance += `• <b>${r.title}</b>\n`;
        msgFinance += `  → ${r.action}\n`;
        msgFinance += `  Owner: ${r.owner}\n\n`;
      });
    }

    msgFinance += `<i>Internal · DEVCON HQ Finance · Confidential</i>`;

    // ─────────────────────────────────────────
    // SEND — sequential with delay
    // ─────────────────────────────────────────
    await tgSend(BOT_TOKEN, CHAT_ID, msgMain);
    await delay(1500);
    await tgSend(BOT_TOKEN, CHAT_ID, msgTeams);
    await delay(1500);
    await tgSend(BOT_TOKEN, CHAT_ID, msgFinance);

    return res.status(200).json({ ok: true, sent: true });

  } catch (err) {
    console.error('Cron error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function tgSend(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  return r.json();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function kvGet(key, url, token) {
  try {
    const r = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    if (!data.result) return null;

    let parsed = data.result;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    if (Array.isArray(parsed)) parsed = parsed[0];
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    return parsed;
  } catch (err) {
    console.error(`kvGet error for key "${key}":`, err.message);
    return null;
  }
}
