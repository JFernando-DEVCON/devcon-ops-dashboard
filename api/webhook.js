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
- Dom umbrella reimbursement: ₱8,239.92 — PENDING (charged to personal card, Shopee)
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
  // Telegram sends a POST when a message arrives
  if (req.method !== 'POST') return res.status(200).end();

  const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    const update = req.body;

    // Get message from update
    const message = update.message || update.channel_post;
    if (!message || !message.text) return res.status(200).end();

    const chatId   = message.chat.id;
    const text     = message.text.trim();
    const userName = message.from?.first_name || 'there';

    // Ignore messages that don't start with / or mention the bot
    // In a GC, bot only responds to commands or direct mentions
    const isCommand = text.startsWith('/');
    const isMention = text.toLowerCase().includes('@devcon') ||
                      text.toLowerCase().includes('bot,') ||
                      text.toLowerCase().includes('bot:');
    const isReply   = message.reply_to_message?.from?.is_bot;

    if (!isCommand && !isMention && !isReply) {
      return res.status(200).end(); // ignore normal GC chatter
    }

    // Strip command prefix or mention prefix
    const query = text
      .replace(/^\/\w+\s*/, '')
      .replace(/@\w+\s*/i, '')
      .replace(/^bot[,:]\s*/i, '')
      .trim() || text;

    // Send typing indicator
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });

    // Call Claude
    const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
    const response  = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: DASHBOARD_CONTEXT,
      messages: [{ role: 'user', content: `${userName} asks: ${query}` }]
    });

    const reply = response.content[0].text;

    // Send reply to Telegram
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

    return res.status(200).end();

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).end(); // always return 200 to Telegram
  }
}

