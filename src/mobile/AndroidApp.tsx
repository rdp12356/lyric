import React, { useEffect, useRef, useState } from 'react';
import { Headphones, Upload, Search, Settings2, X, Play, Pause, SkipBack, SkipForward, Sun, MessageSquare, Smartphone, Music2 } from 'lucide-react';
import { AmbientRimLights } from '../components/AmbientRimLights';
import { BlurredCoverBackground } from '../components/BlurredCoverBackground';
import { SyncedLyricsView } from '../components/SyncedLyricsView';
import { TrackSearchModal } from '../components/TrackSearchModal';
import { AndroidMedia, isAndroid } from '../services/androidMedia';
import { createTrackFromFile, DEMO_TRACKS, visualizerEngine } from '../services/audioManager';
import { extractPaletteFromImage, PRESET_PALETTES } from '../services/colorExtractor';
import { fetchLyricsFromLRCLIB } from '../services/lrclib';
import { parseLRC } from '../services/lrcParser';
import type { Track, LyricsData, RimLightConfig } from '../types';
import './mobile.css';

const time = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${Math.floor(Math.max(0, s) % 60).toString().padStart(2, '0')}`;

export default function AndroidApp() {
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'device' | 'local'>(isAndroid ? 'device' : 'local');
  const [permission, setPermission] = useState(false);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [wordStyle, setWordStyle] = useState(false);
  const [palette, setPalette] = useState(PRESET_PALETTES.indigo);
  const [rim, setRim] = useState<RimLightConfig>({ enabled: true, mode: 'pulse', thickness: 12, blur: 35, intensity: 0.8, beatReactivity: 0.6, palettePreset: 'album-art' });
  const [energy, setEnergy] = useState({ bass: 0, mid: 0, treble: 0, overall: 0 });
  const audio = useRef<HTMLAudioElement | null>(null);
  const sample = useRef({ position: 0, at: performance.now(), playing: false });
  const fileInput = useRef<HTMLInputElement>(null);
  const lrcInput = useRef<HTMLInputElement>(null);
  const trackRef = useRef(track);
  trackRef.current = track;
  const importedLyrics = useRef(false);
  const localUrl = useRef<string | null>(null);

  const sync = (pos: number, active: boolean) => {
    sample.current = { position: pos, at: performance.now(), playing: active };
    setPlaying(active);
    setPosition(pos);
  };

  useEffect(() => {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    audio.current = el;
    const update = () => sync(el.currentTime, !el.paused && !el.ended);
    el.addEventListener('timeupdate', update);
    el.addEventListener('play', update);
    el.addEventListener('pause', update);
    el.addEventListener('ended', update);
    el.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    });
    el.addEventListener('error', () => {
      sync(el.currentTime, false);
      setError('This audio could not be opened. Try another file or preview.');
    });
    visualizerEngine.init(el);
    return () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 33) {
        const s = sample.current;
        const pos = s.position + (s.playing ? (now - s.at) / 1000 : 0);
        setPosition(duration > 0 ? Math.min(duration, pos) : pos);
        setEnergy(visualizerEngine.getAudioEnergy(pos, s.playing));
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration]);

  useEffect(() => {
    if (!isAndroid || source !== 'device') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    audio.current?.pause();
    const poll = async () => {
      try {
        const state = await AndroidMedia.getPlayback();
        if (cancelled) return;
        setPermission(state.permissionGranted);
        if (state.active && state.title) {
          const id = `${state.packageName}:${state.title}:${state.artist}`;
          const previous = trackRef.current;
          if (previous?.id !== id) {
            importedLyrics.current = false;
            setLyrics(null);
            setError('');
            setTrack({ id, title: state.title, artist: state.artist || '', album: state.album || '',
              albumArt: state.artwork || '', duration: state.duration || 0, position: state.position || 0,
              source: 'android-media', isPlaying: !!state.playing, badge: state.packageName });
          } else if (state.artwork && previous.albumArt !== state.artwork) {
            setTrack({ ...previous, albumArt: state.artwork });
          }
          setDuration(state.duration || 0);
          sync(state.position || 0, !!state.playing);
        } else {
          setTrack(null);
          setLyrics(null);
          sync(0, false);
        }
      } catch {
        if (!cancelled) setError('Could not read the music player. Check notification access in Sources.');
      } finally {
        if (!cancelled) timer = setTimeout(poll, 700);
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    if (track.albumArt) void extractPaletteFromImage(track.albumArt).then(p => { if (!cancelled) setPalette(p); });
    if (importedLyrics.current) return;
    setLoading(true);
    setLyrics(null);
    void fetchLyricsFromLRCLIB(track.title, track.artist, track.album, duration).then(data => {
      if (!cancelled && !importedLyrics.current) { setLyrics(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [track?.id, track?.title, track?.artist, duration]);

  useEffect(() => () => { if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);

  const selectTrack = async (next: Track) => {
    setSource('local');
    setError('');
    importedLyrics.current = false;
    setLyrics(null);
    setTrack(next);
    setDuration(0);
    sync(0, false);
    if (localUrl.current && localUrl.current !== next.audioUrl) URL.revokeObjectURL(localUrl.current);
    localUrl.current = next.audioUrl?.startsWith('blob:') ? next.audioUrl : null;
    const el = audio.current;
    if (!el || !next.audioUrl) { setError('No audio preview is available for this song. Open a local audio file instead.'); return; }
    el.src = next.audioUrl;
    el.load();
    visualizerEngine.resume();
    try { await el.play(); } catch { setError('Tap Play to start this track.'); }
  };

  const control = async (action: 'play-pause' | 'next' | 'previous') => {
    setError('');
    if (source === 'device' && isAndroid) {
      try { await AndroidMedia.control({ action }); } catch { setError('The music player did not accept this control. Open it and try again.'); }
      return;
    }
    const el = audio.current;
    if (!el || !track) return;
    if (action === 'play-pause') {
      visualizerEngine.resume();
      if (!el.paused) el.pause();
      else { try { await el.play(); } catch { sync(el.currentTime, false); setError('Playback failed. Open another audio file.'); } }
    } else if (action === 'previous') {
      el.currentTime = 0;
      sync(0, !el.paused);
    } else {
      const index = DEMO_TRACKS.findIndex(t => t.id === track.id);
      await selectTrack(DEMO_TRACKS[(index + 1) % DEMO_TRACKS.length]);
    }
  };

  const seek = async (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration, seconds));
    if (source === 'device' && isAndroid) {
      try { await AndroidMedia.control({ action: 'seek', position: clamped }); } catch { setError('Seeking is unavailable in this player.'); }
    } else if (audio.current && duration > 0) {
      audio.current.currentTime = clamped;
      sync(clamped, !audio.current.paused);
    }
  };

  const loadLrc = async (file: File) => {
    try {
      const lines = parseLRC(await file.text(), duration || track?.duration || 180);
      if (!lines.length) throw new Error('No timestamps');
      importedLyrics.current = true;
      setLoading(false);
      setLyrics({ trackName: track?.title || file.name, artistName: track?.artist || '', synced: true, lines, source: 'Imported LRC' });
      setSettings(false);
      setError('');
    } catch { setError('Could not read this LRC file. Use lyrics with [mm:ss.xx] timestamps.'); }
  };

  const switchSource = (next: 'device' | 'local') => {
    audio.current?.pause();
    setSource(next);
    setTrack(null);
    setLyrics(null);
    setError('');
    sync(0, false);
  };

  return <div className="mobile-app">
    {track?.albumArt && <BlurredCoverBackground coverUrl={track.albumArt} />}
    <AmbientRimLights config={rim} palette={palette} audioEnergy={energy} isPlaying={playing} />
    <header className="mobile-header">
      <div><span className="mobile-brand">lyric<span>✦</span></span><span className="mobile-source">{source === 'device' ? 'Listening to your player' : 'Your music, in motion'}</span></div>
      <div className="mobile-actions">
        <button aria-label="Toggle ambient lighting" aria-pressed={rim.enabled} onClick={() => setRim(r => ({ ...r, enabled: !r.enabled }))}><Sun size={21} opacity={rim.enabled ? 1 : 0.4} /></button>
        <button aria-label="Sources and settings" onClick={() => setSettings(true)}><Settings2 size={21} /></button>
      </div>
    </header>
    <main className="mobile-stage">
      {!track ? <div className="mobile-welcome">
        <div className="mobile-welcome-icon"><Headphones size={34} strokeWidth={1.5} /></div>
        <h1>Your music.<br /><span>Every word.</span></h1>
        <p>{source === 'device' ? permission ? 'Play a song in Spotify or another music app, then come back here.' : 'Connect your music player to bring lyrics and ambient light to every song.' : 'Open an audio file and let the lyrics take the stage.'}</p>
        {source === 'device' && !permission ? <button className="mobile-primary" onClick={() => setSettings(true)}><Smartphone size={18} /> Connect music player</button> : null}
        <button className={source === 'local' ? 'mobile-primary' : 'mobile-secondary'} onClick={() => fileInput.current?.click()}><Upload size={18} /> Open audio file</button>
        <button className="mobile-text-button" onClick={() => void selectTrack(DEMO_TRACKS[0])}>Try a song preview</button>
      </div> : loading ? <div className="mobile-welcome"><Music2 className="animate-pulse" size={32} /><p>Finding the words…</p></div> : <SyncedLyricsView lyrics={lyrics} currentTime={position + offset / 1000} duration={duration} palette={palette} style={wordStyle ? 'verci-single-word' : 'smooth-captions'} onSeek={s => void seek(s)} onSearchOpen={() => setSearch(true)} />}
    </main>
    {error && <div className="mobile-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={18} /></button></div>}
    {track && <section className="mobile-player glass-panel" aria-label="Music player">
      <div className="mobile-track"><div className="mobile-art">{track.albumArt ? <img src={track.albumArt} alt="" /> : <Music2 size={24} />}</div><div className="mobile-track-text"><strong>{track.title}</strong><span>{track.artist || 'Local audio'}</span></div><button aria-label="Search song previews" onClick={() => setSearch(true)}><Search size={22} /></button></div>
      <div className="mobile-progress"><input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 0)} disabled={!duration} onChange={e => void seek(Number(e.target.value))} /><div><span>{time(position)}</span><span>{time(duration)}</span></div></div>
      <div className="mobile-transport"><button aria-label="Open audio file" onClick={() => fileInput.current?.click()}><Upload size={20} /></button><button aria-label="Previous track" onClick={() => void control('previous')}><SkipBack size={24} fill="currentColor" /></button><button className="mobile-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => void control('play-pause')}>{playing ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button><button aria-label="Next track" onClick={() => void control('next')}><SkipForward size={24} fill="currentColor" /></button><button aria-label="Toggle lyric style" aria-pressed={wordStyle} onClick={() => setWordStyle(v => !v)}><MessageSquare size={20} /></button></div>
      <div className="mobile-sync"><span>{lyrics?.source || (loading ? 'Finding lyrics' : 'Lyrics unavailable')}</span><div><button aria-label="Delay lyrics 50 milliseconds" onClick={() => setOffset(v => Math.max(-5000, v - 50))}>−</button><span>Sync {offset > 0 ? '+' : ''}{offset}ms</span><button aria-label="Advance lyrics 50 milliseconds" onClick={() => setOffset(v => Math.min(5000, v + 50))}>+</button></div></div>
    </section>}
    <input aria-label="Audio file" ref={fileInput} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void selectTrack(createTrackFromFile(f)); e.target.value = ''; }} />
    <input aria-label="LRC lyrics file" ref={lrcInput} type="file" accept=".lrc,text/plain" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void loadLrc(f); e.target.value = ''; }} />
    <TrackSearchModal isOpen={search} previewsOnly onClose={() => setSearch(false)} onSelectTrack={t => void selectTrack(t)} />
    {settings && <div className="mobile-scrim" onClick={() => setSettings(false)}><section role="dialog" aria-modal="true" aria-labelledby="sources-title" className="mobile-sheet glass-panel" onClick={e => e.stopPropagation()}>
      <div className="mobile-sheet-heading"><h2 id="sources-title">Sources & settings</h2><button aria-label="Close settings" onClick={() => setSettings(false)}><X size={22} /></button></div>
      {isAndroid && <div className="mobile-source-option"><Smartphone size={23} /><div><strong>Music player</strong><p>Read song details and control active media sessions. Notification access is optional; other notification content is not read.</p><button className="mobile-secondary" onClick={async () => { try { await AndroidMedia.openSettings(); switchSource('device'); setSettings(false); } catch { setError('Could not open Android settings. Enable Lyric in Notification access.'); } }}>Enable notification access</button>{source !== 'device' && <button className="mobile-text-button" onClick={() => { switchSource('device'); setSettings(false); }}>Listen to music player</button>}</div></div>}
      <div className="mobile-source-option"><Upload size={23} /><div><strong>Local audio</strong><p>Choose a song from your phone. Use “Artist - Title” filenames for better lyric matches. Playback stays inside Lyric.</p><button className="mobile-secondary" onClick={() => { setSettings(false); fileInput.current?.click(); }}>Choose audio file</button></div></div>
      {track && <div className="mobile-source-option"><MessageSquare size={23} /><div><strong>Your lyrics</strong><p>Import an LRC file for offline lyrics or a different version of this song.</p><button className="mobile-secondary" onClick={() => lrcInput.current?.click()}>Import LRC lyrics</button>{source === 'local' && <><label>Song title<input value={track.title} onChange={e => setTrack({ ...track, title: e.target.value })} /></label><label>Artist<input value={track.artist} onChange={e => setTrack({ ...track, artist: e.target.value })} /></label></>}</div></div>}
      <p className="mobile-note">Catalog search plays short previews. For full songs, use a music player or a local file. Word timing is estimated from lyric line timestamps. Ambient lighting stays inside this app.</p>
    </section></div>}
  </div>;
}
