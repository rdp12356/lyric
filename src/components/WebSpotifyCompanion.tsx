import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Music2, RefreshCw, Search, LogOut, Check, AlertCircle, ArrowLeft, Download, ExternalLink, Settings2, Library, Heart } from 'lucide-react';
import {
  beginSpotifyBrowserLogin, disconnectSpotifyBrowser, finishSpotifyBrowserCallback,
  getSpotifyBrowserAccessToken, hasRememberedSpotifySession,
  savedSpotifyClientId, webSpotifyRedirectUri, spotifyBrowserControlsAuthorized
} from '../services/webSpotifyAuth';
import {
  readWebSpotifyPlayback, spotifyWebControl, PlaybackRequestError, type SpotifyWebPlayback
} from '../services/webSpotifyPlayback';
import { findLyrics, lyricsProviders, type LyricsCandidate, type LyricsTrack } from '../services/lyricsProviders';
import { cachedLyrics, cacheLyrics, lyricsKey, removeCachedLyrics } from '../services/lyricsCache';
import { parseLRC } from '../services/lrcParser';
import { SyncClock } from '../services/syncClock';
import { SpotifyLyricsPanel } from './SpotifyLyricsPanel';
import { MusicLibraryDrawer } from './MusicLibraryDrawer';
import { musicLibrary, useMusicLibrary } from '../services/musicLibrary';
import type { LyricsData, Track } from '../types';

const OFFSET_STORE = 'lyric.web.song.offsets.v1';
const FONT_STORE = 'lyric.web.font.size.v1';
const BUTTON = 'rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-40';
const TEXT = 'block w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400';
type Phase = 'checking' | 'disconnected' | 'connected';
const describe = (error: unknown) => error instanceof Error ? error.message : 'An unexpected Spotify error occurred.';
function readOffsets(): Record<string, number> {
  try {
    const obj: unknown = JSON.parse(localStorage.getItem(OFFSET_STORE) || '{}');
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj as Record<string, number> : {};
  } catch { return {}; }
}
function saveOffset(id: string, ms: number) {
  try {
    const offsets = readOffsets();
    offsets[id] = ms;
    const last = Object.entries(offsets).slice(-80);
    localStorage.setItem(OFFSET_STORE, JSON.stringify(Object.fromEntries(last)));
  } catch { /* May be disabled in private browsing. */ }
}
function playerTrack(value: SpotifyWebPlayback): LyricsTrack {
  return {
    id: value.trackId || value.uri,
    name: value.title, artist: value.artist, album: value.album, duration: value.duration
  };
}
function SpotifyFavorite({ song }: { song: Track }) {
  const library = useMusicLibrary();
  const favorite = library.favorites.some(item => item.id === song.id);
  return <button aria-label={favorite ? 'Remove Spotify favorite' : 'Save Spotify favorite'} className={BUTTON}
    onClick={() => musicLibrary.toggleFavorite(song)}>
    <Heart size={15} fill={favorite ? 'currentColor' : 'none'} className="inline" />
    <span className="hidden sm:inline"> {favorite ? 'Saved' : 'Favorite'}</span>
  </button>;
}

export default function WebSpotifyCompanion() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [clientId, setClientId] = useState(savedSpotifyClientId);
  const [remember, setRemember] = useState(true);
  const [allowControls, setAllowControls] = useState(spotifyBrowserControlsAuthorized);
  const [authError, setAuthError] = useState('');
  const [connection, setConnection] = useState('');
  const [playback, setPlayback] = useState<SpotifyWebPlayback | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [lyricsError, setLyricsError] = useState('');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const [fontSize, setFontSize] = useState(() => {
    try { return Math.min(42, Math.max(18, Number(localStorage.getItem(FONT_STORE)) || 27)); } catch { return 27; }
  });
  const [settings, setSettings] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showPlain, setShowPlain] = useState(true);
  const [manualResult, setManualResult] = useState(false);
  const clock = useRef(new SyncClock());
  const lastKey = useRef('');
  const playbackRef = useRef<SpotifyWebPlayback | null>(null);
  const requestId = useRef(0);
  const lyricRequestId = useRef(0);
  const lrcInput = useRef<HTMLInputElement>(null);
  const track = playback ? playerTrack(playback) : null;
  const trackId = track?.id || '';
  const activeCacheKey = track ? lyricsKey(track.name, track.artist, track.album, track.duration) : '';
  const spotifyUrl = trackId && /^[a-zA-Z0-9]{22}$/.test(trackId) ? 'https://open.spotify.com/track/' + trackId : '';
  const artwork = playback?.artwork;
  const libraryTrack = useMemo<Track | null>(() => playback ? ({
    id: playback.uri || playback.trackId,
    title: playback.title,
    artist: playback.artist,
    album: playback.album,
    albumArt: playback.artwork,
    duration: playback.duration,
    position: playback.position,
    isPlaying: playback.playing,
    source: 'spotify-web'
  }) : null, [playback?.uri, playback?.trackId, playback?.title, playback?.artist, playback?.album, playback?.artwork, playback?.duration, playback?.playing]);
  const formatTime = (time: number) => {
    const value = Math.max(0, Math.floor(time));
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
  };

  useEffect(() => {
    try { localStorage.setItem('lyric.web.spotify.prefer-mode', 'true'); } catch { /* Optional. */ }
    // The authorization service deduplicates concurrent StrictMode callbacks.
    let alive = true;
    void (async () => {
      try {
        const authorized = await finishSpotifyBrowserCallback();
        if (!alive) return;
        if (!authorized && !hasRememberedSpotifySession()) { setPhase('disconnected'); return; }
        await getSpotifyBrowserAccessToken();
        if (alive) { setPhase('connected'); setAllowControls(spotifyBrowserControlsAuthorized()); setAuthError(''); }
      } catch (error) {
        if (alive) { setPhase('disconnected'); setAuthError(describe(error)); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const reconnect = useCallback(async () => {
    setPhase('checking'); setAuthError('');
    try {
      await getSpotifyBrowserAccessToken(true);
      setPhase('connected'); setAllowControls(spotifyBrowserControlsAuthorized());
    } catch (error) { setAuthError(describe(error)); setPhase('disconnected'); }
  }, []);
  const disconnect = useCallback(() => {
    requestId.current++; lyricRequestId.current++;
    disconnectSpotifyBrowser();
    setPhase('disconnected'); setAllowControls(false); setPlayback(null); playbackRef.current = null;
    setLyrics(null); setConnection(''); setAuthError('');
    lastKey.current = ''; clock.current.reset(0, false);
  }, []);
  const goBack = useCallback(() => {
    try { localStorage.setItem('lyric.web.spotify.prefer-mode', 'false'); } catch { /* Optional. */ }
    window.location.assign(webSpotifyRedirectUri());
  }, []);

  useEffect(() => {
    if (phase !== 'connected') return;
    let cancelled = false;
    let active: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const generation = ++requestId.current;
    const poll = async () => {
      if (cancelled || document.hidden) return;
      active?.abort();
      active = new AbortController();
      const signal = active.signal;
      let nextDelay = 2500;
      try {
        const result = await readWebSpotifyPlayback(signal);
        if (cancelled || generation !== requestId.current || signal.aborted) return;
        failures = 0;
        setConnection(result.message);
        const next = result.playback;
        if (!next) {
          playbackRef.current = null; lastKey.current = '';
          lyricRequestId.current++; setLyrics(null); setManualResult(false);
          clock.current.reset(0, false); setPlayback(null); setSeconds(0);
        } else {
          const key = next.uri || next.trackId;
          if (key !== lastKey.current) {
            musicLibrary.rememberTrack({
              id: next.uri || next.trackId, title: next.title, artist: next.artist,
              album: next.album, albumArt: next.artwork, duration: next.duration,
              position: next.position, isPlaying: next.playing, source: 'spotify-web'
            });
            lyricRequestId.current++; setLyrics(null); setManualResult(false);
            setLyricsError(''); setCandidates([]);
            clock.current.reset(next.position, next.playing);
            lastKey.current = key;
          } else clock.current.update(next.position, next.playing);
          playbackRef.current = next;
          setPlayback(previous => {
            // Avoid rebuilding lyrics UI every time a position snapshot arrives.
            const same = previous && previous.uri === next.uri && previous.playing === next.playing
              && previous.artwork === next.artwork && previous.deviceName === next.deviceName;
            return same ? previous : next;
          });
        }
        nextDelay = next?.playing ? 2500 : 4500;
      } catch (error) {
        if (cancelled || signal.aborted || generation !== requestId.current) return;
        // A revoked/expired refresh token is not a transient playback outage.
        // The auth service clears it on invalid_grant; return to Sign In.
        if (!hasRememberedSpotifySession()) {
          setAuthError('Spotify authorization expired or was revoked. Connect your account again.');
          setPhase('disconnected');
          setPlayback(null); setLyrics(null); clock.current.reset(0, false);
          return;
        }
        failures++;
        nextDelay = Math.min(30000, 1500 * Math.pow(2, Math.min(5, failures)));
        if (error instanceof PlaybackRequestError) {
          if (error.status === 429) nextDelay = Math.max(nextDelay, (error.retryAfterSeconds || 15) * 1000);
          if (error.status === 401) { setAuthError(error.message); setPhase('disconnected'); return; }
        }
        setConnection(describe(error));
      } finally {
        if (!cancelled && generation === requestId.current && !document.hidden)
          timer = setTimeout(poll, nextDelay);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) active?.abort();
      else void poll();
    };
    document.addEventListener('visibilitychange', visibility);
    void poll();
    return () => {
      cancelled = true; requestId.current++;
      clearTimeout(timer); active?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== 'connected') return;
    let frame = 0, last = 0;
    const tick = (now: number) => {
      if (now - last >= 40 && !document.hidden) {
        const position = clock.current.now();
        setSeconds(previous => Math.abs(previous - position) > 0.04 ? position : previous);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (!track || !autoFollow || manualResult) return;
    let alive = true;
    const abort = new AbortController();
    const identity = ++lyricRequestId.current;
    setLyricsLoading(true); setLyricsError(''); setLyrics(null);
    setOffsetMs(readOffsets()[trackId] || 0);
    const cached = cachedLyrics(activeCacheKey);
    if (cached) { setLyrics(cached); setLyricsLoading(false); return; }
    void findLyrics(track, false, abort.signal).then(result => {
      if (!alive || identity !== lyricRequestId.current) return;
      setLyrics(result.lyrics);
      const errors = {
        'not-found': 'No matching lyrics in LRCLIB. Search alternate releases or import an LRC file.',
        'instrumental': 'The matched version is marked instrumental.',
        'network': 'Could not reach LRCLIB. Check your network and retry.',
        'service-error': 'LRCLIB is currently unavailable.',
        'rate-limited': 'LRCLIB requested a cooldown. Try again later.'
      };
      setLyricsError(result.issue ? errors[result.issue] : '');
      setLyricsLoading(false);
    }).catch(error => {
      if (alive && identity === lyricRequestId.current) {
        setLyricsError(describe(error)); setLyricsLoading(false);
      }
    });
    return () => { alive = false; abort.abort(); lyricRequestId.current++; };
  }, [trackId, autoFollow, manualResult, activeCacheKey]);
  useEffect(() => { setManualResult(false); setSearchOpen(false); }, [trackId]);

  const refreshLyrics = async () => {
    if (!track) return;
    const identity = ++lyricRequestId.current;
    setLyricsLoading(true); setLyricsError('');
    removeCachedLyrics(activeCacheKey);
    try {
      const result = await findLyrics(track, true);
      if (identity !== lyricRequestId.current) return;
      setLyrics(result.lyrics);
      if (!result.lyrics) setLyricsError('No new version found. Try manual search or an imported LRC file.');
      setManualResult(false);
    } catch (error) {
      if (identity === lyricRequestId.current) setLyricsError(describe(error));
    } finally { if (identity === lyricRequestId.current) setLyricsLoading(false); }
  };
  const searchAlternatives = async () => {
    if (!track) return;
    setSearchLoading(true); setCandidates([]); setLyricsError('');
    const identity = ++lyricRequestId.current;
    try {
      const results = await lyricsProviders[0].searchLyrics({
        ...track,
        name: searchText.trim() ? searchText.trim() : track.name
      });
      if (identity === lyricRequestId.current) {
        setCandidates(results);
        if (!results.length) setLyricsError('No alternative releases matched. You can import a personal .lrc file.');
      }
    } catch (error) {
      if (identity === lyricRequestId.current) setLyricsError(describe(error));
    } finally { if (identity === lyricRequestId.current) setSearchLoading(false); }
  };
  const selectCandidate = async (candidate: LyricsCandidate) => {
    if (!track) return;
    const identity = ++lyricRequestId.current;
    setLyricsLoading(true);
    try {
      const result = await lyricsProviders[0].getLyrics(candidate, track);
      if (identity !== lyricRequestId.current) return;
      if (!result) { setLyricsError('This release has no usable lyrics. Try another.'); return; }
      const selection = { ...result, source: 'LRCLIB (manually selected)' };
      setManualResult(true); setLyrics(selection);
      cacheLyrics(activeCacheKey, selection);
      setLyricsError(''); setSearchOpen(false);
    } catch (error) {
      if (identity === lyricRequestId.current) setLyricsError(describe(error));
    } finally { if (identity === lyricRequestId.current) setLyricsLoading(false); }
  };
  const importLrc = async (file: File | undefined) => {
    if (!file || !track) return;
    if (file.size > 2 * 1024 * 1024) { setLyricsError('LRC files must be smaller than 2 MB.'); return; }
    const raw = await file.text();
    const lines = parseLRC(raw, track.duration);
    if (!lines.length) { setLyricsError('No valid [mm:ss.xx] timestamps found in the LRC file.'); return; }
    const imported: LyricsData = {
      id: 'personal-lrc', trackName: track.name, artistName: track.artist,
      albumName: track.album, synced: true,
      hasWordSync: /<\d{2,}:\d{2}(?:\.\d{1,3})?>/.test(raw),
      lines, source: 'Imported LRC'
    };
    lyricRequestId.current++;
    setManualResult(true); setLyrics(imported); setLyricsError('');
    cacheLyrics(activeCacheKey, imported);
  };
  const seekSpotifyLine = useCallback(async (lineTime: number) => {
    if (!playback?.canSeek || !allowControls) return;
    try {
      // A positive lyric offset highlights early; seeking must reverse that
      // offset to land on the actual Spotify playback timestamp.
      const position = Math.max(0, Math.min(playback.duration, lineTime - offsetMs / 1000));
      await spotifyWebControl('seek', position);
      clock.current.reset(position, playback.playing);
      setSeconds(position);
      setConnection('');
    } catch (error) { setConnection(describe(error)); }
  }, [playback?.canSeek, playback?.playing, playback?.duration, allowControls, offsetMs]);
  const togglePlayback = async () => {
    if (!allowControls || !playback) return;
    try { await spotifyWebControl(playback.playing ? 'pause' : 'resume'); setConnection(''); }
    catch (error) { setConnection(describe(error)); }
  };
  const updateOffset = (value: number) => {
    if (!trackId) return;
    const number = Math.max(-15000, Math.min(15000, value));
    setOffsetMs(number); saveOffset(trackId, number);
  };
  const resetAutomatic = () => {
    if (activeCacheKey) removeCachedLyrics(activeCacheKey);
    setLyricsError(''); setManualResult(false); setLyrics(null); setSearchOpen(false);
    if (!autoFollow) setAutoFollow(true);
  };
  const theme = useMemo(() => artwork ? {
    backgroundImage: 'linear-gradient(180deg, rgba(9,13,21,.84), rgba(7,8,13,.98)), url("' +
      artwork.replace(/["\\]/g, '') + '")',
    backgroundSize: 'cover', backgroundPosition: 'center'
  } : {}, [artwork]);

  return <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#090b10] text-white"
    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", ...theme }}>
    <header className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-300"><Music2 size={20} /></div>
        <div><strong className="text-lg tracking-tight">Lyric<span className="text-emerald-400"> ✦</span></strong>
          <p className="text-[11px] text-white/50">Spotify companion · browser mode</p></div>
      </div>
      <div className="flex items-center gap-2">
        <button className={BUTTON} onClick={goBack}><ArrowLeft className="inline h-4 w-4 mr-1" /> Original player</button>
        <button className={BUTTON} onClick={() => setLibraryOpen(true)} aria-label="Open music library">
          <Library className="inline h-4 w-4 mr-1" /> Library
        </button>
        {phase === 'connected' && <button className={BUTTON} onClick={() => setSettings(value => !value)}
          aria-label="Lyrics settings"><Settings2 className="inline h-4 w-4" /></button>}
        {phase === 'connected' && <button className={BUTTON} onClick={disconnect}>
          <LogOut className="inline h-4 w-4 mr-1" /> Disconnect
        </button>}
      </div>
    </header>
    {phase !== 'connected' ? <main className="flex flex-1 items-center justify-center p-4">
      <section className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#131923]/95 p-6 shadow-2xl sm:p-9">
        <h1 className="mb-2 text-2xl font-bold">Connect your Spotify playback</h1>
        <p className="mb-6 text-sm leading-relaxed text-white/60">
          This companion follows what is playing in your official Spotify app. It does not stream or download music.
        </p>
        {authError && <p role="alert" className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          <AlertCircle className="inline h-4 w-4 mr-1" /> {authError}</p>}
        {phase === 'checking' ? <p className="animate-pulse text-sm text-white/60">Checking saved Spotify authorization…</p> :
          <div className="space-y-4">
            <label className="block text-sm">Spotify public Client ID
              <input aria-label="Spotify public Client ID" className={TEXT} value={clientId}
                maxLength={32} autoCapitalize="none" autoComplete="off" spellCheck={false}
                placeholder="32 hexadecimal characters"
                onChange={event => setClientId(event.target.value.trim())} />
            </label>
            <label className="flex items-start gap-2 text-xs text-white/60">
              <input aria-label="Allow Spotify playback controls" type="checkbox" checked={allowControls} onChange={e => setAllowControls(e.target.checked)} />
              Optional: allow lyric-line seeking and pause/resume controls (requests Spotify's extra playback-control permission).
            </label>
            <label className="flex items-start gap-2 text-xs text-white/60">
              <input aria-label="Remember Spotify sign-in" type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Remember my connection on this browser (stores a refresh token in browser storage, which is less secure than a backend).
            </label>
            <div className="rounded-xl bg-black/25 p-3 text-xs text-white/70">
              Register this EXACT redirect URI in your Spotify Developer Dashboard:
              <code className="mt-2 block break-all text-emerald-300 select-all">{webSpotifyRedirectUri()}</code>
              <p className="mt-2 text-white/40">Do not use the Android deep-link URI for browser sign-in.</p>
            </div>
            <button className="w-full rounded-xl bg-[#1ed760] p-3 font-semibold text-[#06110a] disabled:opacity-40"
              disabled={!/^[a-f0-9]{32}$/i.test(clientId)}
              onClick={() => void beginSpotifyBrowserLogin(clientId, remember, allowControls).catch(error => setAuthError(describe(error)))}>
              Connect with Spotify
            </button>
            {hasRememberedSpotifySession() && <button className={BUTTON + ' w-full'} onClick={() => void reconnect()}>
              Retry saved session</button>}
          </div>}
      </section>
    </main> : <>
      <section className="z-10 flex shrink-0 items-center gap-4 border-b border-white/10 px-5 py-3 sm:px-10">
        {playback?.artwork && <img src={playback.artwork} alt="Album cover" className="h-14 w-14 rounded-xl object-cover shadow-xl" />}
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-base">{playback?.title || 'No active song'}</strong>
          <span className="block truncate text-xs text-white/55">
            {playback ? playback.artist + ' · ' + playback.album + ' · ' + playback.deviceName : connection}
          </span>
        </div>
        <div className="hidden sm:block text-right text-xs text-white/55">
          <div>{playback?.playing ? 'Playing' : playback ? 'Paused' : 'Waiting'}</div>
          <div>{formatTime(seconds)} / {formatTime(playback?.duration || 0)}</div>
        </div>
        {libraryTrack && <SpotifyFavorite song={libraryTrack} />}
        {allowControls && playback && <button className={BUTTON} onClick={() => void togglePlayback()} aria-label={playback.playing ? 'Pause Spotify' : 'Resume Spotify'}>{playback.playing ? 'Pause' : 'Play'}</button>}
        {spotifyUrl && <a href={spotifyUrl} target="_blank" rel="noopener noreferrer" title="Open song in Spotify"
          className={BUTTON}><ExternalLink size={15} /></a>}
      </section>
      {settings && <section className="z-10 flex shrink-0 flex-wrap items-center gap-5 border-b border-white/10 bg-black/50 px-5 py-3 text-sm">
        <label>Lyrics size <input aria-label="Lyrics size" type="range" min="18" max="42" step="2"
          value={fontSize} onChange={e => { const value = Number(e.target.value); setFontSize(value);
            try { localStorage.setItem(FONT_STORE, String(value)); } catch { /* optional */ }
          }}/></label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={autoFollow} onChange={e => setAutoFollow(e.target.checked)} />
          Auto-find lyrics for new songs
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showPlain} onChange={e => setShowPlain(e.target.checked)} />
          Allow plain lyrics fallback
        </label>
      </section>}
      <section className="relative z-10 flex min-h-0 flex-1 flex-col">
        {lyricsLoading && <div role="status" className="p-3 text-center text-xs text-emerald-200/80 animate-pulse">
          Finding matched lyrics…
        </div>}
        {lyricsError && <p role="status" className="p-3 text-center text-xs text-amber-200">{lyricsError}</p>}
        {lyrics && (showPlain || lyrics.synced) ?
          <SpotifyLyricsPanel lyrics={lyrics} time={seconds} offsetMs={offsetMs} fontSize={fontSize} onSeek={playback?.canSeek && allowControls ? seekSpotifyLine : undefined} /> :
          <div className="flex flex-1 items-center justify-center px-6 text-center text-white/45">
            {playback ? 'No synchronized lyrics found for this recording.' : 'Start playback in Spotify and return here.'}
          </div>}
      </section>
      <footer className="z-10 shrink-0 border-t border-white/10 bg-black/40 px-3 py-3 sm:px-10">
        {playback && <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/45">
          <span>{formatTime(seconds)} / {formatTime(playback.duration)} {playback.playing ? '· following Spotify' : '· paused'}</span>
          <span>{lyrics?.source || 'Lyrics unavailable'}{manualResult ? ' · saved selection' : ''}</span>
        </div>}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button className={BUTTON} disabled={!track || lyricsLoading} onClick={() => void refreshLyrics()}>
            <RefreshCw className="inline h-3.5 w-3.5 mr-1" /> Refresh lyrics
          </button>
          <button className={BUTTON} disabled={!track} onClick={() => { setSearchOpen(v => !v); setSearchText(''); }}>
            <Search className="inline h-3.5 w-3.5 mr-1" /> Search versions
          </button>
          <button className={BUTTON} disabled={!track} onClick={() => lrcInput.current?.click()}>
            <Download className="inline h-3.5 w-3.5 mr-1" /> Import LRC
          </button>
          <button className={BUTTON} disabled={!track} onClick={() => updateOffset(offsetMs - 100)}>−100 ms</button>
          <span className="text-xs tabular-nums text-white/60">{offsetMs >= 0 ? '+' : ''}{offsetMs} ms</span>
          <button className={BUTTON} disabled={!track} onClick={() => updateOffset(offsetMs + 100)}>+100 ms</button>
          {manualResult && <button className={BUTTON} onClick={resetAutomatic}>Reset automatic</button>}
          <input ref={lrcInput} type="file" accept=".lrc,text/plain" className="hidden"
            aria-label="LRC file" onChange={event => { void importLrc(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        {searchOpen && <div className="mx-auto mt-3 max-h-[28dvh] max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#181e27] p-3">
          <form onSubmit={e => { e.preventDefault(); void searchAlternatives(); }} className="flex gap-2">
            <input className={TEXT} value={searchText} onChange={e => setSearchText(e.target.value)}
              aria-label="Search lyrics by title and artist" placeholder={track?.name + ' · ' + track?.artist} />
            <button className={BUTTON} disabled={searchLoading}>{searchLoading ? 'Searching…' : 'Search'}</button>
          </form>
          {candidates.map(candidate => <button key={candidate.id} className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10"
            onClick={() => void selectCandidate(candidate)}>
            <span className="truncate"><strong>{candidate.trackName}</strong> · {candidate.artistName} · {candidate.duration}s
              <small className="ml-2 text-white/40">{candidate.formats.join(' / ')}</small></span>
            <span className="shrink-0 text-xs text-emerald-300">{Math.round(candidate.confidence * 100)}% <Check className="inline h-3 w-3" /></span>
          </button>)}
        </div>}
      </footer>
    </>}
    <MusicLibraryDrawer open={libraryOpen} onClose={() => setLibraryOpen(false)}
      playing={libraryTrack} allowPlayback={false}
      onPlayTrack={() => setConnection('Switch to the original Lyric player to play saved previews.')} />
  </div>;
}
