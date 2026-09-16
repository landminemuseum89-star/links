const { getLinks, normalizeUrl, parseBody, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (!['POST', 'PUT'].includes(req.method)) {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const body = parseBody(req.body);
    const title = String(body.title || '').trim();
    const url = normalizeUrl(body.url);

    if (!title || !url) {
      res.status(400).json({ error: 'Missing title or URL' });
      return;
    }

    const now = new Date().toISOString();
    if (req.method === 'POST') {
      const links = await getLinks(false);
      const nextPosition = links.reduce((max, link) => Math.max(max, Number(link.position || 0)), 0) + 1;
      await supabaseRequest('/rest/v1/links', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          title,
          url,
          icon: body.icon || 'globe',
          position: nextPosition,
          is_active: Boolean(body.is_active),
          created_at: now,
          updated_at: now
        })
      });
    } else {
      await supabaseRequest(`/rest/v1/links?id=eq.${Number(body.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          title,
          url,
          icon: body.icon || 'globe',
          is_active: Boolean(body.is_active),
          updated_at: now
        })
      });
    }

    res.status(200).json({ ok: true, links: await getLinks(false) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
