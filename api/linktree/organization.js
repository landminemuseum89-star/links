const { getOrganizations, parseBody, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (!['POST', 'PUT'].includes(req.method)) {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim();
    const notes = String(body.notes || '').trim();

    if (!name || !code) {
      res.status(400).json({ error: 'Missing name or code' });
      return;
    }

    const now = new Date().toISOString();
    if (req.method === 'POST') {
      await supabaseRequest('/rest/v1/organizations', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ name, code, notes, created_at: now, updated_at: now })
      });
    } else {
      await supabaseRequest(`/rest/v1/organizations?id=eq.${Number(body.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ name, code, notes, updated_at: now })
      });
    }

    res.status(200).json({ ok: true, organizations: await getOrganizations() });
  } catch (error) {
    if (String(error.message).includes('duplicate') || String(error.message).includes('unique')) {
      res.status(409).json({ error: 'That code already exists' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};
