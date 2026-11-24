import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const token = (process.env.TMDB_API_READ_ACCESS_TOKEN || '').trim().replace(/^Bearer\s+/i, '');

function normalizeSupabaseUrl(raw: string | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';
  return value.replace(/\/(rest|auth|storage|realtime|functions)\/v1\/?.*$/i, '').replace(/\/+$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

const envAdminSessionSecret = (process.env.ADMIN_SESSION_SECRET || '').trim();
const envAdminPasscode = (process.env.ADMIN_PASSCODE || '').trim();
const envAdminEmails = (process.env.ADMIN_EMAILS || '')
  .replace(/^['"]|['"]$/g, '')
  .split(/[,;\s]+/)
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// In-memory claimed passcode hash when ADMIN_PASSCODE is unset
let claimedPasscodeSalt = '';
let claimedPasscodeHash = '';

// Per-IP brute-force protection for admin login/bootstrap (max 5 failed attempts / 15 min)
const adminLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: express.Request): string {
  const fwd = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '';
  return fwd || req.ip || 'unknown';
}

function checkAdminRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = adminLoginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedAdminAttempt(ip: string) {
  const now = Date.now();
  const entry = adminLoginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    adminLoginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

function clearAdminAttempts(ip: string) {
  adminLoginAttempts.delete(ip);
}

function hashPasscode(passcode: string, salt: string): Buffer {
  return crypto.scryptSync(passcode, salt, 64);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function verifyPasscode(input: string): boolean {
  if (envAdminPasscode) {
    return timingSafeStringEqual(input, envAdminPasscode);
  }
  if (claimedPasscodeHash && claimedPasscodeSalt) {
    const derived = hashPasscode(input, claimedPasscodeSalt);
    const stored = Buffer.from(claimedPasscodeHash, 'hex');
    return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
  }
  return false;
}

function signAdminToken(subject: string): string | null {
  if (!envAdminSessionSecret) return null;
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({
      typ: 'aurora-admin',
      sub: subject,
      role: 'admin',
      iat: now,
      exp: now + 12 * 60 * 60 * 1000
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', envAdminSessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(bearer: string): { sub: string; role: string } | null {
  if (!envAdminSessionSecret) return null;
  const parts = bearer.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', envAdminSessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      decoded?.typ !== 'aurora-admin' ||
      decoded?.role !== 'admin' ||
      typeof decoded?.sub !== 'string' ||
      !decoded.sub ||
      typeof decoded?.exp !== 'number' ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp <= Date.now()
    ) {
      return null;
    }
    if (envAdminEmails.length > 0 && !envAdminEmails.includes(decoded.sub.toLowerCase())) {
      return null;
    }
    return { sub: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

async function verifySupabaseAdmin(accessToken: string): Promise<{ authorized: boolean; email?: string; userId?: string }> {
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) return { authorized: false };
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!userRes.ok) return { authorized: false };
    const user = (await userRes.json()) as {
      id?: string;
      email?: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
    };
    const email = (user.email || '').trim().toLowerCase();
    const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
    if (!email || !isConfirmed) return { authorized: false, email };

    if (envAdminEmails.length > 0) {
      return {
        authorized: envAdminEmails.includes(email),
        email,
        userId: user.id
      };
    }

    if (user.id) {
      const roleRes = await fetch(
        `${supabaseUrl}/rest/v1/admin_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`
          },
          signal: AbortSignal.timeout(5000)
        }
      );
      if (roleRes.ok) {
        const rows = (await roleRes.json()) as Array<{ role?: string }>;
        if (Array.isArray(rows) && rows.some(r => r.role === 'admin' || r.role === 'moderator')) {
          return { authorized: true, email, userId: user.id };
        }
      }
    }
    return { authorized: false, email };
  } catch {
    return { authorized: false };
  }
}

function extractBearer(req: express.Request): string {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!envAdminSessionSecret) {
    res.status(503).json({ error: 'Admin session verification is unavailable: ADMIN_SESSION_SECRET is not configured' });
    return;
  }
  const bearer = extractBearer(req);
  if (!bearer) {
    res.status(401).json({ error: 'Administrator authorization required' });
    return;
  }
  const hmacUser = verifyAdminToken(bearer);
  if (hmacUser) {
    (req as any).adminActor = hmacUser.sub;
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden: valid signed administrator session required' });
}

function isAllowedMediaHost(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return false;
    return host === 'archive.org' || host.endsWith('.archive.org') || host === 'tile.loc.gov';
  } catch {
    return false;
  }
}

// Lightweight server-side store for admin-curated sources, featured config, reports, and analytics
type AdminCuratedSource = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  description: string;
  itemUrl: string;
  videoUrl: string;
  playerType: 'mp4' | 'hls' | 'embed';
  provider: string;
  rightsLabel: string;
  rightsUrl: string;
  rightsNote: string;
  attribution: string;
  runtimeSeconds: number;
  contentType: 'feature' | 'short';
  posterPath?: string;
  subtitles?: { label: string; lang: string; url: string }[];
  featured?: boolean;
  active: boolean;
  updatedAt: string;
};

type ContentReportRecord = {
  id: string;
  targetType: 'title' | 'review' | 'source';
  targetId: string;
  reason: string;
  reporter: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
};

const adminSources: AdminCuratedSource[] = [];
const contentReports: ContentReportRecord[] = [];
let featuredConfig: {
  heroTmdbIds: number[];
  curatedShelfTitle: string;
  disabledSourceIds: string[];
} = {
  heroTmdbIds: [],
  curatedShelfTitle: 'Watch full movies free',
  disabledSourceIds: []
};

const analyticsCounters = {
  playbackStarts: 0,
  playbackCompletions: 0,
  searches: 0,
  detailViews: 0,
  recentEvents: [] as { type: string; label: string; at: string }[]
};

// In-memory TMDB response cache (5 minute TTL, max 200 entries)
const tmdbCache = new Map<string, { expires: number; status: number; body: any }>();

app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    tmdbConfigured: Boolean(token),
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey)
  })
);

app.get('/api/config', (_req, res) =>
  res.json({
    supabaseUrl,
    supabaseAnonKey
  })
);

app.get('/api/sources', (_req, res) => {
  res.json({
    sources: adminSources.filter(s => s.active),
    featuredConfig
  });
});

app.post('/api/analytics/event', (req, res) => {
  const type = typeof req.body?.type === 'string' ? req.body.type.slice(0, 40) : '';
  const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 120) : '';
  if (type === 'play_start') analyticsCounters.playbackStarts++;
  else if (type === 'play_complete') analyticsCounters.playbackCompletions++;
  else if (type === 'search') analyticsCounters.searches++;
  else if (type === 'detail_view') analyticsCounters.detailViews++;
  if (type) {
    analyticsCounters.recentEvents = [
      { type, label, at: new Date().toISOString() },
      ...analyticsCounters.recentEvents
    ].slice(0, 25);
  }
  res.json({ ok: true });
});

app.post('/api/reports', (req, res) => {
  const targetType = req.body?.targetType;
  const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim().slice(0, 120) : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  const reporter = typeof req.body?.reporter === 'string' ? req.body.reporter.trim().slice(0, 120) : 'guest';
  if (!['title', 'review', 'source'].includes(targetType) || !targetId || reason.length < 3) {
    res.status(400).json({ error: 'Valid targetType, targetId, and reason (min 3 chars) are required' });
    return;
  }
  const report: ContentReportRecord = {
    id: crypto.randomUUID(),
    targetType,
    targetId,
    reason,
    reporter,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  contentReports.unshift(report);
  res.status(201).json({ ok: true, report });
});

// Admin authentication & bootstrap status
app.get('/api/admin/status', async (req, res) => {
  const adminBearer = typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'].trim() : '';
  const authBearer = extractBearer(req);

  let authenticated = false;
  let actor = '';
  let emailAuthorized = false;
  let signedInEmail = '';

  const candidateAdminToken = adminBearer || (verifyAdminToken(authBearer) ? authBearer : '');
  if (candidateAdminToken) {
    const hmac = verifyAdminToken(candidateAdminToken);
    if (hmac) {
      authenticated = true;
      actor = hmac.sub;
    }
  }

  if (authBearer && !verifyAdminToken(authBearer)) {
    const sb = await verifySupabaseAdmin(authBearer);
    signedInEmail = sb.email || '';
    emailAuthorized = sb.authorized;
  }

  res.json({
    authenticated,
    actor,
    emailAuthorized,
    signedInEmail,
    envPasscodeConfigured: Boolean(envAdminPasscode),
    adminEmailsConfigured: envAdminEmails.length > 0,
    sessionSecretConfigured: Boolean(envAdminSessionSecret),
    needsBootstrap: !envAdminPasscode && !claimedPasscodeHash
  });
});

app.post('/api/admin/session', async (req, res) => {
  if (!envAdminSessionSecret) {
    res.status(503).json({ error: 'ADMIN_SESSION_SECRET is not configured on the server' });
    return;
  }
  if (envAdminPasscode || claimedPasscodeHash) {
    res.status(400).json({ error: 'Administrator passcode verification is required' });
    return;
  }
  const sbToken = extractBearer(req);
  const sb = await verifySupabaseAdmin(sbToken);
  if (!sb.authorized || !sb.email) {
    res.status(403).json({ error: 'Your account email is not authorized for administrator access' });
    return;
  }
  const signed = signAdminToken(sb.email);
  if (!signed) {
    res.status(503).json({ error: 'Could not issue signed admin session' });
    return;
  }
  res.json({ ok: true, token: signed, actor: sb.email });
});

app.post('/api/admin/bootstrap', async (req, res) => {
  if (!envAdminSessionSecret) {
    res.status(503).json({ error: 'ADMIN_SESSION_SECRET is not configured on the server' });
    return;
  }
  if (envAdminPasscode || claimedPasscodeHash) {
    res.status(409).json({ error: 'Admin passcode is already configured' });
    return;
  }
  const ip = getClientIp(req);
  const rl = checkAdminRateLimit(ip);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    return;
  }
  let subject = 'admin-passcode';
  if (envAdminEmails.length > 0) {
    const sb = await verifySupabaseAdmin(extractBearer(req));
    if (!sb.authorized || !sb.email) {
      recordFailedAdminAttempt(ip);
      res.status(403).json({ error: 'Sign in with a verified email listed in ADMIN_EMAILS first' });
      return;
    }
    subject = sb.email;
  }
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (passcode.length < 8) {
    recordFailedAdminAttempt(ip);
    res.status(400).json({ error: 'Choose an admin passcode with at least 8 characters' });
    return;
  }
  claimedPasscodeSalt = crypto.randomBytes(16).toString('hex');
  claimedPasscodeHash = hashPasscode(passcode, claimedPasscodeSalt).toString('hex');
  clearAdminAttempts(ip);
  const adminToken = signAdminToken(subject);
  if (!adminToken) {
    res.status(503).json({ error: 'Could not issue signed admin session' });
    return;
  }
  res.status(201).json({ ok: true, token: adminToken, actor: subject });
});

app.post('/api/admin/login', async (req, res) => {
  if (!envAdminSessionSecret) {
    res.status(503).json({ error: 'ADMIN_SESSION_SECRET is not configured on the server' });
    return;
  }
  const ip = getClientIp(req);
  const rl = checkAdminRateLimit(ip);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    return;
  }

  let subject = 'admin-passcode';
  if (envAdminEmails.length > 0) {
    const sbToken = extractBearer(req);
    if (!sbToken) {
      res.status(401).json({ error: 'Sign in with an authorized email listed in ADMIN_EMAILS first' });
      return;
    }
    const sb = await verifySupabaseAdmin(sbToken);
    if (!sb.authorized || !sb.email) {
      recordFailedAdminAttempt(ip);
      res.status(403).json({ error: 'Forbidden: only verified emails listed in ADMIN_EMAILS can access the admin dashboard' });
      return;
    }
    subject = sb.email;
  }

  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (!passcode || !verifyPasscode(passcode)) {
    recordFailedAdminAttempt(ip);
    res.status(401).json({ error: 'Invalid administrator passcode' });
    return;
  }

  clearAdminAttempts(ip);
  const adminToken = signAdminToken(subject);
  if (!adminToken) {
    res.status(503).json({ error: 'Could not issue signed admin session' });
    return;
  }
  res.json({ ok: true, token: adminToken, actor: subject });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  res.json({
    analytics: analyticsCounters,
    customSourcesCount: adminSources.length,
    activeCustomSourcesCount: adminSources.filter(s => s.active).length,
    disabledBuiltinCount: featuredConfig.disabledSourceIds.length,
    openReportsCount: contentReports.filter(r => r.status === 'open').length,
    totalReportsCount: contentReports.length,
    featuredConfig,
    configHealth: {
      adminPasscodeConfigured: Boolean(envAdminPasscode),
      adminPasscodeLengthOk: envAdminPasscode.length >= 8,
      adminEmailsConfigured: envAdminEmails.length > 0,
      adminEmailsCount: envAdminEmails.length,
      adminSessionSecretConfigured: Boolean(envAdminSessionSecret),
      adminSessionSecretStrong: envAdminSessionSecret.length >= 32,
      tmdbConfigured: Boolean(token),
      supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey)
    }
  });
});

app.get('/api/admin/sources', requireAdmin, (_req, res) => {
  res.json({ sources: adminSources, featuredConfig });
});

app.post('/api/admin/sources', requireAdmin, (req, res) => {
  const body = req.body || {};
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : crypto.randomUUID().slice(0, 12);
  const titleVal = typeof body.title === 'string' ? body.title.trim() : '';
  const year = Number(body.year);
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const itemUrl = typeof body.itemUrl === 'string' ? body.itemUrl.trim() : '';
  const rightsUrl = typeof body.rightsUrl === 'string' ? body.rightsUrl.trim() : '';
  const runtimeSeconds = Number(body.runtimeSeconds);

  if (!titleVal || !Number.isInteger(year) || year < 1888 || !isAllowedMediaHost(videoUrl) || !itemUrl.startsWith('http') || !rightsUrl.startsWith('http') || !Number.isFinite(runtimeSeconds) || runtimeSeconds <= 0) {
    res.status(400).json({ error: 'Valid title, year, runtimeSeconds, itemUrl, rightsUrl, and HTTPS archive.org / tile.loc.gov videoUrl are required' });
    return;
  }

  const record: AdminCuratedSource = {
    id,
    tmdbId: Number.isInteger(Number(body.tmdbId)) && Number(body.tmdbId) > 0 ? Number(body.tmdbId) : undefined,
    title: titleVal,
    year,
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : `${titleVal} (${year})`,
    itemUrl,
    videoUrl,
    playerType: body.playerType === 'hls' ? 'hls' : body.playerType === 'embed' ? 'embed' : 'mp4',
    provider: typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : 'Internet Archive',
    rightsLabel: typeof body.rightsLabel === 'string' && body.rightsLabel.trim() ? body.rightsLabel.trim() : 'Public Domain / Open License',
    rightsUrl,
    rightsNote: typeof body.rightsNote === 'string' && body.rightsNote.trim() ? body.rightsNote.trim() : 'Verified by Aurora administrator.',
    attribution: typeof body.attribution === 'string' && body.attribution.trim() ? body.attribution.trim() : `${titleVal} (${year})`,
    runtimeSeconds: Math.round(runtimeSeconds),
    contentType: body.contentType === 'short' ? 'short' : 'feature',
    posterPath: typeof body.posterPath === 'string' && body.posterPath.trim() ? body.posterPath.trim() : undefined,
    subtitles: Array.isArray(body.subtitles)
      ? body.subtitles.filter((s: any) => s?.label && s?.lang && isAllowedMediaHost(s?.url))
      : [],
    featured: Boolean(body.featured),
    active: body.active !== false,
    updatedAt: new Date().toISOString()
  };

  const existingIdx = adminSources.findIndex(s => s.id === id);
  if (existingIdx >= 0) adminSources[existingIdx] = record;
  else adminSources.unshift(record);

  res.status(201).json({ ok: true, source: record });
});

app.put('/api/admin/sources/:id', requireAdmin, (req, res) => {
  const idx = adminSources.findIndex(s => s.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Custom source not found' });
    return;
  }
  const current = adminSources[idx];
  const body = req.body || {};
  if (body.videoUrl && !isAllowedMediaHost(body.videoUrl)) {
    res.status(400).json({ error: 'videoUrl must be an HTTPS URL on archive.org or tile.loc.gov' });
    return;
  }
  adminSources[idx] = {
    ...current,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title,
    active: typeof body.active === 'boolean' ? body.active : current.active,
    featured: typeof body.featured === 'boolean' ? body.featured : current.featured,
    videoUrl: typeof body.videoUrl === 'string' && body.videoUrl.trim() ? body.videoUrl.trim() : current.videoUrl,
    updatedAt: new Date().toISOString()
  };
  res.json({ ok: true, source: adminSources[idx] });
});

app.delete('/api/admin/sources/:id', requireAdmin, (req, res) => {
  const idx = adminSources.findIndex(s => s.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Custom source not found' });
    return;
  }
  adminSources.splice(idx, 1);
  res.json({ ok: true });
});

app.get('/api/admin/featured', requireAdmin, (_req, res) => {
  res.json({ featuredConfig });
});

app.put('/api/admin/featured', requireAdmin, (req, res) => {
  const heroTmdbIds = Array.isArray(req.body?.heroTmdbIds)
    ? req.body.heroTmdbIds.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 10)
    : featuredConfig.heroTmdbIds;
  const curatedShelfTitle = typeof req.body?.curatedShelfTitle === 'string' && req.body.curatedShelfTitle.trim()
    ? req.body.curatedShelfTitle.trim().slice(0, 60)
    : featuredConfig.curatedShelfTitle;
  const disabledSourceIds = Array.isArray(req.body?.disabledSourceIds)
    ? req.body.disabledSourceIds.filter((s: any) => typeof s === 'string')
    : featuredConfig.disabledSourceIds;
  featuredConfig = { heroTmdbIds, curatedShelfTitle, disabledSourceIds };
  res.json({ ok: true, featuredConfig });
});

app.get('/api/admin/reports', requireAdmin, (_req, res) => {
  res.json({ reports: contentReports });
});

app.patch('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const report = contentReports.find(r => r.id === req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  const status = req.body?.status;
  if (!['open', 'resolved', 'dismissed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  report.status = status;
  res.json({ ok: true, report });
});

// TMDB Proxy with TTL cache
app.get('/api/tmdb/*', (req, res, next) => {
  if (!token) {
    res.status(503).json({ error: 'TMDB API token is not configured' });
    return;
  }
  const params = req.params as unknown as Record<string, string | string[]>;
  const rawPath = params['0'];
  const tail = Array.isArray(rawPath) ? rawPath.join('/') : rawPath || '';
  const allowed = /^(trending\/(movie|tv|all)\/(day|week)|movie\/(popular|now_playing|top_rated|upcoming)|tv\/(popular|top_rated|on_the_air|airing_today)|discover\/(movie|tv)|search\/(movie|tv|multi|person)|movie\/\d+(\/(credits|videos|recommendations|similar|watch\/providers|release_dates))?|tv\/\d+(\/(credits|videos|recommendations|similar|watch\/providers|content_ratings|season\/\d+))?|person\/popular|person\/\d+|genre\/(movie|tv)\/list)$/.test(tail);
  if (!allowed) {
    res.status(400).json({ error: 'Unsupported TMDB endpoint' });
    return;
  }
  const url = new URL(`https://api.themoviedb.org/3/${tail}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  const cacheKey = url.toString();
  const cached = tmdbCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.status(cached.status).json(cached.body);
    return;
  }
  fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } })
    .then(async r => {
      const data = await r.json();
      if (r.ok) {
        if (tmdbCache.size >= 200) {
          const oldestKey = tmdbCache.keys().next().value;
          if (oldestKey) tmdbCache.delete(oldestKey);
        }
        tmdbCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, status: r.status, body: data });
      }
      res.status(r.status).json(data);
    })
    .catch(next);
});

app.get('/api/free-films/verify', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) {
    res.status(400).json({ ok: false, error: 'Missing url parameter' });
    return;
  }
  if (!isAllowedMediaHost(rawUrl)) {
    res.status(403).json({ ok: false, error: 'Source host is not in the verified archive allowlist' });
    return;
  }
  try {
    const upstream = await fetch(rawUrl, { method: 'HEAD', redirect: 'follow' });
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    const acceptRanges = upstream.headers.get('accept-ranges') || '';
    const isMedia =
      contentType.startsWith('video/') ||
      contentType.includes('mp4') ||
      contentType.includes('mpegurl') ||
      rawUrl.toLowerCase().includes('.m3u8');
    res.json({
      ok: upstream.ok && isMedia,
      status: upstream.status,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : 0,
      acceptRanges
    });
  } catch {
    res.status(502).json({ ok: false, error: 'Could not reach video source' });
  }
});

app.get('/api/subtitles', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl || !isAllowedMediaHost(rawUrl)) {
    res.status(403).json({ error: 'Subtitle host is not in the allowlist' });
    return;
  }
  try {
    const upstream = await fetch(rawUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      res.status(upstream.status).send('Subtitle unavailable');
      return;
    }
    const text = await upstream.text();
    const vtt = text.trimStart().startsWith('WEBVTT')
      ? text
      : 'WEBVTT\n\n' + text.replace(/\r\n/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(vtt);
  } catch {
    res.status(502).send('Could not load subtitle');
  }
});

app.all('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

function start() {
  const root = path.resolve(__dirname, '../dist');
  app.use(express.static(root));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  app.listen(port, '0.0.0.0', () => console.log(`Aurora listening on ${port}`));
}

start();
