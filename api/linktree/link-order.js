const { getLinks, parseBody, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    const links = Array.isArray(body.links) ? body.links : [];
    const now = new Date().toISOString();

    await Promise.all(
      links.map((link) =>
        supabaseRequest(`/rest/v1/links?id=eq.${Number(link.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            position: Number(link.position),
            updated_at: now
          })
        })
      )
    );

    res.status(200).json({ ok: true, links: await getLinks(false) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
