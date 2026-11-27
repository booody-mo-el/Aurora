import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
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
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const dataFilePath = process.env.AURORA_DATA_FILE
  ? path.resolve(process.env.AURORA_DATA_FILE)
  : path.resolve(__dirname, '../data/aurora-store.json');

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
    return (
      host === 'archive.org' ||
      host.endsWith('.archive.org') ||
      host === 'tile.loc.gov' ||
      host === 'test-streams.mux.dev' ||
      host === 'download.blender.org' ||
      host === 'commons.wikimedia.org' ||
      host === 'upload.wikimedia.org'
    );
  } catch {
    return false;
  }
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizePosterPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const val = raw.trim();
  if (!val) return undefined;
  if (val.startsWith('/') && !val.startsWith('//') && /^\/[a-zA-Z0-9_.\-/]+$/.test(val)) return val;
  if (val.startsWith('https://image.tmdb.org/')) return val;
  return undefined;
}

const reportAttempts = new Map<string, { count: number; resetAt: number }>();
function checkReportRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = reportAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    reportAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count += 1;
  return true;
}

// Persistent store for admin-curated sources, featured config, reports, and analytics
type AdminCuratedSource = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  description: string;
  itemUrl: string;
  videoUrl: string;
  fallbackUrls?: string[];
  qualitySources?: { label: string; url: string }[];
  playerType: 'mp4' | 'hls' | 'embed';
  provider: string;
  rightsLabel: string;
  rightsUrl: string;
  rightsNote: string;
  attribution: string;
  runtimeSeconds: number;
  completeness?: 'complete' | 'incomplete';
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

type FeaturedConfig = {
  heroTmdbIds: number[];
  curatedShelfTitle: string;
  disabledSourceIds: string[];
};

type AnalyticsCounters = {
  playbackStarts: number;
  playbackCompletions: number;
  searches: number;
  detailViews: number;
  recentEvents: { type: string; label: string; at: string }[];
};

type StoreSnapshot = {
  adminSources: AdminCuratedSource[];
  contentReports: ContentReportRecord[];
  featuredConfig: FeaturedConfig;
  analyticsCounters: AnalyticsCounters;
};

let adminSources: AdminCuratedSource[] = [];
let contentReports: ContentReportRecord[] = [];
let featuredConfig: FeaturedConfig = {
  heroTmdbIds: [],
  curatedShelfTitle: 'Watch full movies free',
  disabledSourceIds: []
};
let analyticsCounters: AnalyticsCounters = {
  playbackStarts: 0,
  playbackCompletions: 0,
  searches: 0,
  detailViews: 0,
  recentEvents: []
};
let supabaseTablesReady = false;

function loadStoreFromDisk() {
  try {
    if (!fs.existsSync(dataFilePath)) return;
    const raw = fs.readFileSync(dataFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreSnapshot>;
    if (Array.isArray(parsed.adminSources)) adminSources = parsed.adminSources;
    if (Array.isArray(parsed.contentReports)) contentReports = parsed.contentReports;
    if (parsed.featuredConfig && typeof parsed.featuredConfig === 'object') {
      featuredConfig = {
        heroTmdbIds: Array.isArray(parsed.featuredConfig.heroTmdbIds) ? parsed.featuredConfig.heroTmdbIds : [],
        curatedShelfTitle: typeof parsed.featuredConfig.curatedShelfTitle === 'string' && parsed.featuredConfig.curatedShelfTitle
          ? parsed.featuredConfig.curatedShelfTitle
          : 'Watch full movies free',
        disabledSourceIds: Array.isArray(parsed.featuredConfig.disabledSourceIds) ? parsed.featuredConfig.disabledSourceIds : []
      };
    }
    if (parsed.analyticsCounters && typeof parsed.analyticsCounters === 'object') {
      analyticsCounters = {
        playbackStarts: Number(parsed.analyticsCounters.playbackStarts) || 0,
        playbackCompletions: Number(parsed.analyticsCounters.playbackCompletions) || 0,
        searches: Number(parsed.analyticsCounters.searches) || 0,
        detailViews: Number(parsed.analyticsCounters.detailViews) || 0,
        recentEvents: Array.isArray(parsed.analyticsCounters.recentEvents) ? parsed.analyticsCounters.recentEvents.slice(0, 25) : []
      };
    }
  } catch (err) {
    console.warn('Could not load Aurora local persistent store:', err instanceof Error ? err.message : 'unknown error');
  }
}

function saveStoreToDisk() {
  try {
    const dir = path.dirname(dataFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${dataFilePath}.tmp`;
    const snapshot: StoreSnapshot = {
      adminSources,
      contentReports,
      featuredConfig,
      analyticsCounters
    };
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmpPath, dataFilePath);
  } catch (err) {
    console.warn('Could not save Aurora local persistent store:', err instanceof Error ? err.message : 'unknown error');
  }
}

async function sbAdminFetch(restPath: string, init: RequestInit = {}) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  const headers = new Headers(init.headers);
  headers.set('apikey', supabaseServiceRoleKey);
  headers.set('Authorization', `Bearer ${supabaseServiceRoleKey}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${supabaseUrl}/rest/v1/${restPath}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(6000)
  });
}

async function hydrateStoreFromSupabase() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;
  try {
    const [srcRes, setRes, repRes, anaRes] = await Promise.all([
      sbAdminFetch('curated_sources?select=*&order=updated_at.desc'),
      sbAdminFetch('site_settings?key=eq.featured_config&select=value'),
      sbAdminFetch('content_reports?select=*&order=created_at.desc&limit=200'),
      sbAdminFetch('analytics_counters?id=eq.global&select=*')
    ]);
    if (srcRes?.ok) {
      supabaseTablesReady = true;
      const rows = (await srcRes.json()) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        adminSources = rows.map(r => ({
          id: r.id,
          tmdbId: r.tmdb_id ?? undefined,
          title: r.title,
          year: r.year,
          description: r.description,
          itemUrl: r.item_url,
          videoUrl: r.video_url,
          fallbackUrls: Array.isArray(r.fallback_urls) ? r.fallback_urls : [],
          qualitySources: Array.isArray(r.quality_sources) ? r.quality_sources : [],
          playerType: r.stream_type || 'mp4',
          provider: r.provider,
          rightsLabel: r.rights_label,
          rightsUrl: r.rights_url,
          rightsNote: r.rights_note,
          attribution: r.attribution,
          runtimeSeconds: r.runtime_seconds,
          completeness: r.completeness === 'incomplete' ? 'incomplete' : 'complete',
          contentType: r.content_type || 'feature',
          posterPath: r.poster_path ?? undefined,
          subtitles: Array.isArray(r.subtitles) ? r.subtitles : [],
          featured: Boolean(r.featured),
          active: r.active !== false,
          updatedAt: r.updated_at || new Date().toISOString()
        }));
      }
    }
    if (setRes?.ok) {
      const rows = (await setRes.json()) as any[];
      if (Array.isArray(rows) && rows[0]?.value) {
        const val = rows[0].value;
        featuredConfig = {
          heroTmdbIds: Array.isArray(val.heroTmdbIds) ? val.heroTmdbIds : [],
          curatedShelfTitle: typeof val.curatedShelfTitle === 'string' && val.curatedShelfTitle ? val.curatedShelfTitle : 'Watch full movies free',
          disabledSourceIds: Array.isArray(val.disabledSourceIds) ? val.disabledSourceIds : []
        };
      }
    }
    if (repRes?.ok) {
      const rows = (await repRes.json()) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        contentReports = rows.map(r => ({
          id: String(r.id),
          targetType: r.target_type,
          targetId: r.target_id,
          reason: r.reason,
          reporter: r.reporter_label || r.reporter_id || 'guest',
          status: r.status || 'open',
          createdAt: r.created_at || new Date().toISOString()
        }));
      }
    }
    if (anaRes?.ok) {
      const rows = (await anaRes.json()) as any[];
      if (Array.isArray(rows) && rows[0]) {
        const a = rows[0];
        analyticsCounters = {
          playbackStarts: Number(a.playback_starts) || 0,
          playbackCompletions: Number(a.playback_completions) || 0,
          searches: Number(a.searches) || 0,
          detailViews: Number(a.detail_views) || 0,
          recentEvents: Array.isArray(a.recent_events) ? a.recent_events.slice(0, 25) : []
        };
      }
    }
    saveStoreToDisk();
  } catch {
    // Keep local persistent store if Supabase schema is not yet applied
  }
}

async function syncSourceToSupabase(record: AdminCuratedSource) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;
  try {
    const r = await sbAdminFetch('curated_sources?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: record.id,
        tmdb_id: record.tmdbId ?? null,
        title: record.title,
        year: record.year,
        description: record.description,
        item_url: record.itemUrl,
        video_url: record.videoUrl,
        stream_type: record.playerType,
        provider: record.provider,
        rights_label: record.rightsLabel,
        rights_url: record.rightsUrl,
        rights_note: record.rightsNote,
        attribution: record.attribution,
        runtime_seconds: record.runtimeSeconds,
        content_type: record.contentType,
        poster_path: record.posterPath ?? null,
        subtitles: record.subtitles ?? [],
        fallback_urls: record.fallbackUrls ?? [],
        quality_sources: record.qualitySources ?? [],
        completeness: record.completeness ?? 'complete',
        source_verified: true,
        featured: Boolean(record.featured),
        active: record.active,
        updated_at: record.updatedAt
      })
    });
    if (r?.ok) supabaseTablesReady = true;
  } catch {}
}

async function deleteSourceFromSupabase(id: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;
  try {
    await sbAdminFetch(`curated_sources?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {}
}

async function syncFeaturedToSupabase() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;
  try {
    const r = await sbAdminFetch('site_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        key: 'featured_config',
        value: featuredConfig,
        updated_at: new Date().toISOString()
      })
    });
    if (r?.ok) supabaseTablesReady = true;
  } catch {}
}

async function syncAnalyticsToSupabase() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;
  try {
    await sbAdminFetch('analytics_counters?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: 'global',
        playback_starts: analyticsCounters.playbackStarts,
        playback_completions: analyticsCounters.playbackCompletions,
        searches: analyticsCounters.searches,
        detail_views: analyticsCounters.detailViews,
        recent_events: analyticsCounters.recentEvents,
        updated_at: new Date().toISOString()
      })
    });
  } catch {}
}

async function insertReportToSupabase(report: ContentReportRecord): Promise<ContentReportRecord> {
  if (!supabaseUrl || !supabaseServiceRoleKey) return report;
  try {
    const r = await sbAdminFetch('content_reports', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        reporter_label: report.reporter,
        target_type: report.targetType,
        target_id: report.targetId,
        reason: report.reason,
        status: report.status
      })
    });
    if (r?.ok) {
      supabaseTablesReady = true;
      const rows = (await r.json()) as any[];
      if (Array.isArray(rows) && rows[0]?.id !== undefined) {
        return { ...report, id: String(rows[0].id), createdAt: rows[0].created_at || report.createdAt };
      }
    }
  } catch {}
  return report;
}

async function updateReportInSupabase(id: string, status: ContentReportRecord['status']) {
  if (!supabaseUrl || !supabaseServiceRoleKey || !/^\d+$/.test(id)) return;
  try {
    await sbAdminFetch(`content_reports?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  } catch {}
}

loadStoreFromDisk();

// In-memory TMDB response cache (5 minute TTL, max 200 entries)
const tmdbCache = new Map<string, { expires: number; status: number; body: any }>();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    tmdbConfigured: Boolean(token),
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    persistenceMode: supabaseUrl && supabaseServiceRoleKey && supabaseTablesReady ? 'supabase+disk' : 'disk'
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
    saveStoreToDisk();
    void syncAnalyticsToSupabase();
  }
  res.json({ ok: true });
});

app.post('/api/reports', async (req, res) => {
  const ip = getClientIp(req);
  if (!checkReportRateLimit(ip)) {
    res.status(429).json({ error: 'Too many reports submitted. Please try again later.' });
    return;
  }
  const targetType = req.body?.targetType;
  const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim().slice(0, 120) : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  const reporter = typeof req.body?.reporter === 'string' && req.body.reporter.trim() ? req.body.reporter.trim().slice(0, 120) : 'guest';
  if (!['title', 'review', 'source'].includes(targetType) || !targetId || reason.length < 3) {
    res.status(400).json({ error: 'Valid targetType, targetId, and reason (min 3 chars) are required' });
    return;
  }
  const initialReport: ContentReportRecord = {
    id: crypto.randomUUID(),
    targetType,
    targetId,
    reason,
    reporter,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  const persistedReport = await insertReportToSupabase(initialReport);
  contentReports.unshift(persistedReport);
  saveStoreToDisk();
  res.status(201).json({ ok: true, report: persistedReport });
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
      supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
      supabaseServiceRoleConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
      supabaseTablesReady,
      persistenceMode: supabaseUrl && supabaseServiceRoleKey && supabaseTablesReady ? 'supabase+disk' : 'disk'
    }
  });
});

app.get('/api/admin/sources', requireAdmin, (_req, res) => {
  res.json({ sources: adminSources, featuredConfig });
});

app.post('/api/admin/sources', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : crypto.randomUUID().slice(0, 12);
  const titleVal = typeof body.title === 'string' ? body.title.trim() : '';
  const year = Number(body.year);
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const itemUrl = typeof body.itemUrl === 'string' ? body.itemUrl.trim() : '';
  const rightsUrl = typeof body.rightsUrl === 'string' ? body.rightsUrl.trim() : '';
  const runtimeSeconds = Number(body.runtimeSeconds);

  if (!titleVal || !Number.isInteger(year) || year < 1888 || !isAllowedMediaHost(videoUrl) || !isSafeHttpUrl(itemUrl) || !isSafeHttpUrl(rightsUrl) || !Number.isFinite(runtimeSeconds) || runtimeSeconds <= 0) {
    res.status(400).json({ error: 'Valid title, year, runtimeSeconds, itemUrl, rightsUrl, and HTTPS allowlisted videoUrl are required' });
    return;
  }

  const fallbackUrls = Array.isArray(body.fallbackUrls)
    ? body.fallbackUrls
        .filter((u: unknown): u is string => typeof u === 'string')
        .map((u: string) => u.trim())
        .filter((u: string) => isAllowedMediaHost(u))
    : [];

  const qualitySources = Array.isArray(body.qualitySources)
    ? body.qualitySources.filter((q: any) => typeof q?.label === 'string' && q.label.trim() && isAllowedMediaHost(q?.url))
    : [];

  const record: AdminCuratedSource = {
    id,
    tmdbId: Number.isInteger(Number(body.tmdbId)) && Number(body.tmdbId) > 0 ? Number(body.tmdbId) : undefined,
    title: titleVal,
    year,
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : `${titleVal} (${year})`,
    itemUrl,
    videoUrl,
    fallbackUrls,
    qualitySources,
    playerType: body.playerType === 'hls' ? 'hls' : body.playerType === 'embed' ? 'embed' : 'mp4',
    provider: typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : 'Internet Archive',
    rightsLabel: typeof body.rightsLabel === 'string' && body.rightsLabel.trim() ? body.rightsLabel.trim() : 'Public Domain / Open License',
    rightsUrl,
    rightsNote: typeof body.rightsNote === 'string' && body.rightsNote.trim() ? body.rightsNote.trim() : 'Verified by Aurora administrator.',
    attribution: typeof body.attribution === 'string' && body.attribution.trim() ? body.attribution.trim() : `${titleVal} (${year})`,
    runtimeSeconds: Math.round(runtimeSeconds),
    completeness: body.completeness === 'incomplete' ? 'incomplete' : 'complete',
    contentType: body.contentType === 'short' ? 'short' : 'feature',
    posterPath: sanitizePosterPath(body.posterPath),
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

  saveStoreToDisk();
  await syncSourceToSupabase(record);
  res.status(201).json({ ok: true, source: record });
});

app.put('/api/admin/sources/:id', requireAdmin, async (req, res) => {
  const idx = adminSources.findIndex(s => s.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Custom source not found' });
    return;
  }
  const current = adminSources[idx];
  const body = req.body || {};
  if (body.videoUrl && !isAllowedMediaHost(body.videoUrl)) {
    res.status(400).json({ error: 'videoUrl must be an HTTPS URL on an allowlisted media host' });
    return;
  }
  const nextFallbackUrls = Array.isArray(body.fallbackUrls)
    ? body.fallbackUrls
        .filter((u: unknown): u is string => typeof u === 'string')
        .map((u: string) => u.trim())
        .filter((u: string) => isAllowedMediaHost(u))
    : current.fallbackUrls;

  adminSources[idx] = {
    ...current,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title,
    active: typeof body.active === 'boolean' ? body.active : current.active,
    featured: typeof body.featured === 'boolean' ? body.featured : current.featured,
    videoUrl: typeof body.videoUrl === 'string' && body.videoUrl.trim() ? body.videoUrl.trim() : current.videoUrl,
    playerType: body.playerType === 'hls' || body.playerType === 'mp4' || body.playerType === 'embed' ? body.playerType : current.playerType,
    fallbackUrls: nextFallbackUrls,
    updatedAt: new Date().toISOString()
  };
  saveStoreToDisk();
  await syncSourceToSupabase(adminSources[idx]);
  res.json({ ok: true, source: adminSources[idx] });
});

app.delete('/api/admin/sources/:id', requireAdmin, async (req, res) => {
  const idx = adminSources.findIndex(s => s.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Custom source not found' });
    return;
  }
  const [removed] = adminSources.splice(idx, 1);
  saveStoreToDisk();
  await deleteSourceFromSupabase(removed.id);
  res.json({ ok: true });
});

app.get('/api/admin/featured', requireAdmin, (_req, res) => {
  res.json({ featuredConfig });
});

app.put('/api/admin/featured', requireAdmin, async (req, res) => {
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
  saveStoreToDisk();
  await syncFeaturedToSupabase();
  res.json({ ok: true, featuredConfig });
});

app.get('/api/admin/reports', requireAdmin, (_req, res) => {
  res.json({ reports: contentReports });
});

app.patch('/api/admin/reports/:id', requireAdmin, async (req, res) => {
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
  saveStoreToDisk();
  await updateReportInSupabase(report.id, status);
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
  fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  })
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
    .catch(() => {
      res.status(502).json({ error: 'Movie metadata service temporarily unavailable' });
    });
});

function convertSrtToVtt(raw: string): string {
  const clean = raw.replace(/^\uFEFF/, '');
  if (clean.trimStart().startsWith('WEBVTT')) return clean;
  const normalized = clean
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g, (_m, hh, mm, ss, ms) => {
      return `${String(hh).padStart(2, '0')}:${mm}:${ss}.${String(ms).padEnd(3, '0')}`;
    });
  return `WEBVTT\n\n${normalized}`;
}

app.get('/api/free-films/verify', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) {
    res.status(400).json({ ok: false, error: 'Missing url parameter' });
    return;
  }
  if (!isAllowedMediaHost(rawUrl)) {
    res.status(403).json({ ok: false, error: 'Source host is not in the verified media allowlist' });
    return;
  }
  try {
    const upstream = await fetch(rawUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-65535' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const contentRange = upstream.headers.get('content-range') || '';
    const acceptRanges = upstream.headers.get('accept-ranges') || '';
    const rangeTotal = contentRange.includes('/') ? Number(contentRange.split('/')[1]) : 0;
    const headerLength = Number(upstream.headers.get('content-length') || 0);
    const contentLength = Number.isFinite(rangeTotal) && rangeTotal > 0 ? rangeTotal : Number.isFinite(headerLength) ? headerLength : 0;
    const rangeSupported = upstream.status === 206 || acceptRanges.toLowerCase().includes('bytes') || Boolean(contentRange);

    const bytes = Buffer.from(await upstream.arrayBuffer());
    const textSample = bytes.toString('utf8', 0, Math.min(bytes.length, 512));
    const latinSample = bytes.toString('latin1', 0, Math.min(bytes.length, 256));
    const isHlsPlaylist = textSample.trimStart().startsWith('#EXTM3U');
    const isMp4Signature = latinSample.includes('ftyp');
    const isWebmSignature = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    const isMediaContentType =
      contentType.startsWith('video/') ||
      contentType.includes('mp4') ||
      contentType.includes('mpegurl') ||
      contentType.includes('octet-stream');
    const signature = isHlsPlaylist ? 'hls-m3u8' : isMp4Signature ? 'mp4-ftyp' : isWebmSignature ? 'webm-ebml' : 'unknown';
    const ok = upstream.ok && (isHlsPlaylist || isMp4Signature || isWebmSignature || (isMediaContentType && rawUrl.toLowerCase().includes('.m3u8')));

    res.json({
      ok,
      status: upstream.status,
      contentType,
      contentLength,
      acceptRanges: acceptRanges || (rangeSupported ? 'bytes' : ''),
      rangeSupported,
      signature
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
    const upstream = await fetch(rawUrl, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      res.status(upstream.status).send('Subtitle unavailable');
      return;
    }
    const text = await upstream.text();
    const vtt = convertSrtToVtt(text);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(vtt);
  } catch {
    res.status(502).send('Could not load subtitle');
  }
});

app.all('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

async function start() {
  await hydrateStoreFromSupabase();
  const root = path.resolve(__dirname, '../dist');
  app.use(
    express.static(root, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('sw.js') || filePath.endsWith('registerSW.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      }
    })
  );
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  app.listen(port, '0.0.0.0', () => console.log(`Aurora listening on ${port}`));
}

void start();
