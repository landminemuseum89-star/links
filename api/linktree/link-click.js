const { parseBody, parseVisitor, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    const linkId = Number(body.id);
    if (!linkId) {
      res.status(400).json({ error: 'Missing button id' });
      return;
    }

    await supabaseRequest('/rest/v1/link_clicks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        link_id: linkId,
        clicked_at: new Date().toISOString(),
        ...parseVisitor(req)
      })
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
