const { getProfile, parseBody, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    await supabaseRequest('/rest/v1/profile?id=eq.1', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        display_name: String(body.display_name || '').trim() || 'Cambodia Landmine Museum',
        subtitle: String(body.subtitle || '').trim(),
        bio: String(body.bio || '').trim(),
        avatar_url: String(body.avatar_url || '').trim(),
        updated_at: new Date().toISOString()
      })
    });

    res.status(200).json({ ok: true, profile: await getProfile() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
