import React, { useEffect, useState } from 'react';
import { BarChart3, CheckCircle, Film, Flag, Lock, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import type { FreeFilm } from '../types';

type AdminDashboardProps = {
  supabaseAccessToken?: string;
  userEmail?: string;
  builtinSources: FreeFilm[];
  onSourcesUpdated: () => void;
  onOpenAuth: () => void;
};

type AdminOverview = {
  analytics: {
    playbackStarts: number;
    playbackCompletions: number;
    searches: number;
    detailViews: number;
    recentEvents: { type: string; label: string; at: string }[];
  };
  customSourcesCount: number;
  activeCustomSourcesCount: number;
  disabledBuiltinCount: number;
  openReportsCount: number;
  totalReportsCount: number;
  featuredConfig: {
    heroTmdbIds: number[];
    curatedShelfTitle: string;
    disabledSourceIds: string[];
  };
  configHealth?: {
    adminPasscodeConfigured: boolean;
    adminPasscodeLengthOk: boolean;
    adminEmailsConfigured: boolean;
    adminEmailsCount: number;
    adminSessionSecretConfigured: boolean;
    adminSessionSecretStrong: boolean;
    tmdbConfigured: boolean;
    supabaseConfigured: boolean;
    supabaseServiceRoleConfigured?: boolean;
    supabaseTablesReady?: boolean;
    persistenceMode?: 'supabase+disk' | 'disk';
  };
};

type ReportItem = {
  id: string;
  targetType: 'title' | 'review' | 'source';
  targetId: string;
  reason: string;
  reporter: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
};

export default function AdminDashboard({
  supabaseAccessToken,
  userEmail,
  builtinSources,
  onSourcesUpdated,
  onOpenAuth
}: AdminDashboardProps) {
  // Signed admin session token stored in React memory only (never localStorage)
  const [adminBearer, setAdminBearer] = useState<string>('');
  const [authenticated, setAuthenticated] = useState(false);
  const [actor, setActor] = useState('');
  const [emailAuthorized, setEmailAuthorized] = useState(false);
  const [adminEmailsConfigured, setAdminEmailsConfigured] = useState(false);
  const [envPasscodeConfigured, setEnvPasscodeConfigured] = useState(false);
  const [sessionSecretConfigured, setSessionSecretConfigured] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<'overview' | 'sources' | 'featured' | 'reports'>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [customSources, setCustomSources] = useState<any[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);

  // New source form
  const [srcTitle, setSrcTitle] = useState('');
  const [srcYear, setSrcYear] = useState('1960');
  const [srcTmdbId, setSrcTmdbId] = useState('');
  const [srcVideoUrl, setSrcVideoUrl] = useState('');
  const [srcFallbackUrl, setSrcFallbackUrl] = useState('');
  const [srcPlayerType, setSrcPlayerType] = useState<'mp4' | 'hls'>('mp4');
  const [srcContentType, setSrcContentType] = useState<'feature' | 'short'>('feature');
  const [srcItemUrl, setSrcItemUrl] = useState('');
  const [srcRightsUrl, setSrcRightsUrl] = useState('https://creativecommons.org/publicdomain/mark/1.0/');
  const [srcRuntime, setSrcRuntime] = useState('4500');
  const [srcProvider, setSrcProvider] = useState('Internet Archive');
  const [srcSubtitleUrl, setSrcSubtitleUrl] = useState('');
  const [srcDesc, setSrcDesc] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Featured settings form
  const [heroIdsInput, setHeroIdsInput] = useState('');
  const [shelfTitleInput, setShelfTitleInput] = useState('Watch full movies free');

  async function checkStatus(tokenOverride?: string) {
    setLoading(true);
    const signedAdminToken = tokenOverride ?? adminBearer;
    const headers: Record<string, string> = {};
    if (supabaseAccessToken) headers.Authorization = `Bearer ${supabaseAccessToken}`;
    if (signedAdminToken) headers['X-Admin-Token'] = signedAdminToken;

    try {
      const res = await fetch('/api/admin/status', { headers });
      const data = await res.json();
      setAuthenticated(Boolean(data.authenticated));
      setActor(data.actor || '');
      setEmailAuthorized(Boolean(data.emailAuthorized));
      setAdminEmailsConfigured(Boolean(data.adminEmailsConfigured));
      setEnvPasscodeConfigured(Boolean(data.envPasscodeConfigured));
      setSessionSecretConfigured(data.sessionSecretConfigured !== false);
      setNeedsBootstrap(Boolean(data.needsBootstrap));

      if (data.authenticated && signedAdminToken) {
        await loadAdminData(signedAdminToken);
      } else if (
        !data.authenticated &&
        data.emailAuthorized &&
        !data.envPasscodeConfigured &&
        !data.needsBootstrap &&
        data.sessionSecretConfigured &&
        supabaseAccessToken
      ) {
        // Exchange verified Supabase email session for HMAC-signed admin token when no passcode is configured
        const sessRes = await fetch('/api/admin/session', {
          method: 'POST',
          headers: { Authorization: `Bearer ${supabaseAccessToken}` }
        });
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          if (sessData.token) {
            setAdminBearer(sessData.token);
            setAuthenticated(true);
            setActor(sessData.actor || userEmail || 'admin');
            await loadAdminData(sessData.token);
          }
        }
      }
    } catch {
      setAuthError('Could not connect to admin service.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAdminData(signedToken: string) {
    const headers = { Authorization: `Bearer ${signedToken}` };
    const [ovRes, srcRes, repRes] = await Promise.all([
      fetch('/api/admin/overview', { headers }),
      fetch('/api/admin/sources', { headers }),
      fetch('/api/admin/reports', { headers })
    ]);
    if (ovRes.ok) {
      const ov = await ovRes.json();
      setOverview(ov);
      setHeroIdsInput((ov.featuredConfig?.heroTmdbIds || []).join(', '));
      setShelfTitleInput(ov.featuredConfig?.curatedShelfTitle || 'Watch full movies free');
    } else if (ovRes.status === 401 || ovRes.status === 403) {
      setAdminBearer('');
      setAuthenticated(false);
    }
    if (srcRes.ok) {
      const s = await srcRes.json();
      setCustomSources(s.sources || []);
    }
    if (repRes.ok) {
      const r = await repRes.json();
      setReports(r.reports || []);
    }
  }

  useEffect(() => {
    if (!supabaseAccessToken) {
      setAdminBearer('');
    }
    checkStatus(!supabaseAccessToken ? '' : undefined);
  }, [supabaseAccessToken]);

  async function handleAdminAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError('');
    const endpoint = needsBootstrap ? '/api/admin/bootstrap' : '/api/admin/login';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (supabaseAccessToken) headers.Authorization = `Bearer ${supabaseAccessToken}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ passcode })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }
      setAdminBearer(data.token);
      setPasscode('');
      await checkStatus(data.token);
    } catch {
      setAuthError('Request failed.');
    }
  }

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    setStatusMsg('');
    const res = await fetch('/api/admin/sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminBearer}`
      },
      body: JSON.stringify({
        title: srcTitle,
        year: Number(srcYear),
        tmdbId: srcTmdbId ? Number(srcTmdbId) : undefined,
        videoUrl: srcVideoUrl,
        fallbackUrls: srcFallbackUrl.trim()
          ? srcFallbackUrl.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        playerType: srcPlayerType,
        contentType: srcContentType,
        itemUrl: srcItemUrl,
        rightsUrl: srcRightsUrl,
        runtimeSeconds: Number(srcRuntime),
        provider: srcProvider,
        description: srcDesc,
        subtitles: srcSubtitleUrl.trim()
          ? [{ label: 'English', lang: 'en', url: srcSubtitleUrl.trim() }]
          : []
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusMsg(data.error || 'Failed to add source');
      return;
    }
    setSrcTitle('');
    setSrcVideoUrl('');
    setSrcFallbackUrl('');
    setSrcItemUrl('');
    setSrcSubtitleUrl('');
    setSrcDesc('');
    setStatusMsg('Verified streaming source added and persisted.');
    await loadAdminData(adminBearer);
    onSourcesUpdated();
  }

  async function toggleCustomSource(id: string, active: boolean) {
    await fetch(`/api/admin/sources/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminBearer}` },
      body: JSON.stringify({ active: !active })
    });
    await loadAdminData(adminBearer);
    onSourcesUpdated();
  }

  async function deleteCustomSource(id: string) {
    await fetch(`/api/admin/sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminBearer}` }
    });
    await loadAdminData(adminBearer);
    onSourcesUpdated();
  }

  async function saveFeatured(event: React.FormEvent) {
    event.preventDefault();
    const heroTmdbIds = heroIdsInput
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => Number.isInteger(n) && n > 0);
    const res = await fetch('/api/admin/featured', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminBearer}` },
      body: JSON.stringify({
        heroTmdbIds,
        curatedShelfTitle: shelfTitleInput,
        disabledSourceIds: overview?.featuredConfig?.disabledSourceIds || []
      })
    });
    if (res.ok) {
      setStatusMsg('Featured settings updated.');
      await loadAdminData(adminBearer);
      onSourcesUpdated();
    }
  }

  async function toggleBuiltinDisabled(id: string) {
    const current = overview?.featuredConfig?.disabledSourceIds || [];
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    await fetch('/api/admin/featured', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminBearer}` },
      body: JSON.stringify({
        heroTmdbIds: overview?.featuredConfig?.heroTmdbIds || [],
        curatedShelfTitle: overview?.featuredConfig?.curatedShelfTitle || 'Watch full movies free',
        disabledSourceIds: next
      })
    });
    await loadAdminData(adminBearer);
    onSourcesUpdated();
  }

  async function updateReportStatus(id: string, status: 'resolved' | 'dismissed') {
    await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminBearer}` },
      body: JSON.stringify({ status })
    });
    await loadAdminData(adminBearer);
  }

  if (loading) {
    return (
      <main className="searchPage">
        <p className="eyebrow"><ShieldCheck size={14} /> ADMINISTRATION</p>
        <h1>Admin <span>Dashboard</span></h1>
        <p className="muted">Verifying administrator session…</p>
      </main>
    );
  }

  if (!authenticated) {
    const mustSignInWithAdminEmail = adminEmailsConfigured && !supabaseAccessToken;
    const signedInButDenied = adminEmailsConfigured && Boolean(supabaseAccessToken) && !emailAuthorized;

    return (
      <main className="searchPage">
        <p className="eyebrow"><Lock size={14} /> PROTECTED ADMINISTRATION</p>
        <h1>Admin <span>Authorization</span></h1>

        {!sessionSecretConfigured ? (
          <div className="empty">
            <Lock />
            <h2>Admin sessions unavailable</h2>
            <p>The server administrator session secret is not configured. Add it in environment settings and restart the server.</p>
          </div>
        ) : mustSignInWithAdminEmail ? (
          <div className="empty">
            <Lock />
            <h2>Sign in with an authorized email</h2>
            <p>Access to the admin dashboard is restricted to verified administrator accounts.</p>
            <button type="button" className="primary" onClick={onOpenAuth}>Sign in to Aurora</button>
          </div>
        ) : signedInButDenied ? (
          <div className="empty">
            <Lock />
            <h2>Access denied</h2>
            <p>
              {userEmail
                ? `The account "${userEmail}" is not authorized for administrator access, or its email has not been verified yet.`
                : 'This account is not authorized for administrator access.'}
            </p>
          </div>
        ) : (
          <>
            <p className="pageIntro muted">
              {userEmail
                ? `Verified administrator account: ${userEmail}. Enter the administrator passcode to issue a signed admin session.`
                : 'Administrator privileges are enforced on the server. Enter your administrator passcode to continue.'}
            </p>

            <form className="profileEditorCard" onSubmit={handleAdminAuth}>
              <h2>{needsBootstrap ? 'Claim First-Run Admin Passcode' : 'Administrator Sign In'}</h2>
              <p className="muted">
                {needsBootstrap
                  ? 'Set an initial passcode (min 8 characters) to lock and manage the admin console.'
                  : envPasscodeConfigured
                    ? 'Passcode and session verification are enforced server-side with signed tokens.'
                    : 'Enter your administrator passcode.'}
              </p>
              <label className="authField">
                <span>{needsBootstrap ? 'Create admin passcode' : 'Administrator passcode'}</span>
                <input
                  type="password"
                  minLength={8}
                  required
                  autoComplete="current-password"
                  placeholder="At least 8 characters"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                />
              </label>
              {authError && <p className="formMsg">{authError}</p>}
              <button type="submit" className="primary">
                {needsBootstrap ? 'Set Passcode & Enter' : 'Unlock Dashboard'}
              </button>
            </form>
          </>
        )}
      </main>
    );
  }

  return (
    <main className="searchPage adminPage">
      <div className="archiveFilmTop">
        <div>
          <p className="eyebrow"><ShieldCheck size={14} /> ADMIN CONSOLE · {actor}</p>
          <h1>Platform <span>Administration</span></h1>
        </div>
        {adminBearer && (
          <button className="secondary" onClick={() => { setAdminBearer(''); setAuthenticated(false); }}>
            Lock Admin Session
          </button>
        )}
      </div>

      <div className="freeFilmFilter" role="tablist">
        <button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>
          <BarChart3 size={13} /> Overview &amp; Analytics
        </button>
        <button className={tab === 'sources' ? 'selected' : ''} onClick={() => setTab('sources')}>
          <Film size={13} /> Streaming Sources ({builtinSources.length + customSources.length})
        </button>
        <button className={tab === 'featured' ? 'selected' : ''} onClick={() => setTab('featured')}>
          Featured &amp; Categories
        </button>
        <button className={tab === 'reports' ? 'selected' : ''} onClick={() => setTab('reports')}>
          <Flag size={13} /> Reports ({reports.filter(r => r.status === 'open').length} open)
        </button>
      </div>

      {statusMsg && <p className="infoBanner">{statusMsg}</p>}

      {tab === 'overview' && overview && (
        <>
          <div className="adminStatGrid">
            <div className="adminStatCard">
              <small>Playback Starts</small>
              <strong>{overview.analytics.playbackStarts}</strong>
            </div>
            <div className="adminStatCard">
              <small>Completions</small>
              <strong>{overview.analytics.playbackCompletions}</strong>
            </div>
            <div className="adminStatCard">
              <small>Searches Logged</small>
              <strong>{overview.analytics.searches}</strong>
            </div>
            <div className="adminStatCard">
              <small>Open Reports</small>
              <strong>{overview.openReportsCount}</strong>
            </div>
          </div>

          {overview.configHealth && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow">ENVIRONMENT CHECK</p><h2>Security &amp; Integration Status</h2></div>
              </div>
              <div className="archiveSourceMeta adminHealthGrid">
                <div className={overview.configHealth.adminPasscodeConfigured ? 'healthOk' : 'healthWarn'}>
                  <small>Admin Passcode</small>
                  <strong>{overview.configHealth.adminPasscodeConfigured ? (overview.configHealth.adminPasscodeLengthOk ? 'Configured (ok)' : 'Configured (short)') : 'Missing'}</strong>
                </div>
                <div className={overview.configHealth.adminEmailsConfigured ? 'healthOk' : 'healthWarn'}>
                  <small>Admin Emails Allowlist</small>
                  <strong>{overview.configHealth.adminEmailsConfigured ? `Configured (${overview.configHealth.adminEmailsCount} listed)` : 'Not restricted'}</strong>
                </div>
                <div className={overview.configHealth.adminSessionSecretConfigured ? 'healthOk' : 'healthWarn'}>
                  <small>Session Signing Secret</small>
                  <strong>{overview.configHealth.adminSessionSecretConfigured ? (overview.configHealth.adminSessionSecretStrong ? 'Configured (strong)' : 'Configured (< 32 chars)') : 'Missing'}</strong>
                </div>
                <div className={overview.configHealth.tmdbConfigured && overview.configHealth.supabaseConfigured ? 'healthOk' : 'healthWarn'}>
                  <small>Core APIs &amp; Persistence</small>
                  <strong>
                    TMDB {overview.configHealth.tmdbConfigured ? 'OK' : 'Missing'} ·{' '}
                    Supabase {overview.configHealth.supabaseConfigured ? 'OK' : 'Missing'} ·{' '}
                    Store {overview.configHealth.persistenceMode === 'supabase+disk' ? 'Supabase + Disk' : 'Disk (local)'}
                  </strong>
                </div>
              </div>
            </section>
          )}

          <section className="detailSection">
            <div className="detailSectionHead">
              <div><p className="eyebrow">RECENT ACTIVITY</p><h2>Playback &amp; Catalog Events</h2></div>
            </div>
            {overview.analytics.recentEvents.length === 0 ? (
              <p className="muted">No activity recorded yet.</p>
            ) : (
              <div className="reviewList">
                {overview.analytics.recentEvents.map((ev, i) => (
                  <div className="reviewCard" key={i}>
                    <div className="reviewCardTop">
                      <b>{ev.type}</b>
                      <time>{new Date(ev.at).toLocaleTimeString()}</time>
                    </div>
                    <p>{ev.label || 'Catalog interaction'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'sources' && (
        <div className="adminSplit">
          <form className="profileEditorCard" onSubmit={addSource}>
            <h2><Plus size={16} /> Add Verified Stream Source</h2>
            <p className="muted">Only HTTPS media URLs from allowlisted hosts (archive.org, tile.loc.gov, test-streams.mux.dev, download.blender.org) are permitted.</p>
            <label className="authField"><span>Title</span><input required value={srcTitle} onChange={e => setSrcTitle(e.target.value)} placeholder="e.g. Nosferatu" /></label>
            <div className="adminRowTwo">
              <label className="authField"><span>Year</span><input type="number" required value={srcYear} onChange={e => setSrcYear(e.target.value)} /></label>
              <label className="authField"><span>Runtime (seconds)</span><input type="number" required value={srcRuntime} onChange={e => setSrcRuntime(e.target.value)} /></label>
            </div>
            <div className="adminRowTwo">
              <label className="authField"><span>TMDB Movie ID (optional)</span><input type="number" value={srcTmdbId} onChange={e => setSrcTmdbId(e.target.value)} placeholder="653" /></label>
              <label className="authField"><span>Provider</span><input required value={srcProvider} onChange={e => setSrcProvider(e.target.value)} /></label>
            </div>
            <div className="adminRowTwo">
              <label className="authField">
                <span>Stream Format</span>
                <select className="sortSelect" value={srcPlayerType} onChange={e => setSrcPlayerType(e.target.value as 'mp4' | 'hls')}>
                  <option value="mp4">MP4 (Progressive H.264/AAC)</option>
                  <option value="hls">HLS (.m3u8 Adaptive)</option>
                </select>
              </label>
              <label className="authField">
                <span>Category</span>
                <select className="sortSelect" value={srcContentType} onChange={e => setSrcContentType(e.target.value as 'feature' | 'short')}>
                  <option value="feature">Full Feature</option>
                  <option value="short">Short Film</option>
                </select>
              </label>
            </div>
            <label className="authField"><span>Video URL (HTTPS MP4 or HLS .m3u8)</span><input type="url" required value={srcVideoUrl} onChange={e => setSrcVideoUrl(e.target.value)} placeholder="https://archive.org/download/..." /></label>
            <label className="authField"><span>Fallback Mirror URLs (comma-separated, optional)</span><input value={srcFallbackUrl} onChange={e => setSrcFallbackUrl(e.target.value)} placeholder="https://archive.org/download/..._512kb.mp4" /></label>
            <label className="authField"><span>Source Record URL</span><input type="url" required value={srcItemUrl} onChange={e => setSrcItemUrl(e.target.value)} placeholder="https://archive.org/details/..." /></label>
            <label className="authField"><span>License / Rights URL</span><input type="url" required value={srcRightsUrl} onChange={e => setSrcRightsUrl(e.target.value)} /></label>
            <label className="authField"><span>External Subtitle URL (.vtt/.srt, optional)</span><input type="url" value={srcSubtitleUrl} onChange={e => setSrcSubtitleUrl(e.target.value)} placeholder="https://archive.org/download/.../subs.srt" /></label>
            <label className="authField"><span>Description</span><input value={srcDesc} onChange={e => setSrcDesc(e.target.value)} placeholder="Short synopsis and provenance" /></label>
            <button type="submit" className="primary">Save Verified Source</button>
          </form>

          <div className="adminColumn">
            <h3 className="adminListTitle">Custom Admin Sources ({customSources.length})</h3>
            <div className="reviewList">
              {customSources.map(src => (
                <article className="reviewCard" key={src.id}>
                  <div className="reviewCardTop">
                    <b>{src.title} ({src.year})</b>
                    <span>{src.active ? 'Active' : 'Disabled'}</span>
                  </div>
                  <p className="adminSourceUrl">{src.provider} · {src.videoUrl}</p>
                  <div className="historyCardActions">
                    <button className="secondary" onClick={() => toggleCustomSource(src.id, src.active)}>
                      {src.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="historyRemove" onClick={() => deleteCustomSource(src.id)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </article>
              ))}
              {!customSources.length && <p className="muted">No custom sources added yet.</p>}
            </div>

            <h3 className="adminListTitle spaced">Built-in Verified Sources ({builtinSources.length})</h3>
            <div className="reviewList">
              {builtinSources.map(src => {
                const disabled = overview?.featuredConfig?.disabledSourceIds?.includes(src.id);
                return (
                  <article className="reviewCard" key={src.id}>
                    <div className="reviewCardTop">
                      <b>{src.title} ({src.year})</b>
                      <span>{disabled ? 'Hidden' : 'Visible'}</span>
                    </div>
                    <p>{src.provider} · {src.contentType}</p>
                    <button className="secondary" onClick={() => toggleBuiltinDisabled(src.id)}>
                      {disabled ? 'Restore to Catalog' : 'Hide from Catalog'}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'featured' && (
        <form className="profileEditorCard" onSubmit={saveFeatured}>
          <h2>Featured Hero &amp; Shelf Configuration</h2>
          <label className="authField">
            <span>Curated Free Movies Shelf Title</span>
            <input value={shelfTitleInput} onChange={e => setShelfTitleInput(e.target.value)} />
          </label>
          <label className="authField">
            <span>Prioritized Hero TMDB IDs (comma-separated, optional)</span>
            <input value={heroIdsInput} onChange={e => setHeroIdsInput(e.target.value)} placeholder="10331, 3085, 15856" />
          </label>
          <button type="submit" className="primary">Save Featured Configuration</button>
        </form>
      )}

      {tab === 'reports' && (
        <div className="reviewList">
          {reports.map(r => (
            <article className="reviewCard" key={r.id}>
              <div className="reviewCardTop">
                <b>{r.targetType.toUpperCase()} · {r.targetId}</b>
                <span>{r.status}</span>
              </div>
              <p>{r.reason}</p>
              <time>Reported by {r.reporter} · {new Date(r.createdAt).toLocaleString()}</time>
              {r.status === 'open' && (
                <div className="historyCardActions" style={{ marginTop: 10 }}>
                  <button className="primary" onClick={() => updateReportStatus(r.id, 'resolved')}>
                    <CheckCircle size={13} /> Resolve
                  </button>
                  <button className="secondary" onClick={() => updateReportStatus(r.id, 'dismissed')}>
                    <XCircle size={13} /> Dismiss
                  </button>
                </div>
              )}
            </article>
          ))}
          {!reports.length && <p className="muted">No content or review reports submitted yet.</p>}
        </div>
      )}
    </main>
  );
}
