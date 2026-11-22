import React, { useEffect, useState } from 'react';
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
const img = (path: string | null | undefined, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const title = (film: Film) => film.title || film.name || 'Untitled';
async function api<T = any>(path: string): Promise<T> {
  const response = await fetch('/api/tmdb/' + path.replace(/^\/+/, ''));
  if (!response.ok) throw new Error('Could not connect to the movie service');
  return response.json();
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
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [error, setError] = useState('');
  const [homeLoading, setHomeLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [introVisible, setIntroVisible] = useState(() => !sessionStorage.getItem('aurora-intro-seen') && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [personItem, setPersonItem] = useState<Person | null>(null);
  const [personLoading, setPersonLoading] = useState(false);

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
      const { data } = client.auth.onAuthStateChange((_event: string, session: any) => {
        const nextUser = session?.user || null; setUser(nextUser); setSaved([]);
        if (nextUser) { setAuth(false); setError(''); }
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
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setError('Could not initialize Supabase. Check the project settings.'); return; }
    setBusy(true); setError('');
    const { error: loginError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
    setBusy(false); setError(loginError?.message || 'We sent a sign-in link to your email.');
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
    { label: 'Celebrities', to: '/celebrities', icon: null }, { label: 'Downloads', to: '/downloads', icon: <Download size={15} /> },
    { label: 'Favorites', to: '/my-list', icon: <Heart size={15} /> }
  ];
  const activeNav = path === '/' ? '/' : path.startsWith('/movie') ? '/movies' : path.startsWith('/tv') ? '/series' : path;

  return <>{introVisible && <div className="introVideo" onAnimationEnd={event => { if (event.target === event.currentTarget) { sessionStorage.setItem('aurora-intro-seen', '1'); setIntroVisible(false); } }}><video src="/aurora-intro.mp4" autoPlay muted playsInline onEnded={() => { sessionStorage.setItem('aurora-intro-seen', '1'); setIntroVisible(false); }} /><div className="introVignette" /><div className="introWordmark"><span className="brandMark">◜</span><b>Aurora</b></div></div>}
    <header className="topbar"><button className="brand" onClick={() => go('/')}><span className="brandMark">◜</span><b>Aurora</b></button><nav aria-label="Main navigation">{navItems.map(item => <button key={item.to} className={activeNav === item.to ? 'active' : ''} onClick={() => go(item.to)}>{item.icon}{item.label}</button>)}</nav><div className="topActions"><label className="search"><Search size={18} /><input placeholder="Search movies and shows" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</label>{user ? <button className="userBtn" onClick={async () => { await supabase?.auth.signOut(); setUser(null); }}><LogOut size={16} /> Sign out</button> : <button className="loginBtn" onClick={() => setAuth(true)}><UserRound size={17} /> Sign in</button>}</div></header>
    {query.trim().length > 1 ? <main className="searchPage"><p className="eyebrow">Search results</p><h1>Searching for <span>{query}</span></h1><div className="grid">{results.map(card)}</div>{!results.length && <p className="muted">Type a movie or show title to get started.</p>}</main>
    : detail ? <main className="detailPage" style={{ backgroundImage: detailItem?.backdrop_path ? `linear-gradient(0deg,#071016 7%,rgba(7,16,22,.7) 52%,rgba(7,16,22,.18)),url(${img(detailItem.backdrop_path, 'original')})` : '' }}><button className="backBtn" onClick={() => go('/')}>← Back</button>{detailItem && <div className="detailContent"><p className="eyebrow">{detail[1] === 'tv' ? 'TV show' : 'Movie'} • {detailItem.release_date?.slice(0, 4) || detailItem.first_air_date?.slice(0, 4)}</p><h1>{title(detailItem)}</h1><div className="meta"><span><Star size={16} fill="currentColor" /> {detailItem.vote_average?.toFixed(1)} / 10</span><span>{detailItem.genres?.map((genre: any) => genre.name).slice(0, 3).join(' • ')}</span></div><p>{detailItem.overview || 'Discover more about this title on Aurora.'}</p><div className="detailActions"><button className="primary" onClick={() => toggleSaved(detailItem, detail[1])}><Heart size={17} /> Add to Favorites</button><button className="secondary" onClick={() => toggleDownload(detailItem)}><Download size={16} /> Add to Downloads</button></div><p className="notice">Aurora provides information only; it does not host, download, or stream content.</p></div>}{!detailItem && <p className="detailLoading">{detailError || (detailLoading ? 'Loading title details…' : 'Title details are unavailable.')}</p>}
      <section className="reviews"><div className="reviewHeading"><div><p className="eyebrow">COMMUNITY</p><h2>Ratings &amp; reviews</h2></div><div className="reviewAverage"><Star size={18} fill="currentColor" /><strong>{reviewAverage ? reviewAverage.toFixed(1) : '—'}</strong><span>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span></div></div><form className="reviewForm" onSubmit={submitReview}><h3>{reviews.some((review: any) => review.user_id === user?.id) ? 'Edit your review' : 'Rate this title'}</h3><div className="ratingPicker" role="group" aria-label="Choose a rating from 1 to 10">{Array.from({ length: 10 }, (_, index) => <button type="button" key={index + 1} className={rating >= index + 1 ? 'selected' : ''} aria-label={`${index + 1} out of 10`} onClick={() => setRating(index + 1)}>{index + 1}</button>)}</div><textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} placeholder={user ? 'Share what you thought about this movie or show…' : 'Sign in to write a review'} disabled={!user} required /><div className="reviewFormFoot"><span>{comment.length}/2000</span>{user ? <button className="primary" disabled={reviewBusy}>{reviewBusy ? 'Publishing…' : 'Publish review'}</button> : <button type="button" className="primary" onClick={() => setAuth(true)}>Sign in to review</button>}</div>{reviewMessage && <p className="reviewMessage">{reviewMessage}</p>}</form><div className="reviewList">{reviews.map((review: any) => <article className="reviewCard" key={review.id}><div className="reviewCardTop"><b>{review.user_id === user?.id ? 'Your review' : 'Aurora viewer'}</b><span><Star size={14} fill="currentColor" /> {review.rating}/10</span></div><p>{review.comment}</p><time>{new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</time></article>)}{!reviews.length && <p className="muted">{reviewMessage.startsWith('Reviews are unavailable') ? reviewMessage : 'No reviews yet. Be the first to share your thoughts.'}</p>}</div></section>
    </main>
    : celebrity ? <main className="searchPage celebrityPage">{personItem ? <><button className="backBtn" onClick={() => go('/celebrities')}>← All celebrities</button><section className="celebrityHero"><div className="celebrityPortrait">{personItem.profile_path ? <img src={img(personItem.profile_path, 'h632')} alt={personItem.name} /> : <UserRound />}</div><div><p className="eyebrow">{personItem.known_for_department || 'Artist'}</p><h1>{personItem.name}</h1>{personItem.birthday && <p className="muted">Born {personItem.birthday}{personItem.place_of_birth ? ` · ${personItem.place_of_birth}` : ''}</p>}<p>{personItem.biography || 'Explore the films and series featuring this artist.'}</p></div></section><h2 className="sectionTitle">Known for</h2><div className="grid">{(personItem as any).combined_credits?.cast?.slice().sort((a: Film, b: Film) => (b.vote_average || 0) - (a.vote_average || 0)).slice(0, 16).map((film: Film) => card({ ...film, media_type: film.media_type || 'movie' }))}</div></> : <><p className="eyebrow">Aurora spotlight</p><h1>Popular <span>celebrities</span></h1>{personLoading ? <p className="muted">Loading profile…</p> : <p className="muted">A closer look at the performers and creators behind your favorite stories.</p>}</>}</main>
    : path === '/discover' ? <main className="searchPage"><p className="eyebrow">A world of stories</p><h1>Discover <span>Your next story</span></h1>{shelf('Popular movies', movies, '/movies')}{shelf('Popular TV shows', shows, '/series')}{peopleShelf()}</main>
    : path === '/movies' ? <main className="searchPage"><p className="eyebrow">The big screen</p><h1>Movies <span>for every mood</span></h1><div className="grid">{movies.map(card)}</div></main>
    : path === '/series' ? <main className="searchPage"><p className="eyebrow">Long-form stories</p><h1>TV Series <span>Worth staying in for</span></h1><div className="grid">{shows.map(card)}</div></main>
    : path === '/top-movies' ? <main className="searchPage"><p className="eyebrow"><Trophy size={15} /> TMDB audience ratings</p><h1>Top 10 <span>Movies</span></h1><p className="muted pageIntro">Highest-rated movies in the TMDB catalog. Ratings and rankings may change.</p><div className="grid rankedGrid">{topMovies.slice(0, 10).map((film, index) => <div className="rankedItem" key={film.id}><b className="rankNumber">{String(index + 1).padStart(2, '0')}</b>{card(film)}</div>)}</div></main>
    : path === '/celebrities' ? <main className="searchPage"><p className="eyebrow">Aurora spotlight</p><h1>Popular <span>celebrities</span></h1><p className="muted pageIntro">Meet the actors and artists behind this week's most talked-about stories.</p><div className="peopleGrid">{people.map(personCard)}</div></main>
    : path === '/downloads' ? <main className="searchPage"><p className="eyebrow"><Download size={15} /> Your saved queue</p><h1>Downloads <span>Watchlist</span></h1><div className="infoBanner">Aurora does not host or download movie files. This is a personal title queue saved on this device, so you can keep track of what to find on your streaming services.</div>{downloads.length ? <div className="grid">{downloads.map(card)}</div> : <div className="empty"><Download /><h2>Your queue is empty</h2><p>Add a title using the download icon to keep it in this list.</p><button className="primary" onClick={() => go('/movies')}>Explore movies</button></div>}</main>
    : path === '/my-list' ? <main className="searchPage"><p className="eyebrow"><Heart size={15} /> Your cinematic space</p><h1>Favorites <span>My List</span></h1>{user ? (savedLoading ? <p className="muted">Loading your favorites…</p> : saved.length ? <div className="grid">{saved.map(card)}</div> : <div className="empty"><Heart /><h2>Your favorites are ready</h2><p>Save a movie or show and it will appear here.</p><button className="primary" onClick={() => go('/discover')}>Discover titles</button></div>) : <div className="empty"><Heart /><h2>Save what you love</h2><p>Sign in to keep your favorite movies and TV shows in one place.</p><button className="primary" onClick={() => setAuth(true)}>Sign in</button></div>}</main>
    : <><main className="hero" style={{ backgroundImage: hero?.backdrop_path ? `linear-gradient(90deg,rgba(5,12,17,.95) 0%,rgba(5,12,17,.72) 40%,rgba(5,12,17,.12) 100%),linear-gradient(0deg,#071016 0%,transparent 35%),url(${img(hero.backdrop_path, 'original')})` : '' }}><div className="auroraGlow" /><div className="heroText"><div className="eyebrow"><span className="liveDot" /> Picked for you by Aurora</div><h1>{hero ? title(hero) : 'Your next night starts here'}</h1><div className="heroMeta"><span><Star size={15} fill="currentColor" /> {(hero?.vote_average || 8.7).toFixed(1)}</span><span>{hero?.release_date?.slice(0, 4) || '2025'}</span><span>Editor’s pick</span></div><p>{hero?.overview || 'Discover stories that stay with you. A curated selection for tonight.'}</p><div className="heroBtns"><button className="primary" onClick={() => hero && go(`/${hero.media_type === 'tv' ? 'tv' : 'movie'}/${hero.id}`)}><Play size={17} fill="currentColor" /> Discover this story</button><button className="secondary" onClick={() => hero && toggleSaved(hero)}><Heart size={17} /> Add to Favorites</button></div><div className="heroCount">01 <i /> 05</div></div><div className="heroLogo"><span>◜</span> AURORA ORIGINAL</div></main>{shelf('Trending this week', trending, '/top-movies')}{shelf('Movies worth your time', movies, '/movies')}{shelf('Shows to get hooked on', shows, '/series')}{shelf('Top rated movies', topMovies, '/top-movies')}{peopleShelf()}</>}
    <footer><div className="brand"><span className="brandMark">◜</span><b>Aurora</b></div><p>Your next night starts here.</p><small>This product uses the TMDB API and is not endorsed or certified by TMDB. Aurora provides discovery information only and does not host, download, or stream content.</small></footer>
    {auth && <div className="modalShade" onClick={() => setAuth(false)}><section className="authModal" onClick={event => event.stopPropagation()}><button className="close" onClick={() => setAuth(false)}><X /></button><div className="brand modalBrand"><span className="brandMark">◜</span><b>Aurora</b></div><p className="eyebrow">Your cinematic space</p><h2>Welcome to Aurora</h2><p className="muted">Enter your email and we’ll send you a secure sign-in link.</p><form onSubmit={login}><input type="email" required placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} /><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button></form>{error && <p className="formMsg">{error}</p>}<small>Sign in to save your favorite movies and TV shows.</small></section></div>}
    {error && !auth && <div className="toast">{error}</div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
