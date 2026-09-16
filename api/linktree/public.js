const { getLinks, getProfile, parseVisitor, selectSingle, sendMethodNotAllowed, supabaseRequest } = require('../_linktree');

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
      const visitor = parseVisitor(req);
      await supabaseRequest('/rest/v1/visits', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          organization_id: trackedOrganization?.id || null,
          code,
          visited_at: new Date().toISOString(),
          ...visitor
        })
      });
    }

    const [profile, links] = await Promise.all([getProfile(), getLinks(true)]);
    res.status(200).json({ profile, links, trackedOrganization });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
