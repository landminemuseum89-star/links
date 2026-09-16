const { parseBody, parseVisitor, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

function omitFields(payload, fields) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !fields.includes(key)));
}

async function recordClick(payload) {
  const attempts = [
    payload,
    omitFields(payload, ['browser_region']),
    omitFields(payload, ['browser_region', 'country', 'region', 'city', 'timezone'])
  ];

  for (const attempt of attempts) {
    try {
      await supabaseRequest('/rest/v1/link_clicks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(attempt)
      });
      return;
    } catch (error) {
      const isSchemaCacheError = /schema cache|column .*link_clicks/i.test(error.message);
      if (!isSchemaCacheError || attempt === attempts[attempts.length - 1]) {
        throw error;
      }
    }
  }
}

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

    await recordClick({
      link_id: linkId,
      clicked_at: new Date().toISOString(),
      ...parseVisitor(req, {
        timezone: body.timezone || '',
        browser_region: body.browser_region || ''
      })
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
