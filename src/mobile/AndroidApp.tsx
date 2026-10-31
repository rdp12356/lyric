import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Upload, Search, Settings2, X, Play, Pause, SkipBack, SkipForward, Sun, MessageSquare, Smartphone, Music2, ListMusic, Mic, Maximize2, Minimize2, Radio } from 'lucide-react';
import { AmbientRimLights } from '../components/AmbientRimLights';
import { BlurredCoverBackground } from '../components/BlurredCoverBackground';
import { SyncedLyricsView } from '../components/SyncedLyricsView';
import { TrackSearchModal } from '../components/TrackSearchModal';
import { AndroidMedia, isAndroid, type AndroidPlayback } from '../services/androidMedia';
import { Spotify } from '../services/spotify';
import { AudioInput, WebMicrophone } from '../services/audioInput';
import { createTrackFromFile, DEMO_TRACKS, visualizerEngine } from '../services/audioManager';
import { extractPaletteFromImage, PRESET_PALETTES } from '../services/colorExtractor';
import { lookupLyricsFromLRCLIB, type LyricsLookupIssue } from '../services/lrclib';
import { cacheLyrics, cachedLyrics, lyricsKey } from '../services/lyricsCache';
import { parseLRC } from '../services/lrcParser';
import { BeatEnvelope, SILENCE, AudioEnergy } from '../services/beatEnvelope';
import { SyncClock } from '../services/syncClock';
import { readPreferences, writePreferences, songKey } from './preferences';
import { Sheet } from './Sheet';
import type { Track, LyricsData, LyricStyle, RimMode, PalettePreset } from '../types';
import './mobile.css';

const time = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${Math.floor(Math.max(0, s) % 60).toString().padStart(2, '0')}`;
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
type Source = 'device' | 'spotify' | 'local' | 'manual';
const styles: LyricStyle[] = ['smooth-captions', 'verci-single-word', 'cinematic'];

export default function AndroidApp() {
  const [prefs, setPrefs] = useState(readPreferences);
  const [track, setTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lyricsIssue, setLyricsIssue] = useState('');
  const [lyricsRetryToken, setLyricsRetryToken] = useState(0);
  const [source, setSource] = useState<Source>('local');
  const [supportsMusicSync, setSupportsMusicSync] = useState(false);
  const [permission, setPermission] = useState(false);
  const [settings, setSettings] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [calibration, setCalibration] = useState(false);
  const [search, setSearch] = useState(false);
  const [searchForLyrics, setSearchForLyrics] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [palette, setPalette] = useState(PRESET_PALETTES.indigo);
  const [energy, setEnergy] = useState<AudioEnergy>(SILENCE);
  const [micActive, setMicActive] = useState(false);
  const [focus, setFocus] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyAutoReconnect, setSpotifyAutoReconnect] = useState(false);
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const [clientId, setClientId] = useState('');
  const [spotifyIdentity, setSpotifyIdentity] = useState({ packageName: 'io.github.rdp12356.lyric', fingerprint: '' });
  const [connecting, setConnecting] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState('browser');
  useEffect(() => {
    if (!connecting || !isAndroid) return;
    const timer=setInterval(() => { void Spotify.getStatus().then(value => { if(value.phase)setConnectionPhase(value.phase); }).catch(() => {}); },1000);
    return () => clearInterval(timer);
  }, [connecting]);
  const [canSeek, setCanSeek] = useState(true);
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [latency, setLatency] = useState(0);
  const [players, setPlayers] = useState<{packageName: string; label: string; playing: boolean}[]>([]);
  const [repeat, setRepeat] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clock = useRef(new SyncClock());
  const envelope = useRef(new BeatEnvelope());
  const microphone = useRef(new WebMicrophone());
  const micEnergy = useRef<AudioEnergy>(SILENCE);
  const sourceRef = useRef(source); sourceRef.current = source;
  const trackRef = useRef(track); trackRef.current = track;
  const playingRef = useRef(playing); playingRef.current = playing;
  const queueRef = useRef(queue); queueRef.current = queue;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const ended = useRef<() => void>(() => {});
  const urls = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const lrcInput = useRef<HTMLInputElement>(null);
  const importedLyrics = useRef(false);
  const eventRevision = useRef(0);
  const rim = prefs.rim;
  const activePalette = rim.palettePreset === 'album-art' ? palette : PRESET_PALETTES[rim.palettePreset] || palette;

  useEffect(() => { writePreferences(prefs); }, [prefs]);
  useEffect(() => {
    if (isAndroid) void AudioInput.setKeepAwake({ enabled: playing || micActive || focus }).catch(() => {});
  }, [playing, micActive, focus]);
  useEffect(() => {
    if (!isAndroid) return;
    let cancelled = false;
    void AndroidMedia.getCapabilities().then(value => {
      if (cancelled) return;
      setSupportsMusicSync(value.musicPlayerSync);
      // Keep Local as the default; connections are always a deliberate choice.
    }).catch(() => {});
    void Spotify.getStatus().then(value => {
      if (cancelled) return;
      setSpotifyConnected(value.connected);
      setSpotifyAutoReconnect(!!value.autoReconnect);
      setClientId(value.clientId);
      setSpotifyIdentity({ packageName: value.packageName || 'io.github.rdp12356.lyric', fingerprint: value.fingerprint || '' });
      if (value.connected || value.autoReconnect) {
        sourceRef.current = 'spotify'; setSource('spotify');
        if (value.autoReconnect && !value.connected) {
          setAutoReconnecting(true);
          void Spotify.reconnect().catch(problem => {
            if (!cancelled) { setAutoReconnecting(false); setError(message(problem, 'Spotify could not reconnect automatically.')); }
          });
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Reconcile the native Spotify SDK after activity recreation and foreground changes.
  useEffect(() => {
    if (!isAndroid || source !== 'spotify') return;
    let cancelled = false;
    let retryTicks = 0;
    const refresh = async () => {
      if (cancelled || document.hidden) return;
      try {
        const status = await Spotify.getStatus();
        if (cancelled) return;
        setSpotifyConnected(status.connected);
        setSpotifyAutoReconnect(!!status.autoReconnect);
        if (status.connected) {
          setAutoReconnecting(false); retryTicks = 0;
        } else if (autoReconnecting) {
          retryTicks++;
          if (retryTicks >= 24) {
            setAutoReconnecting(false);
            setError('Spotify did not reconnect. Open the official Spotify app, then tap Reconnect Spotify.');
          }
        }
      } catch { /* The status check is advisory; never interrupt local playback. */ }
    };
    const timer = setInterval(() => { void refresh(); }, 1250);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    void refresh();
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [source, autoReconnecting]);
  const sync = (pos: number, active: boolean, speed = 1, transport = 0, reset = false) => {
    if (reset) clock.current.reset(pos, active, speed); else clock.current.update(pos, active, speed, transport);
    setPlaying(active); setPosition(pos);
  };
  useEffect(() => {
    const el = new Audio(); el.crossOrigin = 'anonymous'; audio.current = el;
    const update = () => { if (sourceRef.current === 'local') sync(el.currentTime, !el.paused && !el.ended); };
    const metadata = () => { if (sourceRef.current === 'local' && Number.isFinite(el.duration)) setDuration(el.duration); };
    const onEnded = () => { update(); ended.current(); };
    const onError = () => { if (sourceRef.current === 'local') { sync(el.currentTime, false); setError('This audio could not be opened. Try another file or preview.'); } };
    for (const type of ['timeupdate', 'play', 'pause']) el.addEventListener(type, update);
    el.addEventListener('loadedmetadata', metadata); el.addEventListener('ended', onEnded); el.addEventListener('error', onError);
    visualizerEngine.init(el);
    return () => {
      for (const type of ['timeupdate', 'play', 'pause']) el.removeEventListener(type, update);
      el.removeEventListener('loadedmetadata', metadata); el.removeEventListener('ended', onEnded); el.removeEventListener('error', onError);
      el.pause(); el.removeAttribute('src'); el.load(); audio.current = null;
    };
  }, []);
  useEffect(() => {
    let frame = 0, lastPosition = 0, lastEnergy = 0;
    const tick = (now: number) => {
      if (now - lastPosition >= 33) {
        const local = sourceRef.current === 'local';
        const pos = local ? audio.current?.currentTime || 0 : clock.current.now();
        const bounded = duration > 0 ? Math.min(duration, pos) : pos;
        setPosition(prev => Math.abs(prev - bounded) >= 0.025 ? bounded : prev);
        lastPosition = now;
      }
      if (now - lastEnergy >= 60) {
        const local = sourceRef.current === 'local';
        const input = micActive ? (isAndroid ? micEnergy.current : microphone.current.energy()) : local && playingRef.current ? visualizerEngine.getMeasuredEnergy() : SILENCE;
        setEnergy(envelope.current.update(input, now, prefsRef.current.sensitivity));
        lastEnergy = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, micActive]);
  const applyPlayback = useCallback((state: AndroidPlayback, player: 'spotify' | 'device', transportMs: number) => {
    if (sourceRef.current !== player) return;
    setPermission(state.permissionGranted);
    if (state.players) setPlayers(state.players);
    if (state.active && state.title) {
      const trackId = `${player}:${state.packageName}:${state.trackId || [state.title, state.artist, state.album, Math.round(state.duration || 0)].join('|')}`;
      const changed = trackRef.current?.id !== trackId;
      if (changed) {
        importedLyrics.current = false;
        setError(''); setLyrics(null); setLyricsIssue('');
        const next: Track = {
          id: trackId, title: state.title, artist: state.artist || '',
          album: state.album || '', albumArt: state.artwork || '',
          duration: state.duration || 0, position: state.position || 0,
          source: player === 'spotify' ? 'spotify-web' : 'android-media',
          isPlaying: !!state.playing
        };
        trackRef.current = next;
        setTrack(next);
      } else if (state.artwork && trackRef.current?.albumArt !== state.artwork) {
        trackRef.current = { ...trackRef.current!, albumArt: state.artwork };
        setTrack(trackRef.current);
      }
      setDuration(state.duration || 0);
      setCanSeek(state.canSeek !== false);
      if (changed) clock.current.reset(state.position || 0, !!state.playing, state.speed ?? 1);
      else clock.current.update(state.position || 0, !!state.playing, state.speed ?? 1, transportMs);
      setPlaying(!!state.playing);
      setPosition(clock.current.now());
    } else {
      // Spotify may briefly report an empty track between songs; never retain stale lyrics.
      trackRef.current = null;
      setTrack(null); setLyrics(null); setDuration(0);
      clock.current.reset(0, false); setPlaying(false); setPosition(0);
    }
  }, []);

  // Native Spotify state subscription updates song changes and pause/play immediately.
  // Periodic polling below remains as a safety net for artwork and position drift.
  useEffect(() => {
    if (!isAndroid || source !== 'spotify' || !spotifyConnected) return;
    let cancelled = false;
    let listener: { remove(): Promise<void> } | null = null;
    try {
      void Spotify.addListener('playerState', state => {
        if (cancelled || document.hidden) return;
        eventRevision.current++;
        applyPlayback(state, 'spotify', 0);
      }).then(handle => {
        if (cancelled) void handle.remove();
        else listener = handle;
      }).catch(() => { /* Older APKs still work using the polling fallback. */ });
    } catch { /* Browser-only test environments may not implement native listeners. */ }
    return () => { cancelled = true; if (listener) void listener.remove(); };
  }, [source, spotifyConnected, applyPlayback]);

  useEffect(() => {
    if (source !== 'device' && source !== 'spotify') return;
    if (source === 'spotify' && !spotifyConnected) return;
    let cancelled = false, inFlight = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    audio.current?.pause();
    const poll = async () => {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      const revisionBeforeRequest = eventRevision.current;
      let delay = source === 'spotify' ? 1400 : 650;
      try {
        const started = performance.now();
        const state = source === 'spotify'
          ? await Spotify.getPlayback()
          : await AndroidMedia.getPlayback({ packageName: prefs.preferredPlayer });
        if (cancelled) return;
        // Do not overwrite a newer Spotify push event with an older network/bridge response.
        if (source === 'spotify' && revisionBeforeRequest !== eventRevision.current) return;
        const roundtrip = performance.now() - started;
        setLatency(Math.round(roundtrip));
        if (state.retryAfterMs) {
          delay = Math.max(1500, state.retryAfterMs);
          setError('Spotify has temporarily limited updates. Retrying automatically.');
          return;
        }
        failures = 0;
        applyPlayback(state, source, roundtrip);
      } catch (problem) {
        if (!cancelled) {
          failures++; delay = Math.min(15000, delay * 2 ** Math.min(4, failures));
          if (failures >= 3) {
            setError(message(problem, 'Could not read your player. Check its connection in Sources.'));
            clock.current.reset(clock.current.now(), false); setPlaying(false);
          }
        }
      } finally {
        inFlight = false;
        if (!cancelled && !document.hidden) timer = setTimeout(poll, delay);
      }
    };
    const visible = () => { clearTimeout(timer); if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [source, prefs.preferredPlayer, spotifyConnected, applyPlayback]);
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    if (track.albumArt) void extractPaletteFromImage(track.albumArt).then(value => { if (!cancelled) setPalette(value); });
    const key = songKey(track.title, track.artist, track.album, duration);
    setOffset(prefsRef.current.offsets[key] || 0);
    return () => { cancelled = true; };
  }, [track?.id, track?.albumArt, track?.title, track?.artist, duration]);
  useEffect(() => {
    if (!track || importedLyrics.current) return;
    let cancelled = false;
    setLyricsIssue('');
    const cached = cachedLyrics(lyricsKey(track.title, track.artist, track.album, duration));
    if (cached) { setLyrics(cached); setLoading(false); return; }
    setLoading(true);
    const descriptions: Record<LyricsLookupIssue, string> = {
      'not-found': 'No matching lyrics were found on LRCLIB for this song. Try Search Alternative Releases or import an LRC file.',
      'instrumental': 'LRCLIB marks this recording as instrumental.',
      'network': 'Could not reach LRCLIB. Check your internet connection and switch songs to retry.',
      'rate-limited': 'LRCLIB is temporarily rate-limiting requests. Try again shortly.',
      'service-error': 'LRCLIB is temporarily unavailable. Try again later or import an LRC file.'
    };
    const timer = setTimeout(() => {
      void lookupLyricsFromLRCLIB(track.title, track.artist, track.album, duration)
        .then(result => {
          if (cancelled || importedLyrics.current) return;
          setLyrics(result.lyrics);
          setLyricsIssue(result.issue ? descriptions[result.issue] + (result.issue === 'rate-limited' && result.retryAfterSeconds ? ' Retry after ' + result.retryAfterSeconds + 's.' : '') : '');
          setLoading(false);
        })
        .catch(() => {
          if (cancelled || importedLyrics.current) return;
          setLyrics(null);
          setLyricsIssue('Could not retrieve lyrics. Check your connection and try another song.');
          setLoading(false);
        });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [track?.id, track?.title, track?.artist, duration, lyricsRetryToken]);
  const stopMic = useCallback(() => { if (isAndroid) void AudioInput.stop().catch(() => {}); else microphone.current.stop(); micEnergy.current = SILENCE; setMicActive(false); }, []);
  useEffect(() => {
    if (!micActive || !isAndroid) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try { const data = await AudioInput.getEnergy(); if (!cancelled) { micEnergy.current = data; if (!data.active) { setMicActive(false); return; } } }
      catch { if (!cancelled) { setError('Microphone stopped. You can restart it from Lighting.'); setMicActive(false); return; } }
      if (!cancelled) timer = setTimeout(read, 50);
    };
    void read();
    return () => { cancelled = true; clearTimeout(timer); void AudioInput.stop().catch(() => {}); };
  }, [micActive]);
  useEffect(() => {
    const hidden = () => { if (document.hidden && micActive) stopMic(); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [micActive, stopMic]);
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); microphone.current.stop(); if (isAndroid) void AudioInput.stop().catch(() => {}); }, []);

  const selectTrack = async (next: Track, manual = false) => {
    setSource(manual ? 'manual' : 'local'); sourceRef.current = manual ? 'manual' : 'local';
    audio.current?.pause(); setError(''); importedLyrics.current = false; setLyrics(null); setTrack(next); setCanSeek(true);
    setDuration(manual ? next.duration : 0); sync(0, false, 1, 0, true);
    if (manual) return;
    setQueue(items => items.some(item => item.id === next.id) ? items : [...items, next]);
    const el = audio.current;
    if (!el || !next.audioUrl) { setError('No preview is available. Open a local audio file or use manual lyrics.'); return; }
    el.src = next.audioUrl; el.load(); visualizerEngine.resume();
    try { await el.play(); } catch { setError('Tap Play to start this track.'); }
  };
  // Alternative lyrics must not replace the connected Spotify/Android playback source.
  const selectSearchResult = async (candidate: Track) => {
    if (!searchForLyrics || (source !== 'spotify' && source !== 'device') || !trackRef.current) {
      await selectTrack(candidate, searchForLyrics);
      return;
    }
    const original = trackRef.current;
    setLyricsIssue(''); setLoading(true);
    const result = await lookupLyricsFromLRCLIB(candidate.title, candidate.artist, candidate.album, candidate.duration)
      .catch(() => ({ lyrics: null }));
    if (trackRef.current?.id !== original.id) return;
    if (result.lyrics) {
      importedLyrics.current = true;
      const selected = { ...result.lyrics, source: result.lyrics.source + ' (selected version)' };
      setLyrics(selected);
      cacheLyrics(lyricsKey(original.title, original.artist, original.album, original.duration), selected);
      setLyricsIssue('');
    } else {
      setLyricsIssue('No lyrics found for that version. Try another version or import a synced LRC file.');
    }
    setLoading(false);
  };

  const control = async (action: 'play-pause' | 'next' | 'previous') => {
    setError('');
    if (source === 'spotify' || source === 'device') {
      try { if (source === 'spotify') await Spotify.control({ action }); else await AndroidMedia.control({ action, packageName: prefs.preferredPlayer }); }
      catch (problem) { setError(message(problem, 'This control is unavailable in your music player.')); }
      return;
    }
    if (source === 'manual') {
      if (action === 'play-pause') sync(clock.current.now(), !playing, 1, 0, true);
      else setError('Change the song in your music app, then choose its lyrics in Search.');
      return;
    }
    const el = audio.current; if (!el || !track) return;
    if (action === 'play-pause') {
      visualizerEngine.resume(); if (!el.paused) el.pause();
      else try { await el.play(); } catch { sync(el.currentTime, false); setError('Playback failed. Try another audio file.'); }
    } else {
      const index = queue.findIndex(item => item.id === track.id);
      if (action === 'previous' && el.currentTime > 3) { el.currentTime = 0; return; }
      const next = index + (action === 'next' ? 1 : -1);
      const item = queue[next] || (repeat ? queue[(next + queue.length) % queue.length] : undefined);
      if (item) await selectTrack(item); else if (action === 'previous') el.currentTime = 0;
    }
  };
  ended.current = () => { if (repeat && queueRef.current.length === 1 && trackRef.current) void selectTrack(trackRef.current); else void control('next'); };
  const seek = async (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration, seconds));
    if (!canSeek) return;
    try {
      if (source === 'device') await AndroidMedia.control({ action: 'seek', position: clamped, packageName: prefs.preferredPlayer });
      else if (source === 'spotify') await Spotify.control({ action: 'seek', position: clamped });
      else if (source === 'manual') sync(clamped, playing, 1, 0, true);
      else if (audio.current && duration > 0) { audio.current.currentTime = clamped; sync(clamped, !audio.current.paused, 1, 0, true); }
    } catch (problem) { setError(message(problem, 'Seeking is unavailable.')); }
  };
  const changeOffset = (value: number) => {
    const next = Math.max(-15000, Math.min(15000, Math.round(value / 50) * 50)); setOffset(next);
    if (track) setPrefs(p => ({ ...p, offsets: Object.fromEntries([...Object.entries(p.offsets).filter(([key]) => key !== songKey(track.title, track.artist, track.album, duration)), [songKey(track.title, track.artist, track.album, duration), next]].slice(-50)) }));
  };
  const loadLrc = async (file: File) => {
    try {
      const lines = parseLRC(await file.text(), duration || track?.duration || 180); if (!lines.length) throw new Error('No timestamps');
      const value: LyricsData = { trackName: track?.title || file.name, artistName: track?.artist || '', synced: true, lines, source: 'Imported LRC' };
      importedLyrics.current = true; setLoading(false); setLyrics(value); setSettings(false); setError('');
      if (track) cacheLyrics(lyricsKey(track.title, track.artist, track.album, duration), value);
    } catch { setError('Use an LRC file with [mm:ss.xx] timestamps.'); }
  };
  const switchSource = (next: Source) => {
    audio.current?.pause(); sourceRef.current = next; setSource(next); setTrack(null); setLyrics(null); setError(''); importedLyrics.current = false; sync(0, false, 1, 0, true); setSettings(false);
  };
  const toggleMic = async () => {
    if (micActive) { stopMic(); return; }
    try { if (isAndroid) await AudioInput.start(); else await microphone.current.start(); setMicActive(true); setError(''); }
    catch (problem) { setError(message(problem, 'Microphone unavailable. Allow it in Android settings if you want speaker-reactive lighting.')); }
  };
  const reconnectSpotify = async () => {
    setError(''); setAutoReconnecting(true);
    try {
      const status = await Spotify.reconnect();
      setSpotifyConnected(status.connected);
      setSpotifyAutoReconnect(!!status.autoReconnect);
      if (status.connected) { setAutoReconnecting(false); sourceRef.current = 'spotify'; setSource('spotify'); }
    } catch (problem) {
      setAutoReconnecting(false);
      setError(message(problem, 'Spotify could not reconnect. Open Spotify, play a song, then retry.'));
    }
  };

  const connectSpotify = async () => {
    setConnecting(true); setError('');
    try { const result = await Spotify.connectBrowser({ clientId: clientId.trim() }); setSpotifyConnected(result.connected); setSpotifyAutoReconnect(!!result.autoReconnect); setAutoReconnecting(false); switchSource('spotify'); }
    catch (problem) { const detail = message(problem, 'Spotify connection failed. Check the app registration and Android signing fingerprint.'); if (detail !== 'Spotify connection cancelled') setError(detail); }
    finally { setConnecting(false); }
  };
  useEffect(() => {
    if (!sleepUntil) return;
    const timer = setTimeout(() => {
      if (playingRef.current && sourceRef.current === 'device') void AndroidMedia.control({ action: 'play-pause', packageName: prefsRef.current.preferredPlayer }).catch(() => {});
      else if (playingRef.current && sourceRef.current === 'spotify') void Spotify.control({ action: 'play-pause' }).catch(() => {});
      audio.current?.pause(); sync(clock.current.now(), false); stopMic(); setFocus(false); setSleepUntil(null);
    }, Math.max(0, sleepUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [sleepUntil, stopMic]);
  useEffect(() => {
    const back = (event: Event) => {
      if (settings || queueOpen || calibration || search || focus) { event.preventDefault(); setSettings(false); setQueueOpen(false); setCalibration(false); setSearch(false); setFocus(false); }
    };
    window.addEventListener('lyric-back', back); return () => window.removeEventListener('lyric-back', back);
  }, [settings, queueOpen, calibration, search, focus]);
  const openSearch = (manual = false) => { setSearchForLyrics(manual); setSearch(true); };
  const cycleStyle = () => setPrefs(p => ({...p, style: styles[(styles.indexOf(p.style) + 1) % styles.length]}));
  const closeSettings = useCallback(() => setSettings(false), []);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const closeCalibration = useCallback(() => setCalibration(false), []);
  const audioLabel = micActive ? 'Microphone · live audio' : source === 'local' && playing ? 'Audio FFT · live' : source === 'manual' ? 'Manual timing · not linked' : source === 'spotify' ? 'Spotify SDK · add mic for beats' : source === 'device' ? 'Player clock · add mic for beats' : 'Audio reactive lighting';

  return <div className={`mobile-app ${focus ? 'mobile-focus' : ''}`}>
    {track?.albumArt && <BlurredCoverBackground coverUrl={track.albumArt} />}
    <AmbientRimLights config={rim} palette={activePalette} audioEnergy={energy} isPlaying={playing || micActive} />
    <header className="mobile-header"><div><span className="mobile-brand">lyric<span>✦</span></span><span className="mobile-source">{source === 'spotify' ? (spotifyConnected ? 'Spotify connected' : autoReconnecting ? 'Reconnecting to Spotify…' : 'Spotify disconnected') : source === 'device' ? 'Music player connected' : source === 'manual' ? 'Manual lyrics' : 'Your music, in motion'}</span></div><div className="mobile-actions">
      <button aria-label="Toggle ambient lighting" aria-pressed={rim.enabled} onClick={() => setPrefs(p => ({...p, rim:{...p.rim, enabled:!p.rim.enabled}}))}><Sun size={20} opacity={rim.enabled ? 1 : .4}/></button>
      <button aria-label="Open queue" onClick={() => setQueueOpen(true)}><ListMusic size={20}/></button>
      <button aria-label="Sources and settings" onClick={() => setSettings(true)}><Settings2 size={20}/></button>
    </div></header>
    <main className="mobile-stage">
      {!track ? <div className="mobile-welcome"><div className="mobile-welcome-icon"><Headphones size={34} strokeWidth={1.5}/></div><h1>Your music.<br/><span>Every word.</span></h1>
        <p>{source === 'spotify' ? 'Start a song in Spotify, then return here. Your account’s active playback will appear automatically.' : source === 'device' ? permission ? 'Play a song in your selected music app, then return here.' : 'Enable notification access in Sources to follow your selected player.' : 'Open your songs. Feel every beat. Bring the words to life.'}</p>
        <button className="mobile-primary" onClick={() => fileInput.current?.click()}><Upload size={18}/> Open audio file</button>
        {isAndroid && <button className="mobile-secondary" onClick={() => setSettings(true)}><Radio size={17}/> Connect music</button>}
        <button className="mobile-text-button" onClick={() => { setQueue(DEMO_TRACKS); void selectTrack(DEMO_TRACKS[0]); }}>Try a song preview</button>
        <button className="mobile-text-button" onClick={() => openSearch(true)}>Find lyrics for another player</button>
      </div> : loading && !lyrics ? <div className="mobile-welcome"><Music2 className="animate-pulse" size={32}/><p>Finding the words…</p></div> : <SyncedLyricsView lyrics={lyrics} currentTime={Math.max(0, position + offset / 1000)} duration={duration} palette={activePalette} style={prefs.style} unavailableMessage={lyricsIssue} onRetry={() => { setLyricsIssue(''); setLyricsRetryToken(value => value + 1); }} onSeek={s => void seek(s)} onSearchOpen={() => openSearch(source !== 'local')} />}
    </main>
    {error && <div className="mobile-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={18}/></button></div>}
    {track && !focus && <section className="mobile-player glass-panel" aria-label="Music player">
      <div className="mobile-track"><div className="mobile-art">{track.albumArt ? <img src={track.albumArt} alt=""/> : <Music2 size={24}/>}</div><div className="mobile-track-text"><strong>{track.title}</strong><span>{track.artist || 'Local audio'}</span></div><button aria-label="Search song previews" onClick={() => openSearch(source !== 'local')}><Search size={20}/></button><button aria-label="Focus mode" onClick={() => setFocus(true)}><Maximize2 size={18}/></button></div>
      <div className="mobile-progress"><input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 0)} disabled={!duration || !canSeek} onChange={e => void seek(Number(e.target.value))}/><div><span>{time(position)}</span><span>{time(duration)}</span></div></div>
      <div className="mobile-transport"><button aria-label="Microphone reactive lighting" aria-pressed={micActive} onClick={() => void toggleMic()}><Mic size={20} color={micActive ? '#c4b5fd' : undefined}/></button><button aria-label="Previous track" onClick={() => void control('previous')}><SkipBack size={24} fill="currentColor"/></button><button className="mobile-play" aria-label={playing ? 'Pause' : 'Play'} title={source === 'manual' ? 'Start or pause the manual lyric clock' : undefined} onClick={() => void control('play-pause')}>{playing ? <Pause size={25} fill="currentColor"/> : <Play size={25} fill="currentColor"/>}</button><button aria-label="Next track" onClick={() => void control('next')}><SkipForward size={24} fill="currentColor"/></button><button aria-label="Toggle lyric style" onClick={cycleStyle}><MessageSquare size={20}/></button></div>
      <div className="mobile-sync"><button className="mobile-lyrics-status" aria-label="Open lyric calibration" onClick={() => setCalibration(true)}>{lyrics?.source || 'Lyrics unavailable'}</button><div><button aria-label="Delay lyrics 50 milliseconds" onClick={() => changeOffset(offset - 50)}>−</button><span>Sync {offset > 0 ? '+' : ''}{offset}ms</span><button aria-label="Advance lyrics 50 milliseconds" onClick={() => changeOffset(offset + 50)}>+</button></div></div>
      <div className="mobile-energy" aria-label={audioLabel}><span className="mobile-energy-bars">{[energy.bass, energy.mid, energy.treble].map((value, i) => <i key={i} style={{height:`${3 + value * 12}px`}}/>)}</span><span>{audioLabel}</span>{sleepUntil && <span>Sleep on</span>}</div>
    </section>}
    {focus && <button className="mobile-show-player glass-pill" onClick={() => setFocus(false)}><Minimize2 size={16}/> Show player</button>}
    <input aria-label="Audio file" ref={fileInput} type="file" accept="audio/*" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); const tracks = files.map(createTrackFromFile); tracks.forEach(t => t.audioUrl && urls.current.add(t.audioUrl)); if (tracks.length) { setQueue(items => [...items, ...tracks]); void selectTrack(tracks[0]); } e.target.value = ''; }}/>
    <input aria-label="LRC lyrics file" ref={lrcInput} type="file" accept=".lrc,text/plain" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void loadLrc(f); e.target.value = ''; }}/>
    <TrackSearchModal isOpen={search} previewsOnly lyricsOnly={searchForLyrics} onClose={() => setSearch(false)} onSelectTrack={t => void selectSearchResult(t)}/>
    {queueOpen && <Sheet title="Your queue" onClose={closeQueue}><p className="mobile-note">Add multiple audio files. Files remain available while the app is open.</p><button className="mobile-primary" onClick={() => fileInput.current?.click()}><Upload size={17}/> Add songs</button><label className="mobile-switch">Repeat queue<input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)}/></label>{queue.length ? queue.map((item, index) => <button key={`${item.id}-${index}`} className={`mobile-queue-row ${track?.id === item.id ? 'active' : ''}`} onClick={() => { void selectTrack(item); setQueueOpen(false); }}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{item.title}</strong><small>{item.artist}</small></div>{track?.id === item.id && <Music2 size={18}/>}</button>) : <p className="mobile-note">Your queue is empty. Choose a few songs to start listening.</p>}</Sheet>}
    {calibration && <Sheet title="Lyric calibration" onClose={closeCalibration}><p className="mobile-note">Tap a line exactly when you hear its first word. Calibration is saved for this song. Word timings are estimated unless your LRC contains word timestamps.</p><div className="mobile-calibration"><button onClick={() => changeOffset(offset - 50)}>−50ms</button><strong>{offset > 0 ? '+' : ''}{offset}ms</strong><button onClick={() => changeOffset(offset + 50)}>+50ms</button></div><button className="mobile-secondary" onClick={() => changeOffset(0)}>Reset calibration</button>{source !== 'local' && source !== 'manual' && <p className="mobile-note">Last API round trip: {latency}ms. Updates: {source === 'spotify' ? 'event-driven, with ~1.4s calibration' : 'about every 650ms'}; the lyric clock advances between updates.</p>}<div className="mobile-calibration-lines">{lyrics?.lines.map(line => <button key={line.id} className={position + offset/1000 >= line.time && position + offset/1000 < line.endTime ? 'active' : ''} onClick={() => changeOffset((line.time - position) * 1000)}><span>{time(line.time)}</span>{line.text || 'Instrumental'}</button>)}</div></Sheet>}
    {settings && <Sheet title="Sources & settings" onClose={closeSettings}>
      <>{error && <div className="mobile-error" role="alert"><span>{error}</span><button aria-label="Dismiss connection error" onClick={() => setError('')}><X size={18}/></button></div>}</><section className="mobile-settings-section"><h3>Your music</h3><button className="mobile-secondary" onClick={() => { setSettings(false); fileInput.current?.click(); }}><Upload size={17}/> Choose audio files</button><button className="mobile-secondary" onClick={() => { setSettings(false); openSearch(true); }}>Manual lyrics for another player</button>{source === 'manual' && <p className="mobile-note">Manual mode doesn’t control Spotify. Match the playhead to your music and start the lyric clock.</p>}
      {track && <><button className="mobile-secondary" onClick={() => lrcInput.current?.click()}>Import LRC lyrics</button><button className="mobile-secondary" onClick={() => {setSettings(false);setCalibration(true);}}>Calibrate this song</button>{source === 'local' && <div className="mobile-metadata"><label>Song title<input value={track.title} onChange={e => { importedLyrics.current = false; setTrack({...track,title:e.target.value}); }}/></label><label>Artist<input value={track.artist} onChange={e => { importedLyrics.current = false; setTrack({...track,artist:e.target.value}); }}/></label></div>}</>}
      </section>
      {isAndroid && <section className="mobile-settings-section">
        <h3>Spotify app <span className="mobile-badge">{spotifyConnected ? "Connected" : autoReconnecting ? "Reconnecting…" : "Disconnected"}</span></h3>
        <p className="mobile-note">Link to the official Spotify app with App Remote. Playback permissions and available controls depend on Spotify.</p>
        {spotifyConnected ? <>
          <div className="mobile-button-row">
            <button className="mobile-secondary" onClick={() => switchSource("spotify")}>Follow Spotify</button>
            <button className="mobile-secondary" onClick={() => void Spotify.openApp().catch(e => setError(message(e, "Could not open Spotify")))}>Open Spotify</button>
            <button className="mobile-text-button" onClick={async () => { try { await Spotify.disconnect(); setSpotifyConnected(false); setSpotifyAutoReconnect(false); setAutoReconnecting(false); if (source === "spotify") switchSource("local"); } catch (e) { setError(message(e, "Could not disconnect Spotify")); } }}>Disconnect</button>
          </div>
          <label className="mobile-switch">Reconnect Spotify automatically when reopening Lyric
            <input type="checkbox" checked={spotifyAutoReconnect} onChange={async e => {
              const enabled = e.target.checked;
              try { const value = await Spotify.setAutoReconnect({ enabled }); setSpotifyAutoReconnect(!!value.autoReconnect); }
              catch (problem) { setError(message(problem, "Could not update Spotify reconnect preference.")); }
            }}/>
          </label>
          <p className="mobile-note">This remembers your choice locally and reconnects using Spotify App Remote. No password or token is stored by Lyric; Spotify may still require you to sign in again if authorization expires.</p>
        </> : <>
          {spotifyAutoReconnect && <>
            <p className="mobile-note">Your earlier Spotify connection is remembered. Try reconnecting without repeating browser approval.</p>
            <button className="mobile-secondary" disabled={autoReconnecting} onClick={() => void reconnectSpotify()}>{autoReconnecting ? "Reconnecting to Spotify…" : "Reconnect Spotify"}</button>
          </>}
          <label className="mobile-field">Public Client ID<input value={clientId} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="32-character Spotify Client ID" onChange={e => setClientId(e.target.value)}/></label>
          <button className="mobile-secondary" onClick={() => void Spotify.openApp().catch(e => setError(message(e, "Could not open Spotify")))}>Open Spotify first</button>
          <p className="mobile-note">Use Sign in with Spotify if you have not connected before or if you need to reauthorize the account. The official Spotify app must be installed and signed in.</p>
          <p className="mobile-note">Spotify developer registration for this APK:<code>lyric://spotify-callback</code><code>{spotifyIdentity.packageName}</code><code>{spotifyIdentity.fingerprint || "Fingerprint available in the installed Android app"}</code></p>
          <button className="mobile-secondary" disabled={connecting || autoReconnecting || !/^[a-f0-9]{32}$/i.test(clientId.trim())} onClick={() => void connectSpotify()}>{connecting ? (connectionPhase === "playback" ? "Browser approved · connecting playback…" : "Finish authorization in your browser…") : "Sign in with Spotify"}</button>
          {connecting && <button className="mobile-text-button" onClick={async () => { setConnecting(false); await Spotify.disconnect().catch(() => {}); setSpotifyAutoReconnect(false); }}>Cancel login</button>}
        </>}
      </section>}
      {supportsMusicSync && <section className="mobile-settings-section"><h3>Android music player</h3><p className="mobile-note">Follows media sessions without Spotify API credentials. Requires optional notification access and may be restricted by Android or Play Protect.</p><label className="mobile-field">Preferred player<select value={prefs.preferredPlayer} onChange={e=>setPrefs(p=>({...p,preferredPlayer:e.target.value}))}><option value="">Automatic</option><option value="com.spotify.music">Spotify</option>{players.filter(p=>p.packageName!=='com.spotify.music').map(p=><option key={p.packageName} value={p.packageName}>{p.label}</option>)}</select></label><button className="mobile-secondary" onClick={async()=>{try{await AndroidMedia.openSettings();switchSource('device');}catch(e){setError(message(e,'Could not open notification settings'));}}}>Enable notification access</button><button className="mobile-secondary" onClick={()=>switchSource('device')}>Listen to music player</button></section>}
      <section className="mobile-settings-section"><h3>Lighting</h3><p className="mobile-note">Local files drive the edges from their real audio spectrum. For music playing through speakers, enable the microphone. It won’t hear Spotify audio confined to headphones. The microphone stops when Lyric leaves the foreground; nothing is saved or uploaded.</p><button className="mobile-secondary" onClick={() => void toggleMic()}><Mic size={17}/>{micActive?'Stop microphone':'Use microphone for beats'}</button><label className="mobile-field">Light pattern<select value={rim.mode} onChange={e=>setPrefs(p=>({...p,rim:{...p.rim,mode:e.target.value as RimMode}}))}>{(['pulse','wave','aurora','liquid','static'] as RimMode[]).map(mode=><option key={mode} value={mode}>{mode[0].toUpperCase()+mode.slice(1)}</option>)}</select></label><label className="mobile-field">Color palette<select value={rim.palettePreset} onChange={e=>setPrefs(p=>({...p,rim:{...p.rim,palettePreset:e.target.value as PalettePreset}}))}>{Object.keys(PRESET_PALETTES).map(name=><option key={name} value={name}>{name==='album-art'?'Album colors':name}</option>)}</select></label>
      <label className="mobile-range">Beat sensitivity <span>{prefs.sensitivity.toFixed(1)}×</span><input aria-label="Beat sensitivity" type="range" min="0.5" max="4" step="0.1" value={prefs.sensitivity} onChange={e=>setPrefs(p=>({...p,sensitivity:Number(e.target.value)}))}/></label><label className="mobile-range">Brightness <span>{Math.round(rim.intensity*100)}%</span><input aria-label="Lighting brightness" type="range" min="0.1" max="1" step="0.05" value={rim.intensity} onChange={e=>setPrefs(p=>({...p,rim:{...p.rim,intensity:Number(e.target.value)}}))}/></label><label className="mobile-range">Edge width <span>{rim.thickness}px</span><input aria-label="Edge width" type="range" min="2" max="20" step="1" value={rim.thickness} onChange={e=>setPrefs(p=>({...p,rim:{...p.rim,thickness:Number(e.target.value)}}))}/></label></section>
      <section className="mobile-settings-section"><h3>Playback & lyrics</h3><label className="mobile-field">Lyric style<select value={prefs.style} onChange={e=>setPrefs(p=>({...p,style:e.target.value as LyricStyle}))}><option value="smooth-captions">Smooth captions</option><option value="verci-single-word">Single word</option><option value="cinematic">Scrolling lines</option></select></label><label className="mobile-field">Sleep timer (keep Lyric open)<select aria-label="Sleep timer" value={sleepUntil?'on':'off'} onChange={e=>setSleepUntil(e.target.value==='off'?null:Date.now()+Number(e.target.value)*60000)}><option value="off">Off</option>{sleepUntil&&<option value="on">Timer is running</option>}<option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label><button className="mobile-secondary" onClick={()=>{setSettings(false);setFocus(true);}}>Enter focus mode</button><p className="mobile-note">Recent lyrics and per-song calibration are saved on this device. Audio files are session-only. Search results are short previews. Lighting stays inside Lyric.</p></section>
    </Sheet>}
  </div>;
}
