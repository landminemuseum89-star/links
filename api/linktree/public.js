const { getLinks, getProfile, parseVisitor, selectSingle, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

function omitFields(payload, fields) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !fields.includes(key)));
}

async function recordVisit(payload) {
  const attempts = [
    payload,
    omitFields(payload, ['browser_region']),
    omitFields(payload, ['browser_region', 'country', 'region', 'city', 'timezone'])
  ];

  for (const attempt of attempts) {
    try {
      await supabaseRequest('/rest/v1/visits', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(attempt)
      });
      return;
    } catch (error) {
      const isSchemaCacheError = /schema cache|column .*visits/i.test(error.message);
      if (!isSchemaCacheError || attempt === attempts[attempts.length - 1]) {
        throw error;
      }
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const code = req.query?.variable || '';
    let trackedOrganization = null;

    if (code) {
      trackedOrganization = await selectSingle('organizations', `code=eq.${encodeURIComponent(code)}&select=id,name,code`);
      const visitor = parseVisitor(req, {
        timezone: req.query?.timezone || '',
        browser_region: req.query?.browser_region || ''
      });
      try {
        await recordVisit({
          organization_id: trackedOrganization?.id || null,
          code,
          visited_at: new Date().toISOString(),
          ...visitor
        });
      } catch (error) {
        console.error('Visit tracking failed:', error.message);
      }
    }

    const [profile, links] = await Promise.all([getProfile(), getLinks(true)]);
    res.status(200).json({ profile, links, trackedOrganization });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
