const QRCode = require('qrcode');
const {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  getAdminData,
  getLinks,
  getOrganizations,
  getProfile,
  getRequestOrigin,
  normalizeUrl,
  parseBody,
  parseVisitor,
  selectSingle,
  sendMethodNotAllowed,
  supabaseRequest,
  uploadProfileImage
} = require('../_linktree');
const { addQrCodeLabel } = require('../_qrLabel');

function getRoute(req) {
  const pathname = new URL(req.url || '/', 'https://local.test').pathname;
  return pathname.replace(/^\/api\/linktree\/?/, '').replace(/\/$/, '') || 'public';
}

function omitFields(payload, fields) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !fields.includes(key)));
}

async function recordWithSchemaFallback(table, payload) {
  const attempts = [
    payload,
    omitFields(payload, ['browser_region']),
    omitFields(payload, ['browser_region', 'country', 'region', 'city', 'timezone'])
  ];

  for (const attempt of attempts) {
    try {
      await supabaseRequest(`/rest/v1/${table}`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(attempt)
      });
      return;
    } catch (error) {
      const isSchemaCacheError = new RegExp(`schema cache|column .*${table}`, 'i').test(error.message);
      if (!isSchemaCacheError || attempt === attempts[attempts.length - 1]) throw error;
    }
  }
}

async function handlePublic(req, res) {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);

  const code = req.query?.variable || '';
  let trackedOrganization = null;
  const profilePromise = getProfile();
  const linksPromise = getLinks(true, { includeStats: false });

  if (code) {
    trackedOrganization = await selectSingle('organizations', `code=eq.${encodeURIComponent(code)}&select=id,name,code`);
    const visitor = parseVisitor(req, {
      timezone: req.query?.timezone || '',
      browser_region: req.query?.browser_region || ''
    });

    try {
      await recordWithSchemaFallback('visits', {
        organization_id: trackedOrganization?.id || null,
        code,
        visited_at: new Date().toISOString(),
        ...visitor
      });
    } catch (error) {
      console.error('Visit tracking failed:', error.message);
    }
  }

  const [profile, links] = await Promise.all([profilePromise, linksPromise]);
  res.status(200).json({ profile, links, trackedOrganization });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  const body = parseBody(req.body);
  const valid = body.email === ADMIN_EMAIL && body.password === ADMIN_PASSWORD;
  res.status(valid ? 200 : 401).json(valid ? { ok: true } : { error: 'Incorrect user or password' });
}

async function handleLink(req, res) {
  if (!['POST', 'PUT'].includes(req.method)) return sendMethodNotAllowed(res);

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
    const updatePayload = {
      title,
      url,
      icon: body.icon || 'globe',
      is_active: Boolean(body.is_active),
      updated_at: now
    };

    if (Number.isFinite(Number(body.position))) updatePayload.position = Number(body.position);

    await supabaseRequest(`/rest/v1/links?id=eq.${Number(body.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(updatePayload)
    });
  }

  res.status(200).json({ ok: true, links: await getLinks(false) });
}

async function handleLinkOrder(req, res) {
  if (req.method !== 'PUT') return sendMethodNotAllowed(res);

  const body = parseBody(req.body);
  const links = Array.isArray(body.links) ? body.links : [];
  const now = new Date().toISOString();

  await Promise.all(
    links.map((link) =>
      supabaseRequest(`/rest/v1/links?id=eq.${Number(link.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ position: Number(link.position), updated_at: now })
      })
    )
  );

  res.status(200).json({ ok: true, links: await getLinks(false) });
}

async function handleLinkClick(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);

  const body = parseBody(req.body);
  const linkId = Number(body.id);
  if (!linkId) {
    res.status(400).json({ error: 'Missing button id' });
    return;
  }

  await recordWithSchemaFallback('link_clicks', {
    link_id: linkId,
    clicked_at: new Date().toISOString(),
    ...parseVisitor(req, {
      timezone: body.timezone || '',
      browser_region: body.browser_region || ''
    })
  });

  res.status(200).json({ ok: true });
}

async function handleOrganization(req, res) {
  if (!['POST', 'PUT'].includes(req.method)) return sendMethodNotAllowed(res);

  const body = parseBody(req.body);
  const name = String(body.name || '').trim();
  const code = String(body.code || '').trim();
  const notes = String(body.notes || '').trim();

  if (!name || !code) {
    res.status(400).json({ error: 'Missing name or code' });
    return;
  }

  const now = new Date().toISOString();
  if (req.method === 'POST') {
    await supabaseRequest('/rest/v1/organizations', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ name, code, notes, created_at: now, updated_at: now })
    });
  } else {
    await supabaseRequest(`/rest/v1/organizations?id=eq.${Number(body.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ name, code, notes, updated_at: now })
    });
  }

  res.status(200).json({ ok: true, organizations: await getOrganizations() });
}

async function handleProfile(req, res) {
  if (req.method !== 'PUT') return sendMethodNotAllowed(res);

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
}

async function handleProfileImage(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);

  const body = parseBody(req.body);
  const avatarUrl = await uploadProfileImage({ imageData: body.imageData });
  await supabaseRequest('/rest/v1/profile?id=eq.1', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
  });

  res.status(200).json({ ok: true, avatar_url: avatarUrl, profile: await getProfile() });
}

async function handleQr(req, res) {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);

  const code = req.query?.code || '';
  const origin = req.query?.origin || getRequestOrigin(req);

  if (!code) {
    res.status(400).json({ error: 'Missing code' });
    return;
  }

  const targetUrl = `${origin}/?variable=${encodeURIComponent(code)}`;
  const qrPng = await QRCode.toBuffer(targetUrl, {
    type: 'png',
    width: 1080,
    margin: 2,
    color: { dark: '#121212', light: '#fffaf2' }
  });
  const png = addQrCodeLabel(qrPng, code);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="qr-${code}.png"`);
  res.end(png);
}

async function handleDelete(req, res, table) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);

  const body = parseBody(req.body);
  await supabaseRequest(`/rest/v1/${table}?id=eq.${Number(body.id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
  res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  try {
    const route = getRoute(req);

    if (route === 'public') return await handlePublic(req, res);
    if (route === 'admin') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res);
      return res.status(200).json(await getAdminData());
    }
    if (route === 'login') return await handleLogin(req, res);
    if (route === 'link') return await handleLink(req, res);
    if (route === 'link-order') return await handleLinkOrder(req, res);
    if (route === 'link-click') return await handleLinkClick(req, res);
    if (route === 'link/delete') return await handleDelete(req, res, 'links');
    if (route === 'organization') return await handleOrganization(req, res);
    if (route === 'organization/delete') return await handleDelete(req, res, 'organizations');
    if (route === 'profile') return await handleProfile(req, res);
    if (route === 'profile-image') return await handleProfileImage(req, res);
    if (route === 'qr') return await handleQr(req, res);
    if (route === 'visit/delete') return await handleDelete(req, res, 'visits');
    if (route === 'click/delete') return await handleDelete(req, res, 'link_clicks');

    res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    const isDuplicate = String(error.message).includes('duplicate') || String(error.message).includes('unique');
    res.status(isDuplicate ? 409 : 500).json({ error: isDuplicate ? 'That code already exists' : error.message });
  }
};
