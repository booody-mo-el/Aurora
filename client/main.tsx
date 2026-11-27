import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Download,
  Film as FilmIcon,
  Flag,
  Heart,
  History,
  Home,
  LogOut,
  Play,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  Trophy,
  Tv,
  UserRound,
  X
} from 'lucide-react';
import { supabase, initializeSupabase } from './supabase';
import './style.css';
import InstallPrompt from './InstallPrompt';
import VideoPlayer from './components/VideoPlayer';
import ProfilesView, { avatarBackground } from './components/ProfilesView';
import AdminDashboard from './components/AdminDashboard';
import {
  api,
  baseFreeFilms,
  findFreeFilmMatch,
  findFreeShortMatch,
  formatRuntime,
  img,
  isAnimeFilm,
  isVerifiedFullFeature,
  title,
  validateFreeFilmCatalogEntry
} from './catalog';
import type {
  AuthMode,
  EpisodeData,
  Film,
  FreeFilm,
  Genre,
  Person,
  Profile,
  ReviewItem,
  WatchHistoryEntry,
  WatchProvider
} from './types';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err?.message || 'Unexpected rendering error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="searchPage">
          <div className="empty">
            <h2>Something went wrong</h2>
            <p>{this.state.message}</p>
            <button className="primary" onClick={() => window.location.reload()}>Reload Aurora</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_PROFILE: Profile = {
  id: 'default-main',
  name: 'Main',
  avatar: 'emerald',
  is_kids: false,
  autoplay_next: true,
  preferred_genres: []
};

const downloadKey = 'aurora-download-queue';
const profilesStorageKey = 'aurora-profiles';
const activeProfileStorageKey = 'aurora-active-profile';

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function historyKeyFor(profileId: string) {
  return `aurora-watch-history:${profileId}`;
}

function favoritesKeyFor(profileId: string) {
  return `aurora-favorites:${profileId}`;
}

function searchHistoryKeyFor(profileId: string) {
  return `aurora-search-history:${profileId}`;
}

const prefsStorageKey = 'aurora-user-preferences';

function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function handleCardPointerMove(event: React.MouseEvent<HTMLElement>) {
  if (typeof window !== 'undefined') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-hover: hover)').matches) return;
  }
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const px = (event.clientX - rect.left) / rect.width;
  const py = (event.clientY - rect.top) / rect.height;
  const rx = ((0.5 - py) * 11).toFixed(2);
  const ry = ((px - 0.5) * 13).toFixed(2);
  el.style.setProperty('--rx', `${rx}deg`);
  el.style.setProperty('--ry', `${ry}deg`);
  el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
}

function handleCardPointerLeave(event: React.MouseEvent<HTMLElement>) {
  const el = event.currentTarget;
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
  el.style.setProperty('--mx', '50%');
  el.style.setProperty('--my', '20%');
}

function trackAnalytics(type: string, label: string) {
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, label })
  }).catch(() => {});
}

function App() {
  const [path, setPath] = useState(location.pathname);

  // Catalog state
  const [trending, setTrending] = useState<Film[]>([]);
  const [movies, setMovies] = useState<Film[]>([]);
  const [shows, setShows] = useState<Film[]>([]);
  const [animeList, setAnimeList] = useState<Film[]>([]);
  const [recentList, setRecentList] = useState<Film[]>([]);
  const [topMovies, setTopMovies] = useState<Film[]>([]);
  const [personalizedRecs, setPersonalizedRecs] = useState<Film[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);

  // Genres & Filters
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [selectedMovieGenre, setSelectedMovieGenre] = useState<number | null>(null);
  const [movieYear, setMovieYear] = useState<string>('');
  const [movieMinRating, setMovieMinRating] = useState<number>(0);
  const [movieSort, setMovieSort] = useState('popularity.desc');
  const [moviePage, setMoviePage] = useState(1);
  const [movieHasMore, setMovieHasMore] = useState(true);
  const [moviesBusy, setMoviesBusy] = useState(false);

  const [selectedTvGenre, setSelectedTvGenre] = useState<number | null>(null);
  const [tvYear, setTvYear] = useState<string>('');
  const [tvMinRating, setTvMinRating] = useState<number>(0);
  const [tvSort, setTvSort] = useState('popularity.desc');
  const [tvPage, setTvPage] = useState(1);
  const [tvHasMore, setTvHasMore] = useState(true);
  const [tvBusy, setTvBusy] = useState(false);

  const [animeYear, setAnimeYear] = useState<string>('');
  const [animeMinRating, setAnimeMinRating] = useState<number>(0);
  const [animeSort, setAnimeSort] = useState('popularity.desc');
  const [animeType, setAnimeType] = useState<'tv' | 'movie'>('tv');
  const [animePage, setAnimePage] = useState(1);
  const [animeHasMore, setAnimeHasMore] = useState(true);
  const [animeBusy, setAnimeBusy] = useState(false);

  // Discovery / Search state
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<Film[]>([]);
  const [peopleResults, setPeopleResults] = useState<Person[]>([]);
  const [searchTypeFilter, setSearchTypeFilter] = useState<'all' | 'movie' | 'tv' | 'anime' | 'person'>('all');
  const [searchYearFilter, setSearchYearFilter] = useState('');
  const [searchRatingFilter, setSearchRatingFilter] = useState(0);

  // Auth & Supabase
  const [user, setUser] = useState<any>(null);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [dbClient, setDbClient] = useState<any>(null);
  const [auth, setAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsToken, setSmsToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [homeLoading, setHomeLoading] = useState(true);
  const [introVisible, setIntroVisible] = useState(
    () => !sessionStorage.getItem('aurora-intro-seen') && !matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Profiles
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const stored = readJsonStorage<Profile[]>(profilesStorageKey, [DEFAULT_PROFILE]);
    return stored.length ? stored : [DEFAULT_PROFILE];
  });
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return localStorage.getItem(activeProfileStorageKey) || DEFAULT_PROFILE.id;
  });
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || DEFAULT_PROFILE;

  // Profile-scoped Favorites, Watch History, Downloads, Search History
  const [saved, setSaved] = useState<Film[]>(() => readJsonStorage<Film[]>(favoritesKeyFor(activeProfile.id), []));
  const [savedLoading, setSavedLoading] = useState(false);
  const [downloads, setDownloads] = useState<Film[]>(() => readJsonStorage<Film[]>(downloadKey, []));
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>(() =>
    readJsonStorage<WatchHistoryEntry[]>(historyKeyFor(activeProfile.id), [])
  );
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    readJsonStorage<string[]>(searchHistoryKeyFor(activeProfile.id), [])
  );

  // Free Films & Admin Curated Sources
  const [customSources, setCustomSources] = useState<FreeFilm[]>([]);
  const [featuredConfig, setFeaturedConfig] = useState<{
    heroTmdbIds: number[];
    curatedShelfTitle: string;
    disabledSourceIds: string[];
  }>({ heroTmdbIds: [], curatedShelfTitle: 'Watch full movies free', disabledSourceIds: [] });

  const allFreeFilms = useMemo(() => {
    const disabled = new Set(featuredConfig.disabledSourceIds || []);
    const builtIn = baseFreeFilms.filter(f => !disabled.has(f.id));
    const merged = [...customSources, ...builtIn];
    return merged.filter(validateFreeFilmCatalogEntry);
  }, [customSources, featuredConfig]);

  const verifiedFullFeatures = useMemo(() => allFreeFilms.filter(isVerifiedFullFeature), [allFreeFilms]);

  const [freeFilmFilter, setFreeFilmFilter] = useState<'all' | 'feature' | 'short'>('all');
  const [selectedFreeFilmId, setSelectedFreeFilmId] = useState('night-of-the-living-dead-1968');
  const [autoResumeSeconds, setAutoResumeSeconds] = useState<number | null>(null);

  // Detail & Celebrity & Season state
  const [detailItem, setDetailItem] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [trailer, setTrailer] = useState<any>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [watchProviders, setWatchProviders] = useState<{
    region: string;
    link?: string;
    flatrate: WatchProvider[];
    free: WatchProvider[];
    rent: WatchProvider[];
    buy: WatchProvider[];
  } | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<EpisodeData[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const [personItem, setPersonItem] = useState<Person | null>(null);
  const [personLoading, setPersonLoading] = useState(false);

  // Reviews
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewSort, setReviewSort] = useState<'newest' | 'helpful'>('newest');
  const [helpfulVoteIds, setHelpfulVoteIds] = useState<number[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');

  // Report modal
  const [reportTarget, setReportTarget] = useState<{ type: 'title' | 'review' | 'source'; id: string; label: string } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportMsg, setReportMsg] = useState('');

  // Account page messages & user playback preferences
  const [accountMsg, setAccountMsg] = useState('');
  const [preferredPlaybackSpeed, setPreferredPlaybackSpeed] = useState<number>(() => {
    const stored = readJsonStorage<{ preferred_playback_speed?: number }>(prefsStorageKey, {});
    const val = Number(stored.preferred_playback_speed);
    return Number.isFinite(val) && val >= 0.5 && val <= 2 ? val : 1;
  });

  const recoveryFlowRef = useRef(false);
  const lastProgressSyncRef = useRef<number>(0);

  // Load curated sources + featured config from backend
  function refreshCuratedSources() {
    fetch('/api/sources')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.sources)) {
          setCustomSources(
            data.sources.map((s: any) => ({
              ...s,
              completeness: s.completeness === 'incomplete' ? 'incomplete' : 'complete',
              sourceVerified: true,
              fallbackUrls: Array.isArray(s.fallbackUrls) ? s.fallbackUrls : [],
              qualitySources: Array.isArray(s.qualitySources) && s.qualitySources.length
                ? s.qualitySources
                : s.videoUrl
                  ? [
                      { label: s.playerType === 'hls' ? 'Adaptive HLS' : 'Primary', url: s.videoUrl },
                      ...(Array.isArray(s.fallbackUrls) ? s.fallbackUrls.map((u: string, i: number) => ({ label: `Mirror ${i + 1}`, url: u })) : [])
                    ]
                  : [],
              availableQualities: [s.playerType === 'hls' ? 'HLS Stream' : 'MP4'],
              excerpts: Array.isArray(s.excerpts) && s.excerpts.length
                ? s.excerpts
                : [{ label: 'Opening', start: 0, end: Math.min(30, Number(s.runtimeSeconds) || 30) }],
              isCustom: true
            }))
          );
        }
        if (data.featuredConfig) setFeaturedConfig(data.featuredConfig);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshCuratedSources();
  }, []);

  useEffect(() => {
    const pop = () => setPath(location.pathname);
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);

  function go(next: string) {
    history.pushState({}, '', next);
    setPath(next);
    setQuery('');
    setSearchFocused(false);
    scrollTo(0, 0);
  }

  function openFreeFilm(filmId: string, resumeAtSeconds?: number) {
    setAutoResumeSeconds(resumeAtSeconds && resumeAtSeconds >= 5 ? resumeAtSeconds : null);
    setSelectedFreeFilmId(filmId);
    trackAnalytics('play_start', filmId);
    go('/free-films');
  }

  // Persist active profile id and load profile-scoped local state when activeProfile changes
  useEffect(() => {
    localStorage.setItem(activeProfileStorageKey, activeProfile.id);
    setWatchHistory(readJsonStorage<WatchHistoryEntry[]>(historyKeyFor(activeProfile.id), []));
    setSearchHistory(readJsonStorage<string[]>(searchHistoryKeyFor(activeProfile.id), []));
    if (!user) {
      setSaved(readJsonStorage<Film[]>(favoritesKeyFor(activeProfile.id), []));
    }
  }, [activeProfile.id, user]);

  // Initial Supabase + TMDB Catalog bootstrap
  useEffect(() => {
    let subscription: any;
    initializeSupabase().then(client => {
      if (!client) return;
      setDbClient(client);
      client.auth.getSession().then(({ data }: any) => {
        setUser(data.session?.user || null);
        setSessionToken(data.session?.access_token || '');
      });
      const { data } = client.auth.onAuthStateChange((event: string, session: any) => {
        const nextUser = session?.user || null;
        setUser(nextUser);
        setSessionToken(session?.access_token || '');
        if (event === 'PASSWORD_RECOVERY') {
          recoveryFlowRef.current = true;
          setAuth(true);
          setAuthMode('reset-password');
          setPassword('');
          setConfirmPassword('');
          setError('');
        } else if (nextUser && !recoveryFlowRef.current) {
          setAuth(false);
          setError('');
        }
      });
      subscription = data.subscription;
    });

    const kidsFilter = activeProfile.is_kids ? '&with_genres=10751&certification_country=US&certification.lte=PG' : '';
    const requests = [
      api('/trending/all/week?language=en-US'),
      api(`/discover/movie?language=en-US&sort_by=popularity.desc${kidsFilter}`),
      api(`/discover/tv?language=en-US&sort_by=popularity.desc${activeProfile.is_kids ? '&with_genres=10751' : ''}`),
      api('/movie/top_rated?language=en-US'),
      api('/movie/now_playing?language=en-US'),
      api('/discover/tv?language=en-US&with_genres=16&with_original_language=ja&sort_by=popularity.desc'),
      api('/person/popular?language=en-US'),
      api('/genre/movie/list?language=en-US'),
      api('/genre/tv/list?language=en-US')
    ];

    Promise.allSettled(requests).then(([trend, movie, tv, top, nowPlaying, anime, cast, mGenres, tGenres]) => {
      let successes = 0;
      const filterAdult = (list: Film[]) =>
        activeProfile.is_kids ? list.filter(f => !f.adult) : list;

      if (trend.status === 'fulfilled') {
        successes++;
        const list = filterAdult((trend.value.results || []).filter((i: Film) => i.media_type !== 'person'));
        setTrending(list.map((i: Film) => ({ ...i, media_type: i.media_type || 'movie' })));
      }
      if (movie.status === 'fulfilled') {
        successes++;
        setMovies(filterAdult((movie.value.results || []).map((i: Film) => ({ ...i, media_type: 'movie' }))));
        setMovieHasMore((movie.value.page || 1) < (movie.value.total_pages || 1));
      }
      if (tv.status === 'fulfilled') {
        successes++;
        setShows(filterAdult((tv.value.results || []).map((i: Film) => ({ ...i, media_type: 'tv' }))));
        setTvHasMore((tv.value.page || 1) < (tv.value.total_pages || 1));
      }
      if (top.status === 'fulfilled') {
        successes++;
        setTopMovies(filterAdult((top.value.results || []).map((i: Film) => ({ ...i, media_type: 'movie' }))));
      }
      if (nowPlaying.status === 'fulfilled') {
        successes++;
        setRecentList(filterAdult((nowPlaying.value.results || []).map((i: Film) => ({ ...i, media_type: 'movie' }))));
      }
      if (anime.status === 'fulfilled') {
        successes++;
        setAnimeList(filterAdult((anime.value.results || []).map((i: Film) => ({ ...i, media_type: 'tv' }))));
        setAnimeHasMore((anime.value.page || 1) < (anime.value.total_pages || 1));
      }
      if (cast.status === 'fulfilled') {
        successes++;
        setPeople(cast.value.results || []);
      }
      if (mGenres.status === 'fulfilled') setMovieGenres(mGenres.value.genres || []);
      if (tGenres.status === 'fulfilled') setTvGenres(tGenres.value.genres || []);
      setError(successes ? '' : 'Could not connect to the movie service');
      setHomeLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, [activeProfile.is_kids]);

  // Personalized recommendations from profile's favorites or watch history
  useEffect(() => {
    const seedSaved = saved[0];
    const seedHistory = watchHistory.find(h => h.tmdb_id);
    const seedType = seedSaved?.media_type === 'tv' ? 'tv' : 'movie';
    const seedId = seedSaved?.id || seedHistory?.tmdb_id;

    if (!seedId) {
      setPersonalizedRecs([]);
      return;
    }

    let cancelled = false;
    api(`/${seedType}/${seedId}/recommendations?language=en-US`)
      .then(data => {
        if (cancelled) return;
        const list = (data.results || [])
          .filter((f: Film) => (activeProfile.is_kids ? !f.adult : true))
          .slice(0, 12)
          .map((f: Film) => ({ ...f, media_type: f.media_type || seedType }));
        setPersonalizedRecs(list);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [saved.length, watchHistory.length, activeProfile.id, activeProfile.is_kids]);

  // Sync user profiles + saved titles + watch history with Supabase when signed in
  useEffect(() => {
    if (!user || !supabase) return;
    let cancelled = false;

    // 1. Load user profiles from Supabase
    supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data, error: profErr }: any) => {
        if (cancelled || profErr || !Array.isArray(data) || data.length === 0) return;
        setProfiles(data);
        writeJsonStorage(profilesStorageKey, data);
        if (!data.some((p: Profile) => p.id === activeProfileId)) {
          setActiveProfileId(data[0].id);
        }
      }, () => {});

    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const client = supabase;
    if (!user || !client) return;
    let cancelled = false;
    setSavedLoading(true);

    // Guest favorites migration/merge on login
    const guestFavs = readJsonStorage<Film[]>(favoritesKeyFor(activeProfile.id), []);

    client
      .from('saved_titles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(async ({ data, error: dbError }: any) => {
        if (cancelled) return;
        if (dbError) {
          setSaved(guestFavs);
          setSavedLoading(false);
          return;
        }
        const rows = (data || []).filter((item: any) => !item.profile_id || item.profile_id === activeProfile.id);
        const mapped: Film[] = rows.map((item: any) => ({
          id: item.tmdb_id,
          title: item.title,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          media_type: item.media_type
        }));

        const scopedProfileId = isUuid(activeProfile.id) ? activeProfile.id : null;
        // Sync any guest favorites not yet in Supabase
        for (const gf of guestFavs) {
          const mt = gf.media_type || 'movie';
          if (!mapped.some(m => m.id === gf.id && m.media_type === mt)) {
            const insertPayload: Record<string, unknown> = {
              user_id: user.id,
              tmdb_id: gf.id,
              media_type: mt,
              title: title(gf),
              poster_path: gf.poster_path,
              vote_average: gf.vote_average
            };
            if (scopedProfileId) insertPayload.profile_id = scopedProfileId;
            let { error: insErr } = await client.from('saved_titles').insert(insertPayload);
            if (insErr && scopedProfileId) {
              delete insertPayload.profile_id;
              ({ error: insErr } = await client.from('saved_titles').insert(insertPayload));
            }
            if (!insErr) mapped.unshift({ ...gf, media_type: mt });
          }
        }
        if (!cancelled) {
          setSaved(mapped);
          writeJsonStorage(favoritesKeyFor(activeProfile.id), mapped);
          setSavedLoading(false);
        }
      });

    // Load user playback preferences from Supabase
    client
      .from('user_preferences')
      .select('preferred_playback_speed')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (cancelled || !data) return;
        const speed = Number(data.preferred_playback_speed);
        if (Number.isFinite(speed) && speed >= 0.5 && speed <= 2) {
          setPreferredPlaybackSpeed(speed);
          writeJsonStorage(prefsStorageKey, { preferred_playback_speed: speed });
        }
      }, () => {});

    // Load watch history from Supabase & merge with local (including uploading newer local guest entries)
    client
      .from('watch_history')
      .select('*')
      .eq('user_id', user.id)
      .order('last_watched_at', { ascending: false })
      .limit(30)
      .then(async ({ data, error: whError }: any) => {
        if (cancelled || whError || !Array.isArray(data)) return;
        const scoped = data.filter((row: any) => !row.profile_id || row.profile_id === activeProfile.id);
        const localRows = readJsonStorage<WatchHistoryEntry[]>(historyKeyFor(activeProfile.id), []);
        const map = new Map<string, WatchHistoryEntry>();
        for (const row of scoped) map.set(row.item_key, row);
        for (const local of localRows) {
          const existing = map.get(local.item_key);
          if (!existing || new Date(local.last_watched_at) > new Date(existing.last_watched_at)) {
            map.set(local.item_key, local);
            const upsertPayload: Record<string, unknown> = {
              user_id: user.id,
              item_key: local.item_key,
              media_type: local.media_type,
              tmdb_id: local.tmdb_id ?? null,
              free_film_id: local.free_film_id ?? null,
              title: local.title,
              poster_path: local.poster_path ?? null,
              progress_seconds: local.progress_seconds,
              duration_seconds: local.duration_seconds,
              completed: local.completed,
              last_watched_at: local.last_watched_at
            };
            if (isUuid(activeProfile.id)) upsertPayload.profile_id = activeProfile.id;
            const { error: upErr } = await client.from('watch_history').upsert(upsertPayload, { onConflict: 'user_id,item_key' });
            if (upErr && upsertPayload.profile_id) {
              delete upsertPayload.profile_id;
              await client.from('watch_history').upsert(upsertPayload, { onConflict: 'user_id,item_key' });
            }
          }
        }
        const merged = Array.from(map.values())
          .sort((a, b) => new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime())
          .slice(0, 30);
        if (!cancelled) {
          setWatchHistory(merged);
          writeJsonStorage(historyKeyFor(activeProfile.id), merged);
        }
      }, () => {});

    return () => { cancelled = true; };
  }, [user, activeProfile.id]);

  // Category fetch helpers
  function loadMoviesCatalog(
    genreId: number | null,
    sortBy: string,
    yearVal: string,
    minRating: number,
    pageNum: number,
    append: boolean
  ) {
    setMoviesBusy(true);
    const params = new URLSearchParams({
      language: 'en-US',
      sort_by: sortBy,
      page: String(pageNum),
      include_adult: 'false'
    });
    if (genreId) params.set('with_genres', String(genreId));
    else if (activeProfile.is_kids) params.set('with_genres', '10751');
    if (yearVal && /^\d{4}$/.test(yearVal)) params.set('primary_release_year', yearVal);
    if (minRating > 0) params.set('vote_average.gte', String(minRating));
    if (sortBy === 'vote_average.desc') params.set('vote_count.gte', '200');

    api(`/discover/movie?${params.toString()}`)
      .then(data => {
        const items = (data.results || [])
          .filter((f: Film) => (activeProfile.is_kids ? !f.adult : true))
          .map((item: Film) => ({ ...item, media_type: 'movie' }));
        setMovies(prev => (append ? [...prev, ...items] : items));
        setMoviePage(pageNum);
        setMovieHasMore(pageNum < Math.min(data.total_pages || 1, 20));
      })
      .catch(() => {})
      .finally(() => setMoviesBusy(false));
  }

  function loadSeriesCatalog(
    genreId: number | null,
    sortBy: string,
    yearVal: string,
    minRating: number,
    pageNum: number,
    append: boolean
  ) {
    setTvBusy(true);
    const params = new URLSearchParams({
      language: 'en-US',
      sort_by: sortBy,
      page: String(pageNum),
      include_adult: 'false'
    });
    if (genreId) params.set('with_genres', String(genreId));
    else if (activeProfile.is_kids) params.set('with_genres', '10751');
    if (yearVal && /^\d{4}$/.test(yearVal)) params.set('first_air_date_year', yearVal);
    if (minRating > 0) params.set('vote_average.gte', String(minRating));
    if (sortBy === 'vote_average.desc') params.set('vote_count.gte', '100');

    api(`/discover/tv?${params.toString()}`)
      .then(data => {
        const items = (data.results || []).map((item: Film) => ({ ...item, media_type: 'tv' }));
        setShows(prev => (append ? [...prev, ...items] : items));
        setTvPage(pageNum);
        setTvHasMore(pageNum < Math.min(data.total_pages || 1, 20));
      })
      .catch(() => {})
      .finally(() => setTvBusy(false));
  }

  function loadAnimeCatalog(
    mediaType: 'tv' | 'movie',
    sortBy: string,
    yearVal: string,
    minRating: number,
    pageNum: number,
    append: boolean
  ) {
    setAnimeBusy(true);
    const params = new URLSearchParams({
      language: 'en-US',
      sort_by: sortBy,
      page: String(pageNum),
      with_genres: '16',
      with_original_language: 'ja',
      include_adult: 'false'
    });
    if (yearVal && /^\d{4}$/.test(yearVal)) {
      params.set(mediaType === 'tv' ? 'first_air_date_year' : 'primary_release_year', yearVal);
    }
    if (minRating > 0) params.set('vote_average.gte', String(minRating));
    if (sortBy === 'vote_average.desc') params.set('vote_count.gte', '80');

    api(`/discover/${mediaType}?${params.toString()}`)
      .then(data => {
        const items = (data.results || []).map((item: Film) => ({ ...item, media_type: mediaType }));
        setAnimeList(prev => (append ? [...prev, ...items] : items));
        setAnimePage(pageNum);
        setAnimeHasMore(pageNum < Math.min(data.total_pages || 1, 20));
      })
      .catch(() => {})
      .finally(() => setAnimeBusy(false));
  }

  // Hero slides (honors admin featuredConfig.heroTmdbIds if prioritized)
  const heroSlides = useMemo(() => {
    const valid = trending.filter(item => item.backdrop_path && item.overview);
    if (featuredConfig.heroTmdbIds?.length) {
      const idSet = new Set(featuredConfig.heroTmdbIds);
      const prioritized = valid.filter(i => idSet.has(i.id));
      const rest = valid.filter(i => !idSet.has(i.id));
      return [...prioritized, ...rest].slice(0, 6);
    }
    return valid.slice(0, 6);
  }, [trending, featuredConfig.heroTmdbIds]);

  const hero = heroSlides[heroIndex % Math.max(heroSlides.length, 1)] || trending[0] || null;

  useEffect(() => {
    if (heroSlides.length <= 1 || path !== '/') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setHeroIndex(i => (i + 1) % heroSlides.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, path]);

  // Search with suggestions & history
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setPeopleResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      trackAnalytics('search', trimmed);
      api(`/search/multi?query=${encodeURIComponent(trimmed)}&language=en-US&include_adult=false`)
        .then(data => {
          const raw = (data.results || []) as any[];
          const media = raw
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .filter(item => (activeProfile.is_kids ? !item.adult : true));
          const castMatches = raw.filter(item => item.media_type === 'person');
          setResults(media);
          setPeopleResults(castMatches);
        })
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, activeProfile.is_kids]);

  function commitSearchHistory(term: string) {
    const clean = term.trim();
    if (clean.length < 2) return;
    setSearchHistory(prev => {
      const next = [clean, ...prev.filter(x => x.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      writeJsonStorage(searchHistoryKeyFor(activeProfile.id), next);
      return next;
    });
  }

  // Filtered search results
  const filteredSearchResults = useMemo(() => {
    return results.filter(item => {
      if (searchTypeFilter === 'movie' && item.media_type !== 'movie') return false;
      if (searchTypeFilter === 'tv' && item.media_type !== 'tv') return false;
      if (searchTypeFilter === 'anime' && !isAnimeFilm(item)) return false;
      if (searchYearFilter && /^\d{4}$/.test(searchYearFilter)) {
        const yr = (item.release_date || item.first_air_date || '').slice(0, 4);
        if (yr !== searchYearFilter) return false;
      }
      if (searchRatingFilter > 0 && (item.vote_average || 0) < searchRatingFilter) return false;
      return true;
    });
  }, [results, searchTypeFilter, searchYearFilter, searchRatingFilter]);

  // Favorites (supports both Supabase authenticated users AND guest localStorage)
  async function toggleSaved(film: Film, type = 'movie') {
    const mediaType = film.media_type || type;
    const item: Film = { ...film, media_type: mediaType };
    const exists = saved.some(s => s.id === film.id && (s.media_type || 'movie') === mediaType);

    if (!user || !supabase) {
      const next = exists
        ? saved.filter(s => !(s.id === film.id && (s.media_type || 'movie') === mediaType))
        : [item, ...saved];
      setSaved(next);
      writeJsonStorage(favoritesKeyFor(activeProfile.id), next);
      return;
    }

    setError('');
    if (exists) {
      const { error: dbError } = await supabase
        .from('saved_titles')
        .delete()
        .eq('user_id', user.id)
        .eq('media_type', mediaType)
        .eq('tmdb_id', film.id);
      if (dbError) { setError(dbError.message); return; }
      const next = saved.filter(s => !(s.id === film.id && (s.media_type || 'movie') === mediaType));
      setSaved(next);
      writeJsonStorage(favoritesKeyFor(activeProfile.id), next);
    } else {
      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        tmdb_id: item.id,
        media_type: item.media_type,
        title: title(item),
        poster_path: item.poster_path,
        vote_average: item.vote_average
      };
      if (isUuid(activeProfile.id)) insertPayload.profile_id = activeProfile.id;
      let { error: dbError } = await supabase.from('saved_titles').insert(insertPayload);
      if (dbError && insertPayload.profile_id) {
        delete insertPayload.profile_id;
        ({ error: dbError } = await supabase.from('saved_titles').insert(insertPayload));
      }
      if (dbError) { setError(dbError.message); return; }
      const next = [item, ...saved];
      setSaved(next);
      writeJsonStorage(favoritesKeyFor(activeProfile.id), next);
    }
  }

  function toggleDownload(film: Film) {
    const mediaType = film.media_type || 'movie';
    const exists = downloads.some(item => item.id === film.id && (item.media_type || 'movie') === mediaType);
    const next = exists
      ? downloads.filter(item => !(item.id === film.id && (item.media_type || 'movie') === mediaType))
      : [{ ...film, media_type: mediaType }, ...downloads];
    setDownloads(next);
    writeJsonStorage(downloadKey, next);
  }

  // Watch history progress tracking (per activeProfile)
  function recordWatchProgress(film: FreeFilm, currentTime: number, duration: number, forceSync = false) {
    const progress = Math.floor(currentTime);
    const total = Math.floor(duration || film.runtimeSeconds || 0);
    if (progress < 3 || total <= 0) return;

    const now = Date.now();
    if (!forceSync && now - lastProgressSyncRef.current < 3000) return;
    lastProgressSyncRef.current = now;

    const completed = progress >= total * 0.95;
    if (completed && forceSync) trackAnalytics('play_complete', film.id);

    const itemKey = `free:${film.id}`;
    const entry: WatchHistoryEntry = {
      item_key: itemKey,
      profile_id: activeProfile.id,
      media_type: 'free-film',
      tmdb_id: film.tmdbId ?? null,
      free_film_id: film.id,
      title: film.title,
      poster_path: film.posterPath ?? null,
      progress_seconds: completed ? total : progress,
      duration_seconds: total,
      completed,
      last_watched_at: new Date().toISOString()
    };

    setWatchHistory(prev => {
      const next = [entry, ...prev.filter(item => item.item_key !== itemKey)].slice(0, 30);
      writeJsonStorage(historyKeyFor(activeProfile.id), next);
      return next;
    });

    if (user && dbClient) {
      const upsertPayload: Record<string, unknown> = {
        user_id: user.id,
        item_key: entry.item_key,
        media_type: entry.media_type,
        tmdb_id: entry.tmdb_id,
        free_film_id: entry.free_film_id,
        title: entry.title,
        poster_path: entry.poster_path,
        progress_seconds: entry.progress_seconds,
        duration_seconds: entry.duration_seconds,
        completed: entry.completed,
        last_watched_at: entry.last_watched_at
      };
      if (isUuid(activeProfile.id)) upsertPayload.profile_id = activeProfile.id;
      dbClient
        .from('watch_history')
        .upsert(upsertPayload, { onConflict: 'user_id,item_key' })
        .then(({ error: whErr }: any) => {
          if (whErr && upsertPayload.profile_id) {
            delete upsertPayload.profile_id;
            dbClient.from('watch_history').upsert(upsertPayload, { onConflict: 'user_id,item_key' }).then(() => {}, () => {});
          }
        }, () => {});
    }
  }

  function updateUserPreferences(prefs: { preferred_playback_speed?: number; preferred_subtitle_lang?: string }) {
    if (typeof prefs.preferred_playback_speed === 'number') {
      setPreferredPlaybackSpeed(prefs.preferred_playback_speed);
      writeJsonStorage(prefsStorageKey, { preferred_playback_speed: prefs.preferred_playback_speed });
    }
    if (user && dbClient) {
      dbClient
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            preferred_playback_speed: prefs.preferred_playback_speed ?? preferredPlaybackSpeed,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        )
        .then(() => {}, () => {});
    }
  }

  function removeWatchHistoryItem(itemKey: string) {
    setWatchHistory(prev => {
      const next = prev.filter(item => item.item_key !== itemKey);
      writeJsonStorage(historyKeyFor(activeProfile.id), next);
      return next;
    });
    if (user && dbClient) {
      dbClient.from('watch_history').delete().eq('user_id', user.id).eq('item_key', itemKey).then(() => {}, () => {});
    }
  }

  // Profile CRUD
  async function createProfile(input: { name: string; avatar: Profile['avatar']; is_kids: boolean; autoplay_next: boolean }) {
    if (user && dbClient) {
      const { data, error: dbErr } = await dbClient
        .from('user_profiles')
        .insert({ user_id: user.id, ...input })
        .select()
        .single();
      if (!dbErr && data) {
        const next = [...profiles, data];
        setProfiles(next);
        writeJsonStorage(profilesStorageKey, next);
        setActiveProfileId(data.id);
        return;
      }
    }
    const localProf: Profile = {
      id: `local-${crypto.randomUUID().slice(0, 8)}`,
      ...input,
      preferred_genres: []
    };
    const next = [...profiles, localProf];
    setProfiles(next);
    writeJsonStorage(profilesStorageKey, next);
    setActiveProfileId(localProf.id);
  }

  async function updateProfile(id: string, input: Partial<Profile>) {
    if (user && dbClient && !id.startsWith('local-') && id !== 'default-main') {
      await dbClient.from('user_profiles').update(input).eq('id', id).eq('user_id', user.id);
    }
    const next = profiles.map(p => (p.id === id ? { ...p, ...input } : p));
    setProfiles(next);
    writeJsonStorage(profilesStorageKey, next);
  }

  async function deleteProfile(id: string) {
    if (profiles.length <= 1) return;
    if (user && dbClient && !id.startsWith('local-') && id !== 'default-main') {
      await dbClient.from('user_profiles').delete().eq('id', id).eq('user_id', user.id);
    }
    const next = profiles.filter(p => p.id !== id);
    setProfiles(next);
    writeJsonStorage(profilesStorageKey, next);
    if (activeProfileId === id) setActiveProfileId(next[0].id);
  }

  // Auth handlers
  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    setBusy(true); setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError(authError.message);
    } catch { setError('Could not sign in right now. Please try again.'); }
    finally { setBusy(false); }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    if (password.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin }
      });
      if (authError) setError(authError.message);
      else {
        setAuthMode('signin');
        setPassword('');
        setConfirmPassword('');
        setError(data.session ? 'Your account is ready. You are signed in.' : 'Check your email to confirm your account.');
      }
    } catch { setError('Could not create the account right now. Please try again.'); }
    finally { setBusy(false); }
  }

  async function requestPasswordReset(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    if (!email.trim()) { setError('Enter the email address for your account.'); return; }
    setBusy(true); setError('');
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      setError(authError?.message || 'If an account exists for that email, a password-reset link will arrive shortly.');
    } catch { setError('Could not send a reset email right now. Please try again.'); }
    finally { setBusy(false); }
  }

  async function sendSmsRecoveryCode(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    const normalizedPhone = phoneNumber.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) { setError('Enter your phone in international format, for example +201234567890.'); return; }
    setBusy(true); setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({ phone: normalizedPhone, options: { channel: 'sms', shouldCreateUser: false } });
      if (authError) { recoveryFlowRef.current = false; setError('Could not send a code. Check that this verified phone is linked to your account.'); }
      else { recoveryFlowRef.current = true; setPhoneNumber(normalizedPhone); setAuthMode('sms-code'); setError('Enter the verification code sent to your phone.'); }
    } catch { recoveryFlowRef.current = false; setError('Could not send a code right now. Please try again.'); }
    finally { setBusy(false); }
  }

  async function verifySmsRecoveryCode(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    if (!/^\d{4,10}$/.test(smsToken.trim())) { setError('Enter the verification code from your SMS.'); return; }
    setBusy(true); setError(''); recoveryFlowRef.current = true;
    try {
      const { error: authError } = await supabase.auth.verifyOtp({ phone: phoneNumber, token: smsToken.trim(), type: 'sms' });
      if (authError) setError('That code could not be verified. Check it or request a new one.');
      else { setAuthMode('reset-password'); setPassword(''); setConfirmPassword(''); setError('Verified. Choose a new password for your account.'); }
    } catch { setError('Could not verify the code right now. Please try again.'); }
    finally { setBusy(false); }
  }

  async function saveNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    if (password.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) setError(authError.message);
      else {
        recoveryFlowRef.current = false;
        setAuth(false);
        setAuthMode('signin');
        setPassword('');
        setConfirmPassword('');
        setSmsToken('');
        setError('Your password has been updated.');
      }
    } catch { setError('Could not update your password right now. Please try again.'); }
    finally { setBusy(false); }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    setBusy(true); setError('');
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true }
    });
    setBusy(false);
    setError(loginError?.message || 'We sent a sign-in link to your email.');
  }

  async function loginWithGoogle() {
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    setBusy(true); setError('');
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (googleError) { setBusy(false); setError(googleError.message); }
  }

  // Detail & Celebrity loading
  const detail = path.match(/^\/(movie|tv)\/(\d+)/);
  const celebrity = path.match(/^\/celebrity\/(\d+)/);

  useEffect(() => {
    setDetailItem(null);
    setDetailError('');
    setWatchProviders(null);
    setSeasonEpisodes([]);
    setSelectedSeason(1);
    if (!detail) { setDetailLoading(false); return; }
    let cancelled = false;
    setDetailLoading(true);
    trackAnalytics('detail_view', `${detail[1]}:${detail[2]}`);

    api(`/${detail[1]}/${detail[2]}?language=en-US&append_to_response=credits,recommendations,similar`)
      .then(data => {
        if (cancelled) return;
        setDetailItem(data);
        if (detail[1] === 'tv' && Array.isArray(data.seasons)) {
          const firstSeason = data.seasons.find((s: any) => s.season_number >= 1) || data.seasons[0];
          if (firstSeason) setSelectedSeason(firstSeason.season_number);
        }
      })
      .catch(() => { if (!cancelled) setDetailError('Could not load title details. Please try again later.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });

    api(`/${detail[1]}/${detail[2]}/watch/providers`)
      .then(data => {
        if (cancelled || !data?.results) return;
        const regionKey = data.results.EG ? 'EG' : data.results.US ? 'US' : Object.keys(data.results)[0];
        if (!regionKey) return;
        const entry = data.results[regionKey];
        setWatchProviders({
          region: regionKey,
          link: entry.link,
          flatrate: entry.flatrate || [],
          free: entry.free || [],
          rent: entry.rent || [],
          buy: entry.buy || []
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [path]);

  // Fetch season episodes for TV / Anime
  useEffect(() => {
    if (!detail || detail[1] !== 'tv' || !detailItem?.id) return;
    let cancelled = false;
    setSeasonLoading(true);
    api(`/tv/${detailItem.id}/season/${selectedSeason}?language=en-US`)
      .then(data => {
        if (!cancelled) setSeasonEpisodes(data.episodes || []);
      })
      .catch(() => { if (!cancelled) setSeasonEpisodes([]); })
      .finally(() => { if (!cancelled) setSeasonLoading(false); });
    return () => { cancelled = true; };
  }, [detail?.[1], detailItem?.id, selectedSeason]);

  useEffect(() => {
    setPersonItem(null);
    if (!celebrity) { setPersonLoading(false); return; }
    let cancelled = false;
    setPersonLoading(true);
    api(`/person/${celebrity[1]}?language=en-US&append_to_response=combined_credits`)
      .then(data => { if (!cancelled) setPersonItem(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPersonLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    setReviews([]); setRating(0); setComment(''); setReviewMessage('');
    if (!detailItem?.id || !dbClient) return;
    let cancelled = false;
    const mediaType = detail?.[1] || 'movie';
    dbClient
      .from('title_reviews')
      .select('*')
      .eq('tmdb_id', detailItem.id)
      .eq('media_type', mediaType)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: dbError }: any) => {
        if (cancelled) return;
        if (dbError) {
          setReviewMessage('Reviews are unavailable. Apply supabase/schema.sql in Supabase SQL Editor.');
          return;
        }
        const rows: ReviewItem[] = (data || []).filter((r: ReviewItem) => r.status !== 'hidden');
        setReviews(rows);
        const ownReview = rows.find((item: ReviewItem) => item.user_id === user?.id && (!item.profile_id || item.profile_id === activeProfile.id));
        if (ownReview) {
          setRating(ownReview.rating);
          setComment(ownReview.comment);
        }
      });
    return () => { cancelled = true; };
  }, [detailItem?.id, detail?.[1], user, dbClient, activeProfile.id]);

  useEffect(() => {
    setTrailer(null);
    if (!detail?.[1] || !detailItem?.id) { setTrailerLoading(false); return; }
    let cancelled = false;
    setTrailerLoading(true);
    api(`/${detail[1]}/${detailItem.id}/videos?language=en-US`)
      .then(data => {
        if (cancelled) return;
        const videos = (data.results || []).filter((video: any) => video.site === 'YouTube' && video.key);
        setTrailer(
          videos.find((video: any) => video.official && video.type === 'Trailer') ||
          videos.find((video: any) => video.type === 'Trailer') ||
          videos.find((video: any) => video.type === 'Teaser') ||
          null
        );
      })
      .catch(() => { if (!cancelled) setTrailer(null); })
      .finally(() => { if (!cancelled) setTrailerLoading(false); });
    return () => { cancelled = true; };
  }, [path, detailItem?.id]);

  const sortedReviews = useMemo(() => {
    const copy = [...reviews];
    if (reviewSort === 'helpful') {
      copy.sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0));
    } else {
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return copy;
  }, [reviews, reviewSort]);

  const reviewAverage = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !supabase) { setAuth(true); setReviewMessage('Sign in to publish your review.'); return; }
    if (!detailItem || !detail?.[1]) return;
    if (!rating) { setReviewMessage('Choose a rating from 1 to 10.'); return; }
    if (!comment.trim()) { setReviewMessage('Add a comment before publishing.'); return; }
    setReviewBusy(true); setReviewMessage('');
    const payload: Record<string, unknown> = {
      user_id: user.id,
      media_type: detail[1],
      tmdb_id: detailItem.id,
      title: title(detailItem),
      rating,
      comment: comment.trim(),
      author_name: activeProfile.name
    };
    if (isUuid(activeProfile.id)) payload.profile_id = activeProfile.id;
    let { data, error: dbError } = await supabase
      .from('title_reviews')
      .upsert(payload, { onConflict: 'user_id,media_type,tmdb_id' })
      .select()
      .single();
    if (dbError && (payload.profile_id || payload.author_name)) {
      delete payload.profile_id;
      delete payload.author_name;
      ({ data, error: dbError } = await supabase
        .from('title_reviews')
        .upsert(payload, { onConflict: 'user_id,media_type,tmdb_id' })
        .select()
        .single());
    }
    setReviewBusy(false);
    if (dbError) { setReviewMessage(dbError.message); return; }
    setReviews(rows => [data, ...rows.filter(row => row.user_id !== user.id)]);
    setReviewMessage('Your review is published.');
  }

  async function deleteOwnReview(reviewId: number) {
    if (!user || !supabase) return;
    const { error: dbError } = await supabase.from('title_reviews').delete().eq('id', reviewId).eq('user_id', user.id);
    if (dbError) { setReviewMessage(dbError.message); return; }
    setReviews(rows => rows.filter(r => r.id !== reviewId));
    setRating(0);
    setComment('');
    setReviewMessage('Your review was deleted.');
  }

  async function toggleHelpful(review: ReviewItem) {
    if (!user || !supabase) { setAuth(true); return; }
    const alreadyVoted = helpfulVoteIds.includes(review.id);
    if (alreadyVoted) {
      await supabase.from('review_votes').delete().eq('review_id', review.id).eq('user_id', user.id).then(() => {}, () => {});
      setHelpfulVoteIds(ids => ids.filter(id => id !== review.id));
      setReviews(rows => rows.map(r => (r.id === review.id ? { ...r, helpful_count: Math.max(0, (r.helpful_count || 0) - 1) } : r)));
    } else {
      await supabase.from('review_votes').insert({ review_id: review.id, user_id: user.id }).then(() => {}, () => {});
      setHelpfulVoteIds(ids => [...ids, review.id]);
      setReviews(rows => rows.map(r => (r.id === review.id ? { ...r, helpful_count: (r.helpful_count || 0) + 1 } : r)));
    }
  }

  async function submitReport(event: React.FormEvent) {
    event.preventDefault();
    if (!reportTarget || reportReason.trim().length < 3) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        reason: reportReason.trim(),
        reporter: user?.email || activeProfile.name
      })
    });
    if (res.ok) {
      setReportMsg('Report submitted for administrator review.');
      setReportReason('');
      setTimeout(() => { setReportTarget(null); setReportMsg(''); }, 1200);
    } else {
      setReportMsg('Could not submit report.');
    }
  }

  function card(film: Film) {
    const type = film.media_type || 'movie';
    const isSaved = saved.some(item => item.id === film.id && (item.media_type || 'movie') === type);
    const freeMatch = type === 'movie' ? findFreeFilmMatch(film, allFreeFilms) : undefined;
    const animeBadge = isAnimeFilm(film);
    return (
      <article
        className="card"
        key={`${type}-${film.id}`}
        onClick={() => go(`/${type}/${film.id}`)}
        onMouseMove={handleCardPointerMove}
        onMouseLeave={handleCardPointerLeave}
      >
        <div className="poster">
          {film.poster_path ? (
            <img
              src={img(film.poster_path)}
              loading="lazy"
              alt={title(film)}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="posterEmpty"><Clapperboard /></div>
          )}
          <div className="posterSheen" aria-hidden="true" />
          <div className="cardQuickActions">
            <button className="quickSave" aria-label={isSaved ? 'Remove from favorites' : 'Add to favorites'} title="My List" onClick={event => { event.stopPropagation(); toggleSaved(film, type); }}>
              <Heart size={15} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
            <button className="quickDownload" aria-label="Add to download queue" title="Download queue" onClick={event => { event.stopPropagation(); toggleDownload(film); }}>
              <Download size={15} />
            </button>
          </div>
          {freeMatch && <span className="streamTag">Full Movie</span>}
          {!freeMatch && animeBadge && <span className="streamTag animeTag">Anime</span>}
          <div className="posterShade">
            <span>{type === 'tv' ? 'Series' : 'Movie'}</span>
            <b><Star size={12} fill="currentColor" /> {(film.vote_average || 0).toFixed(1)}</b>
          </div>
        </div>
        <div className="cardTitle">{title(film)}</div>
        <div className="cardYear">{(film.release_date || film.first_air_date || '').slice(0, 4) || '—'}</div>
      </article>
    );
  }

  function shelf(label: string, items: Film[], to = '/discover', eyebrowText = 'Picked by Aurora') {
    return (
      <section className="shelf">
        <div className="shelfHead">
          <div><small>{eyebrowText}</small><h2>{label}</h2></div>
          <button className="textBtn" onClick={() => go(to)}>See all <ChevronRight size={16} /></button>
        </div>
        <div className="row">
          {homeLoading && !items.length
            ? Array.from({ length: 6 }, (_, i) => <div className="cardSkeleton" key={i} />)
            : items.slice(0, 12).map(card)}
          {!homeLoading && !items.length && <p className="muted">No titles available right now.</p>}
        </div>
      </section>
    );
  }

  function freeFeatureShelf() {
    return (
      <section className="shelf">
        <div className="shelfHead">
          <div><small>Verified public-domain streams</small><h2>{featuredConfig.curatedShelfTitle || 'Watch full movies free'}</h2></div>
          <button className="textBtn" onClick={() => go('/free-films')}>Open player <ChevronRight size={16} /></button>
        </div>
        <div className="row">
          {verifiedFullFeatures.map(entry => (
            <article
              className="card"
              key={entry.id}
              onClick={() => openFreeFilm(entry.id)}
              onMouseMove={handleCardPointerMove}
              onMouseLeave={handleCardPointerLeave}
            >
              <div className="poster">
                {entry.posterPath ? (
                  <img
                    src={img(entry.posterPath)}
                    loading="lazy"
                    alt={entry.title}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="posterEmpty"><Clapperboard /></div>
                )}
                <div className="posterSheen" aria-hidden="true" />
                <span className="streamTag">Full Movie</span>
                <div className="posterShade">
                  <span>{formatRuntime(entry.runtimeSeconds)}</span>
                  <b><Play size={12} fill="currentColor" /> Watch</b>
                </div>
              </div>
              <div className="cardTitle">{entry.title}</div>
              <div className="cardYear">{entry.year} · {entry.provider}</div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function peopleShelf() {
    return (
      <section className="shelf">
        <div className="shelfHead">
          <div><small>Meet the talent</small><h2>Popular celebrities</h2></div>
          <button className="textBtn" onClick={() => go('/celebrities')}>See all <ChevronRight size={16} /></button>
        </div>
        <div className="peopleRow">{people.slice(0, 10).map(personCard)}</div>
      </section>
    );
  }

  function personCard(person: Person) {
    return (
      <button className="personCard" key={person.id} onClick={() => go(`/celebrity/${person.id}`)}>
        <span className="personPortrait">
          {person.profile_path ? (
            <img
              src={img(person.profile_path, 'w342')}
              loading="lazy"
              alt={person.name}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <UserRound />
          )}
        </span>
        <b>{person.name}</b>
        <small>{person.character || person.known_for_department || 'Artist'}</small>
      </button>
    );
  }

  const navItems = [
    { label: 'Home', to: '/', icon: <Home size={14} /> },
    { label: 'Movies', to: '/movies', icon: <FilmIcon size={14} /> },
    { label: 'Series', to: '/series', icon: <Tv size={14} /> },
    { label: 'Anime', to: '/anime', icon: <Sparkles size={14} /> },
    { label: 'Top 10', to: '/top-movies', icon: <Trophy size={14} /> },
    { label: 'Free Films', to: '/free-films', icon: <Play size={14} /> },
    { label: 'My List', to: '/my-list', icon: <Heart size={14} /> },
    { label: 'Discover', to: '/discover', icon: <Compass size={14} /> }
  ];

  const activeNav = path === '/' ? '/' : path.startsWith('/movie') ? '/movies' : path.startsWith('/tv') ? '/series' : path;
  const selectedFreeFilm = allFreeFilms.find(f => f.id === selectedFreeFilmId) || allFreeFilms[0];
  const selectedFilmIndex = allFreeFilms.findIndex(f => f.id === selectedFreeFilm?.id);
  const nextFreeFilm = selectedFilmIndex >= 0 && selectedFilmIndex + 1 < allFreeFilms.length ? allFreeFilms[selectedFilmIndex + 1] : undefined;
  const filteredFreeFilms = allFreeFilms.filter(f => (freeFilmFilter === 'all' ? true : f.contentType === freeFilmFilter));
  const selectedProgress = watchHistory.find(h => h.free_film_id === selectedFreeFilm?.id || h.item_key === `free:${selectedFreeFilm?.id}`);

  const detailFreeMatch = detail && detail[1] === 'movie' && detailItem ? findFreeFilmMatch(detailItem, allFreeFilms) : undefined;
  const detailShortMatch = detail && detail[1] === 'movie' && detailItem && !detailFreeMatch ? findFreeShortMatch(detailItem, allFreeFilms) : undefined;
  const hasExternalProviders = Boolean(
    watchProviders &&
    (watchProviders.flatrate.length > 0 || watchProviders.free.length > 0 || watchProviders.rent.length > 0 || watchProviders.buy.length > 0)
  );
  const detailCast: Person[] = (detailItem?.credits?.cast || []).slice(0, 12);
  const detailCrew: Person[] = (detailItem?.credits?.crew || [])
    .filter((c: Person) => ['Director', 'Creator', 'Executive Producer', 'Writer'].includes(c.job || ''))
    .slice(0, 4);
  const detailRecommendations: Film[] = (detailItem?.recommendations?.results || [])
    .slice(0, 12)
    .map((item: Film) => ({ ...item, media_type: item.media_type || detail?.[1] || 'movie' }));
  const detailSimilar: Film[] = (detailItem?.similar?.results || [])
    .slice(0, 12)
    .map((item: Film) => ({ ...item, media_type: item.media_type || detail?.[1] || 'movie' }));
  const isDetailSaved = detailItem
    ? saved.some(item => item.id === detailItem.id && (item.media_type || 'movie') === (detail?.[1] || 'movie'))
    : false;
  const heroFreeMatch = hero && hero.media_type !== 'tv' ? findFreeFilmMatch(hero, allFreeFilms) : undefined;

  return (
    <>
      <InstallPrompt />
      {introVisible && (
        <div
          className="introVideo"
          onAnimationEnd={event => {
            if (event.target === event.currentTarget) {
              sessionStorage.setItem('aurora-intro-seen', '1');
              setIntroVisible(false);
            }
          }}
        >
          <video
            src="/aurora-intro.mp4"
            autoPlay
            muted
            playsInline
            onEnded={() => {
              sessionStorage.setItem('aurora-intro-seen', '1');
              setIntroVisible(false);
            }}
          />
          <div className="introVignette" />
          <div className="introWordmark"><span className="brandMark">◜</span><b>Aurora</b></div>
        </div>
      )}

      <header className="topbar">
        <button className="brand" onClick={() => go('/')}><span className="brandMark">◜</span><b>Aurora</b></button>
        <nav aria-label="Main navigation">
          {navItems.map(item => (
            <button key={item.to} className={activeNav === item.to ? 'active' : ''} onClick={() => go(item.to)}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
        <div className="topActions">
          <div className="searchWrap">
            <label className="search">
              <Search size={17} />
              <input
                placeholder="Search titles, anime, actors"
                value={query}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onKeyDown={e => { if (e.key === 'Enter') commitSearchHistory(query); }}
                onChange={event => setQuery(event.target.value)}
              />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}
            </label>
            {searchFocused && !query.trim() && searchHistory.length > 0 && (
              <div className="searchDropdown">
                <div className="searchDropdownHead">
                  <small>Recent searches</small>
                  <button
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      setSearchHistory([]);
                      writeJsonStorage(searchHistoryKeyFor(activeProfile.id), []);
                    }}
                  >
                    Clear
                  </button>
                </div>
                {searchHistory.map(term => (
                  <button
                    key={term}
                    type="button"
                    className="searchSuggestionBtn"
                    onMouseDown={e => {
                      e.preventDefault();
                      setQuery(term);
                    }}
                  >
                    <History size={13} /> {term}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="profilePill"
            onClick={() => go('/profiles')}
            title="Switch viewing profile"
          >
            <span className="profilePillDot" style={{ background: avatarBackground(activeProfile.avatar) }}>
              {activeProfile.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{activeProfile.name}{activeProfile.is_kids ? ' · Kids' : ''}</span>
          </button>

          {user ? (
            <>
              <button className="iconNavBtn" onClick={() => go('/account')} aria-label="Account & Admin" title="Account">
                <Settings size={16} />
              </button>
              <button
                className="userBtn"
                onClick={async () => {
                  await supabase?.auth.signOut();
                  setUser(null);
                  setSessionToken('');
                }}
              >
                <LogOut size={16} /> Sign out
              </button>
            </>
          ) : (
            <>
              <button className="iconNavBtn" onClick={() => go('/admin')} aria-label="Admin Dashboard" title="Admin">
                <Shield size={16} />
              </button>
              <button className="loginBtn" onClick={() => setAuth(true)}>
                <UserRound size={17} /> Sign in
              </button>
            </>
          )}
        </div>
      </header>

      {query.trim().length > 1 ? (
        <main className="searchPage">
          <p className="eyebrow">Search &amp; Discovery</p>
          <h1>Searching for <span>{query}</span></h1>
          <div className="filterBar">
            <div className="genreChips">
              {(['all', 'movie', 'tv', 'anime', 'person'] as const).map(t => (
                <button
                  key={t}
                  className={searchTypeFilter === t ? 'selected' : ''}
                  onClick={() => setSearchTypeFilter(t)}
                >
                  {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : t === 'tv' ? 'TV Series' : t === 'anime' ? 'Anime' : 'People'}
                </button>
              ))}
            </div>
            <div className="filterRightGroup">
              <input
                className="yearInput"
                placeholder="Year"
                maxLength={4}
                value={searchYearFilter}
                onChange={e => setSearchYearFilter(e.target.value.replace(/\D/g, ''))}
              />
              <select
                className="sortSelect"
                value={searchRatingFilter}
                onChange={e => setSearchRatingFilter(Number(e.target.value))}
              >
                <option value={0}>Any rating</option>
                <option value={6}>6.0+ rating</option>
                <option value={7}>7.0+ rating</option>
                <option value={8}>8.0+ rating</option>
              </select>
            </div>
          </div>

          {searchTypeFilter === 'person' ? (
            <div className="peopleGrid">
              {peopleResults.map(personCard)}
              {!peopleResults.length && <p className="muted">{searchLoading ? 'Searching actors and creators…' : 'No matching people found.'}</p>}
            </div>
          ) : (
            <>
              {peopleResults.length > 0 && searchTypeFilter === 'all' && (
                <section className="shelf" style={{ paddingInline: 0 }}>
                  <div className="shelfHead"><div><small>Talent</small><h2>Matching People</h2></div></div>
                  <div className="peopleRow">{peopleResults.slice(0, 8).map(personCard)}</div>
                </section>
              )}
              <div className="grid">{filteredSearchResults.map(card)}</div>
              {!filteredSearchResults.length && (
                <p className="muted">{searchLoading ? 'Searching TMDB catalog…' : 'No matching titles found with these filters.'}</p>
              )}
            </>
          )}
        </main>
      ) : path === '/profiles' ? (
        <ProfilesView
          profiles={profiles}
          activeProfileId={activeProfile.id}
          signedInEmail={user?.email}
          onSelectProfile={id => setActiveProfileId(id)}
          onCreateProfile={createProfile}
          onUpdateProfile={updateProfile}
          onDeleteProfile={deleteProfile}
          onContinue={() => go('/')}
        />
      ) : path === '/admin' ? (
        <AdminDashboard
          supabaseAccessToken={sessionToken}
          userEmail={user?.email}
          builtinSources={baseFreeFilms}
          onSourcesUpdated={refreshCuratedSources}
          onOpenAuth={() => setAuth(true)}
        />
      ) : path === '/account' ? (
        <main className="searchPage">
          <p className="eyebrow"><Settings size={14} /> PROTECTED ACCOUNT</p>
          <h1>Account <span>Settings</span></h1>
          {!user ? (
            <div className="empty">
              <UserRound />
              <h2>Sign in required</h2>
              <p>Account settings and cloud profile sync require an authenticated Aurora session.</p>
              <button className="primary" onClick={() => setAuth(true)}>Sign in</button>
            </div>
          ) : (
            <div className="adminSplit">
              <section className="profileEditorCard">
                <h2>Account Identity</h2>
                <p className="muted"><strong>Email:</strong> {user.email || 'Phone account'}</p>
                <p className="muted">
                  <strong>Verification:</strong>{' '}
                  {user.email_confirmed_at ? 'Email verified' : 'Pending email verification'}
                </p>
                <p className="muted"><strong>Active Profile:</strong> {activeProfile.name}{activeProfile.is_kids ? ' (Kids)' : ''}</p>
                <div className="historyCardActions">
                  {!user.email_confirmed_at && user.email && (
                    <button
                      className="secondary"
                      onClick={async () => {
                        if (!supabase) return;
                        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: user.email });
                        setAccountMsg(resendErr ? resendErr.message : 'Verification email sent.');
                      }}
                    >
                      Resend verification email
                    </button>
                  )}
                  <button className="secondary" onClick={() => go('/profiles')}>Manage Profiles</button>
                  <button className="secondary" onClick={() => go('/admin')}>Admin Console</button>
                </div>
                {accountMsg && <p className="formMsg">{accountMsg}</p>}
              </section>

              <section className="profileEditorCard">
                <h2>Quick Links</h2>
                <div className="historyCardActions">
                  <button className="primary" onClick={() => go('/my-list')}>My List &amp; Watch History</button>
                  <button className="secondary" onClick={() => go('/downloads')}>Device Queue</button>
                  <button
                    className="historyRemove"
                    onClick={async () => {
                      await supabase?.auth.signOut();
                      setUser(null);
                      setSessionToken('');
                      go('/');
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </section>
            </div>
          )}
        </main>
      ) : detail ? (
        <main
          className="detailPage"
          style={{
            backgroundImage: detailItem?.backdrop_path
              ? `linear-gradient(95deg,rgba(4,8,20,.94) 0%,rgba(4,8,20,.86) 56%,rgba(4,8,20,.68) 100%),linear-gradient(0deg,#040814 14%,rgba(4,8,20,.88) 60%,rgba(4,8,20,.62) 100%),url(${img(detailItem.backdrop_path, 'original')})`
              : ''
          }}
        >
          <button className="backBtn" onClick={() => go('/')}>← Back</button>
          {detailItem && (
            <div className="detailHeroGrid">
              {detailItem.poster_path && (
                <div className="detailPosterBox">
                  <img src={img(detailItem.poster_path, 'w500')} alt={title(detailItem)} />
                </div>
              )}
              <div className="detailContent">
                <span className={`detailStreamBadge ${detailFreeMatch ? 'full' : detailShortMatch ? 'short' : hasExternalProviders ? 'external' : 'trailerOnly'}`}>
                  {detailFreeMatch
                    ? <><Play size={12} fill="currentColor" /> Full Movie Available (Free Public-Domain Stream)</>
                    : detailShortMatch
                      ? <><Play size={12} fill="currentColor" /> Open-License Short Available ({formatRuntime(detailShortMatch.runtimeSeconds)})</>
                      : hasExternalProviders
                        ? 'External Legal Streaming Provider Available'
                        : 'Trailer and Information Only'}
                </span>
                <p className="eyebrow">
                  {isAnimeFilm(detailItem) ? 'Anime' : detail[1] === 'tv' ? 'TV Series' : 'Movie'} •{' '}
                  {detailItem.release_date || detailItem.first_air_date || '—'}
                  {detailItem.runtime
                    ? ` • ${Math.floor(detailItem.runtime / 60)}h ${detailItem.runtime % 60}m`
                    : detailItem.episode_run_time?.[0]
                      ? ` • ~${detailItem.episode_run_time[0]}m/ep`
                      : ''}
                  {detailItem.number_of_seasons ? ` • ${detailItem.number_of_seasons} Seasons` : ''}
                </p>
                <h1>{title(detailItem)}</h1>
                {(detailItem.original_title && detailItem.original_title !== title(detailItem)) ||
                (detailItem.original_name && detailItem.original_name !== title(detailItem)) ? (
                  <p className="originalTitleLine">
                    Original title: {detailItem.original_title || detailItem.original_name}
                  </p>
                ) : null}
                <div className="meta">
                  <span><Star size={16} fill="currentColor" /> TMDB {detailItem.vote_average?.toFixed(1) || '—'} / 10</span>
                  <span>Aurora {reviewAverage ? `${reviewAverage.toFixed(1)} / 10 (${reviews.length})` : 'No user ratings yet'}</span>
                  <span>{detailItem.genres?.map((g: any) => g.name).slice(0, 3).join(' • ')}</span>
                </div>
                <p>{detailItem.overview || 'Discover more about this title on Aurora.'}</p>
                {detailCrew.length > 0 && (
                  <p className="crewLine">
                    <strong>Creators &amp; Crew:</strong>{' '}
                    {detailCrew.map(c => `${c.name} (${c.job})`).join(' · ')}
                  </p>
                )}
                <div className="detailActions">
                  {detailFreeMatch && (
                    <button className="watchFullMovie" onClick={() => openFreeFilm(detailFreeMatch.id)}>
                      <Play size={17} fill="currentColor" /> Play Full Movie
                    </button>
                  )}
                  {detailShortMatch && (
                    <button className="watchFullMovie" onClick={() => openFreeFilm(detailShortMatch.id)}>
                      <Play size={17} fill="currentColor" /> Play Free Short
                    </button>
                  )}
                  <button className="primary" onClick={() => toggleSaved(detailItem, detail[1])}>
                    <Heart size={17} fill={isDetailSaved ? 'currentColor' : 'none'} /> {isDetailSaved ? 'In My List' : 'Add to My List'}
                  </button>
                  <button className="secondary" onClick={() => toggleDownload(detailItem)}>
                    <Download size={16} /> Queue
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setReportTarget({ type: 'title', id: `${detail[1]}:${detail[2]}`, label: title(detailItem) })}
                  >
                    <Flag size={14} /> Report
                  </button>
                </div>
                <p className="notice">
                  {detailFreeMatch
                    ? `Verified full-length stream provided via ${detailFreeMatch.provider} (${detailFreeMatch.rightsLabel}).`
                    : detailShortMatch
                      ? `Open-license short film provided via ${detailShortMatch.provider} (${detailShortMatch.rightsLabel}).`
                      : 'Aurora only enables Play when a verified full-length source is available. Official trailers below are promotional previews only.'}
                </p>
              </div>
            </div>
          )}

          {!detailItem && (
            <p className="detailLoading">{detailError || (detailLoading ? 'Loading title details…' : 'Title details are unavailable.')}</p>
          )}

          {detail[1] === 'tv' && detailItem?.seasons?.length > 0 && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow">EPISODE GUIDE</p><h2>Seasons &amp; Episodes</h2></div>
                <select
                  className="sortSelect"
                  aria-label="Select season"
                  value={selectedSeason}
                  onChange={e => setSelectedSeason(Number(e.target.value))}
                >
                  {detailItem.seasons
                    .filter((s: any) => s.season_number >= 0)
                    .map((s: any) => (
                      <option key={s.id} value={s.season_number}>
                        {s.name} ({s.episode_count} eps)
                      </option>
                    ))}
                </select>
              </div>
              {seasonLoading ? (
                <p className="muted">Loading episodes…</p>
              ) : (
                <div className="episodesGrid">
                  {seasonEpisodes.map(ep => (
                    <article className="episodeCard" key={ep.id}>
                      {ep.still_path && <img src={img(ep.still_path, 'w300')} loading="lazy" alt={ep.name} />}
                      <div className="episodeBody">
                        <small>Episode {ep.episode_number}{ep.runtime ? ` · ${ep.runtime}m` : ''}</small>
                        <h3>{ep.name}</h3>
                        <p>{ep.overview || 'Episode synopsis unavailable.'}</p>
                      </div>
                    </article>
                  ))}
                  {!seasonEpisodes.length && <p className="muted">No episodes listed for this season.</p>}
                </div>
              )}
            </section>
          )}

          {hasExternalProviders && watchProviders && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow">LEGAL PROVIDERS ({watchProviders.region})</p><h2>Where to watch</h2></div>
                {watchProviders.link && <a className="archiveSource" href={watchProviders.link} target="_blank" rel="noreferrer">Open legal watch options ↗</a>}
              </div>
              <div className="providerGroups">
                {watchProviders.free.length > 0 && (
                  <div className="providerGroup">
                    <small>Free</small>
                    <div className="providerList">
                      {watchProviders.free.map(p => (
                        <a className="providerChip" key={`free-${p.provider_id}`} href={watchProviders.link} target="_blank" rel="noreferrer" aria-label={`Find ${title(detailItem)} on ${p.provider_name}`}>
                          {p.logo_path && <img src={img(p.logo_path, 'w92')} alt="" />}
                          {p.provider_name} <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {watchProviders.flatrate.length > 0 && (
                  <div className="providerGroup">
                    <small>Stream</small>
                    <div className="providerList">
                      {watchProviders.flatrate.map(p => (
                        <a className="providerChip" key={`flat-${p.provider_id}`} href={watchProviders.link} target="_blank" rel="noreferrer" aria-label={`Find ${title(detailItem)} on ${p.provider_name}`}>
                          {p.logo_path && <img src={img(p.logo_path, 'w92')} alt="" />}
                          {p.provider_name} <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {watchProviders.rent.length > 0 && (
                  <div className="providerGroup">
                    <small>Rent</small>
                    <div className="providerList">
                      {watchProviders.rent.map(p => (
                        <a className="providerChip" key={`rent-${p.provider_id}`} href={watchProviders.link} target="_blank" rel="noreferrer" aria-label={`Find ${title(detailItem)} on ${p.provider_name}`}>
                          {p.logo_path && <img src={img(p.logo_path, 'w92')} alt="" />}
                          {p.provider_name} <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {watchProviders.buy.length > 0 && (
                  <div className="providerGroup">
                    <small>Buy</small>
                    <div className="providerList">
                      {watchProviders.buy.map(p => (
                        <a className="providerChip" key={`buy-${p.provider_id}`} href={watchProviders.link} target="_blank" rel="noreferrer" aria-label={`Find ${title(detailItem)} on ${p.provider_name}`}>
                          {p.logo_path && <img src={img(p.logo_path, 'w92')} alt="" />}
                          {p.provider_name} <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <p className="providerNote">Provider availability is region-specific and supplied by TMDB in partnership with JustWatch. Aurora links to the provider listing; playback takes place on the licensed service.</p>
            </section>
          )}

          <section className="trailerSection">
            <div className="trailerHeading">
              <p className="eyebrow">OFFICIAL VIDEO</p>
              <h2>{trailer?.name || 'Official Trailer'}</h2>
            </div>
            {trailerLoading ? (
              <p className="muted">Loading trailer…</p>
            ) : trailer ? (
              <div className="trailerFrame">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?rel=0`}
                  title={`${title(detailItem)} — ${trailer.name || 'Official Trailer'}`}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="trailerUnavailable"><p>No official YouTube trailer is currently listed.</p></div>
            )}
            <small>Official trailer provided by YouTube using TMDB video metadata. Trailers are not full-length movies.</small>
          </section>

          {detailCast.length > 0 && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow">CAST</p><h2>Starring</h2></div>
              </div>
              <div className="peopleRow">{detailCast.map(personCard)}</div>
            </section>
          )}

          {detailRecommendations.length > 0 && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow">MORE LIKE THIS</p><h2>Recommendations</h2></div>
              </div>
              <div className="row">{detailRecommendations.map(card)}</div>
            </section>
          )}

          {detailSimilar.length > 0 && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow">RELATED</p><h2>Similar Titles</h2></div>
              </div>
              <div className="row">{detailSimilar.map(card)}</div>
            </section>
          )}

          <section className="reviews">
            <div className="reviewHeading">
              <div><p className="eyebrow">AURORA COMMUNITY</p><h2>User ratings &amp; reviews</h2></div>
              <div className="reviewHeadActions">
                <select
                  className="sortSelect"
                  aria-label="Sort reviews"
                  value={reviewSort}
                  onChange={e => setReviewSort(e.target.value as 'newest' | 'helpful')}
                >
                  <option value="newest">Newest first</option>
                  <option value="helpful">Most helpful</option>
                </select>
                <div className="reviewAverage">
                  <Star size={18} fill="currentColor" />
                  <strong>{reviewAverage ? reviewAverage.toFixed(1) : '—'}</strong>
                  <span>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span>
                </div>
              </div>
            </div>

            <form className="reviewForm" onSubmit={submitReview}>
              <h3>{reviews.some(r => r.user_id === user?.id) ? 'Edit your review' : `Rate this title as ${activeProfile.name}`}</h3>
              <div className="ratingPicker" role="group" aria-label="Choose a rating from 1 to 10">
                {Array.from({ length: 10 }, (_, index) => (
                  <button
                    type="button"
                    key={index + 1}
                    className={rating >= index + 1 ? 'selected' : ''}
                    aria-label={`${index + 1} out of 10`}
                    onClick={() => setRating(index + 1)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={event => setComment(event.target.value)}
                maxLength={2000}
                placeholder={user ? 'Share what you thought about this movie or show…' : 'Sign in to write a review'}
                disabled={!user}
                required
              />
              <div className="reviewFormFoot">
                <span>{comment.length}/2000</span>
                <div className="historyCardActions">
                  {user && reviews.some(r => r.user_id === user.id) && (
                    <button
                      type="button"
                      className="historyRemove"
                      onClick={() => {
                        const own = reviews.find(r => r.user_id === user.id);
                        if (own) deleteOwnReview(own.id);
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                  {user
                    ? <button className="primary" disabled={reviewBusy}>{reviewBusy ? 'Publishing…' : 'Publish review'}</button>
                    : <button type="button" className="primary" onClick={() => setAuth(true)}>Sign in to review</button>}
                </div>
              </div>
              {reviewMessage && <p className="reviewMessage">{reviewMessage}</p>}
            </form>

            <div className="reviewList">
              {sortedReviews.map(review => (
                <article className="reviewCard" key={review.id}>
                  <div className="reviewCardTop">
                    <b>{review.user_id === user?.id ? `${activeProfile.name} (You)` : review.author_name || 'Aurora viewer'}</b>
                    <span><Star size={14} fill="currentColor" /> {review.rating}/10</span>
                  </div>
                  <p>{review.comment}</p>
                  <div className="reviewCardFoot">
                    <time>{new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                    <div className="reviewCardActions">
                      <button
                        type="button"
                        className={`helpfulBtn ${helpfulVoteIds.includes(review.id) ? 'selected' : ''}`}
                        onClick={() => toggleHelpful(review)}
                      >
                        <ThumbsUp size={12} /> Helpful ({review.helpful_count || 0})
                      </button>
                      <button
                        type="button"
                        className="helpfulBtn"
                        onClick={() => setReportTarget({ type: 'review', id: String(review.id), label: `Review #${review.id}` })}
                      >
                        <Flag size={12} /> Report
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!reviews.length && (
                <p className="muted">
                  {reviewMessage.startsWith('Reviews are unavailable') ? reviewMessage : 'No reviews yet. Be the first to share your thoughts.'}
                </p>
              )}
            </div>
          </section>
        </main>
      ) : celebrity ? (
        <main className="searchPage celebrityPage">
          {personItem ? (
            <>
              <button className="backBtn" onClick={() => go('/celebrities')}>← All celebrities</button>
              <section className="celebrityHero">
                <div className="celebrityPortrait">
                  {personItem.profile_path ? <img src={img(personItem.profile_path, 'h632')} alt={personItem.name} /> : <UserRound />}
                </div>
                <div>
                  <p className="eyebrow">{personItem.known_for_department || 'Artist'}</p>
                  <h1>{personItem.name}</h1>
                  {personItem.birthday && (
                    <p className="muted">Born {personItem.birthday}{personItem.place_of_birth ? ` · ${personItem.place_of_birth}` : ''}</p>
                  )}
                  <p>{personItem.biography || 'Explore the films and series featuring this artist.'}</p>
                </div>
              </section>
              <h2 className="sectionTitle">Known for</h2>
              <div className="grid">
                {(personItem as any).combined_credits?.cast
                  ?.slice()
                  .sort((a: Film, b: Film) => (b.vote_average || 0) - (a.vote_average || 0))
                  .slice(0, 16)
                  .map((film: Film) => card({ ...film, media_type: film.media_type || 'movie' }))}
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">Aurora spotlight</p>
              <h1>Popular <span>celebrities</span></h1>
              {personLoading ? <p className="muted">Loading profile…</p> : <p className="muted">A closer look at the performers and creators behind your favorite stories.</p>}
            </>
          )}
        </main>
      ) : path === '/discover' ? (
        <main className="searchPage">
          <p className="eyebrow">A world of stories</p>
          <h1>Discover <span>Your next story</span></h1>
          {freeFeatureShelf()}
          {shelf('Popular movies', movies, '/movies')}
          {shelf('Popular TV series', shows, '/series')}
          {shelf('Japanese Anime', animeList, '/anime', 'Anime spotlight')}
          {peopleShelf()}
        </main>
      ) : path === '/free-films' ? (
        <main className="searchPage freeFilmsPage">
          <p className="eyebrow">PUBLIC-DOMAIN &amp; OPEN-LICENSE PICKS</p>
          <h1>Free <span>Films</span></h1>
          <p className="pageIntro muted">
            Watch rights-documented public-domain and open-license films in Aurora, or explore newer releases and open their licensed streaming, rental, and purchase options for your region.
          </p>

          {shelf('Modern releases — find licensed watch options', recentList, '/movies', 'Availability varies by country · powered by TMDB / JustWatch')}

          <div className="freeFilmFilter" role="tablist" aria-label="Filter free films">
            <button className={freeFilmFilter === 'all' ? 'selected' : ''} onClick={() => setFreeFilmFilter('all')}>
              All titles ({allFreeFilms.length})
            </button>
            <button className={freeFilmFilter === 'feature' ? 'selected' : ''} onClick={() => setFreeFilmFilter('feature')}>
              Full Features ({allFreeFilms.filter(f => f.contentType === 'feature').length})
            </button>
            <button className={freeFilmFilter === 'short' ? 'selected' : ''} onClick={() => setFreeFilmFilter('short')}>
              Historical Shorts ({allFreeFilms.filter(f => f.contentType === 'short').length})
            </button>
          </div>

          <div className="freeFilmShelf" aria-label="Choose a free film">
            {filteredFreeFilms.map(film => {
              const prog = watchHistory.find(h => h.free_film_id === film.id || h.item_key === `free:${film.id}`);
              const pct = prog && prog.duration_seconds > 0 ? Math.min(100, Math.round((prog.progress_seconds / prog.duration_seconds) * 100)) : 0;
              return (
                <button
                  key={film.id}
                  className={selectedFreeFilm?.id === film.id ? 'selected' : ''}
                  onClick={() => { setAutoResumeSeconds(null); setSelectedFreeFilmId(film.id); }}
                >
                  <small>{film.year} · {film.provider}</small>
                  <strong>{film.title}</strong>
                  <span>{film.rightsLabel}</span>
                  <div className="freeFilmBadges">
                    <span className={`freeFilmBadge ${isVerifiedFullFeature(film) ? 'feature' : ''}`}>
                      {film.contentType === 'feature' ? 'Full Feature' : 'Short'} · {formatRuntime(film.runtimeSeconds)}
                    </span>
                    {pct > 0 && <span className="freeFilmBadge">{prog?.completed ? 'Watched' : `${pct}%`}</span>}
                  </div>
                  {pct > 0 && <div className="freeFilmProgressBar"><i style={{ width: `${pct}%` }} /></div>}
                </button>
              );
            })}
          </div>

          {selectedFreeFilm && (
            <article className="archiveFeature">
              <div className="archiveFilmTop">
                <div>
                  <p className="eyebrow">{selectedFreeFilm.year} · {selectedFreeFilm.provider.toUpperCase()}</p>
                  <div className="archiveTitleRow">
                    <h2>{selectedFreeFilm.title}</h2>
                    <span className={`detailStreamBadge ${isVerifiedFullFeature(selectedFreeFilm) ? 'full' : 'trailerOnly'}`}>
                      {isVerifiedFullFeature(selectedFreeFilm)
                        ? 'Verified Full Feature'
                        : selectedFreeFilm.completeness === 'incomplete'
                          ? 'Incomplete Archival Copy'
                          : 'Historical Short'}
                    </span>
                  </div>
                </div>
                <div className="archiveTopActions">
                  {selectedFreeFilm.tmdbId && (
                    <button className="secondary" onClick={() => go(`/movie/${selectedFreeFilm.tmdbId}`)}>
                      TMDB Info &amp; Reviews
                    </button>
                  )}
                  <a className="archiveSource" href={selectedFreeFilm.itemUrl} target="_blank" rel="noreferrer">View source record ↗</a>
                </div>
              </div>

              <VideoPlayer
                film={selectedFreeFilm}
                nextFilm={nextFreeFilm}
                autoplayNext={activeProfile.autoplay_next}
                savedProgressSeconds={selectedProgress?.progress_seconds || 0}
                savedCompleted={selectedProgress?.completed || false}
                autoResumeSeconds={autoResumeSeconds}
                initialPlaybackRate={preferredPlaybackSpeed}
                onPreferencesChange={updateUserPreferences}
                onConsumeAutoResume={() => setAutoResumeSeconds(null)}
                onProgress={(ct, dur, force) => recordWatchProgress(selectedFreeFilm, ct, dur, force)}
                onPlayNext={nextId => openFreeFilm(nextId, 0)}
              />
            </article>
          )}
        </main>
      ) : path === '/movies' ? (
        <main className="searchPage">
          <p className="eyebrow">The big screen</p>
          <h1>Movies <span>for every mood</span></h1>
          <div className="filterBar">
            <div className="genreChips" role="group" aria-label="Movie genres">
              <button
                className={selectedMovieGenre === null ? 'selected' : ''}
                onClick={() => { setSelectedMovieGenre(null); loadMoviesCatalog(null, movieSort, movieYear, movieMinRating, 1, false); }}
              >
                All genres
              </button>
              {movieGenres.slice(0, 12).map(genre => (
                <button
                  key={genre.id}
                  className={selectedMovieGenre === genre.id ? 'selected' : ''}
                  onClick={() => { setSelectedMovieGenre(genre.id); loadMoviesCatalog(genre.id, movieSort, movieYear, movieMinRating, 1, false); }}
                >
                  {genre.name}
                </button>
              ))}
            </div>
            <div className="filterRightGroup">
              <input
                className="yearInput"
                placeholder="Year"
                maxLength={4}
                value={movieYear}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setMovieYear(val);
                  if (val === '' || val.length === 4) loadMoviesCatalog(selectedMovieGenre, movieSort, val, movieMinRating, 1, false);
                }}
              />
              <select
                className="sortSelect"
                aria-label="Minimum rating"
                value={movieMinRating}
                onChange={e => {
                  const next = Number(e.target.value);
                  setMovieMinRating(next);
                  loadMoviesCatalog(selectedMovieGenre, movieSort, movieYear, next, 1, false);
                }}
              >
                <option value={0}>Any rating</option>
                <option value={6}>6.0+</option>
                <option value={7}>7.0+</option>
                <option value={8}>8.0+</option>
              </select>
              <select
                className="sortSelect"
                aria-label="Sort movies"
                value={movieSort}
                onChange={e => {
                  const nextSort = e.target.value;
                  setMovieSort(nextSort);
                  loadMoviesCatalog(selectedMovieGenre, nextSort, movieYear, movieMinRating, 1, false);
                }}
              >
                <option value="popularity.desc">Most popular</option>
                <option value="vote_average.desc">Top rated</option>
                <option value="primary_release_date.desc">Newest releases</option>
                <option value="release_date.desc">Release date</option>
              </select>
            </div>
          </div>
          <div className="grid">{movies.map(card)}</div>
          {!movies.length && <p className="muted">{moviesBusy ? 'Loading movies…' : 'No movies matched this filter.'}</p>}
          {movieHasMore && movies.length > 0 && (
            <div className="loadMoreWrap">
              <button className="secondary" disabled={moviesBusy} onClick={() => loadMoviesCatalog(selectedMovieGenre, movieSort, movieYear, movieMinRating, moviePage + 1, true)}>
                {moviesBusy ? 'Loading…' : 'Load more movies'}
              </button>
            </div>
          )}
        </main>
      ) : path === '/series' ? (
        <main className="searchPage">
          <p className="eyebrow">Long-form stories</p>
          <h1>TV Series <span>Worth staying in for</span></h1>
          <div className="filterBar">
            <div className="genreChips" role="group" aria-label="TV genres">
              <button
                className={selectedTvGenre === null ? 'selected' : ''}
                onClick={() => { setSelectedTvGenre(null); loadSeriesCatalog(null, tvSort, tvYear, tvMinRating, 1, false); }}
              >
                All genres
              </button>
              {tvGenres.slice(0, 12).map(genre => (
                <button
                  key={genre.id}
                  className={selectedTvGenre === genre.id ? 'selected' : ''}
                  onClick={() => { setSelectedTvGenre(genre.id); loadSeriesCatalog(genre.id, tvSort, tvYear, tvMinRating, 1, false); }}
                >
                  {genre.name}
                </button>
              ))}
            </div>
            <div className="filterRightGroup">
              <input
                className="yearInput"
                placeholder="Year"
                maxLength={4}
                value={tvYear}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setTvYear(val);
                  if (val === '' || val.length === 4) loadSeriesCatalog(selectedTvGenre, tvSort, val, tvMinRating, 1, false);
                }}
              />
              <select
                className="sortSelect"
                aria-label="Minimum rating"
                value={tvMinRating}
                onChange={e => {
                  const next = Number(e.target.value);
                  setTvMinRating(next);
                  loadSeriesCatalog(selectedTvGenre, tvSort, tvYear, next, 1, false);
                }}
              >
                <option value={0}>Any rating</option>
                <option value={6}>6.0+</option>
                <option value={7}>7.0+</option>
                <option value={8}>8.0+</option>
              </select>
              <select
                className="sortSelect"
                aria-label="Sort TV series"
                value={tvSort}
                onChange={e => {
                  const nextSort = e.target.value;
                  setTvSort(nextSort);
                  loadSeriesCatalog(selectedTvGenre, nextSort, tvYear, tvMinRating, 1, false);
                }}
              >
                <option value="popularity.desc">Most popular</option>
                <option value="vote_average.desc">Top rated</option>
                <option value="first_air_date.desc">Newest series</option>
              </select>
            </div>
          </div>
          <div className="grid">{shows.map(card)}</div>
          {!shows.length && <p className="muted">{tvBusy ? 'Loading series…' : 'No series matched this filter.'}</p>}
          {tvHasMore && shows.length > 0 && (
            <div className="loadMoreWrap">
              <button className="secondary" disabled={tvBusy} onClick={() => loadSeriesCatalog(selectedTvGenre, tvSort, tvYear, tvMinRating, tvPage + 1, true)}>
                {tvBusy ? 'Loading…' : 'Load more series'}
              </button>
            </div>
          )}
        </main>
      ) : path === '/anime' ? (
        <main className="searchPage">
          <p className="eyebrow"><Sparkles size={14} /> JAPANESE ANIMATION</p>
          <h1>Anime <span>Catalog</span></h1>
          <p className="pageIntro muted">
            Distinguished from general animation by filtering TMDB Animation entries originating in Japanese (`ja`), with dedicated series and feature films.
          </p>
          <div className="filterBar">
            <div className="genreChips">
              <button
                className={animeType === 'tv' ? 'selected' : ''}
                onClick={() => { setAnimeType('tv'); loadAnimeCatalog('tv', animeSort, animeYear, animeMinRating, 1, false); }}
              >
                Anime Series
              </button>
              <button
                className={animeType === 'movie' ? 'selected' : ''}
                onClick={() => { setAnimeType('movie'); loadAnimeCatalog('movie', animeSort, animeYear, animeMinRating, 1, false); }}
              >
                Anime Films
              </button>
            </div>
            <div className="filterRightGroup">
              <input
                className="yearInput"
                placeholder="Year"
                maxLength={4}
                value={animeYear}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setAnimeYear(val);
                  if (val === '' || val.length === 4) loadAnimeCatalog(animeType, animeSort, val, animeMinRating, 1, false);
                }}
              />
              <select
                className="sortSelect"
                value={animeMinRating}
                onChange={e => {
                  const next = Number(e.target.value);
                  setAnimeMinRating(next);
                  loadAnimeCatalog(animeType, animeSort, animeYear, next, 1, false);
                }}
              >
                <option value={0}>Any rating</option>
                <option value={7}>7.0+</option>
                <option value={8}>8.0+</option>
              </select>
              <select
                className="sortSelect"
                value={animeSort}
                onChange={e => {
                  const next = e.target.value;
                  setAnimeSort(next);
                  loadAnimeCatalog(animeType, next, animeYear, animeMinRating, 1, false);
                }}
              >
                <option value="popularity.desc">Most popular</option>
                <option value="vote_average.desc">Top rated</option>
                <option value={animeType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc'}>Newest</option>
              </select>
            </div>
          </div>
          <div className="grid">{animeList.map(card)}</div>
          {!animeList.length && <p className="muted">{animeBusy ? 'Loading anime…' : 'No anime matched this filter.'}</p>}
          {animeHasMore && animeList.length > 0 && (
            <div className="loadMoreWrap">
              <button className="secondary" disabled={animeBusy} onClick={() => loadAnimeCatalog(animeType, animeSort, animeYear, animeMinRating, animePage + 1, true)}>
                {animeBusy ? 'Loading…' : 'Load more anime'}
              </button>
            </div>
          )}
        </main>
      ) : path === '/top-movies' ? (
        <main className="searchPage">
          <p className="eyebrow"><Trophy size={15} /> TMDB audience ratings</p>
          <h1>Top 10 <span>Movies</span></h1>
          <p className="muted pageIntro">Highest-rated movies in the TMDB catalog. Ratings and rankings may change.</p>
          <div className="grid rankedGrid">
            {topMovies.slice(0, 10).map((film, index) => (
              <div className="rankedItem" key={film.id}>
                <b className="rankNumber">{String(index + 1).padStart(2, '0')}</b>
                {card(film)}
              </div>
            ))}
          </div>
        </main>
      ) : path === '/celebrities' ? (
        <main className="searchPage">
          <p className="eyebrow">Aurora spotlight</p>
          <h1>Popular <span>celebrities</span></h1>
          <p className="muted pageIntro">Meet the actors and artists behind this week's most talked-about stories.</p>
          <div className="peopleGrid">{people.map(personCard)}</div>
        </main>
      ) : path === '/downloads' ? (
        <main className="searchPage">
          <p className="eyebrow"><Download size={15} /> Your saved queue</p>
          <h1>Downloads <span>Watchlist</span></h1>
          <div className="infoBanner">
            Aurora does not host or download copyrighted movie files. This is a personal title queue saved on this device.
          </div>
          {downloads.length ? (
            <div className="grid">{downloads.map(card)}</div>
          ) : (
            <div className="empty">
              <Download />
              <h2>Your queue is empty</h2>
              <p>Add a title using the download icon to keep it in this list.</p>
              <button className="primary" onClick={() => go('/movies')}>Explore movies</button>
            </div>
          )}
        </main>
      ) : path === '/my-list' ? (
        <main className="searchPage">
          <p className="eyebrow"><Heart size={15} /> {activeProfile.name.toUpperCase()}’S SPACE</p>
          <h1>My List <span>&amp; History</span></h1>
          <p className="pageIntro muted">
            {user
              ? `Synced for ${user.email || 'your account'} · Profile: ${activeProfile.name}`
              : `Saved locally for profile “${activeProfile.name}”. Sign in to sync across devices.`}
          </p>

          {savedLoading ? (
            <p className="muted">Loading your saved titles…</p>
          ) : saved.length ? (
            <div className="grid">{saved.map(card)}</div>
          ) : (
            <div className="empty">
              <Heart />
              <h2>Your list is ready</h2>
              <p>Save any movie, series, or anime to find it here anytime.</p>
              <button className="primary" onClick={() => go('/discover')}>Discover titles</button>
            </div>
          )}

          {watchHistory.length > 0 && (
            <section className="detailSection">
              <div className="detailSectionHead">
                <div><p className="eyebrow"><History size={14} /> RESUME PLAYBACK</p><h2>Continue Watching &amp; History</h2></div>
              </div>
              <div className="historyGrid">
                {watchHistory.map(item => {
                  const pct = item.duration_seconds > 0 ? Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100)) : 0;
                  return (
                    <article className="historyCard" key={item.item_key}>
                      <div>
                        <div className="historyCardTop">
                          <div>
                            <small>{item.completed ? 'Completed' : 'In progress'}</small>
                            <h3>{item.title}</h3>
                          </div>
                        </div>
                        <p className="historyCardMeta">
                          {formatRuntime(item.progress_seconds)} / {formatRuntime(item.duration_seconds)} ({pct}%)
                        </p>
                        <div className="freeFilmProgressBar"><i style={{ width: `${pct}%` }} /></div>
                      </div>
                      <div className="historyCardActions">
                        {item.free_film_id && (
                          <button className="primary" onClick={() => openFreeFilm(item.free_film_id!, item.completed ? 0 : item.progress_seconds)}>
                            <Play size={13} fill="currentColor" /> {item.completed ? 'Watch again' : 'Resume'}
                          </button>
                        )}
                        <button className="historyRemove" aria-label={`Remove ${item.title} from watch history`} onClick={() => removeWatchHistoryItem(item.item_key)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      ) : (
        <>
          <main
            className="hero"
            style={{
              backgroundImage: hero?.backdrop_path
                ? `linear-gradient(95deg,rgba(4,8,20,.96) 0%,rgba(4,8,20,.78) 44%,rgba(4,8,20,.28) 100%),linear-gradient(0deg,#040814 0%,transparent 42%),url(${img(hero.backdrop_path, 'original')})`
                : ''
            }}
          >
            <div className="auroraCurtains" aria-hidden="true">
              <span className="auroraRibbon ribbonA" />
              <span className="auroraRibbon ribbonB" />
              <span className="auroraRibbon ribbonC" />
            </div>
            <div className="heroInner">
              <div className="heroText">
                <div className="eyebrow"><Sparkles size={13} /> Featured for {activeProfile.name}</div>
                <h1>{hero ? title(hero) : 'Your next night starts here'}</h1>
                <div className="heroMeta">
                  <span><Star size={14} fill="currentColor" /> {(hero?.vote_average || 8.7).toFixed(1)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{(hero?.release_date || hero?.first_air_date || '').slice(0, 4) || '2026'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{hero?.media_type === 'tv' ? 'Series' : 'Movie'}</span>
                </div>
                <p>{hero?.overview || 'Discover stories that stay with you. A curated selection for tonight.'}</p>
                <div className="heroBtns">
                  {heroFreeMatch ? (
                    <button className="watchFullMovie" onClick={() => openFreeFilm(heroFreeMatch.id)}>
                      <Play size={17} fill="currentColor" /> Play Full Movie
                    </button>
                  ) : (
                    <button className="primary" onClick={() => hero && go(`/${hero.media_type === 'tv' ? 'tv' : 'movie'}/${hero.id}`)}>
                      <Play size={17} fill="currentColor" /> More Info &amp; Trailer
                    </button>
                  )}
                  <button className="secondary" onClick={() => hero && toggleSaved(hero, hero.media_type || 'movie')}>
                    <Heart size={17} /> Add to My List
                  </button>
                </div>
                <div className="heroControls">
                  <div className="heroCount">
                    {String((heroIndex % Math.max(heroSlides.length, 1)) + 1).padStart(2, '0')} <i /> {String(Math.max(heroSlides.length, 1)).padStart(2, '0')}
                  </div>
                  {heroSlides.length > 1 && (
                    <>
                      <div className="heroDots" role="tablist" aria-label="Featured titles">
                        {heroSlides.map((slide, idx) => (
                          <button
                            key={slide.id}
                            aria-label={`Show featured title ${idx + 1}`}
                            className={heroIndex % heroSlides.length === idx ? 'active' : ''}
                            onClick={() => setHeroIndex(idx)}
                          />
                        ))}
                      </div>
                      <button
                        className="heroArrow"
                        aria-label="Previous featured title"
                        onClick={() => setHeroIndex(i => (i - 1 + heroSlides.length) % heroSlides.length)}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        className="heroArrow"
                        aria-label="Next featured title"
                        onClick={() => setHeroIndex(i => (i + 1) % heroSlides.length)}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {hero?.poster_path && (
                <div
                  className="heroShowcase"
                  onClick={() => hero && go(`/${hero.media_type === 'tv' ? 'tv' : 'movie'}/${hero.id}`)}
                  onMouseMove={handleCardPointerMove}
                  onMouseLeave={handleCardPointerLeave}
                >
                  <div className="heroPosterCard">
                    <img src={img(hero.poster_path, 'w500')} alt={title(hero)} />
                    <div className="posterSheen" aria-hidden="true" />
                    <div className="heroPosterMeta">
                      <small>{hero.media_type === 'tv' ? 'Series' : 'Feature'}</small>
                      <b>{title(hero)}</b>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="heroLogo"><span>◜</span> AURORA CINEMA</div>
          </main>

          {watchHistory.some(item => item.free_film_id && item.progress_seconds >= 5 && !item.completed) && (
            <section className="shelf">
              <div className="shelfHead">
                <div><small>Resume where you left off · {activeProfile.name}</small><h2>Continue watching</h2></div>
                <button className="textBtn" onClick={() => go('/free-films')}>Free Films <ChevronRight size={16} /></button>
              </div>
              <div className="historyGrid">
                {watchHistory
                  .filter(item => item.free_film_id && item.progress_seconds >= 5 && !item.completed)
                  .slice(0, 4)
                  .map(item => {
                    const pct = item.duration_seconds > 0 ? Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100)) : 0;
                    return (
                      <article className="historyCard" key={item.item_key}>
                        <div>
                          <div className="historyCardTop">
                            <div>
                              <small>Resume · {pct}%</small>
                              <h3>{item.title}</h3>
                            </div>
                          </div>
                          <p className="historyCardMeta">{formatRuntime(item.progress_seconds)} / {formatRuntime(item.duration_seconds)}</p>
                          <div className="freeFilmProgressBar"><i style={{ width: `${pct}%` }} /></div>
                        </div>
                        <div className="historyCardActions">
                          <button className="primary" onClick={() => openFreeFilm(item.free_film_id!, item.progress_seconds)}>
                            <Play size={13} fill="currentColor" /> Resume
                          </button>
                          <button className="historyRemove" aria-label={`Remove ${item.title}`} onClick={() => removeWatchHistoryItem(item.item_key)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          )}

          {freeFeatureShelf()}
          {personalizedRecs.length > 0 && shelf(`Recommended for ${activeProfile.name}`, personalizedRecs, '/discover', 'Based on your activity')}
          {shelf('Trending movies & series', trending, '/discover')}
          {shelf('Popular movies', movies, '/movies')}
          {shelf('Popular TV series', shows, '/series')}
          {shelf('Recently added in theaters', recentList, '/movies')}
          {shelf('Anime spotlight', animeList, '/anime', 'Japanese animation')}
          {shelf('Top rated movies', topMovies, '/top-movies')}
          {peopleShelf()}
        </>
      )}

      <footer>
        <div className="brand"><span className="brandMark">◜</span><b>Aurora</b></div>
        <p>Your next night starts here.</p>
        <div className="footerLinks">
          <button onClick={() => go('/free-films')}>Free Films</button>
          <button onClick={() => go('/anime')}>Anime</button>
          <button onClick={() => go('/profiles')}>Profiles</button>
          <button onClick={() => go('/account')}>Account</button>
          <button onClick={() => go('/admin')}>Admin</button>
        </div>
        <small>
          This product uses the TMDB API and is not endorsed or certified by TMDB. Aurora does not host or download copyrighted media. Full-length playback is linked only from rights-documented sources in the Free Films library.
        </small>
      </footer>

      {reportTarget && (
        <div className="modalShade" onClick={() => { setReportTarget(null); setReportMsg(''); }}>
          <section className="authModal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="close" aria-label="Close report dialog" onClick={() => setReportTarget(null)}><X /></button>
            <p className="eyebrow">MODERATION</p>
            <h2>Report {reportTarget.label}</h2>
            <form onSubmit={submitReport}>
              <label className="authField">
                <span>Reason</span>
                <input
                  required
                  minLength={3}
                  placeholder="Describe the issue (broken stream, inappropriate review, etc.)"
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                />
              </label>
              <button className="primary" type="submit">Submit Report</button>
              {reportMsg && <p className="formMsg">{reportMsg}</p>}
            </form>
          </section>
        </div>
      )}

      {auth && (
        <div className="modalShade" onClick={() => { recoveryFlowRef.current = false; setAuth(false); setAuthMode('signin'); setError(''); }}>
          <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="authTitle" onClick={event => event.stopPropagation()}>
            <button className="close" aria-label="Close sign-in" onClick={() => { recoveryFlowRef.current = false; setAuth(false); setAuthMode('signin'); setError(''); }}><X /></button>
            <div className="brand modalBrand"><span className="brandMark">◜</span><b>Aurora</b></div>
            <p className="eyebrow">Your cinematic space</p>
            <h2 id="authTitle">
              {authMode === 'signup' ? 'Create your account'
                : authMode === 'forgot' ? 'Reset your password'
                  : authMode === 'sms-phone' ? 'Recover with your phone'
                    : authMode === 'sms-code' ? 'Verify your phone'
                      : authMode === 'reset-password' ? 'Choose a new password'
                        : authMode === 'magic-link' ? 'Sign in with an email link'
                          : 'Welcome to Aurora'}
            </h2>
            <p className="muted">
              {authMode === 'forgot' ? 'We’ll email you a secure link to choose a new password.'
                : authMode === 'sms-phone' ? 'Use the verified phone number already linked to your Aurora account.'
                  : authMode === 'sms-code' ? `Enter the code sent to ${phoneNumber}.`
                    : authMode === 'reset-password' ? 'Create a new password for your account.'
                      : authMode === 'signup' ? 'Create an Aurora account with your email and a password.'
                        : authMode === 'magic-link' ? 'We’ll send a secure sign-in link to your email.'
                          : 'Sign in to sync profiles, favorites, and watch history.'}
            </p>
            {authMode === 'signin' && (
              <>
                <button className="googleSignIn" onClick={loginWithGoogle} disabled={busy}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
                    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
                    <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z" />
                    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z" />
                  </svg>
                  {busy ? 'Connecting…' : 'Continue with Google'}
                </button>
                <div className="authDivider"><span>OR SIGN IN WITH EMAIL</span></div>
              </>
            )}
            {authMode === 'signin' && (
              <form onSubmit={signInWithPassword}>
                <label className="authField"><span>Email address</span><input type="email" autoComplete="username" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
                <label className="authField"><span>Password</span><input type="password" autoComplete="current-password" required placeholder="Your password" value={password} onChange={event => setPassword(event.target.value)} /></label>
                <button type="button" className="authTextLink authForgot" onClick={() => { setAuthMode('forgot'); setError(''); }}>Forgot password?</button>
                <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                <div className="authOptionLinks">
                  <button type="button" className="authTextLink" onClick={() => { setAuthMode('signup'); setError(''); }}>Create account</button>
                  <button type="button" className="authTextLink" onClick={() => { setAuthMode('magic-link'); setError(''); }}>Email me a sign-in link</button>
                  <button type="button" className="authTextLink" onClick={() => { setAuthMode('sms-phone'); setError(''); }}>Recover with SMS</button>
                </div>
              </form>
            )}
            {authMode === 'signup' && (
              <form onSubmit={createAccount}>
                <label className="authField"><span>Email address</span><input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
                <label className="authField"><span>Password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={event => setPassword(event.target.value)} /></label>
                <label className="authField"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="Enter it again" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
                <button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
                <button type="button" className="authTextLink authBackLink" onClick={() => { setAuthMode('signin'); setError(''); }}>Already have an account? Sign in</button>
              </form>
            )}
            {authMode === 'magic-link' && (
              <form onSubmit={login}>
                <label className="authField"><span>Email address</span><input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
                <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button>
                <button type="button" className="authTextLink authBackLink" onClick={() => { setAuthMode('signin'); setError(''); }}>Back to sign in</button>
              </form>
            )}
            {authMode === 'forgot' && (
              <form onSubmit={requestPasswordReset}>
                <label className="authField"><span>Email address</span><input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
                <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
                <button type="button" className="authTextLink authBackLink" onClick={() => { setAuthMode('signin'); setError(''); }}>Back to sign in</button>
              </form>
            )}
            {authMode === 'sms-phone' && (
              <form onSubmit={sendSmsRecoveryCode}>
                <label className="authField"><span>Verified phone number</span><input type="tel" autoComplete="tel" required placeholder="+201234567890" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} /></label>
                <button className="primary" disabled={busy}>{busy ? 'Sending code…' : 'Send SMS code'}</button>
                <small className="authHint">SMS recovery is available only for a phone already verified on your account.</small>
                <button type="button" className="authTextLink authBackLink" onClick={() => { recoveryFlowRef.current = false; setAuthMode('signin'); setError(''); }}>Back to sign in</button>
              </form>
            )}
            {authMode === 'sms-code' && (
              <form onSubmit={verifySmsRecoveryCode}>
                <label className="authField"><span>SMS verification code</span><input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} placeholder="Enter code" value={smsToken} onChange={event => setSmsToken(event.target.value)} /></label>
                <button className="primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
                <button type="button" className="authTextLink authBackLink" onClick={() => { recoveryFlowRef.current = false; setAuthMode('sms-phone'); setSmsToken(''); setError(''); }}>Use a different phone</button>
              </form>
            )}
            {authMode === 'reset-password' && (
              <form onSubmit={saveNewPassword}>
                <label className="authField"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={event => setPassword(event.target.value)} /></label>
                <label className="authField"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="Enter it again" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
                <button className="primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
              </form>
            )}
            {error && <p className="formMsg" role="status" aria-live="polite">{error}</p>}
            <small>Sign in securely to save favorites and sync profiles.</small>
          </section>
        </div>
      )}

      {error && !auth && <div className="toast">{error}</div>}
    </>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
