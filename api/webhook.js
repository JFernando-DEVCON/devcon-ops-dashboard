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
  reply += `/addtask [priority] [text] @[assignee] — add new task\n`;
  reply += `  priorities: <code>critical</code> <code>high</code> <code>medium</code>\n`;
  reply += `  example: <code>/addtask high Follow up Rolf @Rolf</code>\n`;
  reply += `/deltask [id] — delete a task\n\n`;

  reply += `<b>💰 Budget Commands:</b>\n`;
  reply += `/budget — view all budget line items\n`;
  reply += `/updatespent [id] [amount] — update spent amount\n`;
  reply += `  example: <code>/updatespent b1 55000</code>\n\n`;
  reply += `/update [description] — natural language budget update\n`;
  reply += `  example: <code>/update Bought Marica flight ₱8,500 for Iloilo ABA</code>\n\n`;

  reply += `<b>⚠️ Risk Commands:</b>\n`;
  reply += `/risks — list all open risks with IDs\n`;
  reply += `/resolve [id] — mark risk as resolved\n\n`;

  reply += `<b>📊 Info Commands:</b>\n`;
  reply += `/status — quick summary of open items\n`;
  reply += `/ping — check if bot is online\n\n`;

  reply += `<b>🤖 AI Assistant:</b>\n`;
  reply += `/ask [question] — ask anything about ops data\n`;
  reply += `  example: <code>/ask what is the remaining budget?</code>\n`;
  reply += `  example: <code>/ask sino may pending na tasks?</code>\n`;
  reply += `  example: <code>/ask total reimbursement summary</code>\n\n`;

  reply += `<i>💡 Tip: You can also reply to any bot message to ask follow-up questions in English or Filipino 🇵🇭</i>`;
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
  const query = args.join(' ').trim();

  if (!query) {
    reply = '⚠️ Usage: <code>/addtask [describe the task naturally]</code>\n\n';
    reply += 'Examples:\n';
    reply += '• <code>/addtask Follow up Rolf on Tacloban date, high priority</code>\n';
    reply += '• <code>/addtask Submit BIR invoices assign to Jedd, critical</code>\n';
    reply += '• <code>/addtask Draft Q2 report outline for Dom, this week</code>\n';
    reply += '• <code>/addtask paalamin si Zhi sa Bukidnon ocular, high</code>';
  } else {
    const tasks = await kvGetParsed('tasks', KV_URL, KV_TOKEN);
    if (!tasks) {
      reply = '⚠️ No dashboard data found. Open the dashboard first.';
    } else {
      // Build existing task IDs to generate next sequential ID
      const allTasks = [...tasks.critical, ...tasks.high, ...tasks.medium];
      const existingNums = allTasks
        .map(t => parseInt(t.id.replace('t', '')))
        .filter(n => !isNaN(n) && n < 1000000);
      const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 16;
      const newId = 't' + nextNum;

      // Use Claude to parse natural language
      const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `You extract task details from natural language for a Filipino ops team dashboard.
Extract and return ONLY valid JSON, nothing else, no markdown, no explanation.

Team members: Jedd, Dom, Lady, Rolf, Marica, Ted, Zhi, Joash, Jianyi

Return this exact format:
{"text":"clean task description","priority":"critical|high|medium","assign":"TeamMemberName","due":""}

Rules:
- priority: "critical" if urgent/ASAP/critical/agad, "high" if high/important/priority, "medium" if this week/medium/normal/default
- assign: match to closest team member name mentioned, default to "Jedd" if none mentioned
- text: clean, professional task description in English (translate if Filipino)
- due: leave empty string always
- Never include quotes inside the text value`,
        messages: [{ role: 'user', content: query }]
      });

      const raw = response.content[0].text.trim();

      try {
        const parsed = JSON.parse(raw);

        if (!parsed.text || !parsed.priority || !parsed.assign) {
          throw new Error('Incomplete parse');
        }

        // Validate priority
        const priority = ['critical','high','medium'].includes(parsed.priority)
          ? parsed.priority
          : 'medium';

        const newTask = {
          id: newId,
          text: parsed.text,
          assign: parsed.assign,
          due: parsed.due || '',
          done: false
        };

        tasks[priority].push(newTask);
        await kvSet('tasks', tasks, KV_URL, KV_TOKEN);

        const prioIcon = priority === 'critical' ? '🔴' : priority === 'high' ? '🟠' : '🟡';
        reply = `${prioIcon} <b>Task added!</b>\n\n`;
        reply += `📋 ${newTask.text}\n`;
        reply += `👤 Assigned to: <b>${newTask.assign}</b>\n`;
        reply += `📊 Priority: <b>${priority.toUpperCase()}</b>\n`;
        reply += `🆔 ID: <code>${newId}</code>\n\n`;
        reply += `<i>Refresh dashboard to see changes.</i>`;

      } catch (err) {
        // Claude didn't return clean JSON — ask for retry
        reply = `⚠️ Couldn't parse that task. Try being more specific:\n\n`;
        reply += `<code>/addtask [task description] [priority] @[assignee]</code>\n\n`;
        reply += `Example: <code>/addtask Follow up Rolf on Tacloban date, high priority</code>`;
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

  else if (command === '/updatespent') {
  // Usage: /updatespent b1 55000
  const lineId  = args[0];
  const amount  = parseInt(args[1]);

  if (!lineId || isNaN(amount)) {
    reply = '⚠️ Usage: <code>/updatespent [line-id] [amount]</code>\n';
    reply += 'Example: <code>/updatespent b1 55000</code>\n\n';
    reply += '<b>Line IDs:</b>\n';
    reply += 'b1=Code Camps, b2=HQ Program, b3=SHEisDEVCON\n';
    reply += 'b4=Mentors, b5=PR/Media, b6=Merch\n';
    reply += 'b7=DEVCON Kids, b8=Assets, b9=Travel\n';
    reply += 'b10=Admin Fee, bvat=VAT';
  } else {
    const budget = await kvGetParsed('budget', KV_URL, KV_TOKEN);
    if (!budget) {
      reply = '⚠️ No budget data found. Open dashboard first.';
    } else {
      const line = budget.find(b => b.id === lineId);
      if (!line) {
        reply = `⚠️ Line <code>${lineId}</code> not found.\nUse b1–b10 or bvat.`;
      } else {
        const oldSpent = line.spent;
        line.spent = amount;
        await kvSet('budget', budget, KV_URL, KV_TOKEN);
        const pct = Math.round(amount / line.alloc * 100);
        const status = amount > line.alloc ? '🔴 OVER BUDGET' : pct > 80 ? '🟠 HIGH' : '🟢 OK';
        reply = `✅ <b>Budget updated — Line ${line.num}</b>\n`;
        reply += `${line.name}\n\n`;
        reply += `Previous: ₱${oldSpent.toLocaleString()}\n`;
        reply += `New: ₱${amount.toLocaleString()}\n`;
        reply += `Allocated: ₱${line.alloc.toLocaleString()}\n`;
        reply += `Remaining: ₱${(line.alloc - amount).toLocaleString()}\n`;
        reply += `Utilization: ${pct}% ${status}\n\n`;
        reply += `<i>Refresh dashboard to see changes.</i>`;
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

  else if (command === '/budget') {
  const budget = await kvGetParsed('budget', KV_URL, KV_TOKEN);
  if (!budget) {
    reply = '⚠️ No budget data found. Open dashboard first.';
  } else {
    const opLines = budget.filter(b => !b.vat);
    const totalSpent = opLines.reduce((sum, l) => sum + l.spent, 0);
    const totalAlloc = 1000000;
    const remaining = totalAlloc - totalSpent;

    reply = `💰 <b>DEVCON BUDGET STATUS</b>\n\n`;
    reply += `Total Allocated: ₱1,120,000\n`;
    reply += `Subtotal Spent: ₱${totalSpent.toLocaleString()}\n`;
    reply += `Remaining: ₱${remaining.toLocaleString()}\n\n`;
    reply += `<b>Line Items:</b>\n`;
    opLines.forEach(l => {
      const pct = Math.round(l.spent / l.alloc * 100);
      const icon = l.spent > l.alloc ? '🔴' : pct > 80 ? '🟠' : '🟢';
      reply += `${icon} <code>${l.id}</code> Line ${l.num}: ₱${l.spent.toLocaleString()} / ₱${l.alloc.toLocaleString()} (${pct}%)\n`;
    });
    reply += `\n<i>Use /updatespent [id] [amount] to update</i>`;
  }
}

  else if (command === '/update') {
  const query = args.join(' ');
  if (!query) {
    reply = '⚠️ Usage: <code>/update [describe what was spent]</code>\n\n';
    reply += 'Example:\n<code>/update Bought Marica Iloilo flight ₱8,500 for ABA. Charge to Line 9 Travel.</code>';
  } else {
    const budget = await kvGetParsed('budget', KV_URL, KV_TOKEN);
    if (!budget) {
      reply = '⚠️ No budget data found. Open dashboard first.';
    } else {
      // Build budget context for Claude
      const budgetContext = budget
        .filter(b => !b.vat)
        .map(b => `${b.id} | Line ${b.num} | ${b.name} | Allocated: ₱${b.alloc.toLocaleString()} | Spent: ₱${b.spent.toLocaleString()} | Remaining: ₱${(b.alloc - b.spent).toLocaleString()}`)
        .join('\n');

      const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a budget assistant for DEVCON Philippines ops. 
        
Given a natural language expense update, you must:
1. Identify which budget line(s) to update
2. Extract the peso amount(s)
3. Return ONLY a valid JSON array of updates, nothing else

Budget lines available:
${budgetContext}

Rules:
- If amount is a range (e.g. 30-40k), use the midpoint (35000)
- If amount is estimated, flag it
- Match expenses to the most relevant budget line
- Return JSON only, no explanation

Format:
[{"id":"b1","addAmount":5000,"note":"description of expense"}]

If you cannot determine the amount or line, return:
[{"error":"explanation of what info is missing"}]`,
        messages: [{ role: 'user', content: query }]
      });

      const rawText = response.content[0].text.trim();

      try {
        // Parse Claude's JSON response
        const updates = JSON.parse(rawText);

        if (updates[0]?.error) {
          reply = `⚠️ <b>Couldn't process update:</b>\n${updates[0].error}\n\n`;
          reply += `Please be more specific about:\n• The peso amount\n• What it was spent on\n\n`;
          reply += `Or use: <code>/updatespent [line-id] [total-amount]</code>`;
        } else {
          // Apply updates
          let updateLog = `📝 <b>BUDGET UPDATE APPLIED</b>\n\n`;
          let hasError = false;

          for (const update of updates) {
            const line = budget.find(b => b.id === update.id);
            if (!line) {
              updateLog += `⚠️ Line ${update.id} not found\n`;
              hasError = true;
              continue;
            }
            const oldSpent = line.spent;
            line.spent = oldSpent + update.addAmount;
            const newPct = Math.round(line.spent / line.alloc * 100);
            const status = line.spent > line.alloc ? '🔴 OVER' : newPct > 80 ? '🟠 HIGH' : '🟢 OK';

            updateLog += `${status} <b>Line ${line.num} — ${line.name}</b>\n`;
            updateLog += `  Added: +₱${update.addAmount.toLocaleString()}\n`;
            updateLog += `  Note: ${update.note}\n`;
            updateLog += `  New spent: ₱${line.spent.toLocaleString()} / ₱${line.alloc.toLocaleString()} (${newPct}%)\n\n`;
          }

          if (!hasError) {
            await kvSet('budget', budget, KV_URL, KV_TOKEN);
            updateLog += `✅ <b>Saved to dashboard.</b>\n`;
            updateLog += `<i>Refresh dashboard to see changes.</i>`;
          } else {
            updateLog += `⚠️ Some updates failed. Budget not saved.`;
          }

          reply = updateLog;
        }
      } catch (parseErr) {
        // Claude didn't return clean JSON — fall back to asking for clarification
        reply = `🤖 <b>I understood your update but need clarification:</b>\n\n`;
        reply += `${rawText}\n\n`;
        reply += `Please confirm with:\n<code>/updatespent [line-id] [new-total-amount]</code>\n\n`;
        reply += `Or retry with exact amounts:\n<code>/update Marica Iloilo flight ₱8,500 charge to Travel line</code>`;
      }
    }
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

    // Unwrap string layers
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }

    // Unwrap array
    if (Array.isArray(parsed)) parsed = parsed[0];

    // Unwrap string again
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }

    // ← KEY FIX: unwrap { value: "..." } wrapper
    if (parsed && typeof parsed === 'object' && 'value' in parsed && Object.keys(parsed).length === 1) {
      parsed = parsed.value;
      while (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { break; }
      }
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
