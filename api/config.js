export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Only allow requests from your own dashboard
  const referer = req.headers['referer'] || '';
  const origin  = req.headers['origin'] || '';
  const isFromDashboard = 
    referer.includes('devcon-ops-dashboard.vercel.app') ||
    origin.includes('devcon-ops-dashboard.vercel.app') ||
    referer === '' && origin === ''; // allow direct browser requests

  if (!isFromDashboard) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(200).json({
    botToken: process.env.TELEGRAM_BOT_TOKEN
  });
}
