import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);

function resolveBrevoApiKey(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('xkeysib-')) return trimmed;

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed.api_key || '';
  } catch {
    return '';
  }
}

function ticketEmailHtml({ reservationId, amountDue }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f2eee6;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2eee6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#fffaf0;border:1px solid #e4d4ad;">
            <tr>
              <td style="background:#06193a;padding:24px 28px;">
                <img src="https://www.cambodialandminemuseum.org/wp-content/uploads/2026/06/clmm-logo-white-450x147.png" alt="Cambodia Landmine Museum" style="height:42px;width:auto;display:block;">
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.8px;color:#9b6a17;font-weight:700;margin-bottom:12px;">Prototype preview · Not a real ticket</div>
                <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.08;font-weight:400;margin:0 0 14px;color:#111b2e;">Your tickets are on their way.</h1>
                <p style="font-size:16px;line-height:1.6;color:#586071;margin:0 0 20px;">Hi Sophie, your Cambodia Landmine Museum reservation has been created for <strong>1 visitor</strong>. Please pay <strong>${amountDue}</strong> at the museum entrance when you arrive.</p>
                <div style="background:#fffdf8;border:1px solid #d5a93b;border-left:5px solid #d5a93b;padding:18px;margin:18px 0;">
                  <div style="font-size:13px;color:#6f5b27;font-weight:700;">Amount due at museum</div>
                  <div style="font-size:40px;line-height:1;font-weight:800;color:#111b2e;margin-top:6px;">${amountDue}</div>
                  <div style="font-size:13px;color:#586071;margin-top:10px;">No online payment was collected.</div>
                </div>
                <p style="font-size:15px;line-height:1.6;color:#586071;">Reservation: <strong>${reservationId}</strong><br>Open daily: <strong>7:30 AM-5:30 PM</strong><br>QR token preview: <strong>clm_grp_live_2026_00142</strong></p>
                <p style="font-size:15px;line-height:1.6;color:#586071;">Every visit supports landmine clearance, mine-risk education, and the ongoing operation of the museum.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function brevoPreviewPlugin(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = resolveBrevoApiKey(env.BREVO_API_KEY || env.BREVO_API_KEY_B64);

  return {
    name: 'clm-brevo-preview',
    configureServer(server) {
      server.middlewares.use('/api/brevo/send-test-ticket', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'BREVO_API_KEY or BREVO_API_KEY_B64 is missing in .env.local' }));
          return;
        }

        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk;
        });

        req.on('end', async () => {
          try {
            const body = rawBody ? JSON.parse(rawBody) : {};
            const to = body.to || 'furibesm@gmail.com';
            const reservationId = body.reservationId || 'CLM-2026-00142';
            const amountDue = body.amountDue || '$7.00';

            const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                sender: {
                  name: 'Cambodia Landmine Museum Tickets',
                  email: env.BREVO_SENDER_EMAIL || 'furibesm@gmail.com'
                },
                to: [{ email: to }],
                subject: 'Prototype preview: Your Cambodia Landmine Museum tickets',
                htmlContent: ticketEmailHtml({ reservationId, amountDue }),
                textContent: `Prototype preview - not a real ticket.\n\nReservation: ${reservationId}\nAmount due at museum: ${amountDue}\nOpen daily: 7:30 AM-5:30 PM\nNo online payment was collected.`
              })
            });

            const result = await brevoResponse.json().catch(() => ({}));
            res.statusCode = brevoResponse.ok ? 200 : brevoResponse.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      });
    }
  };
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function triviaAnalyticsPlugin() {
  const dataPath = path.resolve(process.cwd(), 'data/trivia-events.json');
  const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
  const appsScriptUrl = env.GOOGLE_APPS_SCRIPT_URL;
  const appsScriptSecret = env.GOOGLE_APPS_SCRIPT_SECRET;

  const forwardToAppsScript = async (event) => {
    if (!appsScriptUrl || !appsScriptSecret) return false;

    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...event, secret: appsScriptSecret }),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Apps Script failed with ${response.status}`);
    }

    return true;
  };

  const normalizeAnswer = (answer = {}) => ({
    questionId: answer.questionId || '',
    questionNumber: answer.questionNumber ?? '',
    selectedOptionId: answer.selectedOptionId || '',
    selectedOptionLabel: answer.selectedOptionLabel || '',
    selectedAnswerText: answer.selectedAnswerText || '',
    correctOptionId: answer.correctOptionId || '',
    correctOptionLabel: answer.correctOptionLabel || '',
    correctAnswerText: answer.correctAnswerText || '',
    correct: answer.correct === true
  });

  const formatAnswerForExport = (answer) => {
    if (!answer) return '';
    const result = answer.correct ? 'Correct' : 'Incorrect';
    const label = answer.selectedOptionLabel || answer.selectedOptionId?.toUpperCase() || '';
    return `${label} - ${answer.selectedAnswerText || ''} (${result})`;
  };

  return {
    name: 'clm-trivia-analytics',
    configureServer(server) {
      server.middlewares.use('/api/trivia/answer', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk;
        });

        req.on('end', async () => {
          try {
            const event = rawBody ? JSON.parse(rawBody) : {};
            if (event.type !== 'complete') {
              sendJson(res, 200, { ok: true, persisted: false, ignored: true });
              return;
            }

            const answers = Array.isArray(event.answers)
              ? event.answers.slice(0, 4).map(normalizeAnswer)
              : [];
            const correctCount = Number.isFinite(Number(event.correctCount))
              ? Number(event.correctCount)
              : answers.filter((answer) => answer.correct).length;
            const nextEvent = {
              type: 'complete',
              language: event.language || '',
              languageLabel: event.languageLabel || event.language || '',
              answers,
              responseOne: event.responseOne || formatAnswerForExport(answers[0]),
              responseTwo: event.responseTwo || formatAnswerForExport(answers[1]),
              responseThree: event.responseThree || formatAnswerForExport(answers[2]),
              responseFour: event.responseFour || formatAnswerForExport(answers[3]),
              correctCount,
              totalQuestions: Number.isFinite(Number(event.totalQuestions)) ? Number(event.totalQuestions) : null,
              sessionId: event.sessionId || null,
              createdAt: event.createdAt || new Date().toISOString()
            };

            const forwarded = await forwardToAppsScript(nextEvent);

            await mkdir(path.dirname(dataPath), { recursive: true });
            const events = await readJsonFile(dataPath, []);
            events.push(nextEvent);
            await writeFile(dataPath, `${JSON.stringify(events, null, 2)}\n`, 'utf8');

            sendJson(res, 200, { ok: true, persisted: true, forwarded });
          } catch (error) {
            sendJson(res, 500, { error: error.message });
          }
        });
      });

      server.middlewares.use('/api/trivia/summary', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        if (appsScriptUrl) {
          try {
            const response = await fetch(appsScriptUrl, { method: 'GET', redirect: 'follow' });
            const payload = await response.json();
            sendJson(res, 200, { persisted: true, ...payload });
            return;
          } catch {
            // Fall back to the local JSON summary.
          }
        }

        const events = await readJsonFile(dataPath, []);
        const completionEvents = events.filter((event) => event.type === 'complete');
        const byDay = completionEvents.reduce((days, event) => {
          const day = String(event.createdAt || '').slice(0, 10) || 'unknown';
          days[day] = (days[day] || 0) + 1;
          return days;
        }, {});
        const byLanguage = completionEvents.reduce((languages, event) => {
          const key = event.languageLabel || event.language || 'unknown';
          languages[key] = (languages[key] || 0) + 1;
          return languages;
        }, {});

        sendJson(res, 200, {
          totalCompletions: completionEvents.length,
          byDay,
          byLanguage
        });
      });
    }
  };
}

let linktreeDb;

function getLinktreeDb() {
  if (linktreeDb) return linktreeDb;

  const dataDir = path.resolve(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'linktree.sqlite');
  const uploadsDir = path.join(dataDir, 'uploads');

  if (!existsSync(dataDir)) {
    throw new Error('The data directory is missing.');
  }

  const { DatabaseSync } = require('node:sqlite');
  linktreeDb = new DatabaseSync(dbPath);
  linktreeDb.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      bio TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'globe',
      position INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER,
      code TEXT NOT NULL,
      visited_at TEXT NOT NULL,
      language TEXT,
      browser TEXT,
      os TEXT,
      device TEXT,
      referrer TEXT,
      user_agent TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS link_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER,
      clicked_at TEXT NOT NULL,
      language TEXT,
      browser TEXT,
      os TEXT,
      device TEXT,
      referrer TEXT,
      user_agent TEXT,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE SET NULL
    );
  `);

  const now = new Date().toISOString();
  const profile = linktreeDb.prepare('SELECT id FROM profile WHERE id = 1').get();
  if (!profile) {
    linktreeDb.prepare(`
      INSERT INTO profile (id, display_name, subtitle, bio, avatar_url, updated_at)
      VALUES (1, ?, ?, ?, ?, ?)
    `).run(
      'Cambodia Landmine Museum',
      'Museum, relief center, and education for a safer Cambodia',
      'Learn, visit, donate, and help us share why landmines still matter today.',
      'https://www.cambodialandminemuseum.org/wp-content/uploads/2026/06/clmm-logo-white-450x147.png',
      now
    );
  }

  const linkCount = linktreeDb.prepare('SELECT COUNT(*) AS total FROM links').get().total;
  if (linkCount === 0) {
    [
      ['Plan your visit', 'https://www.cambodialandminemuseum.org/plan-your-visit/'],
      ['Buy museum tickets', 'https://www.cambodialandminemuseum.org/'],
      ['Donate', 'https://www.cambodialandminemuseum.org/donate/'],
      ['Instagram', 'https://www.instagram.com/cambodialandminemuseum/']
    ].forEach(([title, url], index) => {
      linktreeDb.prepare(`
        INSERT INTO links (title, url, icon, position, is_active, created_at, updated_at)
        VALUES (?, ?, 'globe', ?, 1, ?, ?)
      `).run(title, url, index + 1, now, now);
    });
  }

  const ensureOrganization = linktreeDb.prepare(`
    INSERT OR IGNORE INTO organizations (name, code, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  ensureOrganization.run('Hotel Angkor', '123', 'Example hotel for local QR tests.', now, now);

  for (let index = 1; index <= 50; index += 1) {
    const code = String(index).padStart(4, '0');
    ensureOrganization.run(`Organization ${index}`, code, 'Physical QR pending assignment.', now, now);
  }

  linktreeDb.prepare(`
    UPDATE organizations
    SET name = REPLACE(name, 'Organizacion', 'Organization'),
        notes = CASE
          WHEN notes = 'QR fisico pendiente de asignar.' THEN 'Physical QR pending assignment.'
          ELSE notes
        END
    WHERE name LIKE 'Organizacion %' OR notes = 'QR fisico pendiente de asignar.'
  `).run();

  mkdir(uploadsDir, { recursive: true }).catch(() => {});
  return linktreeDb;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getProfile(db) {
  return db.prepare('SELECT * FROM profile WHERE id = 1').get();
}

function getLinks(db, activeOnly = false) {
  return db.prepare(`
    SELECT
      links.id,
      links.title,
      links.url,
      links.icon,
      links.position,
      links.is_active,
      COUNT(link_clicks.id) AS click_count,
      MAX(link_clicks.clicked_at) AS last_click_at
    FROM links
    LEFT JOIN link_clicks ON link_clicks.link_id = links.id
    ${activeOnly ? 'WHERE is_active = 1' : ''}
    GROUP BY links.id
    ORDER BY links.position ASC, links.id ASC
  `).all();
}

function getOrganizations(db) {
  return db.prepare(`
    SELECT
      organizations.*,
      COUNT(visits.id) AS visit_count,
      MAX(visits.visited_at) AS last_visit_at
    FROM organizations
    LEFT JOIN visits ON visits.organization_id = organizations.id
    GROUP BY organizations.id
    ORDER BY organizations.created_at DESC
  `).all();
}

function getVisits(db) {
  return db.prepare(`
    SELECT
      visits.*,
      organizations.name AS organization_name
    FROM visits
    LEFT JOIN organizations ON organizations.id = visits.organization_id
    ORDER BY visits.visited_at DESC
    LIMIT 500
  `).all();
}

function parseVisitor(req) {
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
    referrer: req.headers.referer || '',
    userAgent
  };
}

function linktreePlugin() {
  const uploadsDir = path.resolve(process.cwd(), 'data/uploads');

  return {
    name: 'clm-linktree-local',
    configureServer(server) {
      server.middlewares.use('/uploads', async (req, res) => {
        const requested = decodeURIComponent((req.url || '').replace(/^\//, ''));
        const safeName = path.basename(requested);
        const filePath = path.join(uploadsDir, safeName);

        if (!safeName || !existsSync(filePath)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
        res.setHeader('Content-Type', type);
        createReadStream(filePath).pipe(res);
      });

      server.middlewares.use('/api/linktree/login', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const valid = body.email === 'landminemuseum89@gmail.com' && body.password === 'aki123';
          sendJson(res, valid ? 200 : 401, valid ? { ok: true } : { error: 'Incorrect user or password' });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/public', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const db = getLinktreeDb();
          const requestUrl = new URL(req.url || '/', 'http://localhost');
          const code = requestUrl.searchParams.get('variable') || '';
          let trackedOrganization = null;

          if (code) {
            trackedOrganization = db.prepare('SELECT id, name, code FROM organizations WHERE code = ?').get(code) || null;
            const visitor = parseVisitor(req);
            db.prepare(`
              INSERT INTO visits (organization_id, code, visited_at, language, browser, os, device, referrer, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              trackedOrganization?.id || null,
              code,
              new Date().toISOString(),
              visitor.language,
              visitor.browser,
              visitor.os,
              visitor.device,
              visitor.referrer,
              visitor.userAgent
            );
          }

          sendJson(res, 200, {
            profile: getProfile(db),
            links: getLinks(db, true),
            trackedOrganization
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/admin', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const db = getLinktreeDb();
          sendJson(res, 200, {
            profile: getProfile(db),
            links: getLinks(db),
            organizations: getOrganizations(db),
            visits: getVisits(db)
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/profile', async (req, res) => {
        if (req.method !== 'PUT') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const db = getLinktreeDb();
          db.prepare(`
            UPDATE profile
            SET display_name = ?, subtitle = ?, bio = ?, avatar_url = ?, updated_at = ?
            WHERE id = 1
          `).run(
            String(body.display_name || '').trim() || 'Cambodia Landmine Museum',
            String(body.subtitle || '').trim(),
            String(body.bio || '').trim(),
            String(body.avatar_url || '').trim(),
            new Date().toISOString()
          );
          sendJson(res, 200, { ok: true, profile: getProfile(db) });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/profile-image', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const match = String(body.imageData || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
          if (!match) {
            sendJson(res, 400, { error: 'Unsupported image format' });
            return;
          }

          await mkdir(uploadsDir, { recursive: true });
          const mime = match[1];
          const extension = mime === 'image/jpeg' ? 'jpg' : mime.replace('image/', '');
          const fileName = `profile-${Date.now()}.${extension}`;
          const filePath = path.join(uploadsDir, fileName);
          await writeFile(filePath, Buffer.from(match[2], 'base64'));

          const avatarUrl = `/uploads/${fileName}`;
          const db = getLinktreeDb();
          db.prepare('UPDATE profile SET avatar_url = ?, updated_at = ? WHERE id = 1').run(avatarUrl, new Date().toISOString());
          sendJson(res, 200, { ok: true, avatar_url: avatarUrl });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/link-click', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const db = getLinktreeDb();
          const link = db.prepare('SELECT id FROM links WHERE id = ?').get(Number(body.id));
          if (!link) {
            sendJson(res, 404, { error: 'Button not found' });
            return;
          }

          const visitor = parseVisitor(req);
          db.prepare(`
            INSERT INTO link_clicks (link_id, clicked_at, language, browser, os, device, referrer, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            link.id,
            new Date().toISOString(),
            visitor.language,
            visitor.browser,
            visitor.os,
            visitor.device,
            visitor.referrer,
            visitor.userAgent
          );

          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/link/delete', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const db = getLinktreeDb();
          db.prepare('DELETE FROM links WHERE id = ?').run(Number(body.id));
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/link', async (req, res) => {
        if (!['POST', 'PUT'].includes(req.method)) {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const db = getLinktreeDb();
          const now = new Date().toISOString();
          const title = String(body.title || '').trim();
          const url = String(body.url || '').trim();

          if (!title || !url) {
            sendJson(res, 400, { error: 'Missing title or URL' });
            return;
          }

          if (req.method === 'POST') {
            const nextPosition = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM links').get().position;
            db.prepare(`
              INSERT INTO links (title, url, icon, position, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(title, url, body.icon || 'globe', nextPosition, body.is_active ? 1 : 0, now, now);
          } else {
            const current = db.prepare('SELECT position FROM links WHERE id = ?').get(Number(body.id));
            const nextPosition = Number.isFinite(Number(body.position)) ? Number(body.position) : current?.position || 0;
            db.prepare(`
              UPDATE links
              SET title = ?, url = ?, icon = ?, position = ?, is_active = ?, updated_at = ?
              WHERE id = ?
            `).run(title, url, body.icon || 'globe', nextPosition, body.is_active ? 1 : 0, now, Number(body.id));
          }

          sendJson(res, 200, { ok: true, links: getLinks(db) });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/organization/delete', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const db = getLinktreeDb();
          db.prepare('DELETE FROM organizations WHERE id = ?').run(Number(body.id));
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/organization', async (req, res) => {
        if (!['POST', 'PUT'].includes(req.method)) {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const db = getLinktreeDb();
          const now = new Date().toISOString();
          const name = String(body.name || '').trim();
          const code = String(body.code || '').trim();
          const notes = String(body.notes || '').trim();

          if (!name || !code) {
            sendJson(res, 400, { error: 'Missing name or code' });
            return;
          }

          if (req.method === 'POST') {
            db.prepare(`
              INSERT INTO organizations (name, code, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(name, code, notes, now, now);
          } else {
            db.prepare(`
              UPDATE organizations
              SET name = ?, code = ?, notes = ?, updated_at = ?
              WHERE id = ?
            `).run(name, code, notes, now, Number(body.id));
          }

          sendJson(res, 200, { ok: true, organizations: getOrganizations(db) });
        } catch (error) {
          if (String(error.message).includes('UNIQUE')) {
            sendJson(res, 409, { error: 'That code already exists' });
            return;
          }
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/linktree/qr', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const requestUrl = new URL(req.url || '/', 'http://localhost');
          const code = requestUrl.searchParams.get('code') || '';
          const origin = requestUrl.searchParams.get('origin') || `http://${req.headers.host}`;
          if (!code) {
            sendJson(res, 400, { error: 'Missing code' });
            return;
          }

          const targetUrl = `${origin}/?variable=${encodeURIComponent(code)}`;
          const png = await QRCode.toBuffer(targetUrl, {
            type: 'png',
            width: 1080,
            margin: 2,
            color: {
              dark: '#121212',
              light: '#fffaf2'
            }
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Content-Disposition', `attachment; filename="qr-${code}.png"`);
          res.end(png);
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), brevoPreviewPlugin(mode), triviaAnalyticsPlugin(), linktreePlugin()],
  server: {
    allowedHosts: ['f44f-96-9-84-195.ngrok-free.app']
  }
}));
