import Anthropic from '@anthropic-ai/sdk';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID       = process.env.TELEGRAM_CHAT_ID;
const CRON_SECRET   = process.env.CRON_SECRET;
const CLAUDE_KEY    = process.env.ANTHROPIC_API_KEY;

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

async function dbSet(key, value) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
  });
  return r.ok;
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

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase credentials' });
  }

  try {
    const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });

    const now = new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric',
      timeZone: 'Asia/Manila'
    });

    // ── Generate grant list via Claude ──
const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search'
        }
      ],
      system: `You are a grants research assistant for DEVCON Philippines, a registered non-profit tech community organization.

IMPORTANT: Use the web_search tool to find REAL, currently open grants. Search for actual grant pages and verify the URLs exist before including them.

After searching, return ONLY valid JSON, no markdown, no backticks, no explanation.
Return exactly this structure:
{
  "grants": [
    {
      "name": "Grant name",
      "funder": "Organization providing the grant",
      "amount": "Amount range or TBD",
      "deadline": "Deadline date or Rolling",
      "link": "Real verified application URL from search results",
      "relevance": "1-2 sentences why this fits DEVCON PH",
      "score": 85
    }
  ]
}

Rules:
- Search for real open grants using web_search before responding
- Find 8 currently open grants relevant to DEVCON Philippines
- Focus on: AI education, web3/blockchain, tech community building, gender in tech, digital literacy, youth tech programs
- Priority funders: Sui Foundation, USAID, DOST, Google.org, Meta, Microsoft, Gitcoin, UNDP, ADB, Asian foundations
- Philippine non-profits or Southeast Asia eligible
- Score 0-100 based on fit with DEVCON's mission
- Sort by score descending
- Only include grants with REAL verified links from your search
- If you cannot find a real link, use the funder's main grants page URL`,
      messages: [{
        role: 'user',
        content: `Today is ${now}. Search the web and find the best currently open grants for DEVCON Philippines — a non-profit tech community with 10 chapters nationwide running code camps, SHEisDEVCON gender programs, and AI/blockchain education. We have a Sui Foundation partnership. Annual budget ~₱1.12M. 

Search for: "open grants Philippines non-profit tech 2026", "Google.org grants Asia 2026", "USAID Philippines grants 2026", "web3 grants Southeast Asia 2026", "Sui Foundation grants 2026", "DOST grants Philippines 2026".

Find real grant pages with working application URLs.`
      }]
    });

let grants = [];
    try {
      // Find the final text block — may come after tool_use blocks
      const textBlock = response.content
        .filter(b => b.type === 'text')
        .pop();

      if (!textBlock) {
        return res.status(500).json({ error: 'No text response from Claude' });
      }

      // Strip any accidental markdown fences
      const clean = textBlock.text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(clean);
      grants = parsed.grants || [];
    } catch (e) {
      console.error('Parse error:', e.message);
      return res.status(500).json({ error: 'Failed to parse Claude response' });
    }

    if (!grants.length) {
      return res.status(200).json({ ok: true, message: 'No grants found' });
    }

    // ── Save to Supabase for dashboard reference ──
    const scoutRecord = {
      generated_at: new Date().toISOString(),
      grants
    };
    await dbSet('scout_grants', scoutRecord);

    // ── Build Telegram message ──
    const dateStr = new Date().toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'Asia/Manila'
    });

    let msg = `🔍 <b>DEVCON GRANT SCOUT — ${dateStr}</b>\n`;
    msg += `<i>Weekly funding opportunities for DEVCON PH</i>\n\n`;

    grants.slice(0, 8).forEach((g, i) => {
      const scoreBar = g.score >= 80 ? '🟢' : g.score >= 60 ? '🟡' : '🔴';
      msg += `${i + 1}. ${scoreBar} <b>${g.name}</b>\n`;
      msg += `   📌 ${g.funder}\n`;
      msg += `   💰 ${g.amount}\n`;
      msg += `   📅 Deadline: ${g.deadline}\n`;
      msg += `   🎯 ${g.relevance}\n`;
      msg += `   🔗 ${g.link}\n`;
      msg += `   Match: <b>${g.score}/100</b>\n\n`;
    });

    msg += `<i>Scout runs every Monday 10am PHT · /scout to run manually</i>`;

    await sendTg(msg);

    return res.status(200).json({
      ok: true,
      grants_found: grants.length,
      sent_at: new Date().toISOString()
    });

  } catch (err) {
    console.error('Scout error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
