import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bookmark, ChevronLeft, Clapperboard, Download, Heart, LogOut, Play, Search, Star, Trophy, UserRound, X } from 'lucide-react';
import { supabase, initializeSupabase } from './supabase';
import './style.css';

type Film = {
  id: number; title?: string; name?: string; overview?: string; poster_path?: string | null;
  backdrop_path?: string | null; vote_average?: number; release_date?: string; first_air_date?: string;
  media_type?: string; genres?: { id: number; name: string }[]; genre_ids?: number[];
};
type Person = { id: number; name: string; known_for_department?: string; profile_path?: string | null; known_for?: Film[]; biography?: string; birthday?: string; place_of_birth?: string };
type FreeFilm = {
  id: string; title: string; year: number; itemUrl: string; videoUrl?: string;
  playerType?: 'mp4' | 'embed'; embedUrl?: string;
  provider: string; rightsLabel: string; rightsUrl: string; rightsNote: string;
  attribution: string; durationSeconds: number;
  excerpts: { label: string; start: number; end: number }[];
};
type AuthMode = 'signin' | 'signup' | 'magic-link' | 'forgot' | 'sms-phone' | 'sms-code' | 'reset-password';
const img = (path: string | null | undefined, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const title = (film: Film) => film.title || film.name || 'Untitled';
async function api<T = any>(path: string): Promise<T> {
  const response = await fetch('/api/tmdb/' + path.replace(/^\/+/, ''));
  if (!response.ok) throw new Error('Could not connect to the movie service');
  return response.json();
}
const freeFilms: FreeFilm[] = [
  {
    id: 'trip-to-the-moon', title: 'A Trip to the Moon', year: 1902,
    itemUrl: 'https://archive.org/details/ATripToTheMoon20Fps',
    videoUrl: 'https://archive.org/download/ATripToTheMoon20Fps/TripToTheMoon20Fps_512kb.mp4',
    provider: 'Internet Archive', rightsLabel: 'CC BY 3.0 · uploader-declared',
    rightsUrl: 'https://creativecommons.org/licenses/by/3.0/',
    rightsNote: 'The linked Internet Archive item declares CC BY 3.0 for this 20 fps version. This is uploader-provided metadata, not an Internet Archive guarantee; confirm the rights in your territory before reuse or redistribution.',
    attribution: 'A Trip to the Moon (1902), directed by Georges Méliès. 20 fps version from the linked Internet Archive item; uploader-declared CC BY 3.0.',
    durationSeconds: 501,
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'The lunar journey', start: 180, end: 210 }, { label: 'The return', start: 450, end: 480 }]
  },
  {
    id: 'great-train-robbery', title: 'The Great Train Robbery', year: 1903,
    itemUrl: 'https://www.loc.gov/item/00694220/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00000765/00000765.mp4',
    provider: 'Library of Congress', rightsLabel: 'Public-domain film selection · LOC',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection. The Library notes that rights can vary by item and territory; this catalog record describes its available copy as incomplete.',
    attribution: 'The Great Train Robbery (1903), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    durationSeconds: 714,
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'The train', start: 300, end: 330 }, { label: 'Finale', start: 660, end: 690 }]
  },
  {
    id: 'may-irwin-kiss', title: 'May Irwin Kiss', year: 1896,
    itemUrl: 'https://www.loc.gov/item/00694131/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00047798/00047798.mp4',
    provider: 'Library of Congress', rightsLabel: 'Public-domain film selection · LOC',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection. The Library advises users to assess item-specific rights and any territorial restrictions.',
    attribution: 'May Irwin Kiss (1896), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    durationSeconds: 30,
    excerpts: [{ label: 'Excerpt 1', start: 0, end: 8 }, { label: 'Excerpt 2', start: 8, end: 18 }, { label: 'Excerpt 3', start: 18, end: 29 }]
  },
  {
    id: 'mckinley-oath', title: 'President McKinley Taking the Oath', year: 1901,
    itemUrl: 'https://www.loc.gov/item/00694336/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/01906619/01906619.mp4',
    provider: 'Library of Congress', rightsLabel: 'Public-domain film selection · LOC',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection. The Library notes that catalog metadata may not capture all privacy, publicity, licensing, or territorial restrictions.',
    attribution: 'President McKinley Taking the Oath (1901), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    durationSeconds: 44,
    excerpts: [{ label: 'Opening', start: 0, end: 12 }, { label: 'The ceremony', start: 12, end: 28 }, { label: 'Closing', start: 28, end: 43 }]
  },
  {
    id: 'san-francisco-earthquake', title: 'San Francisco Earthquake and Fire', year: 1906,
    itemUrl: 'https://www.loc.gov/item/00694425/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00007947/00007947.mp4',
    provider: 'Library of Congress', rightsLabel: 'Public-domain film selection · LOC',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection. The Library advises that rights and use restrictions may differ outside the United States.',
    attribution: 'San Francisco Earthquake and Fire (1906), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    durationSeconds: 720,
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Ruins', start: 300, end: 330 }, { label: 'The city', start: 660, end: 690 }]
  },
  {
    id: 'westinghouse-panorama', title: 'Panorama of Machine Co. Aisle', year: 1904,
    itemUrl: 'https://www.loc.gov/item/96522104/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/westhpp/2122/2122.mp4',
    provider: 'Library of Congress', rightsLabel: 'Public-domain film selection · LOC',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection. The catalog identifies this copy as a 1904 silent film; verify territorial and other item-specific restrictions before reuse.',
    attribution: 'Panorama of Machine Co. Aisle, Westinghouse Co. Works (1904), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    durationSeconds: 206,
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Factory aisle', start: 80, end: 110 }, { label: 'Closing', start: 170, end: 200 }]
  }
];
const normalizeTitle = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
function findFreeFilmMatch(film: Film | null | undefined): FreeFilm | undefined {
  if (!film || (film.media_type && film.media_type !== 'movie')) return undefined;
  const filmYear = (film.release_date || '').slice(0, 4);
  return freeFilms.find(entry => normalizeTitle(entry.title) === normalizeTitle(title(film)) && (!filmYear || filmYear === String(entry.year)));
}
const downloadKey = 'aurora-download-queue';
function readDownloadQueue(): Film[] {
  try { return JSON.parse(localStorage.getItem(downloadKey) || '[]'); } catch { return []; }
}

function App() {
  const [path, setPath] = useState(location.pathname);
  const [trending, setTrending] = useState<Film[]>([]);
  const [movies, setMovies] = useState<Film[]>([]);
  const [shows, setShows] = useState<Film[]>([]);
  const [topMovies, setTopMovies] = useState<Film[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [hero, setHero] = useState<Film | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Film[]>([]);
  const [user, setUser] = useState<any>(null);
  const [dbClient, setDbClient] = useState<any>(null);
  const [saved, setSaved] = useState<Film[]>([]);
  const [downloads, setDownloads] = useState<Film[]>(readDownloadQueue);
  const [auth, setAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsToken, setSmsToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [error, setError] = useState('');
  const [homeLoading, setHomeLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [trailer, setTrailer] = useState<any>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [introVisible, setIntroVisible] = useState(() => !sessionStorage.getItem('aurora-intro-seen') && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [personItem, setPersonItem] = useState<Person | null>(null);
  const [personLoading, setPersonLoading] = useState(false);
  const [selectedFreeFilmId, setSelectedFreeFilmId] = useState('trip-to-the-moon');
  const [archiveClip, setArchiveClip] = useState(0);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const recoveryFlowRef = useRef(false);

  useEffect(() => {
    const pop = () => setPath(location.pathname);
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  function go(next: string) { history.pushState({}, '', next); setPath(next); setQuery(''); scrollTo(0, 0); }

  useEffect(() => {
    let subscription: any;
    initializeSupabase().then(client => {
      if (!client) return;
      setDbClient(client);
      client.auth.getSession().then(({ data }: any) => setUser(data.session?.user || null));
      const { data } = client.auth.onAuthStateChange((event: string, session: any) => {
        const nextUser = session?.user || null; setUser(nextUser); setSaved([]);
        if (event === 'PASSWORD_RECOVERY') {
          recoveryFlowRef.current = true; setAuth(true); setAuthMode('reset-password'); setPassword(''); setConfirmPassword(''); setError('');
        } else if (nextUser && !recoveryFlowRef.current) { setAuth(false); setError(''); }
      });
      subscription = data.subscription;
    });
    const requests = [
      api('/trending/movie/week?language=en-US'), api('/movie/popular?language=en-US'),
      api('/tv/popular?language=en-US'), api('/movie/top_rated?language=en-US'), api('/person/popular?language=en-US')
    ];
    Promise.allSettled(requests).then(([trend, movie, tv, top, cast]) => {
      let successes = 0;
      if (trend.status === 'fulfilled') { successes++; const list = (trend.value.results || []).map((item: Film) => ({ ...item, media_type: item.media_type || 'movie' })); setTrending(list); setHero(list.find((item: Film) => item.backdrop_path && item.overview) || list[0] || null); }
      if (movie.status === 'fulfilled') { successes++; setMovies((movie.value.results || []).map((item: Film) => ({ ...item, media_type: 'movie' }))); }
      if (tv.status === 'fulfilled') { successes++; setShows((tv.value.results || []).map((item: Film) => ({ ...item, media_type: 'tv' }))); }
      if (top.status === 'fulfilled') { successes++; setTopMovies((top.value.results || []).map((item: Film) => ({ ...item, media_type: 'movie' }))); }
      if (cast.status === 'fulfilled') { successes++; setPeople(cast.value.results || []); }
      setError(successes ? '' : 'Could not connect to the movie service'); setHomeLoading(false);
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => api(`/search/multi?query=${encodeURIComponent(query)}&language=en-US`).then(data => setResults((data.results || []).filter((film: Film) => film.media_type === 'movie' || film.media_type === 'tv'))).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!user || !supabase) { setSaved([]); return; }
    let cancelled = false; setSavedLoading(true);
    supabase.from('saved_titles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data, error: dbError }: any) => {
      if (cancelled) return;
      if (dbError) setError('Could not load your list. Check the Supabase saved_titles table and RLS policies.');
      else setSaved((data || []).map((item: any) => ({ id: item.tmdb_id, title: item.title, poster_path: item.poster_path, vote_average: item.vote_average, media_type: item.media_type })));
      setSavedLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  async function toggleSaved(film: Film, type = 'movie') {
    if (!user) { setAuth(true); setError('Sign in to save titles to your personal list.'); return; }
    if (!supabase) return;
    setError(''); const mediaType = film.media_type || type;
    const exists = saved.some(item => item.id === film.id && (item.media_type || 'movie') === mediaType);
    if (exists) {
      const { error: dbError } = await supabase.from('saved_titles').delete().eq('user_id', user.id).eq('media_type', mediaType).eq('tmdb_id', film.id);
      if (dbError) { setError(dbError.message); return; }
      setSaved(list => list.filter(item => !(item.id === film.id && (item.media_type || 'movie') === mediaType)));
    } else {
      const item = { ...film, media_type: mediaType };
      const { error: dbError } = await supabase.from('saved_titles').insert({ user_id: user.id, tmdb_id: item.id, media_type: item.media_type, title: title(item), poster_path: item.poster_path, vote_average: item.vote_average });
      if (dbError) { setError(dbError.message); return; }
      setSaved(list => [item, ...list]);
    }
  }
  function toggleDownload(film: Film) {
    const exists = downloads.some(item => item.id === film.id && item.media_type === film.media_type);
    const next = exists ? downloads.filter(item => !(item.id === film.id && item.media_type === film.media_type)) : [{ ...film, media_type: film.media_type || 'movie' }, ...downloads];
    setDownloads(next); localStorage.setItem(downloadKey, JSON.stringify(next));
  }
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
      const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
      if (authError) setError(authError.message);
      else { setAuthMode('signin'); setPassword(''); setConfirmPassword(''); setError(data.session ? 'Your account is ready. You are signed in.' : 'If this address can be registered, check your email to confirm your account.'); }
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
      if (authError) { recoveryFlowRef.current = false; setError('Could not send a code. Check that this verified phone is linked to your account and SMS sign-in is enabled.'); }
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
      else { recoveryFlowRef.current = false; setAuth(false); setAuthMode('signin'); setPassword(''); setConfirmPassword(''); setSmsToken(''); setError('Your password has been updated.'); }
    } catch { setError('Could not update your password right now. Please try again.'); }
    finally { setBusy(false); }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    setBusy(true); setError('');
    const { error: loginError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
    setBusy(false); setError(loginError?.message || 'We sent a sign-in link to your email.');
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

  function card(film: Film) {
    const type = film.media_type || 'movie'; const isSaved = saved.some(item => item.id === film.id && item.media_type === type);
    return <article className="card" key={`${type}-${film.id}`} onClick={() => go(`/${type}/${film.id}`)}>
      <div className="poster">{film.poster_path ? <img src={img(film.poster_path)} loading="lazy" alt={title(film)} /> : <div className="posterEmpty"><Clapperboard /></div>}
        <div className="cardQuickActions"><button className="quickSave" aria-label={isSaved ? 'Remove from favorites' : 'Add to favorites'} title="Favorites" onClick={event => { event.stopPropagation(); toggleSaved(film, type); }}><Heart size={16} fill={isSaved ? 'currentColor' : 'none'} /></button><button className="quickDownload" aria-label="Add to download list" title="Add to download list" onClick={event => { event.stopPropagation(); toggleDownload(film); }}><Download size={16} /></button></div>
        <div className="posterShade"><span>{type === 'tv' ? 'TV show' : 'Movie'}</span><b><Star size={13} fill="currentColor" /> {(film.vote_average || 0).toFixed(1)}</b></div>
      </div><div className="cardTitle">{title(film)}</div><div className="cardYear">{(film.release_date || film.first_air_date || '').slice(0, 4) || '—'}</div>
    </article>;
  }
  function shelf(label: string, items: Film[], to = '/discover') {
    return <section className="shelf"><div className="shelfHead"><div><small>Picked by Aurora</small><h2>{label}</h2></div><button className="textBtn" onClick={() => go(to)}>See all <ChevronLeft size={16} /></button></div><div className="row">{items.slice(0, 12).map(card)}{!items.length && <p className="muted">{homeLoading ? 'Loading stories…' : 'No titles available right now.'}</p>}</div></section>;
  }
  function peopleShelf() {
    return <section className="shelf"><div className="shelfHead"><div><small>Meet the talent</small><h2>Popular celebrities</h2></div><button className="textBtn" onClick={() => go('/celebrities')}>See all <ChevronLeft size={16} /></button></div><div className="peopleRow">{people.slice(0, 8).map(personCard)}</div></section>;
  }
  function personCard(person: Person) {
    return <button className="personCard" key={person.id} onClick={() => go(`/celebrity/${person.id}`)}><span className="personPortrait">{person.profile_path ? <img src={img(person.profile_path, 'w342')} loading="lazy" alt={person.name} /> : <UserRound />}</span><b>{person.name}</b><small>{person.known_for_department || 'Actor'}</small></button>;
  }

  const detail = path.match(/^\/(movie|tv)\/(\d+)/);
  const celebrity = path.match(/^\/celebrity\/(\d+)/);
  useEffect(() => {
    setDetailItem(null); setDetailError('');
    if (!detail) { setDetailLoading(false); return; }
    let cancelled = false; setDetailLoading(true);
    api(`/${detail[1]}/${detail[2]}?language=en-US`).then(data => { if (!cancelled) setDetailItem(data); }).catch(() => { if (!cancelled) setDetailError('Could not load title details. Please try again later.'); }).finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [path]);
  useEffect(() => {
    setPersonItem(null);
    if (!celebrity) { setPersonLoading(false); return; }
    let cancelled = false; setPersonLoading(true);
    api(`/person/${celebrity[1]}?language=en-US&append_to_response=combined_credits`).then(data => { if (!cancelled) setPersonItem(data); }).catch(() => {}).finally(() => { if (!cancelled) setPersonLoading(false); });
    return () => { cancelled = true; };
  }, [path]);
  useEffect(() => {
    setReviews([]); setRating(0); setComment(''); setReviewMessage('');
    if (!detailItem?.id || !dbClient) return;
    let cancelled = false; const mediaType = detail?.[1] || 'movie';
    dbClient.from('title_reviews').select('*').eq('tmdb_id', detailItem.id).eq('media_type', mediaType).order('created_at', { ascending: false }).limit(100).then(({ data, error: dbError }: any) => {
      if (cancelled) return;
      if (dbError) { setReviewMessage('Reviews are unavailable. Apply the title_reviews SQL schema in Supabase.'); return; }
      const rows = data || []; setReviews(rows); const ownReview = rows.find((item: any) => item.user_id === user?.id); if (ownReview) { setRating(ownReview.rating); setComment(ownReview.comment); }
    });
    return () => { cancelled = true; };
  }, [detailItem?.id, detail?.[1], user, dbClient]);
  useEffect(() => {
    setTrailer(null);
    if (!detail?.[1] || !detailItem?.id) { setTrailerLoading(false); return; }
    let cancelled = false; setTrailerLoading(true);
    api(`/${detail[1]}/${detailItem.id}/videos?language=en-US`).then(data => {
      if (cancelled) return;
      const videos = (data.results || []).filter((video: any) => video.site === 'YouTube' && video.key);
      setTrailer(videos.find((video: any) => video.official && video.type === 'Trailer') || videos.find((video: any) => video.type === 'Trailer') || videos.find((video: any) => video.type === 'Teaser') || null);
    }).catch(() => { if (!cancelled) setTrailer(null); }).finally(() => { if (!cancelled) setTrailerLoading(false); });
    return () => { cancelled = true; };
  }, [path, detailItem?.id]);
  const reviewAverage = reviews.length ? reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length : 0;
  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !supabase) { setAuth(true); setReviewMessage('Sign in to publish your review.'); return; }
    if (!detailItem || !detail?.[1]) return;
    if (!rating) { setReviewMessage('Choose a rating from 1 to 10.'); return; }
    if (!comment.trim()) { setReviewMessage('Add a comment before publishing.'); return; }
    setReviewBusy(true); setReviewMessage('');
    const payload = { user_id: user.id, media_type: detail[1], tmdb_id: detailItem.id, title: title(detailItem), rating, comment: comment.trim() };
    const { data, error: dbError } = await supabase.from('title_reviews').upsert(payload, { onConflict: 'user_id,media_type,tmdb_id' }).select().single();
    setReviewBusy(false); if (dbError) { setReviewMessage(dbError.message); return; }
    setReviews(rows => [data, ...rows.filter((row: any) => row.user_id !== user.id)]); setReviewMessage('Your review is published.');
  }

  const navItems = [
    { label: 'Home', to: '/', icon: null }, { label: 'Movies', to: '/movies', icon: null },
    { label: 'Series', to: '/series', icon: null }, { label: 'Top 10', to: '/top-movies', icon: <Trophy size={15} /> },
    { label: 'Celebrities', to: '/celebrities', icon: null }, { label: 'Free Films', to: '/free-films', icon: <Play size={15} /> }, { label: 'Downloads', to: '/downloads', icon: <Download size={15} /> },
    { label: 'Favorites', to: '/my-list', icon: <Heart size={15} /> }
  ];
  const activeNav = path === '/' ? '/' : path.startsWith('/movie') ? '/movies' : path.startsWith('/tv') ? '/series' : path;
  const selectedFreeFilm = freeFilms.find(film => film.id === selectedFreeFilmId) || freeFilms[0];

  return <>{introVisible && <div className="introVideo" onAnimationEnd={event => { if (event.target === event.currentTarget) { sessionStorage.setItem('aurora-intro-seen', '1'); setIntroVisible(false); } }}><video src="/aurora-intro.mp4" autoPlay muted playsInline onEnded={() => { sessionStorage.setItem('aurora-intro-seen', '1'); setIntroVisible(false); }} /><div className="introVignette" /><div className="introWordmark"><span className="brandMark">◜</span><b>Aurora</b></div></div>}
    <header className="topbar"><button className="brand" onClick={() => go('/')}><span className="brandMark">◜</span><b>Aurora</b></button><nav aria-label="Main navigation">{navItems.map(item => <button key={item.to} className={activeNav === item.to ? 'active' : ''} onClick={() => go(item.to)}>{item.icon}{item.label}</button>)}</nav><div className="topActions"><label className="search"><Search size={18} /><input placeholder="Search movies and shows" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</label>{user ? <button className="userBtn" onClick={async () => { await supabase?.auth.signOut(); setUser(null); }}><LogOut size={16} /> Sign out</button> : <button className="loginBtn" onClick={() => setAuth(true)}><UserRound size={17} /> Sign in</button>}</div></header>
    {query.trim().length > 1 ? <main className="searchPage"><p className="eyebrow">Search results</p><h1>Searching for <span>{query}</span></h1><div className="grid">{results.map(card)}</div>{!results.length && <p className="muted">Type a movie or show title to get started.</p>}</main>
    : detail ? <main className="detailPage" style={{ backgroundImage: detailItem?.backdrop_path ? `linear-gradient(0deg,#071016 7%,rgba(7,16,22,.7) 52%,rgba(7,16,22,.18)),url(${img(detailItem.backdrop_path, 'original')})` : '' }}><button className="backBtn" onClick={() => go('/')}>← Back</button>{detailItem && <div className="detailContent"><p className="eyebrow">{detail[1] === 'tv' ? 'TV show' : 'Movie'} • {detailItem.release_date?.slice(0, 4) || detailItem.first_air_date?.slice(0, 4)}</p><h1>{title(detailItem)}</h1><div className="meta"><span><Star size={16} fill="currentColor" /> {detailItem.vote_average?.toFixed(1)} / 10</span><span>{detailItem.genres?.map((genre: any) => genre.name).slice(0, 3).join(' • ')}</span></div><p>{detailItem.overview || 'Discover more about this title on Aurora.'}</p><div className="detailActions"><button className="primary" onClick={() => toggleSaved(detailItem, detail[1])}><Heart size={17} /> Add to Favorites</button><button className="secondary" onClick={() => toggleDownload(detailItem)}><Download size={16} /> Add to Downloads</button>{detail[1] === 'movie' && findFreeFilmMatch(detailItem) && <button className="watchFullMovie" onClick={() => { const match = findFreeFilmMatch(detailItem); if (match) { setSelectedFreeFilmId(match.id); setArchiveClip(0); go('/free-films'); } }}><Play size={17} fill="currentColor" /> Watch Full Movie</button>}</div><p className="notice">Aurora embeds official trailers and only offers full-length playback for titles with a listed free-film source and rights information.</p></div>}{!detailItem && <p className="detailLoading">{detailError || (detailLoading ? 'Loading title details…' : 'Title details are unavailable.')}</p>}
      <section className="trailerSection"><div className="trailerHeading"><p className="eyebrow">OFFICIAL VIDEO</p><h2>{trailer?.name || 'Official Trailer'}</h2></div>{trailerLoading ? <p className="muted">Loading trailer…</p> : trailer ? <div className="trailerFrame"><iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?rel=0`} title={`${title(detailItem)} — ${trailer.name || 'Official Trailer'}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : <div className="trailerUnavailable"><p>No official YouTube trailer is currently listed.</p></div>}<small>Official trailer provided by YouTube using TMDB video metadata. Full-length movie playback is not included.</small></section><section className="reviews"><div className="reviewHeading"><div><p className="eyebrow">COMMUNITY</p><h2>Ratings &amp; reviews</h2></div><div className="reviewAverage"><Star size={18} fill="currentColor" /><strong>{reviewAverage ? reviewAverage.toFixed(1) : '—'}</strong><span>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span></div></div><form className="reviewForm" onSubmit={submitReview}><h3>{reviews.some((review: any) => review.user_id === user?.id) ? 'Edit your review' : 'Rate this title'}</h3><div className="ratingPicker" role="group" aria-label="Choose a rating from 1 to 10">{Array.from({ length: 10 }, (_, index) => <button type="button" key={index + 1} className={rating >= index + 1 ? 'selected' : ''} aria-label={`${index + 1} out of 10`} onClick={() => setRating(index + 1)}>{index + 1}</button>)}</div><textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} placeholder={user ? 'Share what you thought about this movie or show…' : 'Sign in to write a review'} disabled={!user} required /><div className="reviewFormFoot"><span>{comment.length}/2000</span>{user ? <button className="primary" disabled={reviewBusy}>{reviewBusy ? 'Publishing…' : 'Publish review'}</button> : <button type="button" className="primary" onClick={() => setAuth(true)}>Sign in to review</button>}</div>{reviewMessage && <p className="reviewMessage">{reviewMessage}</p>}</form><div className="reviewList">{reviews.map((review: any) => <article className="reviewCard" key={review.id}><div className="reviewCardTop"><b>{review.user_id === user?.id ? 'Your review' : 'Aurora viewer'}</b><span><Star size={14} fill="currentColor" /> {review.rating}/10</span></div><p>{review.comment}</p><time>{new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</time></article>)}{!reviews.length && <p className="muted">{reviewMessage.startsWith('Reviews are unavailable') ? reviewMessage : 'No reviews yet. Be the first to share your thoughts.'}</p>}</div></section>
    </main>
    : celebrity ? <main className="searchPage celebrityPage">{personItem ? <><button className="backBtn" onClick={() => go('/celebrities')}>← All celebrities</button><section className="celebrityHero"><div className="celebrityPortrait">{personItem.profile_path ? <img src={img(personItem.profile_path, 'h632')} alt={personItem.name} /> : <UserRound />}</div><div><p className="eyebrow">{personItem.known_for_department || 'Artist'}</p><h1>{personItem.name}</h1>{personItem.birthday && <p className="muted">Born {personItem.birthday}{personItem.place_of_birth ? ` · ${personItem.place_of_birth}` : ''}</p>}<p>{personItem.biography || 'Explore the films and series featuring this artist.'}</p></div></section><h2 className="sectionTitle">Known for</h2><div className="grid">{(personItem as any).combined_credits?.cast?.slice().sort((a: Film, b: Film) => (b.vote_average || 0) - (a.vote_average || 0)).slice(0, 16).map((film: Film) => card({ ...film, media_type: film.media_type || 'movie' }))}</div></> : <><p className="eyebrow">Aurora spotlight</p><h1>Popular <span>celebrities</span></h1>{personLoading ? <p className="muted">Loading profile…</p> : <p className="muted">A closer look at the performers and creators behind your favorite stories.</p>}</>}</main>
    : path === '/discover' ? <main className="searchPage"><p className="eyebrow">A world of stories</p><h1>Discover <span>Your next story</span></h1>{shelf('Popular movies', movies, '/movies')}{shelf('Popular TV shows', shows, '/series')}{peopleShelf()}</main>
    : path === '/free-films' ? <main className="searchPage freeFilmsPage"><p className="eyebrow">PUBLIC-DOMAIN &amp; OPEN-LICENSE PICKS</p><h1>Free <span>Films</span></h1><p className="pageIntro muted">Stream complete films and jump to selected excerpts. Each title links to its source record and item-specific rights information; rights may vary by country.</p><div className="freeFilmShelf" aria-label="Choose a free film">{freeFilms.map(film => <button key={film.id} className={selectedFreeFilm.id === film.id ? 'selected' : ''} onClick={() => { setSelectedFreeFilmId(film.id); setArchiveClip(0); }}><small>{film.year} · {film.provider}</small><strong>{film.title}</strong><span>{film.rightsLabel}</span></button>)}</div><article className="archiveFeature"><div className="archiveFilmTop"><div><p className="eyebrow">{selectedFreeFilm.year} · {selectedFreeFilm.provider.toUpperCase()}</p><h2>{selectedFreeFilm.title}</h2></div><a className="archiveSource" href={selectedFreeFilm.itemUrl} target="_blank" rel="noreferrer">View source record ↗</a></div><div className="archiveMotion">{selectedFreeFilm.playerType === 'embed' && selectedFreeFilm.embedUrl ? <iframe className="archiveEmbed" src={selectedFreeFilm.embedUrl} title={`${selectedFreeFilm.title} full movie`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" /> : <video key={selectedFreeFilm.id} ref={playerRef} controls playsInline preload="metadata" src={selectedFreeFilm.videoUrl} aria-label={`${selectedFreeFilm.title} full movie`} />}</div>{selectedFreeFilm.playerType !== 'embed' && <div className="excerptControls"><span>Jump to an excerpt</span>{selectedFreeFilm.excerpts.map((clip, index) => <button key={clip.start} className={archiveClip === index ? 'selected' : ''} onClick={() => { setArchiveClip(index); if (playerRef.current) { playerRef.current.currentTime = clip.start; void playerRef.current.play().catch(() => {}); } }}>{clip.label} · {Math.floor(clip.start / 60)}:{String(clip.start % 60).padStart(2,'0')}</button>)}</div>}<div className="archiveCredits"><p><strong>Rights status:</strong> {selectedFreeFilm.rightsNote} <a href={selectedFreeFilm.rightsUrl} target="_blank" rel="noreferrer">Rights source ↗</a></p><p><strong>Attribution:</strong> <em>{selectedFreeFilm.attribution}</em></p><p><strong>Playback:</strong> Aurora links directly to the provider’s file and does not re-upload it. The player uses native HTML5 controls for MP4 sources.</p></div></article><p className="archiveFooterNote">The TMDB catalog remains for discovery and trailers. Full-movie playback is shown only for titles matched to a source in this rights-documented library. Aurora does not use trailers as full films.</p></main>
    : path === '/movies' ? <main className="searchPage"><p className="eyebrow">The big screen</p><h1>Movies <span>for every mood</span></h1><div className="grid">{movies.map(card)}</div></main>
    : path === '/series' ? <main className="searchPage"><p className="eyebrow">Long-form stories</p><h1>TV Series <span>Worth staying in for</span></h1><div className="grid">{shows.map(card)}</div></main>
    : path === '/top-movies' ? <main className="searchPage"><p className="eyebrow"><Trophy size={15} /> TMDB audience ratings</p><h1>Top 10 <span>Movies</span></h1><p className="muted pageIntro">Highest-rated movies in the TMDB catalog. Ratings and rankings may change.</p><div className="grid rankedGrid">{topMovies.slice(0, 10).map((film, index) => <div className="rankedItem" key={film.id}><b className="rankNumber">{String(index + 1).padStart(2, '0')}</b>{card(film)}</div>)}</div></main>
    : path === '/celebrities' ? <main className="searchPage"><p className="eyebrow">Aurora spotlight</p><h1>Popular <span>celebrities</span></h1><p className="muted pageIntro">Meet the actors and artists behind this week's most talked-about stories.</p><div className="peopleGrid">{people.map(personCard)}</div></main>
    : path === '/downloads' ? <main className="searchPage"><p className="eyebrow"><Download size={15} /> Your saved queue</p><h1>Downloads <span>Watchlist</span></h1><div className="infoBanner">Aurora does not host or download movie files. This is a personal title queue saved on this device, so you can keep track of what to find on your streaming services.</div>{downloads.length ? <div className="grid">{downloads.map(card)}</div> : <div className="empty"><Download /><h2>Your queue is empty</h2><p>Add a title using the download icon to keep it in this list.</p><button className="primary" onClick={() => go('/movies')}>Explore movies</button></div>}</main>
    : path === '/my-list' ? <main className="searchPage"><p className="eyebrow"><Heart size={15} /> Your cinematic space</p><h1>Favorites <span>My List</span></h1>{user ? (savedLoading ? <p className="muted">Loading your favorites…</p> : saved.length ? <div className="grid">{saved.map(card)}</div> : <div className="empty"><Heart /><h2>Your favorites are ready</h2><p>Save a movie or show and it will appear here.</p><button className="primary" onClick={() => go('/discover')}>Discover titles</button></div>) : <div className="empty"><Heart /><h2>Save what you love</h2><p>Sign in to keep your favorite movies and TV shows in one place.</p><button className="primary" onClick={() => setAuth(true)}>Sign in</button></div>}</main>
    : <><main className="hero" style={{ backgroundImage: hero?.backdrop_path ? `linear-gradient(90deg,rgba(5,12,17,.95) 0%,rgba(5,12,17,.72) 40%,rgba(5,12,17,.12) 100%),linear-gradient(0deg,#071016 0%,transparent 35%),url(${img(hero.backdrop_path, 'original')})` : '' }}><div className="auroraGlow" /><div className="heroText"><div className="eyebrow"><span className="liveDot" /> Picked for you by Aurora</div><h1>{hero ? title(hero) : 'Your next night starts here'}</h1><div className="heroMeta"><span><Star size={15} fill="currentColor" /> {(hero?.vote_average || 8.7).toFixed(1)}</span><span>{hero?.release_date?.slice(0, 4) || '2025'}</span><span>Editor’s pick</span></div><p>{hero?.overview || 'Discover stories that stay with you. A curated selection for tonight.'}</p><div className="heroBtns"><button className="primary" onClick={() => hero && go(`/${hero.media_type === 'tv' ? 'tv' : 'movie'}/${hero.id}`)}><Play size={17} fill="currentColor" /> View title & trailer</button><button className="secondary" onClick={() => hero && toggleSaved(hero)}><Heart size={17} /> Add to Favorites</button></div><div className="heroCount">01 <i /> 05</div></div><div className="heroLogo"><span>◜</span> AURORA VIDEO</div></main>{shelf('Trending this week', trending, '/top-movies')}{shelf('Movies worth your time', movies, '/movies')}{shelf('Shows to get hooked on', shows, '/series')}{shelf('Top rated movies', topMovies, '/top-movies')}{peopleShelf()}</>}
    <footer><div className="brand"><span className="brandMark">◜</span><b>Aurora</b></div><p>Your next night starts here.</p><small>This product uses the TMDB API and is not endorsed or certified by TMDB. Aurora does not host or download copyrighted media. Full-length playback is linked only from rights-documented sources in the Free Films library.</small></footer>
    {auth && <div className="modalShade" onClick={() => { recoveryFlowRef.current = false; setAuth(false); setAuthMode('signin'); setError(''); }}>
      <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="authTitle" onClick={event => event.stopPropagation()}>
        <button className="close" aria-label="Close sign-in" onClick={() => { recoveryFlowRef.current = false; setAuth(false); setAuthMode('signin'); setError(''); }}><X /></button>
        <div className="brand modalBrand"><span className="brandMark">◜</span><b>Aurora</b></div>
        <p className="eyebrow">Your cinematic space</p>
        <h2 id="authTitle">{authMode === 'signup' ? 'Create your account' : authMode === 'forgot' ? 'Reset your password' : authMode === 'sms-phone' ? 'Recover with your phone' : authMode === 'sms-code' ? 'Verify your phone' : authMode === 'reset-password' ? 'Choose a new password' : authMode === 'magic-link' ? 'Sign in with an email link' : 'Welcome to Aurora'}</h2>
        <p className="muted">{authMode === 'forgot' ? 'We’ll email you a secure link to choose a new password.' : authMode === 'sms-phone' ? 'Use the verified phone number already linked to your Aurora account.' : authMode === 'sms-code' ? `Enter the code sent to ${phoneNumber}.` : authMode === 'reset-password' ? 'Create a new password to secure your account.' : authMode === 'signup' ? 'Create an Aurora account with your email and a password.' : authMode === 'magic-link' ? 'We’ll send a secure sign-in link to your email.' : 'Sign in to continue watching and keep your favorites together.'}</p>
        {authMode === 'signin' && <>
          <button className="googleSignIn" onClick={loginWithGoogle} disabled={busy}><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z"/></svg>{busy ? 'Connecting…' : 'Continue with Google'}</button>
          <div className="authDivider"><span>OR SIGN IN WITH EMAIL</span></div>
        </>}
        {authMode === 'signin' && <form onSubmit={signInWithPassword}>
          <label className="authField"><span>Email address</span><input type="email" autoComplete="username" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className="authField"><span>Password</span><input type="password" autoComplete="current-password" required placeholder="Your password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="button" className="authTextLink authForgot" onClick={() => { setAuthMode('forgot'); setError(''); }}>Forgot password?</button>
          <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="authOptionLinks"><button type="button" className="authTextLink" onClick={() => { setAuthMode('signup'); setError(''); }}>Create account</button><button type="button" className="authTextLink" onClick={() => { setAuthMode('magic-link'); setError(''); }}>Email me a sign-in link</button><button type="button" className="authTextLink" onClick={() => { setAuthMode('sms-phone'); setError(''); }}>Recover with SMS</button></div>
        </form>}
        {authMode === 'signup' && <form onSubmit={createAccount}>
          <label className="authField"><span>Email address</span><input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className="authField"><span>Password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="authField"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="Enter it again" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          <button type="button" className="authTextLink authBackLink" onClick={() => { setAuthMode('signin'); setError(''); }}>Already have an account? Sign in</button>
        </form>}
        {authMode === 'magic-link' && <form onSubmit={login}>
          <label className="authField"><span>Email address</span><input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button>
          <button type="button" className="authTextLink authBackLink" onClick={() => { setAuthMode('signin'); setError(''); }}>Back to sign in</button>
        </form>}
        {authMode === 'forgot' && <form onSubmit={requestPasswordReset}>
          <label className="authField"><span>Email address</span><input type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <button type="button" className="authTextLink authBackLink" onClick={() => { setAuthMode('signin'); setError(''); }}>Back to sign in</button>
        </form>}
        {authMode === 'sms-phone' && <form onSubmit={sendSmsRecoveryCode}>
          <label className="authField"><span>Verified phone number</span><input type="tel" autoComplete="tel" required placeholder="+201234567890" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Sending code…' : 'Send SMS code'}</button>
          <small className="authHint">SMS recovery is available only for a phone already verified on your account. Your Supabase project must have phone auth and an SMS provider enabled.</small>
          <button type="button" className="authTextLink authBackLink" onClick={() => { recoveryFlowRef.current = false; setAuthMode('signin'); setError(''); }}>Back to sign in</button>
        </form>}
        {authMode === 'sms-code' && <form onSubmit={verifySmsRecoveryCode}>
          <label className="authField"><span>SMS verification code</span><input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} placeholder="Enter code" value={smsToken} onChange={event => setSmsToken(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
          <button type="button" className="authTextLink authBackLink" onClick={() => { recoveryFlowRef.current = false; setAuthMode('sms-phone'); setSmsToken(''); setError(''); }}>Use a different phone</button>
        </form>}
        {authMode === 'reset-password' && <form onSubmit={saveNewPassword}>
          <label className="authField"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="authField"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="Enter it again" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
          <button className="primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
        </form>}
        {error && <p className="formMsg" role="status" aria-live="polite">{error}</p>}
        <small>Sign in securely to save favorites and keep your watchlist.</small>
      </section>
    </div>}
    {error && !auth && <div className="toast">{error}</div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
