import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Track,
  LyricsData,
  ColorPalette,
  RimLightConfig,
  LyricStyle,
  LayoutMode
} from './types';
import { DEMO_TRACKS, visualizerEngine, createTrackFromFile } from './services/audioManager';
import { fetchLyricsFromLRCLIB } from './services/lrclib';
import { extractPaletteFromImage, PRESET_PALETTES } from './services/colorExtractor';
import {
  checkBridgeHealth,
  fetchMacOSNowPlaying,
  sendMacOSCommand,
  fetchArtworkForTrack
} from './services/macosBridge';
import { globalClock } from './services/playbackClock';

import { AmbientRimLights } from './components/AmbientRimLights';
import { BlurredCoverBackground } from './components/BlurredCoverBackground';
import { LiquidGlassPlayer } from './components/LiquidGlassPlayer';
import { SyncedLyricsView } from './components/SyncedLyricsView';
import { LockscreenPlayerBar } from './components/LockscreenPlayerBar';
import { ControlsModal } from './components/ControlsModal';
import { TrackSearchModal } from './components/TrackSearchModal';
import { LocalLibraryPanel } from './components/LocalLibraryPanel';
import { libraryStore, useLibrary } from './services/libraryStore';
import { useLiquidGlass } from './hooks/useLiquidGlass';

import {
  Sun,
  Maximize2,
  Minimize2,
  Clock,
  Library
} from 'lucide-react';

export const App: React.FC = () => {
  // Playback & Track State
  const [currentTrack, setCurrentTrack] = useState<Track>(() =>
    libraryStore.getPlayable(libraryStore.getSnapshot().currentId || '') || DEMO_TRACKS[0]
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(DEMO_TRACKS[0].duration);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Audio Visualizer Energy for Dynamic Rim Lights
  const [audioEnergy, setAudioEnergy] = useState({ bass: 0.1, mid: 0.1, treble: 0.1, overall: 0.1 });

  // Palette State
  const [extractedPalette, setExtractedPalette] = useState<ColorPalette>(PRESET_PALETTES['album-art']);

  // Configuration States: Default to Lockscreen Mode with Black Background & Dynamic Slights
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('lockscreen');
  const [lyricStyle, setLyricStyle] = useState<LyricStyle>('verci-single-word');

  const [rimConfig, setRimConfig] = useState<RimLightConfig>({
    enabled: true, // Dynamic Slights ON
    mode: 'pulse',
    thickness: 18,
    blur: 45,
    intensity: 1.1,
    beatReactivity: 0.65,
    palettePreset: 'album-art'
  });

  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const library = useLibrary();
  const previousVolume = useRef(0.8);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMacBridgeOnline, setIsMacBridgeOnline] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef(currentTrack);
  const nextRef = useRef<(automatic?: boolean) => void>(() => {});
  const importedAudioUrls = useRef(new Set<string>());
  currentTrackRef.current = currentTrack;
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const lockscreenBarRef = useRef<HTMLDivElement>(null);
  const playerCardRef = useRef<HTMLDivElement>(null);

  // Attach ybouane/liquidglass WebGL shader to glass HTML elements (darker, translucent glass)
  useLiquidGlass(rootContainerRef, [lockscreenBarRef, playerCardRef], {
    refraction: 0.45,
    chromAberration: 0.035,
    edgeHighlight: 0.1,
    blurAmount: 0.12,
    cornerRadius: 38,
    brightness: -0.22,
    opacity: 0.8,
    floating: false
  });

  // Sync manual offset with globalClock
  useEffect(() => {
    globalClock.setManualOffset(syncOffset);
  }, [syncOffset]);

  const activePalette = rimConfig.palettePreset === 'album-art'
    ? extractedPalette
    : PRESET_PALETTES[rimConfig.palettePreset] || extractedPalette;

  // 1. One stable HTMLAudioElement for this view. Track/artwork updates must not
  // tear down the analyser or abandon audio event handlers.
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    audioRef.current = audio;
    audio.volume = libraryStore.getSnapshot().volume;
    const metadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const timeupdate = () => {
      if (!currentTrackRef.current.source.startsWith('macos-')) {
        globalClock.sync(audio.currentTime, !audio.paused, 0);
        setIsPlaying(!audio.paused && !audio.ended);
      }
    };
    const ended = () => nextRef.current(true);
    const failure = () => {
      setIsPlaying(false);
      setSyncFeedback('Audio unavailable — select another authorized source');
    };
    audio.addEventListener('loadedmetadata', metadata);
    audio.addEventListener('timeupdate', timeupdate);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', failure);
    visualizerEngine.init(audio);
    return () => {
      audio.removeEventListener('loadedmetadata', metadata);
      audio.removeEventListener('timeupdate', timeupdate);
      audio.removeEventListener('ended', ended);
      audio.removeEventListener('error', failure);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
      importedAudioUrls.current.forEach(url => URL.revokeObjectURL(url));
      importedAudioUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = library.volume;
  }, [library.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrack.source.startsWith('macos-') || !currentTrack.audioUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    if (audio.src !== currentTrack.audioUrl) {
      audio.pause();
      audio.src = currentTrack.audioUrl;
      audio.load();
      setDuration(currentTrack.duration);
    }
    // Browsers require a user gesture for playback. Never pretend playback
    // succeeded when the audio preview is blocked or unavailable.
    if (isPlaying) void audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack.id, currentTrack.audioUrl, currentTrack.source]);

  // 2. High-Precision 120Hz / 60Hz RequestAnimationFrame Tick Loop
  useEffect(() => {
    let loopId: number;

    const tick = () => {
      const nowPos = globalClock.now();
      setCurrentTime(previous => Math.abs(previous - nowPos) >= 0.03 ? nowPos : previous);

      if (isPlaying) {
        const energy = visualizerEngine.getAudioEnergy(nowPos, isPlaying);
        setAudioEnergy(energy);
      } else {
        setAudioEnergy({ bass: 0.05, mid: 0.05, treble: 0.05, overall: 0.05 });
      }

      loopId = requestAnimationFrame(tick);
    };

    loopId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(loopId);
  }, [isPlaying]);

  // 3. Extract palette and load lyrics when track changes
  useEffect(() => {
    let isCancelled = false;

    extractPaletteFromImage(currentTrack.albumArt).then((palette) => {
      if (!isCancelled) setExtractedPalette(palette);
    });

    setLyricsLoading(true);
    fetchLyricsFromLRCLIB(
      currentTrack.title,
      currentTrack.artist,
      currentTrack.album,
      currentTrack.duration
    ).then((res) => {
      if (!isCancelled) {
        setLyrics(res);
        setLyricsLoading(false);
      }
    });


    return () => {
      isCancelled = true;
    };
  }, [currentTrack]);

  // 4. macOS Bridge Polling (every 350ms)
  useEffect(() => {
    let timer: any;
    let isMounted = true;

    const pollBridge = async () => {
      const isOnline = await checkBridgeHealth();
      if (!isMounted) return;
      setIsMacBridgeOnline(isOnline);

      if (isOnline) {
        const macState = await fetchMacOSNowPlaying();
        if (macState && (macState.state === 'playing' || macState.state === 'paused')) {
          const macSource = macState.activeApp === 'Spotify' ? 'macos-spotify' : 'macos-music';
          const isPlayingState = macState.state === 'playing';

          if (
            currentTrack.title !== macState.track ||
            currentTrack.artist !== macState.artist ||
            currentTrack.source !== macSource
          ) {
            let artwork = macState.artworkUrl;
            if (!artwork && macState.track && macState.artist) {
              artwork = (await fetchArtworkForTrack(macState.track, macState.artist)) || undefined;
            }

            libraryStore.markNowPlaying({
              id: 'macos-' + [macSource, macState.track, macState.artist, macState.album].join('|'),
              title: macState.track, artist: macState.artist, album: macState.album || '',
              albumArt: artwork || '', duration: macState.duration || 0,
              position: macState.position || 0, isPlaying: isPlayingState, source: macSource
            });
            setCurrentTrack({
              id: 'macos-' + [macSource, macState.track, macState.artist, macState.album].join('|'),
              title: macState.track,
              artist: macState.artist,
              album: macState.album || 'Now Playing',
              albumArt: artwork || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
              duration: macState.duration || 200,
              position: macState.position || 0,
              isPlaying: isPlayingState,
              source: macSource,
              badge: `${macState.activeApp}`
            });

            setDuration(macState.duration);
            setIsPlaying(isPlayingState);
            globalClock.sync(macState.position, isPlayingState, macState.latencyMs || 180);
          } else {
            setIsPlaying(isPlayingState);
            globalClock.sync(macState.position, isPlayingState, macState.latencyMs || 180);

            if (macState.artworkUrl && currentTrack.albumArt !== macState.artworkUrl) {
              setCurrentTrack(t => ({ ...t, albumArt: macState.artworkUrl! }));
            }
          }
        }
      }

      if (isMounted) {
        timer = setTimeout(pollBridge, 350);
      }
    };

    pollBridge();
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentTrack]);

  // Controls: Spotify/macOS remains an external source; local queue entries
  // are never promoted to full streaming tracks without an authorized audio URL.
  const handlePlayPause = useCallback(() => {
    visualizerEngine.resume();
    const selected = currentTrackRef.current;
    if (selected.source.startsWith('macos-')) {
      const app = selected.source === 'macos-spotify' ? 'Spotify' : 'Music';
      void sendMacOSCommand('play-pause', app);
      setIsPlaying(wasPlaying => !wasPlaying);
      return;
    }
    const audio = audioRef.current;
    if (!audio || !selected.audioUrl) return;
    if (!audio.paused) { audio.pause(); setIsPlaying(false); globalClock.sync(audio.currentTime, false, 0); }
    else void audio.play().then(() => {
      setIsPlaying(true); globalClock.sync(audio.currentTime, true, 0);
    }).catch(() => {
      setIsPlaying(false);
      setSyncFeedback('Audio unavailable — choose another preview or file');
    });
  }, []);
  const switchLocalTrack = useCallback((id: string | null) => {
    if (!id) { setIsPlaying(false); return; }
    const next = libraryStore.getPlayable(id);
    if (!next?.audioUrl) {
      setIsPlaying(false);
      setSyncFeedback('Track is metadata only — reselect its source');
      return;
    }
    libraryStore.play(next);
    setCurrentTrack(next);
    globalClock.reset(0, true);
    setCurrentTime(0);
    setIsPlaying(true);
  }, []);
  const handleNext = useCallback((automatic = false) => {
    const selected = currentTrackRef.current;
    if (selected.source.startsWith('macos-')) {
      if (!automatic) void sendMacOSCommand('next', selected.source === 'macos-spotify' ? 'Spotify' : 'Music');
      return;
    }
    const next = libraryStore.adjacent(selected.id, 1, automatic);
    if (!next && automatic) { setIsPlaying(false); globalClock.sync(0, false, 0); return; }
    if (next === selected.id && automatic) {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; void audio.play().catch(() => setIsPlaying(false)); }
      globalClock.reset(0, true);
      return;
    }
    switchLocalTrack(next);
  }, [switchLocalTrack]);
  nextRef.current = handleNext;
  const handlePrev = useCallback(() => {
    const selected = currentTrackRef.current;
    if (selected.source.startsWith('macos-')) {
      void sendMacOSCommand('previous', selected.source === 'macos-spotify' ? 'Spotify' : 'Music');
      return;
    }
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      globalClock.reset(0, !audioRef.current.paused);
      return;
    }
    switchLocalTrack(libraryStore.adjacent(selected.id, -1));
  }, [switchLocalTrack]);
  const handleSeek = useCallback((seconds: number) => {
    const selected = currentTrackRef.current;
    if (!Number.isFinite(seconds) || seconds < 0) return;
    if (selected.source.startsWith('macos-')) {
      void sendMacOSCommand('seek', selected.source === 'macos-spotify' ? 'Spotify' : 'Music', { position: seconds });
    } else if (audioRef.current?.src) {
      audioRef.current.currentTime = Math.min(seconds, Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : seconds);
    }
    globalClock.reset(seconds, audioRef.current ? !audioRef.current.paused : false);
    setCurrentTime(seconds);
  }, []);
  const handleSelectSearchedTrack = useCallback((track: Track) => {
    libraryStore.play(track);
    setCurrentTrack(track); globalClock.reset(0, true);
    setCurrentTime(0); setIsPlaying(true);
  }, []);
  const handleFileUpload = useCallback((file: File) => {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(file.name)) {
      setSyncFeedback('Select an audio file to play locally'); return;
    }
    const localTrack = createTrackFromFile(file);
    if (localTrack.audioUrl) importedAudioUrls.current.add(localTrack.audioUrl);
    libraryStore.play(localTrack);
    setCurrentTrack(localTrack); globalClock.reset(0, true);
    setCurrentTime(0); setIsPlaying(true);
    setIsSettingsOpen(false);
  }, []);
  const toggleLocalMute = useCallback(() => {
    const volume = libraryStore.getSnapshot().volume;
    if (volume > 0) { previousVolume.current = volume; libraryStore.setVolume(0); }
    else libraryStore.setVolume(previousVolume.current || 0.8);
  }, []);

  // Publish local-audio metadata and controls to compatible browsers/headsets.
  // Spotify remains external; do not hijack the OS media session for it.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack.audioUrl || currentTrack.source.startsWith('macos-')) return;
    const session = navigator.mediaSession;
    try {
      session.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: currentTrack.albumArt && currentTrack.albumArt.startsWith('https://')
          ? [{ src: currentTrack.albumArt, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    } catch { /* Unsupported artwork/metadata fields are optional. */ }
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => { if (audioRef.current?.paused) handlePlayPause(); }],
      ['pause', () => { if (audioRef.current && !audioRef.current.paused) handlePlayPause(); }],
      ['nexttrack', () => handleNext()],
      ['previoustrack', () => handlePrev()],
      ['seekto', details => { if (typeof details.seekTime === 'number') handleSeek(details.seekTime); }],
      ['seekbackward', details => handleSeek(Math.max(0, audioRef.current?.currentTime || 0) - (details.seekOffset || 10))],
      ['seekforward', details => handleSeek((audioRef.current?.currentTime || 0) + (details.seekOffset || 10))]
    ];
    for (const [action, callback] of handlers) {
      try { session.setActionHandler(action, callback); } catch { /* Browser does not support this action. */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { session.setActionHandler(action, null); } catch { /* Graceful fallback. */ }
      }
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artist, currentTrack.album, currentTrack.albumArt, currentTrack.audioUrl, currentTrack.source, handlePlayPause, handleNext, handlePrev, handleSeek]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (currentTrack.source.startsWith('macos-') || !currentTrack.audioUrl) return;
    session.playbackState = isPlaying ? 'playing' : 'paused';
    const update = () => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      try {
        session.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.min(audio.duration, Math.max(0, audio.currentTime))
        });
      } catch { /* Position metadata is optional. */ }
    };
    update();
    const id = window.setInterval(update, 2000);
    return () => { window.clearInterval(id); };
  }, [currentTrack.id, currentTrack.audioUrl, currentTrack.source, isPlaying]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const toggleLyricStyle = useCallback(() => {
    setLyricStyle(curr => {
      const next = curr === 'verci-single-word' ? 'smooth-captions' : 'verci-single-word';
      const label = next === 'verci-single-word' ? 'Single Word' : 'Smooth Captions';
      setSyncFeedback(label);
      setTimeout(() => setSyncFeedback(null), 1500);
      return next;
    });
  }, []);

  const adjustSyncOffset = useCallback((deltaMs: number) => {
    setSyncOffset(curr => {
      const next = deltaMs === 0 ? 0 : curr + deltaMs;
      const label = next === 0 ? 'Sync: 0ms' : next > 0 ? `Sync: +${next}ms` : `Sync: ${next}ms`;
      setSyncFeedback(label);
      setTimeout(() => setSyncFeedback(null), 1500);
      return next;
    });
  }, []);

  const handleToggleMic = useCallback(async () => {
    const active = await visualizerEngine.toggleMicrophone();
    setIsMicActive(active);
    setSyncFeedback(active ? 'Mic Visualizer: ON' : 'Procedural Beat Sync: ON');
    setTimeout(() => setSyncFeedback(null), 1800);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(duration, currentTime + 5));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 5));
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLyricStyle();
      } else if (e.key === 'r' || e.key === 'R') {
        setRimConfig(c => ({ ...c, enabled: !c.enabled }));
      } else if (e.key === '[') {
        adjustSyncOffset(-50);
      } else if (e.key === ']') {
        adjustSyncOffset(50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, toggleFullscreen, handleSeek, currentTime, duration, adjustSyncOffset, toggleLyricStyle]);

  return (
    <div
      ref={rootContainerRef}
      className="relative w-screen h-screen overflow-hidden bg-black/40 text-slate-100 flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif]"
    >
      {/* 0. Ambient Blurred Cover Art Background (Always active, responsive to current track) */}
      <BlurredCoverBackground coverUrl={currentTrack.albumArt} />

      {/* 1. Dynamic Slights: Screen-Edge Ambient Rim Lights */}
      <AmbientRimLights
        config={rimConfig}
        palette={activePalette}
        audioEnergy={audioEnergy}
        isPlaying={isPlaying}
      />

      {/* Floating Sync / Style Feedback Pill */}
      {syncFeedback && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="glass-pill px-4 py-2 rounded-full text-xs font-mono font-bold text-cyan-300 shadow-2xl flex items-center gap-2 border border-cyan-400/40">
            <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span>{syncFeedback}</span>
          </div>
        </div>
      )}

      {/* 2. Top Bar: Pure White Minimal Floating Icons (Dynamic Slights & Fullscreen Only) */}
      <header className="relative z-30 w-full px-6 py-4 flex items-center justify-end pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3">
          <a href={window.location.pathname + "?mode=spotify"}
            className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
            aria-label="Follow Spotify playback">Follow Spotify</a>
          <button onClick={() => setIsLibraryOpen(true)}
            className="rounded-full border border-white/20 bg-black/30 px-3 py-2 text-xs text-white/90 transition hover:bg-white/10"
            aria-label="Open music library">
            <Library size={15} className="mr-1 inline"/> Library
          </button>
          {/* Dynamic Slights (Pure White Icon Only - No Button Styling) */}
          <button
            onClick={() => setRimConfig(c => ({ ...c, enabled: !c.enabled }))}
            className={`p-2 transition active:scale-90 focus:outline-none ${
              rimConfig.enabled
                ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.75)]'
                : 'text-white/40 hover:text-white'
            }`}
            title="Toggle Dynamic Slights (R)"
          >
            <Sun className="w-5 h-5 text-white" />
          </button>

          {/* Fullscreen (Pure White Icon Only - No Button Styling) */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-white/80 hover:text-white transition active:scale-90 focus:outline-none"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5 text-white" /> : <Maximize2 className="w-5 h-5 text-white" />}
          </button>
        </div>
      </header>

      {/* ================================================================ */}
      {/* 3. MAIN DISPLAY: LOCKSCREEN MODE (Default) OR SPLIT MODE */}
      {/* ================================================================ */}
      <main className="relative z-20 flex-1 w-full h-[calc(100vh-130px)] overflow-hidden px-6 sm:px-12 md:px-20 flex items-center justify-center">
        {layoutMode === 'lockscreen' ? (
          /* ================================================================ */
          /* LOCKSCREEN MODE: Pure black background + Center Lyrics + Bottom Floating Bar */
          /* ================================================================ */
          <div className="w-full h-full flex flex-col items-center justify-center relative animate-in fade-in duration-300">
            {/* Center Lyrics (Single Word or Smooth Captions) */}
            <div className="w-full max-w-4xl h-full flex flex-col items-center justify-center pb-20">
              <SyncedLyricsView
                lyrics={lyrics}
                currentTime={currentTime}
                duration={duration}
                palette={activePalette}
                style={lyricStyle}
                onSeek={handleSeek}
                onSearchOpen={() => setIsSearchOpen(true)}
              />
            </div>

            {/* Bottom Floating Pill Player Bar with Liquid Glass & Pure White Icons */}
            <LockscreenPlayerBar
              ref={lockscreenBarRef}
              track={currentTrack}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              lyricStyle={lyricStyle}
              syncOffset={syncOffset}
              onAdjustSync={adjustSyncOffset}
              onToggleLyricStyle={toggleLyricStyle}
              onPlayPause={handlePlayPause}
              onNext={() => handleNext()}
              onPrev={handlePrev}
              onSeek={handleSeek}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenSearch={() => setIsSearchOpen(true)}
              isMicActive={isMicActive}
              onToggleMic={handleToggleMic}
              volume={library.volume}
              onToggleMute={toggleLocalMute}
            />
          </div>
        ) : (
          /* ================================================================ */
          /* SPLIT STAGE MODE: Left Reference Card + Right Lyrics */
          /* ================================================================ */
          <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center py-4">
            <div className="lg:col-span-5 flex justify-center items-center h-full">
              <LiquidGlassPlayer
                ref={playerCardRef}
                track={currentTrack}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onNext={handleNext}
                onPrev={handlePrev}
                onSeek={handleSeek}
              />
            </div>

            <div className="lg:col-span-7 h-full flex flex-col justify-center overflow-hidden">
              <SyncedLyricsView
                lyrics={lyrics}
                currentTime={currentTime}
                duration={duration}
                palette={activePalette}
                style={lyricStyle}
                onSeek={handleSeek}
                onSearchOpen={() => setIsSearchOpen(true)}
              />
            </div>
          </div>
        )}
      </main>

      {/* 4. Bottom Hint Line */}
      <footer className="relative z-30 w-full px-6 py-2.5 flex items-center justify-between text-[11px] text-white/35 pointer-events-none">
        <span className="hidden sm:inline">
          {lyrics ? `Lyrics: ${lyrics.source || 'LRCLIB'}` : lyricsLoading ? 'Fetching lyrics...' : 'No lyrics'}
        </span>
        <span className="hidden md:inline">
          Hotkeys: Space (Play/Pause) • L (Toggle Style) • [ ] (Sync ±50ms) • F (Fullscreen)
        </span>
      </footer>

      {/* Settings Modal */}
      <ControlsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        rimConfig={rimConfig}
        setRimConfig={setRimConfig}
        lyricConfig={{
          style: lyricStyle,
          fontSize: 'large',
          wordSync: true,
          syncOffset,
          autoScroll: true
        }}
        setLyricConfig={() => {}}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        palette={activePalette}
        isMacBridgeOnline={isMacBridgeOnline}
        onFileUpload={handleFileUpload}
      />

      {/* Search Modal */}
      <TrackSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectTrack={handleSelectSearchedTrack}
      />

      <LocalLibraryPanel open={isLibraryOpen} onClose={() => setIsLibraryOpen(false)}
        nowPlayingId={currentTrack.id}
        onPlay={track => { handleSelectSearchedTrack(track); setIsLibraryOpen(false); }} />
    </div>
  );
};

export default App;
