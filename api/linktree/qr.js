const QRCode = require('qrcode');
const { getRequestOrigin, sendMethodNotAllowed } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const code = req.query?.code || '';
    const origin = req.query?.origin || getRequestOrigin(req);

    if (!code) {
      res.status(400).json({ error: 'Missing code' });
      return;
    }

    const targetUrl = `${origin}/?variable=${encodeURIComponent(code)}`;
    const png = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: 1080,
      margin: 2,
      color: {
        dark: '#121212',
        light: '#fffaf2'
      }
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${code}.png"`);
    res.end(png);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
