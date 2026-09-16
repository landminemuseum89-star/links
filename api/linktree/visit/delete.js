const { parseBody, sendMethodNotAllowed, supabaseRequest } = require('../../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    await supabaseRequest(`/rest/v1/visits?id=eq.${Number(body.id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
