import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Captions,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Upload,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { FreeFilm, SourceProbe } from '../types';
import { formatBytes, formatRuntime, isHttpUrl } from '../catalog';

type VideoPlayerProps = {
  film: FreeFilm;
  nextFilm?: FreeFilm;
  autoplayNext: boolean;
  savedProgressSeconds?: number;
  savedCompleted?: boolean;
  autoResumeSeconds?: number | null;
  initialPlaybackRate?: number;
  onPreferencesChange?: (prefs: { preferred_playback_speed?: number; preferred_subtitle_lang?: string }) => void;
  onConsumeAutoResume: () => void;
  onProgress: (currentTime: number, duration: number, forceSync?: boolean) => void;
  onPlayNext?: (nextId: string) => void;
};

type AudioOption = { index: number; label: string };
type HlsQualityOption = { index: number; label: string };

function convertClientSrtToVtt(raw: string): string {
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

export default function VideoPlayer({
  film,
  nextFilm,
  autoplayNext,
  savedProgressSeconds = 0,
  savedCompleted = false,
  autoResumeSeconds = null,
  initialPlaybackRate = 1,
  onPreferencesChange,
  onConsumeAutoResume,
  onProgress,
  onPlayNext
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const subUploadRef = useRef<HTMLInputElement | null>(null);

  const [playerStatus, setPlayerStatus] = useState<'loading' | 'ready' | 'error' | 'unavailable' | 'iframe'>('loading');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [durationStatus, setDurationStatus] = useState<'pending' | 'matched' | 'mismatch' | 'unknown'>('pending');
  const [measuredDuration, setMeasuredDuration] = useState<number>(0);
  const [sourceProbe, setSourceProbe] = useState<SourceProbe>({ status: 'idle' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(initialPlaybackRate || 1);
  const [activeClip, setActiveClip] = useState(0);

  // Quality & multi-source fallback state
  const [selectedQualityUrl, setSelectedQualityUrl] = useState<string>('');
  const [fallbackIndex, setFallbackIndex] = useState<number>(0);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [hlsLevels, setHlsLevels] = useState<HlsQualityOption[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  // Subtitles state: only real tracks from catalog or user-uploaded .vtt/.srt
  const [localSubTrack, setLocalSubTrack] = useState<{ label: string; url: string } | null>(null);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('off');

  // Audio tracks: only populated if the loaded media/HLS actually exposes > 1 track
  const [audioTracks, setAudioTracks] = useState<AudioOption[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number>(0);

  const [resumePromptSeconds, setResumePromptSeconds] = useState<number | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const pendingQualitySeekRef = useRef<number | null>(null);
  const pendingShouldPlayRef = useRef<boolean>(false);

  // Build ordered deduplicated stream candidate list
  const candidateUrls = useMemo(() => {
    const raw = [
      selectedQualityUrl || film.qualitySources?.[0]?.url || film.videoUrl || '',
      film.videoUrl || '',
      ...(film.fallbackUrls || []),
      ...(film.qualitySources?.map(q => q.url) || [])
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of raw) {
      if (isHttpUrl(u) && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }, [film.id, film.videoUrl, film.fallbackUrls, film.qualitySources, selectedQualityUrl]);

  const activeMediaUrl = candidateUrls[fallbackIndex] || '';
  const isHlsStream = activeMediaUrl.toLowerCase().includes('.m3u8') || (film.playerType === 'hls' && fallbackIndex === 0 && !selectedQualityUrl.toLowerCase().includes('.mp4'));
  const usingFallbackSource = fallbackIndex > 0;

  // Reset when film changes
  useEffect(() => {
    const initialUrl = film.qualitySources?.[0]?.url || film.videoUrl || '';
    setSelectedQualityUrl(initialUrl);
    setFallbackIndex(0);
    setRetryNonce(0);
    setStatusDetail('');
    setHlsLevels([]);
    setSelectedHlsLevel(-1);
    setAudioTracks([]);
    setActiveAudioTrack(0);
    setActiveSubtitle('off');
    setLocalSubTrack(prev => {
      if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
      return null;
    });
    setNextCountdown(null);
    setActiveClip(0);
    setMeasuredDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    pendingQualitySeekRef.current = null;
    pendingShouldPlayRef.current = false;
    setDurationStatus(film.playerType === 'embed' ? 'unknown' : 'pending');

    if (autoResumeSeconds === null && savedProgressSeconds >= 5 && !savedCompleted) {
      setResumePromptSeconds(savedProgressSeconds);
    } else {
      setResumePromptSeconds(null);
    }
  }, [film.id]);

  // Revoke local subtitle blob URL on unmount
  useEffect(() => {
    return () => {
      if (localSubTrack?.url.startsWith('blob:')) {
        URL.revokeObjectURL(localSubTrack.url);
      }
    };
  }, [localSubTrack]);

  // Verify stream availability & HTTP Range support via backend probe
  useEffect(() => {
    if (film.playerType === 'embed' && isHttpUrl(film.embedUrl)) {
      setPlayerStatus('iframe');
      setSourceProbe({ status: 'verified' });
      return;
    }
    if (!isHttpUrl(activeMediaUrl)) {
      setPlayerStatus('unavailable');
      setSourceProbe({ status: 'failed' });
      return;
    }

    setSourceProbe({ status: 'checking' });
    let cancelled = false;
    fetch(`/api/free-films/verify?url=${encodeURIComponent(activeMediaUrl)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setSourceProbe({
          status: data.ok ? 'verified' : 'failed',
          contentType: data.contentType,
          contentLength: data.contentLength,
          acceptRanges: data.acceptRanges,
          rangeSupported: Boolean(data.rangeSupported),
          signature: data.signature,
          error: data.error
        });
      })
      .catch(() => {
        if (!cancelled) setSourceProbe({ status: 'idle' });
      });

    return () => { cancelled = true; };
  }, [film.id, activeMediaUrl, retryNonce]);

  function advanceToFallbackOrError(reason: string) {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime) && video.currentTime > 1) {
      pendingQualitySeekRef.current = video.currentTime;
      pendingShouldPlayRef.current = !video.paused || isPlaying;
    }
    if (fallbackIndex + 1 < candidateUrls.length) {
      setStatusDetail(`Primary stream failed (${reason}). Switching to mirror ${fallbackIndex + 2}/${candidateUrls.length}…`);
      setPlayerStatus('loading');
      setFallbackIndex(idx => idx + 1);
      return;
    }
    setStatusDetail(reason);
    setPlayerStatus('error');
    setIsPlaying(false);
  }

  // Attach HLS (hls.js or Safari native) or direct MP4 source
  useEffect(() => {
    const video = videoRef.current;
    if (!video || film.playerType === 'embed' || !isHttpUrl(activeMediaUrl)) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setPlayerStatus('loading');
    setHlsLevels([]);
    setSelectedHlsLevel(-1);

    if (isHlsStream) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60
        });
        hlsRef.current = hls;
        let networkRecoveries = 0;
        let mediaRecoveries = 0;

        hls.loadSource(activeMediaUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          setStatusDetail('');
          if (data.levels && data.levels.length > 1) {
            const sorted = data.levels
              .map((lvl, idx) => ({
                index: idx,
                height: lvl.height || 0,
                bitrate: lvl.bitrate || 0,
                label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`
              }))
              .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)
              .map(({ index, label }) => ({ index, label }));
            setHlsLevels(sorted);
          }
          if (hls.audioTracks && hls.audioTracks.length > 1) {
            setAudioTracks(hls.audioTracks.map((t, idx) => ({
              index: idx,
              label: t.name || t.lang || `Audio ${idx + 1}`
            })));
            setActiveAudioTrack(hls.audioTrack);
          }
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 1) {
            networkRecoveries += 1;
            setStatusDetail('Network hiccup — reconnecting HLS stream…');
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
            mediaRecoveries += 1;
            setStatusDetail('Recovering HLS media decoder…');
            hls.recoverMediaError();
            return;
          }
          hls.destroy();
          hlsRef.current = null;
          advanceToFallbackOrError(`HLS ${data.details || 'stream error'}`);
        });

        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeMediaUrl;
        video.load();
        return;
      }

      advanceToFallbackOrError('HLS playback is not supported in this browser');
      return;
    }

    video.src = activeMediaUrl;
    video.load();
  }, [film.id, activeMediaUrl, isHlsStream, retryNonce]);

  // Sync HTML5 textTracks mode cleanly with activeSubtitle selection
  function syncTextTracks(targetSub: string) {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const key = t.label || t.language || String(i);
      t.mode = targetSub !== 'off' && key === targetSub ? 'showing' : 'hidden';
    }
  }

  useEffect(() => {
    syncTextTracks(activeSubtitle);
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    const onAddTrack = () => syncTextTracks(activeSubtitle);
    tracks.addEventListener('addtrack', onAddTrack);
    return () => tracks.removeEventListener('addtrack', onAddTrack);
  }, [activeSubtitle, localSubTrack, film.id]);

  // Flush watch progress when tab becomes hidden or closes
  const progressCbRef = useRef(onProgress);
  progressCbRef.current = onProgress;

  useEffect(() => {
    const flush = () => {
      const video = videoRef.current;
      if (!video || film.playerType === 'embed') return;
      if (video.currentTime >= 3 && Number.isFinite(video.duration) && video.duration > 0) {
        progressCbRef.current(video.currentTime, video.duration, true);
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [film.id, film.playerType]);

  // Countdown for autoplay next item when film finishes
  useEffect(() => {
    if (nextCountdown === null || !nextFilm || !onPlayNext) return;
    if (nextCountdown <= 0) {
      setNextCountdown(null);
      onPlayNext(nextFilm.id);
      return;
    }
    const timer = window.setTimeout(() => setNextCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => window.clearTimeout(timer);
  }, [nextCountdown, nextFilm, onPlayNext]);

  const subtitleOptions = useMemo(() => {
    const list: { key: string; label: string; src: string; lang: string }[] = [];
    if (film.subtitles) {
      for (const s of film.subtitles) {
        if (isHttpUrl(s.url)) {
          list.push({
            key: s.label,
            label: s.label,
            src: `/api/subtitles?url=${encodeURIComponent(s.url)}`,
            lang: s.lang
          });
        }
      }
    }
    if (localSubTrack) {
      list.push({
        key: localSubTrack.label,
        label: localSubTrack.label,
        src: localSubTrack.url,
        lang: 'en'
      });
    }
    return list;
  }, [film.subtitles, localSubTrack]);

  // Keyboard shortcuts while player is mounted (stable listener using refs)
  const keyStateRef = useRef({ volume, subtitleOptions, runtimeSeconds: film.runtimeSeconds });
  keyStateRef.current = { volume, subtitleOptions, runtimeSeconds: film.runtimeSeconds };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const video = videoRef.current;
      if (!video || film.playerType === 'embed') return;

      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        event.preventDefault();
        togglePlayPause();
      } else if (key === 'arrowleft' || key === 'j') {
        event.preventDefault();
        seekRelative(key === 'j' ? -15 : -10);
      } else if (key === 'arrowright' || key === 'l') {
        event.preventDefault();
        seekRelative(key === 'l' ? 15 : 10);
      } else if (key === 'arrowup') {
        event.preventDefault();
        updateVolume(Math.min(1, keyStateRef.current.volume + 0.1));
      } else if (key === 'arrowdown') {
        event.preventDefault();
        updateVolume(Math.max(0, keyStateRef.current.volume - 0.1));
      } else if (key === 'm') {
        event.preventDefault();
        toggleMute();
      } else if (key === 'f') {
        event.preventDefault();
        toggleFullscreen();
      } else if (key === 'c') {
        const subs = keyStateRef.current.subtitleOptions;
        if (subs.length > 0) {
          event.preventDefault();
          setActiveSubtitle(prev => (prev === 'off' ? subs[0].key : 'off'));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [film.id, film.playerType]);

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : film.runtimeSeconds;
    const next = Math.max(0, Math.min(duration, seconds));
    if (video.readyState >= 1) {
      video.currentTime = next;
    } else {
      pendingQualitySeekRef.current = next;
    }
    setCurrentTime(next);
  }

  function seekRelative(deltaSeconds: number) {
    const video = videoRef.current;
    if (!video) return;
    seekTo(video.currentTime + deltaSeconds);
  }

  function updateVolume(nextVol: number) {
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    setMuted(clamped === 0);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    setMuted(next);
    video.muted = next;
  }

  function changePlaybackSpeed(speed: number) {
    setPlaybackRate(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    onPreferencesChange?.({ preferred_playback_speed: speed });
  }

  function switchMp4Quality(url: string) {
    if (url === selectedQualityUrl && fallbackIndex === 0) return;
    const video = videoRef.current;
    if (video) {
      pendingQualitySeekRef.current = video.currentTime;
      pendingShouldPlayRef.current = !video.paused || isPlaying;
    }
    setFallbackIndex(0);
    setStatusDetail('');
    setSelectedQualityUrl(url);
  }

  function switchHlsLevel(levelIndex: number) {
    setSelectedHlsLevel(levelIndex);
    if (hlsRef.current) hlsRef.current.currentLevel = levelIndex;
  }

  function switchAudioTrack(index: number) {
    setActiveAudioTrack(index);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = index;
      return;
    }
    const video = videoRef.current as (HTMLVideoElement & { audioTracks?: any[] }) | null;
    if (video?.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = i === index;
      }
    }
  }

  function toggleFullscreen() {
    const container = containerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (container?.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        if (video?.requestFullscreen) video.requestFullscreen().catch(() => {});
      });
    } else if (video?.requestFullscreen) {
      video.requestFullscreen().catch(() => {});
    } else if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  }

  function handleLocalSubtitleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      if (!raw.trim()) return;
      const vttText = convertClientSrtToVtt(raw);
      const blob = new Blob([vttText], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      const label = file.name.replace(/\.(vtt|srt)$/i, '');
      setLocalSubTrack(prev => {
        if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
        return { label, url: blobUrl };
      });
      setActiveSubtitle(label);
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  const effectiveDuration = measuredDuration || film.runtimeSeconds;
  const seekPercent = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  return (
    <div className="auroraPlayerRoot">
      <div className="archiveMotion" ref={containerRef}>
        {film.playerType === 'embed' && isHttpUrl(film.embedUrl) ? (
          <iframe
            className="archiveEmbed"
            src={film.embedUrl}
            title={`${film.title} full movie`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            onLoad={() => setPlayerStatus('iframe')}
          />
        ) : isHttpUrl(activeMediaUrl) ? (
          <>
            <video
              key={film.id}
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              aria-label={`${film.title} full movie`}
              onLoadStart={() => setPlayerStatus('loading')}
              onLoadedMetadata={event => {
                const video = event.currentTarget;
                video.volume = volume;
                video.muted = muted;
                video.playbackRate = playbackRate;
                syncTextTracks(activeSubtitle);

                const actualDuration = video.duration;
                setMeasuredDuration(Number.isFinite(actualDuration) ? actualDuration : 0);
                const tolerance = Math.max(10, film.runtimeSeconds * 0.05);
                setDurationStatus(
                  Number.isFinite(actualDuration) && actualDuration > 0
                    ? Math.abs(actualDuration - film.runtimeSeconds) <= tolerance ? 'matched' : 'mismatch'
                    : 'unknown'
                );

                // Check native audio tracks if exposed by browser
                const nativeVideo = video as HTMLVideoElement & { audioTracks?: any[] };
                if (nativeVideo.audioTracks && nativeVideo.audioTracks.length > 1) {
                  const list: AudioOption[] = [];
                  for (let i = 0; i < nativeVideo.audioTracks.length; i++) {
                    const tr = nativeVideo.audioTracks[i];
                    list.push({ index: i, label: tr.label || tr.language || `Track ${i + 1}` });
                    if (tr.enabled) setActiveAudioTrack(i);
                  }
                  setAudioTracks(list);
                }

                if (pendingQualitySeekRef.current !== null && Number.isFinite(actualDuration)) {
                  video.currentTime = Math.min(actualDuration, pendingQualitySeekRef.current);
                  pendingQualitySeekRef.current = null;
                  if (pendingShouldPlayRef.current) {
                    pendingShouldPlayRef.current = false;
                    video.play().catch(() => {});
                  }
                } else if (autoResumeSeconds !== null && Number.isFinite(actualDuration) && autoResumeSeconds < actualDuration) {
                  video.currentTime = autoResumeSeconds;
                  onConsumeAutoResume();
                  setResumePromptSeconds(null);
                  video.play().catch(() => {});
                }
              }}
              onCanPlay={() => {
                setPlayerStatus('ready');
                setStatusDetail('');
              }}
              onWaiting={() => setPlayerStatus('loading')}
              onPlaying={() => {
                setPlayerStatus('ready');
                setStatusDetail('');
                setIsPlaying(true);
                setNextCountdown(null);
              }}
              onPause={event => {
                setIsPlaying(false);
                onProgress(event.currentTarget.currentTime, event.currentTarget.duration, true);
              }}
              onTimeUpdate={event => {
                setCurrentTime(event.currentTarget.currentTime);
                onProgress(event.currentTarget.currentTime, event.currentTarget.duration, false);
              }}
              onEnded={event => {
                setIsPlaying(false);
                onProgress(event.currentTarget.duration, event.currentTarget.duration, true);
                if (autoplayNext && nextFilm && onPlayNext) {
                  setNextCountdown(6);
                }
              }}
              onError={event => {
                const mediaErr = event.currentTarget.error;
                const reason = mediaErr?.message || `Media error code ${mediaErr?.code ?? 'unknown'}`;
                advanceToFallbackOrError(reason);
              }}
            >
              {subtitleOptions.map(sub => (
                <track
                  key={sub.key}
                  kind="subtitles"
                  src={sub.src}
                  srcLang={sub.lang}
                  label={sub.label}
                />
              ))}
            </video>

            {playerStatus === 'loading' && (
              <div className="archivePlayerState loading" role="status">
                <span className="archivePlayerSpinner" />
                <strong>{usingFallbackSource ? 'Switching to backup stream…' : 'Loading stream…'}</strong>
                <small>{statusDetail || 'Verifying media metadata and preparing progressive playback'}</small>
              </div>
            )}

            {playerStatus === 'error' && (
              <div className="archivePlayerState error" role="alert">
                <strong>Playback unavailable</strong>
                <small>{statusDetail || 'Network error or unsupported stream format in this browser.'}</small>
                <div className="archiveBadgeRow">
                  <button
                    type="button"
                    className="archiveSourceButton"
                    onClick={() => {
                      setStatusDetail('');
                      setFallbackIndex(0);
                      setRetryNonce(n => n + 1);
                    }}
                  >
                    Retry playback
                  </button>
                  <a className="archiveSourceButton" href={film.itemUrl} target="_blank" rel="noreferrer">Open source record</a>
                </div>
              </div>
            )}

            {nextCountdown !== null && nextFilm && onPlayNext && (
              <div className="archivePlayerState nextUpOverlay" role="status">
                <small>UP NEXT IN {nextCountdown}s</small>
                <strong>{nextFilm.title} ({nextFilm.year})</strong>
                <div className="archiveBadgeRow">
                  <button type="button" className="resumePrimary" onClick={() => onPlayNext(nextFilm.id)}>
                    <SkipForward size={14} /> Play Next Now
                  </button>
                  <button type="button" className="resumeSecondary" onClick={() => setNextCountdown(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="archivePlayerState unavailable" role="status">
            <strong>Playback source unavailable</strong>
            <small>No valid MP4, HLS, or permitted embed URL is listed for this title.</small>
            <a className="archiveSourceButton" href={film.itemUrl} target="_blank" rel="noreferrer">View source record</a>
          </div>
        )}
      </div>

      {usingFallbackSource && playerStatus === 'ready' && (
        <p className="fallbackNotice">
          Playing from verified backup stream ({fallbackIndex + 1} of {candidateUrls.length}).
        </p>
      )}

      {resumePromptSeconds !== null && resumePromptSeconds >= 5 && film.playerType !== 'embed' && (
        <div className="resumeBanner">
          <span>You previously watched up to <strong>{formatRuntime(resumePromptSeconds)}</strong>.</span>
          <div className="resumeBannerActions">
            <button
              type="button"
              className="resumePrimary"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = resumePromptSeconds;
                  videoRef.current.play().catch(() => {});
                }
                setResumePromptSeconds(null);
              }}
            >
              Resume from {formatRuntime(resumePromptSeconds)}
            </button>
            <button
              type="button"
              className="resumeSecondary"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                }
                setResumePromptSeconds(null);
              }}
            >
              Start from beginning
            </button>
          </div>
        </div>
      )}

      {film.playerType !== 'embed' && (
        <div className="playerToolbar">
          <div className="playerSeekBar">
            <input
              type="range"
              className="playerSeekSlider"
              aria-label="Seek timeline"
              min={0}
              max={Math.max(1, Math.floor(effectiveDuration))}
              step={1}
              value={Math.min(Math.floor(effectiveDuration), Math.floor(currentTime))}
              style={{ '--seek-pct': `${seekPercent.toFixed(2)}%` } as React.CSSProperties}
              onChange={e => seekTo(Number(e.target.value))}
            />
          </div>

          <div className="playerToolbarGroup">
            <button type="button" onClick={togglePlayPause}>
              {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} fill="currentColor" /> Play</>}
            </button>
            <button type="button" onClick={() => seekRelative(-15)} aria-label="Rewind 15 seconds">
              <RotateCcw size={14} /> -15s
            </button>
            <button type="button" onClick={() => seekRelative(15)} aria-label="Forward 15 seconds">
              <RotateCw size={14} /> +15s
            </button>
            <span className="playerTimeReadout">
              {formatRuntime(currentTime)} / {formatRuntime(effectiveDuration)}
            </span>
          </div>

          <div className="playerToolbarGroup">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              className="playerVolumeSlider"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={e => updateVolume(Number(e.target.value))}
            />

            {[0.75, 1, 1.25, 1.5, 2].map(rate => (
              <button
                key={rate}
                type="button"
                className={playbackRate === rate ? 'selected' : ''}
                onClick={() => changePlaybackSpeed(rate)}
              >
                {rate}x
              </button>
            ))}

            {film.qualitySources && film.qualitySources.length > 1 && (
              <select
                className="playerSelect"
                aria-label="Video quality"
                value={selectedQualityUrl}
                onChange={e => switchMp4Quality(e.target.value)}
              >
                {film.qualitySources.map(q => (
                  <option key={q.url} value={q.url}>{q.label}</option>
                ))}
              </select>
            )}

            {hlsLevels.length > 1 && (
              <select
                className="playerSelect"
                aria-label="HLS video quality"
                value={selectedHlsLevel}
                onChange={e => switchHlsLevel(Number(e.target.value))}
              >
                <option value={-1}>Auto</option>
                {hlsLevels.map(l => (
                  <option key={l.index} value={l.index}>{l.label}</option>
                ))}
              </select>
            )}

            {audioTracks.length > 1 && (
              <select
                className="playerSelect"
                aria-label="Audio track"
                value={activeAudioTrack}
                onChange={e => switchAudioTrack(Number(e.target.value))}
              >
                {audioTracks.map(a => (
                  <option key={a.index} value={a.index}>{a.label}</option>
                ))}
              </select>
            )}

            {subtitleOptions.length > 0 && (
              <span className="playerSubSelectWrap">
                <Captions size={14} aria-hidden="true" />
                <select
                  className="playerSelect"
                  aria-label="Subtitles"
                  value={activeSubtitle}
                  onChange={e => setActiveSubtitle(e.target.value)}
                >
                  <option value="off">Subtitles: Off</option>
                  {subtitleOptions.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </span>
            )}

            <button
              type="button"
              onClick={() => subUploadRef.current?.click()}
              title="Load external .vtt or .srt subtitle file"
            >
              <Upload size={13} /> Subtitles (.vtt/.srt)
            </button>
            <input
              ref={subUploadRef}
              type="file"
              accept=".vtt,.srt,text/vtt"
              hidden
              onChange={handleLocalSubtitleUpload}
            />

            {nextFilm && onPlayNext && (
              <button type="button" onClick={() => onPlayNext(nextFilm.id)}>
                <SkipForward size={14} /> Next
              </button>
            )}

            <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
              <Maximize2 size={14} /> Fullscreen
            </button>
          </div>
        </div>
      )}

      {film.playerType !== 'embed' && (
        <div className="excerptControls">
          <span>Jump to scene</span>
          {film.excerpts.map((clip, index) => (
            <button
              key={clip.start}
              className={activeClip === index ? 'selected' : ''}
              onClick={() => {
                setActiveClip(index);
                if (videoRef.current) {
                  videoRef.current.currentTime = clip.start;
                  videoRef.current.play().catch(() => {});
                }
              }}
            >
              {clip.label} ({formatRuntime(clip.start)})
            </button>
          ))}
          <small className="shortcutHint">Shortcuts: Space Play/Pause · J/L ±15s · M Mute · F Fullscreen · C Subtitles</small>
        </div>
      )}

      <p className="archiveDesc">{film.description}</p>

      <div className="archiveSourceMeta">
        <div>
          <small>Provider</small>
          <strong>{film.provider}</strong>
        </div>
        <div>
          <small>Runtime</small>
          <strong>
            {formatRuntime(effectiveDuration)}
            {film.completeness === 'incomplete' ? ' (incomplete)' : ' (complete)'}
          </strong>
        </div>
        <div>
          <small>Stream Source</small>
          <strong>
            {film.availableQualities.join(', ')}
            {sourceProbe.contentLength ? ` · ${formatBytes(sourceProbe.contentLength)}` : ''}
          </strong>
        </div>
        <div>
          <small>Rights</small>
          <strong>{film.rightsLabel}</strong>
        </div>
      </div>

      <p className={`archiveDurationMatch ${durationStatus === 'matched' ? 'match' : durationStatus === 'mismatch' ? 'mismatch' : ''}`}>
        {durationStatus === 'matched' && `Verified complete stream: measured video duration (${formatRuntime(measuredDuration)}) matches catalog runtime (${formatRuntime(film.runtimeSeconds)}).`}
        {durationStatus === 'mismatch' && `Duration notice: measured video duration (${formatRuntime(measuredDuration)}) differs from catalog runtime (${formatRuntime(film.runtimeSeconds)}).`}
        {durationStatus === 'pending' && (sourceProbe.status === 'verified'
          ? `Source stream verified (${sourceProbe.signature || sourceProbe.contentType || 'video/mp4'}${sourceProbe.rangeSupported ? ', HTTP Range 206 seekable' : ''}). Loading duration metadata…`
          : sourceProbe.status === 'failed'
            ? 'Source stream preflight check failed; playback will try available mirror or source link.'
            : 'Verifying stream signature and HTTP Range metadata…')}
        {durationStatus === 'unknown' && 'Embedded source duration is managed by the external provider.'}
      </p>

      <div className="archiveCredits">
        <p><strong>Attribution:</strong> {film.attribution}</p>
        <p className="archiveRightsNote">
          <strong>Rights &amp; License:</strong> {film.rightsNote}{' '}
          <a href={film.rightsUrl} target="_blank" rel="noreferrer">Read license / rights statement ↗</a>
        </p>
        {film.countryRestrictions && film.countryRestrictions.length > 0 && (
          <p className="countryRestrictions"><strong>Territorial notice:</strong> {film.countryRestrictions.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}
