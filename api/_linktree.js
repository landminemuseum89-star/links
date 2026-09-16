const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'profile-images';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'landminemuseum89@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aki123';

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured.');
  }
}

function sendMethodNotAllowed(res) {
  res.status(405).json({ error: 'Method not allowed' });
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body || '{}');
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8') || '{}');
  return body;
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

async function supabaseRequest(path, options = {}) {
  requireConfig();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || payload || `Supabase request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function selectSingle(table, query = '') {
  const rows = await supabaseRequest(`/rest/v1/${table}?${query}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getProfile() {
  return selectSingle('profile', 'id=eq.1&select=*');
}

async function getLinks(activeOnly = false, options = {}) {
  const { includeStats = true } = options;
  const links = await supabaseRequest(
    `/rest/v1/links?select=id,title,url,icon,position,is_active&order=position.asc,id.asc${activeOnly ? '&is_active=eq.true' : ''}`
  );

  if (!includeStats) {
    return links;
  }

  const clicks = await supabaseRequest('/rest/v1/link_clicks?select=link_id,clicked_at');
  const stats = clicks.reduce((acc, click) => {
    if (!click.link_id) return acc;
    const current = acc[click.link_id] || { click_count: 0, last_click_at: null };
    current.click_count += 1;
    if (!current.last_click_at || click.clicked_at > current.last_click_at) {
      current.last_click_at = click.clicked_at;
    }
    acc[click.link_id] = current;
    return acc;
  }, {});

  return links.map((link) => ({
    ...link,
    click_count: stats[link.id]?.click_count || 0,
    last_click_at: stats[link.id]?.last_click_at || null
  }));
}

function withLinkClickNames(clicks, links) {
  const names = Object.fromEntries(links.map((link) => [link.id, link.title]));
  return clicks.map((click) => ({
    ...click,
    link_title: names[click.link_id] || null
  }));
}

async function getLinkClicks(preloadedLinks = null) {
  const clicks = await supabaseRequest('/rest/v1/link_clicks?select=*&order=clicked_at.desc&limit=500');
  const links = preloadedLinks || await supabaseRequest('/rest/v1/links?select=id,title');
  return withLinkClickNames(clicks, links);
}

function withOrganizationStats(organizations, visits) {
  const stats = visits.reduce((acc, visit) => {
    if (!visit.organization_id) return acc;
    const current = acc[visit.organization_id] || { visit_count: 0, last_visit_at: null };
    current.visit_count += 1;
    if (!current.last_visit_at || visit.visited_at > current.last_visit_at) {
      current.last_visit_at = visit.visited_at;
    }
    acc[visit.organization_id] = current;
    return acc;
  }, {});

  return organizations.map((organization) => ({
    ...organization,
    visit_count: stats[organization.id]?.visit_count || 0,
    last_visit_at: stats[organization.id]?.last_visit_at || null
  }));
}

async function getOrganizations(preloadedVisits = null) {
  const organizations = await supabaseRequest('/rest/v1/organizations?select=*&order=created_at.desc');
  const visits = preloadedVisits || await supabaseRequest('/rest/v1/visits?select=organization_id,visited_at');
  return withOrganizationStats(organizations, visits);
}

function withVisitOrganizationNames(visits, organizations) {
  const names = Object.fromEntries(organizations.map((organization) => [organization.id, organization.name]));
  return visits.map((visit) => ({
    ...visit,
    organization_name: names[visit.organization_id] || null
  }));
}

async function getVisits(preloadedOrganizations = null) {
  const visits = await supabaseRequest('/rest/v1/visits?select=*&order=visited_at.desc&limit=500');
  const organizations = preloadedOrganizations || await supabaseRequest('/rest/v1/organizations?select=id,name');
  return withVisitOrganizationNames(visits, organizations);
}

async function getAdminData() {
  const [profile, links, organizations, visitStatsRows, visits, linkClicks] = await Promise.all([
    getProfile(),
    getLinks(false),
    supabaseRequest('/rest/v1/organizations?select=*&order=created_at.desc'),
    supabaseRequest('/rest/v1/visits?select=organization_id,visited_at'),
    supabaseRequest('/rest/v1/visits?select=*&order=visited_at.desc&limit=500'),
    supabaseRequest('/rest/v1/link_clicks?select=*&order=clicked_at.desc&limit=500')
  ]);

  return {
    profile,
    links,
    organizations: withOrganizationStats(organizations, visitStatsRows),
    visits: withVisitOrganizationNames(visits, organizations),
    linkClicks: withLinkClickNames(linkClicks, links)
  };
}

function decodeHeader(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseVisitor(req, fallback = {}) {
  const userAgent = req.headers['user-agent'] || '';
  const language = req.headers['accept-language'] || '';

  let browser = 'Unknown';
  if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/opr|opera/i.test(userAgent)) browser = 'Opera';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent)) browser = 'Safari';

  let os = 'Unknown';
  if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/mac os x|macintosh/i.test(userAgent)) os = 'macOS';
  else if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let device = 'Desktop';
  if (/mobile|iphone|ipod|android.*mobile/i.test(userAgent)) device = 'Mobile';
  else if (/ipad|tablet|android/i.test(userAgent)) device = 'Tablet';

  return {
    language: language.split(',')[0] || '',
    browser,
    os,
    device,
    country: req.headers['x-vercel-ip-country'] || fallback.country || '',
    region: req.headers['x-vercel-ip-country-region'] || fallback.region || '',
    city: decodeHeader(req.headers['x-vercel-ip-city']) || fallback.city || '',
    timezone: req.headers['x-vercel-ip-timezone'] || fallback.timezone || '',
    browser_region: fallback.browser_region || '',
    referrer: req.headers.referer || req.headers.referrer || '',
    user_agent: userAgent
  };
}

function getRequestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return host ? `${proto}://${host}` : '';
}

async function uploadProfileImage({ imageData }) {
  requireConfig();
  const match = String(imageData || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported image format');
  }

  const mime = match[1];
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.replace('image/', '');
  const fileName = `profile-${Date.now()}.${extension}`;
  const binary = Buffer.from(match[2], 'base64');

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': mime,
      'x-upsert': 'true'
    },
    body: binary
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Image upload failed with ${response.status}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
}

module.exports = {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  SUPABASE_BUCKET,
  getAdminData,
  getLinkClicks,
  getLinks,
  getOrganizations,
  getProfile,
  getRequestOrigin,
  getVisits,
  normalizeUrl,
  parseBody,
  parseVisitor,
  selectSingle,
  sendMethodNotAllowed,
  supabaseRequest,
  uploadProfileImage
};
