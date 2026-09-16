const { ADMIN_EMAIL, ADMIN_PASSWORD, parseBody, sendMethodNotAllowed } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    const valid = body.email === ADMIN_EMAIL && body.password === ADMIN_PASSWORD;
    res.status(valid ? 200 : 401).json(valid ? { ok: true } : { error: 'Incorrect user or password' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
