export type Film = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  original_language?: string;
  origin_country?: string[];
  adult?: boolean;
  genres?: { id: number; name: string }[];
  genre_ids?: number[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: SeasonSummary[];
};

export type SeasonSummary = {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  season_number: number;
  episode_count: number;
  air_date?: string;
};

export type EpisodeData = {
  id: number;
  name: string;
  overview?: string;
  episode_number: number;
  season_number: number;
  still_path?: string | null;
  runtime?: number | null;
  air_date?: string;
  vote_average?: number;
};

export type Person = {
  id: number;
  name: string;
  known_for_department?: string;
  profile_path?: string | null;
  character?: string;
  job?: string;
  known_for?: Film[];
  biography?: string;
  birthday?: string;
  place_of_birth?: string;
};

export type Genre = { id: number; name: string };

export type WatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
};

export type WatchHistoryEntry = {
  item_key: string;
  profile_id?: string | null;
  media_type: 'movie' | 'tv' | 'free-film';
  tmdb_id?: number | null;
  free_film_id?: string | null;
  title: string;
  poster_path?: string | null;
  progress_seconds: number;
  duration_seconds: number;
  completed: boolean;
  last_watched_at: string;
};

export type SubtitleTrack = {
  label: string;
  lang: string;
  url: string;
};

export type QualityVariant = {
  label: string;
  url: string;
};

export type FreeFilm = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  posterUrl?: string;
  posterPath?: string;
  description: string;
  itemUrl: string;
  videoUrl?: string;
  fallbackUrls?: string[];
  playerType?: 'mp4' | 'hls' | 'embed';
  embedUrl?: string;
  provider: string;
  rightsLabel: string;
  rightsUrl: string;
  rightsNote: string;
  attribution: string;
  runtimeSeconds: number;
  completeness: 'complete' | 'incomplete';
  contentType: 'feature' | 'short';
  sourceVerified: boolean;
  streamCodec?: string;
  moovPosition?: 'start' | 'end';
  availableQualities: string[];
  qualitySources?: QualityVariant[];
  subtitles?: SubtitleTrack[];
  countryRestrictions?: string[];
  excerpts: { label: string; start: number; end: number }[];
  isCustom?: boolean;
  featured?: boolean;
};

export type SourceProbe = {
  status: 'idle' | 'checking' | 'verified' | 'failed';
  contentType?: string;
  contentLength?: number;
  acceptRanges?: string;
  rangeSupported?: boolean;
  signature?: string;
  error?: string;
};

export type Profile = {
  id: string;
  name: string;
  avatar: 'emerald' | 'cobalt' | 'amber' | 'violet' | 'rose';
  is_kids: boolean;
  autoplay_next: boolean;
  preferred_genres: number[];
  created_at?: string;
};

export type ReviewItem = {
  id: number;
  user_id: string;
  profile_id?: string | null;
  author_name?: string | null;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  rating: number;
  comment: string;
  helpful_count?: number;
  status?: 'published' | 'hidden' | 'flagged';
  created_at: string;
  updated_at?: string;
};

export type AuthMode =
  | 'signin'
  | 'signup'
  | 'magic-link'
  | 'forgot'
  | 'sms-phone'
  | 'sms-code'
  | 'reset-password';
