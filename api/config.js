export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') return res.status(405).end();

  return res.status(200).json({
    botToken: process.env.TELEGRAM_BOT_TOKEN
  });
}
