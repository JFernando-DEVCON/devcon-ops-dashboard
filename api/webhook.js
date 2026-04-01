import Anthropic from "@anthropic-ai/sdk";

const DASHBOARD_CONTEXT = `
You are DEVCON Ops Bot, a helpful AI assistant for the DEVCON Philippines × Sui Foundation MOU 2026 operations team.
You have access to the following live dashboard data. Answer questions accurately and concisely.
Always respond in the same language the user used (Filipino or English).
Keep responses short and formatted for Telegram (use HTML tags like <b>, <i>, bullet points).

=== BUDGET DATA ===
Total Grant: ₱1,120,000 (₱1,000,000 subtotal + 12% VAT ₱120,000)
Line 1 - Code Camps Executions: Allocated ₱200,000 / Spent ₱49,940
Line 2 - HQ Program Head & Core Contributors: Allocated ₱130,000 / Spent ₱39,969
Line 3 - Campus DEVCON / SHEisDEVCON Events: Allocated ₱80,000 / Spent ₱43,102
Line 4 - Code Camp Mentor Training: Allocated ₱100,000 / Spent ₱10,000
Line 5 - PR & Media Launch: Allocated ₱70,000 / Spent ₱62,500
Line 6 - Partnership Merchandise: Allocated ₱100,000 / Spent ₱100,000 (FULLY SPENT)
Line 7 - DEVCON Kids + Microbit + Hour of AI: Allocated ₱50,000 / Spent ₱50,000 (FULLY SPENT)
Line 8 - Asset Acquisition & Marketing: Allocated ₱120,000 / Spent ₱69,500
Line 9 - Travel for Code Camps: Allocated ₱50,000 / Spent ₱25,000
Line 10 - Admin Fee (20%): Allocated ₱100,000 / Spent ₱10,926
Total Spent: ₱460,937 / Remaining: ₱539,063

=== REIMBURSEMENTS ===
- Dom umbrella reimbursement: ₱8,239.92 — PENDING
- Bukidnon ₱10,000 wrong bank number — RESOLVED ✓
- Bukidnon ₱5,000 additional seed fund — RESOLVED ✓
- Bayleaf Hotel: ₱52,500 — PAID ✓
- JCR Printing: ₱71,940 — PAID ✓
- Iloilo seed fund to Ted: ₱10,000 — PAID ✓

=== CODE CAMPS STATUS ===
1. Manila × Letran — DONE ✓ (Mar 28, 2026)
2. Tacloban × LNU — PENDING (rescheduled, May or Jun TBC)
3. Iloilo × CPU — PENDING (May 16, 2026)
4. Bukidnon × BSU — ON TRACK (May 6, 2026)
5. Pampanga × CCA — PENDING (Jun 24, 2026)

=== OPEN RISKS ===
- Tacloban new date not yet locked (HIGH) — Owner: Rolf
- DeepSurge listing not yet created (HIGH) — Owner: Jianyi
- Iloilo chapter lead not confirmed for Apr 18 (MEDIUM) — Owner: Dom
- Dom umbrella reimbursement ₱8,239.92 pending (MEDIUM) — Owner: Jedd
- Lazada VAT invoices account not updated (MEDIUM) — Owner: Jedd
- Manila BIR liquidation not yet submitted (HIGH) — Owner: Jedd
- DEVCON Kids ₱50k BIR invoice needed (HIGH) — Owner: Jedd

=== KEY DATES ===
- Apr 18: Iloilo × WVSU SHEisDEVCON FWTF Summit
- May 6: Bukidnon × BSU Sui Move Code Camp
- May 16: Iloilo × CPU Sui Code Camp
- Jun 24: Pampanga × CCA Sui Move Code Camp
- Jun 30: Q2 Narrative Report deadline → Sui Foundation

=== TEAM ===
- Jedd: HQ lead, finance, liquidation, BIR compliance
- Dom: Program head, approvals, strategy
- Lady: Manila chapter lead
- Rolf: Tacloban chapter lead
- Marica: Iloilo (Apr 18)
- Ted: Iloilo (May 16)
- Zhi: Bukidnon chapter
- Joash: Pampanga chapter
- Jianyi (@zero_x_j): DeepSurge listings
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
  const KV_URL     = process.env.KV_REST_API_URL;
  const KV_TOKEN   = process.env.KV_REST_API_TOKEN;

  try {
    const update  = req.body;
    const message = update.message || update.channel_post;
    if (!message || !message.text) return res.status(200).end();

    const chatId   = message.chat.id;
    const text     = message.text.trim();
    const userName = message.from?.first_name || 'there';
    const isCommand = text.startsWith('/');
    const isMention = text.toLowerCase().includes('@devcon') ||
                      text.toLowerCase().includes('bot,') ||
                      text.toLowerCase().includes('bot:');
    const isReply   = message.reply_to_message?.from?.is_bot;

    if (!isCommand && !isMention && !isReply) return res.status(200).end();

    // Parse command and args
    const parts   = text.split(/\s+/);
    const command = parts[0].toLowerCase().replace('@devcon_ops_bot', '');
    const args    = parts.slice(1);

    // Send typing indicator
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });

    let reply = '';

    // ─────────────────────────────────────────
    // /help — list all commands
    // ─────────────────────────────────────────
    if (command === '/help') {
      reply = `🤖 <b>DEVCON Ops Bot — Commands</b>\n\n`;
      reply += `<b>📋 Task Commands:</b>\n`;
      reply += `/tasks — list all open tasks with IDs\n`;
      reply += `/done [id] — mark task as done\n`;
      reply += `/undone [id] — mark task as not done\n`;
      reply += `/addtask [priority] [text] @[assignee] — add task\n`;
      reply += `  priorities: <code>critical</code> <code>high</code> <code>medium</code>\n`;
      reply += `  example: <code>/addtask high Follow up Rolf @Rolf</code>\n`;
      reply += `/deltask [id] — delete a task\n\n`;
      reply += `<b>⚠️ Risk Commands:</b>\n`;
      reply += `/risks — list all open risks with IDs\n`;
      reply += `/resolve [id] — mark risk as resolved\n\n`;
      reply += `<b>📊 Info Commands:</b>\n`;
      reply += `/status — quick summary of open items\n`;
      reply += `/ask [question] — ask the AI assistant anything\n`;
    }

    // ─────────────────────────────────────────
    // /tasks — list all open tasks with IDs
    // ─────────────────────────────────────────
    else if (command === '/tasks') {
      const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
      if (!tasks) { reply = '⚠️ No dashboard data found. Open the dashboard first.'; }
      else {
        const criticalOpen = tasks.critical.filter(t => !t.done);
        const highOpen     = tasks.high.filter(t => !t.done);
        const mediumOpen   = tasks.medium.filter(t => !t.done);

        reply = `📋 <b>OPEN TASKS</b>\n\n`;
        if (criticalOpen.length) {
          reply += `🔴 <b>Critical:</b>\n`;
          criticalOpen.forEach(t => reply += `  <code>${t.id}</code> ${t.text} <i>(${t.assign})</i>\n`);
          reply += '\n';
        }
        if (highOpen.length) {
          reply += `🟠 <b>High Priority:</b>\n`;
          highOpen.forEach(t => reply += `  <code>${t.id}</code> ${t.text} <i>(${t.assign})</i>\n`);
          reply += '\n';
        }
        if (mediumOpen.length) {
          reply += `🟡 <b>This Week:</b>\n`;
          mediumOpen.forEach(t => reply += `  <code>${t.id}</code> ${t.text} <i>(${t.assign})</i>\n`);
        }
        if (!criticalOpen.length && !highOpen.length && !mediumOpen.length) {
          reply += '✅ All tasks done!';
        }
        reply += `\n\n<i>Use /done [id] to mark complete</i>`;
      }
    }

    // ─────────────────────────────────────────
    // /done [id] — mark task as done
    // ─────────────────────────────────────────
    else if (command === '/done') {
      const taskId = args[0];
      if (!taskId) { reply = '⚠️ Usage: <code>/done [task-id]</code>\nGet IDs with /tasks'; }
      else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No dashboard data found.'; }
        else {
          let found = false;
          let taskText = '';
          ['critical', 'high', 'medium'].forEach(prio => {
            const task = tasks[prio].find(t => t.id === taskId);
            if (task) {
              task.done = true;
              found = true;
              taskText = task.text;
            }
          });
          if (!found) {
            reply = `⚠️ Task <code>${taskId}</code> not found. Use /tasks to see IDs.`;
          } else {
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply = `✅ <b>Marked as done:</b>\n${taskText}\n\n<i>Dashboard will reflect on next load.</i>`;
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // /undone [id] — mark task as not done
    // ─────────────────────────────────────────
    else if (command === '/undone') {
      const taskId = args[0];
      if (!taskId) { reply = '⚠️ Usage: <code>/undone [task-id]</code>'; }
      else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No dashboard data found.'; }
        else {
          let found = false;
          let taskText = '';
          ['critical', 'high', 'medium'].forEach(prio => {
            const task = tasks[prio].find(t => t.id === taskId);
            if (task) { task.done = false; found = true; taskText = task.text; }
          });
          if (!found) {
            reply = `⚠️ Task <code>${taskId}</code> not found.`;
          } else {
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply = `↩️ <b>Marked as not done:</b>\n${taskText}`;
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // /addtask [priority] [text] @[assignee]
    // ─────────────────────────────────────────
else if (command === '/addtask') {
  const priority = args[0]?.toLowerCase();
  if (!['critical', 'high', 'medium'].includes(priority)) {
    reply = '⚠️ Usage: <code>/addtask [critical|high|medium] [task text] @[assignee]</code>\nExample: <code>/addtask high Follow up Rolf on Tacloban @Rolf</code>';
  } else {
    const remaining = args.slice(1).join(' ');
    const assignMatch = remaining.match(/@(\w+)/);
    const assign = assignMatch ? assignMatch[1] : 'Unassigned';
    const taskText = remaining.replace(/@\w+/, '').trim();

    if (!taskText) {
      reply = '⚠️ Please include a task description.';
    } else {
      let tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);

      // Debug log
      console.log('tasks type:', typeof tasks);
      console.log('tasks full value:', JSON.stringify(tasks)?.slice(0, 500));
      console.log('tasks keys:', tasks ? Object.keys(tasks) : 'null');
      console.log('tasks.high type:', typeof tasks?.high);
      console.log('tasks.high value:', JSON.stringify(tasks?.high)?.slice(0, 200));

      if (!tasks) {
        reply = '⚠️ No dashboard data found. Open the dashboard first.';
      } else if (!tasks[priority]) {
        // Structure exists but priority array missing — initialize it
        tasks[priority] = [];
        reply = `⚠️ Priority array was missing, initialized. Try again.`;
      } else {
        const newTask = {
          id: 't' + Date.now(),
          text: taskText,
          assign,
          due: '',
          done: false
        };
        tasks[priority].push(newTask);
        await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
        const prioIcon = priority === 'critical' ? '🔴' : priority === 'high' ? '🟠' : '🟡';
        reply = `${prioIcon} <b>Task added to ${priority}:</b>\n${taskText}\n👤 Assigned to: ${assign}\n🆔 ID: <code>${newTask.id}</code>\n\n<i>Refresh dashboard to see changes.</i>`;
      }
    }
  }
}

    // ─────────────────────────────────────────
    // /deltask [id] — delete a task
    // ─────────────────────────────────────────
    else if (command === '/deltask') {
      const taskId = args[0];
      if (!taskId) { reply = '⚠️ Usage: <code>/deltask [task-id]</code>'; }
      else {
        const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
        if (!tasks) { reply = '⚠️ No dashboard data found.'; }
        else {
          let found = false;
          let taskText = '';
          ['critical', 'high', 'medium'].forEach(prio => {
            const idx = tasks[prio].findIndex(t => t.id === taskId);
            if (idx !== -1) {
              taskText = tasks[prio][idx].text;
              tasks[prio].splice(idx, 1);
              found = true;
            }
          });
          if (!found) {
            reply = `⚠️ Task <code>${taskId}</code> not found.`;
          } else {
            await kvSet('tasks', tasks, KV_URL, KV_TOKEN);
            reply = `🗑️ <b>Task deleted:</b>\n${taskText}`;
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // /risks — list all open risks with IDs
    // ─────────────────────────────────────────
    else if (command === '/risks') {
      const risks = await kvGetParsed('risks', KV_URL, KV_TOKEN);
      if (!risks) { reply = '⚠️ No dashboard data found.'; }
      else {
        const open = risks.filter(r => r.status === 'open');
        reply = `⚠️ <b>OPEN RISKS (${open.length})</b>\n\n`;
        open.forEach(r => {
          const icon = r.sev === 'critical' ? '🔴' : r.sev === 'high' ? '🟠' : '🟡';
          reply += `${icon} <code>${r.id}</code> <b>${r.title}</b>\n`;
          reply += `   → ${r.action}\n`;
          reply += `   Owner: ${r.owner}\n\n`;
        });
        reply += `<i>Use /resolve [id] to close a risk</i>`;
      }
    }

    // ─────────────────────────────────────────
    // /resolve [id] — resolve a risk
    // ─────────────────────────────────────────
    else if (command === '/resolve') {
      const riskId = args[0];
      if (!riskId) { reply = '⚠️ Usage: <code>/resolve [risk-id]</code>\nGet IDs with /risks'; }
      else {
        const risks = await kvGetParsed('risks', KV_URL, KV_TOKEN);
        if (!risks) { reply = '⚠️ No dashboard data found.'; }
        else {
          const risk = risks.find(r => r.id === riskId);
          if (!risk) {
            reply = `⚠️ Risk <code>${riskId}</code> not found. Use /risks to see IDs.`;
          } else {
            risk.status = 'resolved';
            await kvSet('risks', risks, KV_URL, KV_TOKEN);
            reply = `✅ <b>Risk resolved:</b>\n${risk.title}\n\n<i>Dashboard will reflect on next load.</i>`;
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // /status — quick summary
    // ─────────────────────────────────────────
    else if (command === '/status') {
      const [tasks, risks, chapters] = await Promise.all([
        kvGetParsed('tasks',    KV_URL, KV_TOKEN),
        kvGetParsed('risks',    KV_URL, KV_TOKEN),
        kvGetParsed('chapters', KV_URL, KV_TOKEN),
      ]);
      if (!tasks || !risks || !chapters) { reply = '⚠️ No dashboard data found.'; }
      else {
        const critOpen  = tasks.critical.filter(t => !t.done).length;
        const highOpen  = tasks.high.filter(t => !t.done).length;
        const medOpen   = tasks.medium.filter(t => !t.done).length;
        const openRisks = risks.filter(r => r.status === 'open').length;
        const doneCamps = chapters.filter(c => c.status === 'done').length;
        const days      = Math.ceil((new Date('2026-06-30') - new Date()) / 864e5);

        reply = `📊 <b>DEVCON OPS STATUS</b>\n\n`;
        reply += `🔴 Critical tasks: <b>${critOpen}</b>\n`;
        reply += `🟠 High tasks: <b>${highOpen}</b>\n`;
        reply += `🟡 This week: <b>${medOpen}</b>\n`;
        reply += `⚠️ Open risks: <b>${openRisks}</b>\n`;
        reply += `🏕 Camps done: <b>${doneCamps}/5</b>\n`;
        reply += `📅 Days to Q2: <b>${days}</b>\n\n`;
        reply += `<i>Use /tasks or /risks for details</i>`;
      }
    }

    // ─────────────────────────────────────────
    // /ask — AI assistant
    // ─────────────────────────────────────────
    else if (command === '/ask' || isMention || isReply) {
      const query = command === '/ask'
        ? args.join(' ')
        : text.replace(/@\w+\s*/i, '').replace(/^bot[,:]\s*/i, '').trim();

      if (!query) {
        reply = '⚠️ Usage: <code>/ask [your question]</code>\nExample: <code>/ask what is the remaining budget?</code>';
      } else {
        const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
        const response  = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: DASHBOARD_CONTEXT,
          messages: [{ role: 'user', content: `${userName} asks: ${query}` }]
        });
        reply = response.content[0].text;
      }
    }

    // ─────────────────────────────────────────
    // Unknown command
    // ─────────────────────────────────────────
    else {
      reply = `❓ Unknown command. Type /help to see all available commands.`;
    }

    // Send reply
    if (reply) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_to_message_id: message.message_id
        })
      });
    }

    return res.status(200).end();

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).end();
  }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
async function kvGetParsed(key, url, token) {
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
    console.error(`kvGet error for "${key}":`, err.message);
    return null;
  }
}

async function kvSet(key, value, url, token) {
  try {
    await fetch(`${url}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(value) })
    });
  } catch (err) {
    console.error(`kvSet error for "${key}":`, err.message);
  }
}
