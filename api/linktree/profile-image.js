const { getProfile, parseBody, sendMethodNotAllowed, supabaseRequest, uploadProfileImage } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    const avatarUrl = await uploadProfileImage({ imageData: body.imageData });
    await supabaseRequest('/rest/v1/profile?id=eq.1', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      })
    });

    res.status(200).json({ ok: true, avatar_url: avatarUrl, profile: await getProfile() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
