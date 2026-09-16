const { getLinks, getOrganizations, getProfile, getVisits, sendMethodNotAllowed } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const [profile, links, organizations, visits] = await Promise.all([
      getProfile(),
      getLinks(false),
      getOrganizations(),
      getVisits()
    ]);

    res.status(200).json({ profile, links, organizations, visits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
