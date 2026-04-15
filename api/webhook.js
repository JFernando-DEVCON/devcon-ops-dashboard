import Anthropic from '@anthropic-ai/sdk';

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const KV_URL     = process.env.KV_REST_API_URL;
const KV_TOKEN   = process.env.KV_REST_API_TOKEN;

// ── TEAM CONFIG — mirror of index.html TEAM const ──
const TEAM = {
  hq: ['Dom', 'Michael Lance', 'Jedd', 'Marica', 'RJ'],
  chapters: {
    'Manila':    ['Precious'],
    'Tacloban':  ['Rolf'],
    'Iloilo':    ['Ted'],
    'Bukidnon':  ['Zhi'],
    'Laguna':    ['Danmel'],
    'Pampanga':  ['Rejy Joash'],
    'Legazpi':   ['JP Remar Serrano'],
    'Cebu':      ['Sab', 'Sabrinah'],
    'Davao':     ['Christian Jake Geonzon'],
    'Iligan':    ['Reyche'],
  },
  interns: {
    'Cohort 3': ['Lady', 'Kien', 'Kenshin', 'Allyza'],
    'Cohort 4': ['Clayton', 'Dale', 'Zendy'],
  }
};

// Flat list of all names
const ALL_NAMES = [
  ...TEAM.hq,
  ...Object.values(TEAM.chapters).flat(),
  ...Object.values(TEAM.interns).flat()
];

// Team list string for prompts and help
function teamListStr() {
  return [
    `HQ: ${TEAM.hq.join(', ')}`,
    `Chapters: ${Object.entries(TEAM.chapters).map(([ch, names]) => `${names[0]} (${ch})`).join(', ')}`,
    `Interns C3: ${TEAM.interns['Cohort 3'].join(', ')}`,
    `Interns C4: ${TEAM.interns['Cohort 4'].join(', ')}`,
  ].join('\n');
}

// ── KV HELPERS ──
async function kvSet(key, value, url, token) {
  const r = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
  const result = await r.json();
  if (!r.ok) {
    console.error(`❌ KV write failed for "${key}":`, JSON.stringify(result));
    throw new Error(`KV write failed for "${key}": ${JSON.stringify(result)}`);
  }
  console.log(`✅ KV write OK: ${key}`);
  return result;
}

// ── BOT LOGGER ──
const MAX_LOGS = 100;

async function logToKV(level, command, user, message) {
  try {
    const logs = await kvGetParsed('bot_logs', KV_URL, KV_TOKEN) || [];
    logs.unshift({
      ts:      new Date().toISOString(),
      level:   level   || 'info',
      command: command || '—',
      user:    user    || '—',
      message: message || '—',
    });
    if (logs.length > MAX_LOGS) logs.splice(MAX_LOGS);
    await kvSet('bot_logs', logs, KV_URL, KV_TOKEN);
  } catch (e) {
    console.warn('⚠ Log write failed:', e.message);
  }
}

async function kvGetParsed(key, url, token) {
  try {
    const r = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` }
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

// ── DATE HELPERS ──
function isDue(due) {
  if (!due) return false;
  try {
    const parts = due.split(' ');
    if (parts.length < 2) return false;
    const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const month = months[parts[0]];
    const day = parseInt(parts[1]);
    if (isNaN(month) || isNaN(day)) return false;
    const dueDate = new Date(new Date().getFullYear(), month, day);
    return dueDate < new Date();
  } catch { return false; }
}

function isOverdue(task) {
  return !task.done && isDue(task.due);
}

// ── NAME MATCHER — fuzzy match assignee against a list of names ──
function nameMatch(assign, nameList) {
  if (!assign) return false;
  const a = assign.toLowerCase();
  return nameList.some(n => {
    const nl = n.toLowerCase();
    return a.includes(nl.split(' ')[0]) || nl.includes(a.split(' ')[0]);
  });
}

// ── SEQUENTIAL TASK ID ──
function nextTaskId(tasks) {
  const all = [
    ...(tasks.critical  || []),
    ...(tasks.high      || []),
    ...(tasks.high_done || []),
    ...(tasks.medium    || []),
    ...(tasks.backlog   || []),
  ];
  const nums = all
    .map(t => parseInt((t.id || '').replace(/\D/g, '')))
    .filter(n => !isNaN(n) && n > 0 && n < 1000000);
  return 't' + (nums.length > 0 ? Math.max(...nums) + 1 : 1);
}

// ── 7-DAY DUE DATE ──
function sevenDayDue() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body    = req.body;
  const message = body.message || body.channel_post;
  if (!message || !message.text) return res.status(200).end();

  const chatId  = message.chat.id;
  const text    = message.text.trim();
  const botName = '@devcon';

  // Only respond to commands, @devcon mentions, bot: prefix, or replies to bot
  const isCommand  = text.startsWith('/');
  const isMention  = text.toLowerCase().includes(botName);
  const isPrefix   = text.toLowerCase().startsWith('bot:');
  const isReply    = message.reply_to_message?.from?.is_bot === true;
  if (!isCommand && !isMention && !isPrefix && !isReply) return res.status(200).end();

  const parts   = text.split(/\s+/);
  const command = parts[0].toLowerCase().replace(botName, '').replace('@devconopsbot', '');
  const args    = parts.slice(1);

  let reply = '';

  // ── SEND REPLY HELPER ──
  async function sendReply(text) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text || reply,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_to_message_id: message.message_id
      })
    });
  }

  // Extract sender name for logs
  const senderName = message.from
    ? (message.from.username || message.from.first_name || String(message.from.id))
    : 'unknown';

  try {

    // ════════════════════════════════════════
    // /chatid
    // ════════════════════════════════════════
    if (command === '/chatid') {
      const chat = message.chat;
      reply  = `📋 <b>Chat ID Info</b>\n\n`;
      reply += `<b>Chat ID:</b> <code>${chat.id}</code>\n`;
      reply += `<b>Type:</b> ${chat.type}\n`;
      reply += `<b>Title:</b> ${chat.title || chat.first_name || '—'}\n\n`;
      reply += `<i>Copy the Chat ID above and paste it into the dashboard Telegram Notify page.</i>`;
    }
    
    // ════════════════════════════════════════
    // /ping
    // ════════════════════════════════════════
    else if (command === '/ping') {
      const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
      reply = `🟢 <b>DEVCON Ops Bot online</b>\n${now} PHT`;
    }

    // ════════════════════════════════════════
    // /tasks
    // ════════════════════════════════════════
    else if (command === '/tasks') {
      const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
      if (!tasks) { reply = '⚠️ No data found.'; }
      else {
        const critical = (tasks.critical || []).filter(t => !t.done);
        const high     = (tasks.high || []).filter(t => !t.done);
        const medium   = (tasks.medium || []).filter(t => !t.done);
        const backlog  = (tasks.backlog || []).filter(t => !t.done);
        const total    = critical.length + high.length + medium.length + backlog.length;

        reply = `📋 <b>OPEN TASKS (${total})</b>\n\n`;
        if (critical.length) {
          reply += `🔴 <b>CRITICAL (${critical.length})</b>\n`;
          critical.forEach(t => reply += `  <code>${t.id}</code> ${t.text} · <i>${t.assign}</i>\n`);
          reply += '\n';
        }
        if (high.length) {
          reply += `🟠 <b>HIGH (${high.length})</b>\n`;
          high.forEach(t => reply += `  <code>${t.id}</code> ${t.text} · <i>${t.assign}</i>\n`);
          reply += '\n';
        }
        if (medium.length) {
          reply += `🟡 <b>THIS WEEK (${medium.length})</b>\n`;
          medium.forEach(t => reply += `  <code>${t.id}</code> ${t.text} · <i>${t.assign}</i>\n`);
          reply += '\n';
        }
        if (backlog.length) {
          reply += `📦 <b>BACKLOG — OVERDUE (${backlog.length})</b>\n`;
          backlog.forEach(t => reply += `  <code>${t.id}</code> ${t.text} · <i>${t.assign}</i> · due ${t.due}\n`);
        }
        if (total === 0) reply = '✅ No open tasks. All clear!';
      }
    }

    // ════════════════════════════════════════
    // /done [id]
    // ════════════════════════════════════════
    else if (command === '/done') {
      const id = args[0];
      if (!id) { reply = '⚠️ Usage: <code>/done t1</code>'; }
      else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No data found.'; }
        else {
          let found = false;
          for (const prio of ['critical', 'high', 'medium', 'backlog']) {
            const t = (tasks[prio] || []).find(t => t.id === id);
            if (t) { t.done = true; found = true; break; }
          }
          if (found) {
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply = `✅ Task <code>${id}</code> marked as done. Dashboard will update within 30s.`;
          } else {
            reply = `⚠️ Task <code>${id}</code> not found.`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /undone [id]
    // ════════════════════════════════════════
    else if (command === '/undone') {
      const id = args[0];
      if (!id) { reply = '⚠️ Usage: <code>/undone t1</code>'; }
      else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No data found.'; }
        else {
          let found = false;
          for (const prio of ['critical', 'high', 'medium', 'backlog']) {
            const t = (tasks[prio] || []).find(t => t.id === id);
            if (t) { t.done = false; found = true; break; }
          }
          if (found) {
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply = `↩️ Task <code>${id}</code> marked as not done.`;
          } else {
            reply = `⚠️ Task <code>${id}</code> not found.`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /addtask [natural language]
    // ════════════════════════════════════════
else if (command === '/addtask') {
  const query = args.join(' ').trim();
  if (!query) {
    reply  = '⚠️ Usage: <code>/addtask [describe the task naturally]</code>\n\n';
    reply += '⚠️ <b>Always mention who the task is for.</b>\n';
    reply += 'Task will not be created without a clear assignee.\n\n';
    reply += '<b>Examples:</b>\n';
    reply += '• <code>/addtask Rolf to confirm Tacloban new date, high</code>\n';
    reply += '• <code>/addtask Jedd to submit BIR invoices, critical, by Apr 21</code>\n';
    reply += '• <code>/addtask paalamin si Zhi sa Bukidnon ocular, high</code>\n';
    reply += '• <code>/addtask Ted to confirm CPU Iloilo venue by May 1</code>\n';
    reply += '• <code>/addtask Dom to draft Q2 narrative, medium</code>\n\n';
    reply += '<b>Assignee detection:</b>\n';
    reply += '• Name: "Rolf to follow up" → Rolf\n';
    reply += '• Filipino: "si Zhi", "kay Dom" → Zhi, Dom\n';
    reply += '• Chapter: "Tacloban task" → Rolf, "Iloilo" → Ted\n\n';
    reply += `<b>Team:</b>\n${teamListStr()}`;
  } else {
    const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
    if (!tasks) { reply = '⚠️ No dashboard data found.'; }
    else {
      if (!tasks.backlog) tasks.backlog = [];
      const newId = nextTaskId(tasks);
      const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `You extract task details from natural language for a Filipino ops team dashboard.
Return ONLY valid JSON, no markdown, no explanation, no backticks.

TEAM MEMBERS BY GROUP:
HQ / National Office: Jedd, Dom, Michael Lance, Marica, RJ
Chapter Leaders: Precious (Manila), Rolf (Tacloban), Ted (Iloilo), Zhi (Bukidnon), Danmel (Laguna), Rejy Joash (Pampanga), JP Remar Serrano (Legazpi), Sabrinah (Cebu), Christian Jake Geonzon (Davao), Reyche (Iligan)
Interns Cohort 3: Lady, Kien, Kenshin, Allyza
Interns Cohort 4: Clayton, Dale, Zendy

Current date: ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}

Return exactly:
{"text":"clean task description","priority":"critical|high|medium","assign":"TeamMemberName","due":""}

Rules:
- text: clean English description, translate Filipino if needed
- priority: critical=urgent/asap/agad, high=important/priority, medium=this week/normal/default
- assign: CRITICAL — look hard for any name, pronoun, chapter, or role hint:
    * explicit name: "for Rolf", "assign to Ted", "si Zhi", "kay Dom" → use that exact name
    * chapter hint: "Tacloban" → Rolf, "Iloilo" → Ted, "Bukidnon" → Zhi, "Pampanga" → Rejy Joash, "Manila" → Precious, "Laguna" → Danmel, "Legazpi" → JP Remar Serrano, "Cebu" → Sabrinah, "Davao" → Christian Jake Geonzon, "Iligan" → Reyche
    * first person: "I need to", "ko", "akin", "ako" → Jedd (sender context)
    * NEVER default to Jedd unless there is a clear first-person indicator
    * If no person can be identified at all → return "UNASSIGNED"
- due: extract date if mentioned ("by Apr 21", "before May 6", "this Friday") as "Mon DD" like "Apr 21". Empty string "" if no date mentioned.`,
        messages: [{ role: 'user', content: query }]
      });

      try {
        const parsed = JSON.parse(response.content[0].text.trim());
        const priority = ['critical','high','medium'].includes(parsed.priority) ? parsed.priority : 'medium';

        // Block if no assignee detected
        if (!parsed.assign || parsed.assign === 'UNASSIGNED') {
          reply  = `⚠️ <b>No assignee detected.</b>\n\n`;
          reply += `📋 Task text: "${parsed.text}"\n\n`;
          reply += `Please mention who this task is for and try again.\n\n`;
          reply += '<b>Examples:</b>\n';
          reply += `• <code>/addtask ${parsed.text}, assign to Rolf, high</code>\n`;
          reply += `• <code>/addtask ${parsed.text} for Ted by May 6</code>\n\n`;
          reply += `<b>Team:</b>\n${teamListStr()}`;
        } else {
          const newTask = {
            id:      newId,
            text:    parsed.text,
            assign:  parsed.assign,
            due:     parsed.due && parsed.due.trim() ? parsed.due.trim() : sevenDayDue(),
            done:    false,
            created: new Date().toISOString()
          };
          tasks[priority].push(newTask);
          await kvSet('tasks', tasks, KV_URL, KV_TOKEN);

          const icon = priority === 'critical' ? '🔴' : priority === 'high' ? '🟠' : '🟡';
          reply  = `${icon} <b>Task added!</b>\n\n`;
          reply += `📋 ${newTask.text}\n`;
          reply += `👤 Assigned: <b>${newTask.assign}</b>\n`;
          reply += `📊 Priority: <b>${priority.toUpperCase()}</b>\n`;
          reply += `📅 Due: <b>${newTask.due}</b>\n`;
          reply += `🆔 ID: <code>${newId}</code>\n\n`;
          reply += `<i>Wrong assignee?</i> <code>/reassign ${newId} [name]</code>\n`;
          reply += `<i>Wrong deadline?</i> <code>/setdue ${newId} [date]</code>`;
        }
      } catch {
        reply  = '⚠️ Could not parse that task. Try:\n';
        reply += '<code>/addtask Rolf to confirm Tacloban date, high priority</code>';
      }
    }
  }
}
    // ════════════════════════════════════════
    // /deltask [id]
    // ════════════════════════════════════════
    else if (command === '/deltask') {
      const id = args[0];
      if (!id) { reply = '⚠️ Usage: <code>/deltask t5</code>'; }
      else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No data found.'; }
        else {
          let found = false;
          for (const prio of ['critical', 'high', 'medium', 'backlog']) {
            const idx = (tasks[prio] || []).findIndex(t => t.id === id);
            if (idx !== -1) {
              tasks[prio].splice(idx, 1);
              found = true;
              break;
            }
          }
          if (found) {
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply = `🗑️ Task <code>${id}</code> deleted.`;
          } else {
            reply = `⚠️ Task <code>${id}</code> not found.`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /mytasks [name | group | chapter]
    // ════════════════════════════════════════
    else if (command === '/mytasks') {
      const query = args.join(' ').trim().toLowerCase();
      if (!query) {
        reply  = '⚠️ Usage: <code>/mytasks [name or group]</code>\n\n';
        reply += '<b>By person:</b> <code>/mytasks Jedd</code>\n';
        reply += '<b>By group:</b> <code>/mytasks hq</code> · <code>/mytasks chapters</code> · <code>/mytasks interns</code>\n';
        reply += '<b>By chapter:</b> <code>/mytasks Tacloban</code> · <code>/mytasks Cebu</code>\n';
        reply += '<b>By cohort:</b> <code>/mytasks cohort 3</code> · <code>/mytasks cohort 4</code>';
      } else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No data found.'; }
        else {
          if (!tasks.backlog) tasks.backlog = [];
          let filterNames = [];
          let filterLabel = '';

          if (query === 'hq' || query === 'national' || query === 'national office') {
            filterNames = TEAM.hq;
            filterLabel = '🏢 HQ / National Office';
          } else if (query === 'chapters' || query === 'chapter leaders') {
            filterNames = Object.values(TEAM.chapters).flat();
            filterLabel = '🗺️ All Chapter Leaders';
          } else if (query === 'interns' || query === 'intern') {
            filterNames = Object.values(TEAM.interns).flat();
            filterLabel = '🎓 All Interns';
          } else if (query === 'cohort 3' || query === 'c3') {
            filterNames = TEAM.interns['Cohort 3'];
            filterLabel = '🎓 Cohort 3';
          } else if (query === 'cohort 4' || query === 'c4') {
            filterNames = TEAM.interns['Cohort 4'];
            filterLabel = '🎓 Cohort 4';
          } else {
            // Check chapter name
            const chapterMatch = Object.entries(TEAM.chapters).find(
              ([ch]) => ch.toLowerCase() === query
            );
            if (chapterMatch) {
              filterNames = chapterMatch[1];
              filterLabel = `🗺️ ${chapterMatch[0]} Chapter`;
            } else {
              // Individual name fuzzy match
              const allNames = [
                ...TEAM.hq,
                ...Object.values(TEAM.chapters).flat(),
                ...Object.values(TEAM.interns).flat()
              ];
              const match = allNames.find(n =>
                n.toLowerCase().includes(query) ||
                query.includes(n.toLowerCase().split(' ')[0])
              );
              if (match) {
                filterNames = [match];
                filterLabel = `👤 ${match}`;
              } else {
                reply = `⚠️ Couldn't find "<b>${args.join(' ')}</b>" in the team.\n\nTry: <code>/mytasks hq</code>, <code>/mytasks Tacloban</code>, or <code>/mytasks Jedd</code>`;
                await sendReply(reply);
                return res.status(200).end();
              }
            }
          }

          const critical = (tasks.critical || []).filter(t => !t.done && nameMatch(t.assign, filterNames));
          const high     = (tasks.high || []).filter(t => !t.done && nameMatch(t.assign, filterNames));
          const medium   = (tasks.medium || []).filter(t => !t.done && nameMatch(t.assign, filterNames));
          const backlog  = (tasks.backlog || []).filter(t => !t.done && nameMatch(t.assign, filterNames));
          const total    = critical.length + high.length + medium.length + backlog.length;

          if (total === 0) {
            reply = `✅ <b>${filterLabel}</b>\n\nNo open tasks. All clear!`;
          } else {
            reply = `📋 <b>${filterLabel}</b> — ${total} open task${total > 1 ? 's' : ''}\n\n`;
            if (critical.length) {
              reply += `🔴 <b>CRITICAL (${critical.length})</b>\n`;
              critical.forEach(t => {
                reply += `  <code>${t.id}</code> ${t.text}\n`;
                reply += `  👤 ${t.assign}${t.due ? ` · due ${t.due}` : ''}\n`;
              });
              reply += '\n';
            }
            if (high.length) {
              reply += `🟠 <b>HIGH PRIORITY (${high.length})</b>\n`;
              high.forEach(t => {
                reply += `  <code>${t.id}</code> ${t.text}\n`;
                reply += `  👤 ${t.assign}${t.due ? ` · due ${t.due}` : ''}\n`;
              });
              reply += '\n';
            }
            if (medium.length) {
              reply += `🟡 <b>THIS WEEK (${medium.length})</b>\n`;
              medium.forEach(t => {
                reply += `  <code>${t.id}</code> ${t.text}\n`;
                reply += `  👤 ${t.assign}${t.due ? ` · due ${t.due}` : ''}\n`;
              });
              reply += '\n';
            }
            if (backlog.length) {
              reply += `📦 <b>BACKLOG — OVERDUE (${backlog.length})</b>\n`;
              backlog.forEach(t => {
                reply += `  <code>${t.id}</code> ${t.text}\n`;
                reply += `  👤 ${t.assign} · overdue since ${t.due}${t.backlogFrom ? ` · was ${t.backlogFrom}` : ''}\n`;
              });
              reply += '\n';
            }
            reply += `<i>Use /done [id] to mark complete</i>`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /risks
    // ════════════════════════════════════════
    else if (command === '/risks') {
      const risks = await kvGetParsed('risks', KV_URL, KV_TOKEN);
      if (!risks) { reply = '⚠️ No data found.'; }
      else {
        const open = risks.filter(r => r.status !== 'resolved');
        if (!open.length) { reply = '✅ No open risks.'; }
        else {
          reply = `⚠️ <b>OPEN RISKS (${open.length})</b>\n\n`;
          const order = {critical:0,high:1,medium:2,low:3};
          open.sort((a,b) => (order[a.sev]||9) - (order[b.sev]||9));
          open.forEach(r => {
            const icon = r.sev === 'critical' ? '🔴' : r.sev === 'high' ? '🟠' : r.sev === 'medium' ? '🟡' : '🟢';
            reply += `${icon} <b>${r.title}</b>\n`;
            reply += `   → ${r.action}\n`;
            reply += `   👤 ${r.owner} · <code>${r.id}</code>\n\n`;
          });
        }
      }
    }

    // ════════════════════════════════════════
    // /resolve [id]
    // ════════════════════════════════════════
    else if (command === '/resolve') {
      const id = args[0];
      if (!id) { reply = '⚠️ Usage: <code>/resolve r4</code>'; }
      else {
        const risks = await kvGetParsed('risks', KV_URL, KV_TOKEN);
        if (!risks) { reply = '⚠️ No data found.'; }
        else {
          const r = risks.find(x => x.id === id);
          if (r) {
            r.status = r.status === 'resolved' ? 'open' : 'resolved';
            await kvSet('risks', risks, KV_URL, KV_TOKEN);
            reply = r.status === 'resolved'
              ? `✅ Risk <code>${id}</code> marked as resolved.`
              : `↩️ Risk <code>${id}</code> reopened.`;
          } else {
            reply = `⚠️ Risk <code>${id}</code> not found.`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /budget
    // ════════════════════════════════════════
    else if (command === '/budget') {
      const budget = await kvGetParsed('budget', KV_URL, KV_TOKEN);
      if (!budget) { reply = '⚠️ No data found.'; }
      else {
        const lines = budget.filter(l => !l.vat);
        let total = 0;
        reply = `💰 <b>BUDGET STATUS</b>\n\n`;
        lines.forEach(l => {
          total += l.spent;
          const pct = Math.round(l.spent / l.alloc * 100);
          const bar = pct >= 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢';
          reply += `${bar} <b>Line ${l.num}</b> — ${l.name}\n`;
          reply += `   ₱${l.spent.toLocaleString()} / ₱${l.alloc.toLocaleString()} (${pct}%) · <code>${l.id}</code>\n\n`;
        });
        reply += `<b>Subtotal spent:</b> ₱${total.toLocaleString()} / ₱1,000,000\n`;
        reply += `<b>Remaining:</b> ₱${(1000000 - total).toLocaleString()}`;
      }
    }

    // ════════════════════════════════════════
    // /updatespent [line-id] [amount]
    // ════════════════════════════════════════
    else if (command === '/updatespent') {
      const lineId = args[0];
      const amount = parseInt(args[1]);
      if (!lineId || isNaN(amount)) {
        reply = '⚠️ Usage: <code>/updatespent b1 50000</code>';
      } else {
        const budget = await kvGetParsed('budget', KV_URL, KV_TOKEN);
        if (!budget) { reply = '⚠️ No data found.'; }
        else {
          const line = budget.find(l => l.id === lineId);
          if (line) {
            const old = line.spent;
            line.spent = amount;
            await kvSet('budget', budget, KV_URL, KV_TOKEN);
            reply  = `✅ <b>Budget updated!</b>\n\n`;
            reply += `Line ${line.num}: ${line.name}\n`;
            reply += `₱${old.toLocaleString()} → ₱${amount.toLocaleString()}\n`;
            reply += `Remaining: ₱${(line.alloc - amount).toLocaleString()}`;
          } else {
            reply = `⚠️ Line <code>${lineId}</code> not found. Use IDs like b1, b2 ... b10, bvat`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /update [natural language budget]
    // ════════════════════════════════════════
    else if (command === '/update') {
      const query = args.join(' ').trim();
      if (!query) {
        reply = '⚠️ Usage: <code>/update [natural language]</code>\n';
        reply += 'Example: <code>/update line 5 PR spent is now 62500</code>';
      } else {
        const budget = await kvGetParsed('budget', KV_URL, KV_TOKEN);
        if (!budget) { reply = '⚠️ No data found.'; }
        else {
          const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
          const budgetSummary = budget.map(l => `${l.id}: Line ${l.num} — ${l.name} (allocated ₱${l.alloc}, spent ₱${l.spent})`).join('\n');
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 150,
            system: `You identify a budget line and new spent amount from natural language.
Return ONLY valid JSON, no markdown, no explanation.
Budget lines:\n${budgetSummary}
Return: {"lineId":"b1","amount":50000}`,
            messages: [{ role: 'user', content: query }]
          });
          try {
            const parsed = JSON.parse(response.content[0].text.trim());
            const line = budget.find(l => l.id === parsed.lineId);
            if (line && !isNaN(parsed.amount)) {
              const old = line.spent;
              line.spent = parsed.amount;
              await kvSet('budget', budget, KV_URL, KV_TOKEN);
              reply  = `✅ <b>Budget updated!</b>\n\n`;
              reply += `Line ${line.num}: ${line.name}\n`;
              reply += `₱${old.toLocaleString()} → ₱${parsed.amount.toLocaleString()}\n`;
              reply += `Remaining: ₱${(line.alloc - parsed.amount).toLocaleString()}`;
            } else {
              reply = '⚠️ Could not identify the budget line. Try: <code>/updatespent b1 50000</code>';
            }
          } catch {
            reply = '⚠️ Could not parse. Try: <code>/updatespent b1 50000</code>';
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /status
    // ════════════════════════════════════════
    else if (command === '/status') {
      const [tasks, risks, chapters] = await Promise.all([
        kvGetParsed('tasks', KV_URL, KV_TOKEN),
        kvGetParsed('risks', KV_URL, KV_TOKEN),
        kvGetParsed('chapters', KV_URL, KV_TOKEN),
      ]);
      const days = Math.ceil((new Date('2026-06-30') - new Date()) / 864e5);
      const openCrit    = tasks ? (tasks.critical || []).filter(t => !t.done).length : '?';
      const openHigh    = tasks ? (tasks.high || []).filter(t => !t.done).length : '?';
      const openMed     = tasks ? (tasks.medium || []).filter(t => !t.done).length : '?';
      const openBacklog = tasks ? (tasks.backlog || []).filter(t => !t.done).length : '?';
      const openRisks   = risks ? risks.filter(r => r.status === 'open').length : '?';
      const doneCamps   = chapters ? chapters.filter(c => c.status === 'done').length : '?';
      const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

      reply  = `📊 <b>DEVCON OPS STATUS</b>\n${now}\n\n`;
      reply += `🏕 Code Camps: <b>${doneCamps}/5</b> done\n`;
      reply += `📅 Days to Q2: <b>${days}</b>\n`;
      reply += `💰 Grant: ✅ ₱1,120,000 PAID\n\n`;
      reply += `✅ Tasks open:\n`;
      reply += `  🔴 Critical: ${openCrit}\n`;
      reply += `  🟠 High: ${openHigh}\n`;
      reply += `  🟡 This Week: ${openMed}\n`;
      reply += `  📦 Backlog: ${openBacklog}\n\n`;
      reply += `⚠️ Open Risks: <b>${openRisks}</b>`;
    }

    // ════════════════════════════════════════
    // /ask [question]
    // ════════════════════════════════════════
    else if (command === '/ask' || isReply || isMention || isPrefix) {
      const question = command === '/ask'
        ? args.join(' ')
        : text.replace(/bot:/i, '').replace(new RegExp(botName, 'gi'), '').trim();

      if (!question) {
        reply = '⚠️ Usage: <code>/ask [your question]</code>';
      } else {
        const [tasks, risks, chapters, budget] = await Promise.all([
          kvGetParsed('tasks', KV_URL, KV_TOKEN),
          kvGetParsed('risks', KV_URL, KV_TOKEN),
          kvGetParsed('chapters', KV_URL, KV_TOKEN),
          kvGetParsed('budget', KV_URL, KV_TOKEN),
        ]);
        const days = Math.ceil((new Date('2026-06-30') - new Date()) / 864e5);
        const ctx = `
DEVCON Philippines × Sui Foundation MOU 2026 Ops Context:
- Days to Q2 deadline (Jun 30): ${days}
- Code camps: ${chapters ? chapters.filter(c => c.status === 'done').length : '?'}/5 done
- Grant: ₱1,120,000 PAID
- Open risks: ${risks ? risks.filter(r => r.status === 'open').length : '?'}
- Critical tasks: ${tasks ? (tasks.critical || []).filter(t => !t.done).map(t => t.text).join('; ') : '?'}
- High tasks: ${tasks ? (tasks.high || []).filter(t => !t.done).map(t => t.text).join('; ') : '?'}
- Backlog tasks: ${tasks ? (tasks.backlog || []).filter(t => !t.done).map(t => t.text).join('; ') : 'none'}
- Budget spent: ${budget ? '₱' + budget.filter(l => !l.vat).reduce((s, l) => s + l.spent, 0).toLocaleString() : '?'} / ₱1,000,000
`;
        const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: `You are the DEVCON PH Ops Assistant. Answer concisely in plain text (no markdown). Context:\n${ctx}`,
          messages: [{ role: 'user', content: question }]
        });
        reply = response.content[0].text;
      }
    }

    // ════════════════════════════════════════
    // /help
    // ════════════════════════════════════════
  
    // ════════════════════════════════════════
// /edittask [id] [new text]
// ════════════════════════════════════════
else if (command === '/edittask') {
  const id      = args[0];
  const newText = args.slice(1).join(' ').trim();

  if (!id || !newText) {
    reply  = '⚠️ Usage: <code>/edittask [id] [new task text]</code>\n\n';
    reply += 'Example:\n';
    reply += '• <code>/edittask t5 Collect BIR invoices from all Manila vendors by Apr 21</code>\n\n';
    reply += '<i>To change assignee: /reassign [id] [name]</i>\n';
    reply += '<i>To change deadline: /setdue [id] [date]</i>\n';
    reply += '<i>To change priority: /movetask [id] [priority]</i>';
  } else {
    const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
    if (!tasks) { reply = '⚠️ No dashboard data found.'; }
    else {
      if (!tasks.backlog) tasks.backlog = [];
      let foundTask = null;
      let foundPrio = null;

      for (const prio of ['critical', 'high', 'medium', 'backlog']) {
        const t = (tasks[prio] || []).find(t => t.id === id);
        if (t) { foundTask = t; foundPrio = prio; break; }
      }

      if (!foundTask) {
        reply = `⚠️ Task <code>${id}</code> not found.`;
      } else {
        const oldText    = foundTask.text;
        foundTask.text   = newText;
        foundTask.edited = new Date().toISOString();

        await kvSet('tasks', tasks, KV_URL, KV_TOKEN);

        reply  = `✏️ <b>Task updated!</b>\n\n`;
        reply += `🆔 <code>${id}</code>\n\n`;
        reply += `<s>${oldText}</s>\n`;
        reply += `→ ${newText}\n\n`;
        reply += `👤 ${foundTask.assign || '—'} · 📅 ${foundTask.due || 'no due'} · ${foundPrio.toUpperCase()}\n\n`;
        reply += `<i>Dashboard updates within 30 seconds.</i>`;
      }
    }
  }
}
    
    // ════════════════════════════════════════
    // /setdue [id] [date]
    // ════════════════════════════════════════
    else if (command === '/setdue') {
      const id        = args[0];
      const dateParts = args.slice(1).join(' ').trim();

      if (!id || !dateParts) {
        reply  = '⚠️ Usage: <code>/setdue [task-id] [new due date]</code>\n\n';
        reply += 'Examples:\n';
        reply += '• <code>/setdue t1 Apr 21</code>\n';
        reply += '• <code>/setdue t4 May 15</code>\n';
        reply += '• <code>/setdue t9 Jun 1</code>\n\n';
        reply += '<i>If task is in backlog and new date is not overdue, it auto-restores to original priority.</i>';
      } else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No dashboard data found.'; }
        else {
          if (!tasks.backlog) tasks.backlog = [];
          let foundTask = null;
          let foundPrio = null;
          for (const prio of ['critical', 'high', 'medium', 'backlog']) {
            const t = (tasks[prio] || []).find(t => t.id === id);
            if (t) { foundTask = t; foundPrio = prio; break; }
          }
          if (!foundTask) {
            reply = `⚠️ Task <code>${id}</code> not found.`;
          } else {
            const oldDue  = foundTask.due || 'no due date';
            foundTask.due = dateParts;
            let restored    = false;
            let restorePrio = null;
            if (foundPrio === 'backlog' && !isOverdue(foundTask)) {
              restorePrio = foundTask.backlogFrom || 'medium';
              delete foundTask.backlogFrom;
              delete foundTask.movedToBacklog;
              tasks[restorePrio].push(foundTask);
              tasks.backlog = tasks.backlog.filter(t => t.id !== id);
              restored = true;
            }
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply  = `📅 <b>Due date updated!</b>\n\n`;
            reply += `🆔 <code>${id}</code> ${foundTask.text}\n`;
            reply += `👤 ${foundTask.assign || '—'}\n\n`;
            reply += `Old due: <s>${oldDue}</s>\n`;
            reply += `New due: <b>${dateParts}</b>\n`;
            if (restored) {
              reply += `\n✅ <b>Restored from Backlog → ${restorePrio.toUpperCase()}</b>\n`;
              reply += `<i>No longer overdue — moved back to ${restorePrio} priority.</i>`;
            } else if (foundPrio === 'backlog') {
              reply += `\n📦 <i>Still in Backlog (new date is still overdue).</i>`;
            }
            reply += `\n\n<i>Dashboard updates within 30 seconds.</i>`;
          }
        }
      }
    }



// ════════════════════════════════════════
// /movetask [id] [priority]
// ════════════════════════════════════════
else if (command === '/movetask') {
  const id     = args[0];
  const target = args[1]?.toLowerCase().trim();
  const valid  = ['critical', 'high', 'medium', 'backlog'];

  if (!id || !target || !valid.includes(target)) {
    reply  = '⚠️ Usage: <code>/movetask [id] [priority]</code>\n\n';
    reply += 'Priorities: <code>critical</code> · <code>high</code> · <code>medium</code> · <code>backlog</code>\n\n';
    reply += 'Examples:\n';
    reply += '• <code>/movetask t5 critical</code>\n';
    reply += '• <code>/movetask t12 medium</code>\n';
    reply += '• <code>/movetask t8 backlog</code>';
  } else {
    const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
    if (!tasks) { reply = '⚠️ No dashboard data found.'; }
    else {
      if (!tasks.backlog) tasks.backlog = [];
      let foundTask = null;
      let foundPrio = null;

      for (const prio of ['critical', 'high', 'medium', 'backlog']) {
        const t = (tasks[prio] || []).find(t => t.id === id);
        if (t) { foundTask = t; foundPrio = prio; break; }
      }

      if (!foundTask) {
        reply = `⚠️ Task <code>${id}</code> not found.`;
      } else if (foundPrio === target) {
        reply = `ℹ️ Task <code>${id}</code> is already in ${target.toUpperCase()}.`;
      } else {
        // Remove from current priority
        tasks[foundPrio] = (tasks[foundPrio] || []).filter(t => t.id !== id);

        // Handle backlog metadata
        if (target === 'backlog') {
          foundTask.backlogFrom    = foundPrio;
          foundTask.movedToBacklog = new Date().toISOString();
        } else {
          delete foundTask.backlogFrom;
          delete foundTask.movedToBacklog;
        }

        // Add to target
        tasks[target].push(foundTask);
        await kvSet('tasks', tasks, KV_URL, KV_TOKEN);

        const icons = { critical:'🔴', high:'🟠', medium:'🟡', backlog:'📦' };
        reply  = `${icons[target]} <b>Task moved!</b>\n\n`;
        reply += `🆔 <code>${id}</code> ${foundTask.text}\n\n`;
        reply += `${icons[foundPrio]} ${foundPrio.toUpperCase()} → ${icons[target]} ${target.toUpperCase()}\n`;
        reply += `👤 ${foundTask.assign || '—'} · 📅 ${foundTask.due || 'no due'}\n\n`;
        reply += `<i>Dashboard updates within 30 seconds.</i>`;
      }
    }
  }
}
  
    // ════════════════════════════════════════
    // /reassign [id] [name]
    // ════════════════════════════════════════
    else if (command === '/reassign') {
      const id   = args[0];
      const name = args.slice(1).join(' ').trim();
      if (!id || !name) {
        reply  = '⚠️ Usage: <code>/reassign [task-id] [name]</code>\n\n';
        reply += 'Examples:\n';
        reply += '• <code>/reassign t5 Rolf</code>\n';
        reply += '• <code>/reassign t12 Ted</code>\n';
        reply += '• <code>/reassign t3 Rejy Joash</code>\n\n';
        reply += `<b>Team:</b>\n${teamListStr()}`;
      } else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No dashboard data found.'; }
        else {
          if (!tasks.backlog) tasks.backlog = [];
          let foundTask = null;
          let foundPrio = null;
          for (const prio of ['critical', 'high', 'medium', 'backlog']) {
            const t = (tasks[prio] || []).find(t => t.id === id);
            if (t) { foundTask = t; foundPrio = prio; break; }
          }
          if (!foundTask) {
            reply = `⚠️ Task <code>${id}</code> not found.`;
          } else {
            const nameLower = name.toLowerCase();
            const matched   = ALL_NAMES.find(n =>
              n.toLowerCase().includes(nameLower) ||
              nameLower.includes(n.toLowerCase().split(' ')[0])
            );
            const finalName  = matched || name;
            const oldAssign  = foundTask.assign || '—';
            foundTask.assign = finalName;
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply  = `👤 <b>Task reassigned!</b>\n\n`;
            reply += `🆔 <code>${id}</code> ${foundTask.text}\n\n`;
            reply += `From: <s>${oldAssign}</s>\n`;
            reply += `To: <b>${finalName}</b>\n`;
            reply += `Priority: ${foundPrio.toUpperCase()}\n`;
            reply += foundTask.due ? `Due: ${foundTask.due}\n` : '';
            if (!matched) {
              reply += `\n⚠️ <i>"${name}" not found in team list — saved as entered.</i>`;
            }
            reply += `\n\n<i>Dashboard updates within 30 seconds.</i>`;
          }
        }
      }
    }

    // ════════════════════════════════════════
    // /help
    // ════════════════════════════════════════
    else if (command === '/help') {
      reply  = `📖 <b>DEVCON OPS BOT — COMMANDS</b>\n\n`;
      reply += `<b>── TASKS ──</b>\n`;
      reply += `/tasks — list all open tasks by priority\n`;
      reply += `/done [id] — mark done · <code>/done t1</code>\n`;
      reply += `/undone [id] — reopen · <code>/undone t1</code>\n`;
      reply += `/addtask [natural language] — add task (always include who)\n`;
      reply += `  <code>/addtask Rolf to confirm Tacloban date, high</code>\n`;
      reply += `/deltask [id] — delete · <code>/deltask t5</code>\n`;
      reply += `/edittask [id] [new text] — edit task text · <code>/edittask t5 New description</code>\n`;
      reply += `/movetask [id] [priority] — change priority · <code>/movetask t5 critical</code>\n`;
      reply += `/setdue [id] [date] — update deadline · <code>/setdue t1 Apr 21</code>\n`;
      reply += `  <i>Auto-restores from backlog if new date not overdue</i>\n`;
      reply += `/reassign [id] [name] — change assignee · <code>/reassign t5 Rolf</code>\n\n`;
      reply += `<b>── FILTER ──</b>\n`;
      reply += `/mytasks [name or group]\n`;
      reply += `  person: <code>/mytasks Jedd</code> · <code>/mytasks Rolf</code>\n`;
      reply += `  group: <code>/mytasks hq</code> · <code>/mytasks chapters</code> · <code>/mytasks interns</code>\n`;
      reply += `  chapter: <code>/mytasks Tacloban</code> · <code>/mytasks Cebu</code>\n`;
      reply += `  cohort: <code>/mytasks cohort 3</code> · <code>/mytasks cohort 4</code>\n\n`;
      reply += `<b>── RISKS ──</b>\n`;
      reply += `/risks — list open risks\n`;
      reply += `/resolve [id] — toggle resolved · <code>/resolve r4</code>\n\n`;
      reply += `<b>── BUDGET ──</b>\n`;
      reply += `/budget — view all line items\n`;
      reply += `/updatespent [id] [amount] · <code>/updatespent b1 50000</code>\n`;
      reply += `/update [natural language] · <code>/update line 5 is now 62500</code>\n\n`;
      reply += `<b>── INFO ──</b>\n`;
      reply += `/status — quick ops summary\n`;
      reply += `/chatid — get this chat's ID\n`;
      reply += `/ping — bot online check\n`;
      reply += `/ask [question] — AI assistant\n`;
      reply += `reply to bot message — AI follow-up\n\n`;
      reply += `<b>── TEAM ──</b>\n`;
      reply += teamListStr();
    }

    // ════════════════════════════════════════
    // Unknown
    // ════════════════════════════════════════
    else {
      reply = `❓ Unknown command. Type /help to see all commands.`;
    }

  } catch (err) {
    console.error('Webhook error:', err);
    reply = `⚠️ Error: ${err.message}`;
    // Fire log without awaiting — don't block reply
    logToKV('error', command, senderName, err.message).catch(console.warn);
  }

  // Send reply immediately — log after
  await sendReply(reply);

  // Log without blocking
  if (isCommand) {
    const preview = reply.replace(/<[^>]+>/g, '').slice(0, 120);
    logToKV(
      reply.startsWith('⚠️ Error:') ? 'error' : reply.includes('❓') ? 'warn' : 'ok',
      command,
      senderName,
      preview
    ).catch(console.warn);
  }

  return res.status(200).end();
}
