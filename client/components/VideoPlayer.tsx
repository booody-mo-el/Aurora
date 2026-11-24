import React, { useEffect, useRef, useState } from 'react';
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
  onConsumeAutoResume: () => void;
  onProgress: (currentTime: number, duration: number, forceSync?: boolean) => void;
  onPlayNext?: (nextId: string) => void;
};

type AudioOption = { index: number; label: string };
type HlsQualityOption = { index: number; label: string };

export default function VideoPlayer({
  film,
  nextFilm,
  autoplayNext,
  savedProgressSeconds = 0,
  savedCompleted = false,
  autoResumeSeconds = null,
  onConsumeAutoResume,
  onProgress,
  onPlayNext
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const subUploadRef = useRef<HTMLInputElement | null>(null);

  const [playerStatus, setPlayerStatus] = useState<'loading' | 'ready' | 'error' | 'unavailable' | 'iframe'>('loading');
  const [durationStatus, setDurationStatus] = useState<'pending' | 'matched' | 'mismatch' | 'unknown'>('pending');
  const [measuredDuration, setMeasuredDuration] = useState<number>(0);
  const [sourceProbe, setSourceProbe] = useState<SourceProbe>({ status: 'idle' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeClip, setActiveClip] = useState(0);

  // Quality state: either real qualitySources (e.g. 480p vs 240p) or real HLS levels
  const [selectedQualityUrl, setSelectedQualityUrl] = useState<string>('');
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

  const activeMediaUrl = selectedQualityUrl || film.videoUrl || '';
  const isHlsStream = film.playerType === 'hls' || activeMediaUrl.toLowerCase().includes('.m3u8');

  // Reset when film changes
  useEffect(() => {
    const initialUrl = film.qualitySources?.[0]?.url || film.videoUrl || '';
    setSelectedQualityUrl(initialUrl);
    setHlsLevels([]);
    setSelectedHlsLevel(-1);
    setAudioTracks([]);
    setActiveAudioTrack(0);
    setActiveSubtitle('off');
    setLocalSubTrack(null);
    setNextCountdown(null);
    setActiveClip(0);
    setMeasuredDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setDurationStatus(film.playerType === 'embed' ? 'unknown' : 'pending');

    if (autoResumeSeconds === null && savedProgressSeconds >= 5 && !savedCompleted) {
      setResumePromptSeconds(savedProgressSeconds);
    } else {
      setResumePromptSeconds(null);
    }
  }, [film.id]);

  // Verify stream availability via backend HEAD check
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

    setPlayerStatus('loading');
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
          acceptRanges: data.acceptRanges
        });
      })
      .catch(() => {
        if (!cancelled) setSourceProbe({ status: 'idle' });
      });

    return () => { cancelled = true; };
  }, [film.id, activeMediaUrl]);

  // Attach HLS or native MP4 source
  useEffect(() => {
    const video = videoRef.current;
    if (!video || film.playerType === 'embed' || !isHttpUrl(activeMediaUrl)) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(activeMediaUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        if (data.levels && data.levels.length > 1) {
          setHlsLevels(data.levels.map((lvl, idx) => ({
            index: idx,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`
          })));
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
        if (data.fatal) setPlayerStatus('error');
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    video.src = activeMediaUrl;
    video.load();
  }, [film.id, activeMediaUrl, isHlsStream]);

  // Sync HTML5 textTracks mode with activeSubtitle selection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const key = t.label || t.language || String(i);
      t.mode = activeSubtitle !== 'off' && key === activeSubtitle ? 'showing' : 'hidden';
    }
  }, [activeSubtitle, localSubTrack, film.id]);

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

  // Keyboard shortcuts while player is mounted
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
        updateVolume(Math.min(1, volume + 0.1));
      } else if (key === 'arrowdown') {
        event.preventDefault();
        updateVolume(Math.max(0, volume - 0.1));
      } else if (key === 'm') {
        event.preventDefault();
        toggleMute();
      } else if (key === 'f') {
        event.preventDefault();
        toggleFullscreen();
      } else if (key === 'c') {
        const availableSubs = buildSubtitleOptions();
        if (availableSubs.length > 0) {
          event.preventDefault();
          setActiveSubtitle(prev => (prev === 'off' ? availableSubs[0].key : 'off'));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function buildSubtitleOptions(): { key: string; label: string; src: string; lang: string }[] {
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
  }

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function seekRelative(deltaSeconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : film.runtimeSeconds;
    const next = Math.max(0, Math.min(duration, video.currentTime + deltaSeconds));
    video.currentTime = next;
    setCurrentTime(next);
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
    const next = !muted;
    setMuted(next);
    video.muted = next;
  }

  function changePlaybackSpeed(speed: number) {
    setPlaybackRate(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }

  function switchMp4Quality(url: string) {
    if (url === selectedQualityUrl) return;
    const video = videoRef.current;
    if (video) pendingQualitySeekRef.current = video.currentTime;
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
      const vttText = raw.trimStart().startsWith('WEBVTT')
        ? raw
        : 'WEBVTT\n\n' + raw.replace(/\r\n/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      const blob = new Blob([vttText], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      const label = file.name.replace(/\.(vtt|srt)$/i, '');
      setLocalSubTrack({ label, url: blobUrl });
      setActiveSubtitle(label);
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  const subtitleOptions = buildSubtitleOptions();

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
              key={`${film.id}-${isHlsStream ? 'hls' : 'mp4'}`}
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              aria-label={`${film.title} full movie`}
              onLoadStart={() => setPlayerStatus('loading')}
              onLoadedMetadata={event => {
                const video = event.currentTarget;
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
                  video.play().catch(() => {});
                } else if (autoResumeSeconds !== null && Number.isFinite(actualDuration) && autoResumeSeconds < actualDuration) {
                  video.currentTime = autoResumeSeconds;
                  onConsumeAutoResume();
                  setResumePromptSeconds(null);
                  video.play().catch(() => {});
                }
              }}
              onCanPlay={() => setPlayerStatus('ready')}
              onWaiting={() => setPlayerStatus('loading')}
              onPlaying={() => {
                setPlayerStatus('ready');
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
              onError={() => {
                setPlayerStatus('error');
                setIsPlaying(false);
              }}
            >
              {subtitleOptions.map(sub => (
                <track
                  key={sub.key}
                  kind="subtitles"
                  src={sub.src}
                  srcLang={sub.lang}
                  label={sub.label}
                  default={activeSubtitle === sub.key}
                />
              ))}
            </video>

            {playerStatus === 'loading' && (
              <div className="archivePlayerState loading" role="status">
                <span className="archivePlayerSpinner" />
                <strong>Loading stream…</strong>
                <small>Verifying media metadata and preparing playback</small>
              </div>
            )}

            {playerStatus === 'error' && (
              <div className="archivePlayerState error" role="alert">
                <strong>Playback unavailable</strong>
                <small>Network error or unsupported stream format in this browser.</small>
                <div className="archiveBadgeRow">
                  <button
                    type="button"
                    className="archiveSourceButton"
                    onClick={() => {
                      setPlayerStatus('loading');
                      videoRef.current?.load();
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
              {formatRuntime(currentTime)} / {formatRuntime(measuredDuration || film.runtimeSeconds)}
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
          <small className="shortcutHint">Shortcuts: Space Play/Pause · J/L ±15s · M Mute · F Fullscreen</small>
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
            {formatRuntime(measuredDuration || film.runtimeSeconds)}
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
          ? `Source stream reachable (${sourceProbe.contentType || 'video/mp4'}${sourceProbe.acceptRanges ? ', seekable' : ''}). Loading duration metadata…`
          : sourceProbe.status === 'failed'
            ? 'Source stream preflight check failed; playback will fall back to source link if unavailable.'
            : 'Verifying full stream metadata…')}
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
