const { getAdminData, sendMethodNotAllowed } = require('../_linktree');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    res.status(200).json(await getAdminData());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
