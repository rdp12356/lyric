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
import { useLiquidGlass } from './hooks/useLiquidGlass';
import { MusicLibraryDrawer } from './components/MusicLibraryDrawer';
import { musicLibrary, playbackTrack, canPlaySavedTrack, type SavedTrack } from './services/musicLibrary';

import {
  Sun,
  Library,
  Maximize2,
  Minimize2,
  Clock
} from 'lucide-react';

export const App: React.FC = () => {
  // Playback & Track State
  const [currentTrack, setCurrentTrack] = useState<Track>(() => {
    const state = musicLibrary.getSnapshot();
    const last = state.queue.find(track => track.id === state.currentId);
    const demo = last && DEMO_TRACKS.find(track => track.id === last.id);
    return demo || (last && canPlaySavedTrack(last) ? playbackTrack(last) : DEMO_TRACKS[0]);
  });
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
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMacBridgeOnline, setIsMacBridgeOnline] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const lockscreenBarRef = useRef<HTMLDivElement>(null);
  const playerCardRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef<() => void>(() => {});
  const sourceRef = useRef(currentTrack.source);
  sourceRef.current = currentTrack.source;
  const playOnTrackChange = useRef(false);

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

  // 1. Initialize HTML5 Audio Element & Visualizer Engine
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (!sourceRef.current.startsWith('macos-')) {
        globalClock.sync(audio.currentTime, !audio.paused, 0);
      }
    };

    const handleEnded = () => {
      endedRef.current();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    visualizerEngine.init(audio);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    try {
      // Seed demo previews once per browser, not after the user clears the queue.
      if (localStorage.getItem('lyric.music-library.seeded.v1') !== '1') {
        if (!musicLibrary.getSnapshot().queue.length) DEMO_TRACKS.forEach(track => musicLibrary.queueTrack(track));
        localStorage.setItem('lyric.music-library.seeded.v1', '1');
      }
    } catch { /* Browser storage is optional. */ }
  }, []);

  useEffect(() => {
    let frame = 0, lastPosition = 0, lastEnergy = 0;
    const tick = (now: number) => {
      if (now - lastPosition >= 33) {
        const pos = globalClock.now();
        setCurrentTime(previous => Math.abs(previous - pos) >= 0.03 ? pos : previous);
        lastPosition = now;
      }
      if (now - lastEnergy >= 70) {
        const next = isPlaying ? visualizerEngine.getAudioEnergy(globalClock.now(), true)
          : { bass: 0.05, mid: 0.05, treble: 0.05, overall: 0.05 };
        setAudioEnergy(previous => {
          const change = Math.max(...(['bass','mid','treble','overall'] as const)
            .map(key => Math.abs(previous[key] - next[key])));
          return change > 0.02 ? next : previous;
        });
        lastEnergy = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
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

    if (audioRef.current && currentTrack.audioUrl) {
      if (audioRef.current.src !== currentTrack.audioUrl) {
        audioRef.current.src = currentTrack.audioUrl;
        audioRef.current.load();
        if (playOnTrackChange.current) {
          void audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(e => {
            console.warn('Autoplay prevented:', e);
            setIsPlaying(false);
            setSyncFeedback('Tap Play to start audio');
          });
          playOnTrackChange.current = false;
        }
      }
    }

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

            setCurrentTrack({
              id: `mac-${Date.now()}`,
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

  // Controls
  const handlePlayPause = useCallback(() => {
    visualizerEngine.resume();
    if (currentTrack.source.startsWith('macos-')) {
      const targetApp = currentTrack.source === 'macos-spotify' ? 'Spotify' : 'Music';
      sendMacOSCommand('play-pause', targetApp);
      setIsPlaying(!isPlaying);
      globalClock.sync(currentTime, !isPlaying, 0);
      return;
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        globalClock.sync(audioRef.current.currentTime, false, 0);
      } else {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          globalClock.sync(audioRef.current!.currentTime, true, 0);
        }).catch(err => {
          console.warn('Audio play error:', err);
          setIsPlaying(false);
          setSyncFeedback('Playback blocked · tap Play or choose a valid audio file');
          globalClock.sync(currentTime, false, 0);
        });
      }
    }
  }, [isPlaying, currentTrack, currentTime]);

  const activateLocalTrack = useCallback((saved: SavedTrack) => {
    const originalDemo = DEMO_TRACKS.find(t => t.id === saved.id);
    const candidate = originalDemo || playbackTrack(saved);
    if (!originalDemo && !canPlaySavedTrack(saved)) {
      setSyncFeedback('Audio file unavailable · re-import it or play in the official app');
      return;
    }
    musicLibrary.playNow(candidate);
    playOnTrackChange.current = true;
    setCurrentTrack(candidate);
    setDuration(candidate.duration);
    setCurrentTime(0);
    setIsPlaying(true);
    globalClock.reset(0, true);
  }, []);

  const handleNext = useCallback((ended = false) => {
    if (currentTrack.source.startsWith('macos-')) {
      const targetApp = currentTrack.source === 'macos-spotify' ? 'Spotify' : 'Music';
      void sendMacOSCommand('next', targetApp);
      return;
    }
    const library = musicLibrary.getSnapshot();
    if (library.queue.length) {
      const next = musicLibrary.nextTrack(ended);
      if (next) { activateLocalTrack(next); return; }
      if (ended) { setIsPlaying(false); audioRef.current?.pause(); globalClock.sync(currentTime, false, 0); }
      setSyncFeedback('End of queue · enable Repeat queue to continue');
      return;
    }
    const currentIdx = DEMO_TRACKS.findIndex(t => t.id === currentTrack.id);
    activateLocalTrack(DEMO_TRACKS[(currentIdx + 1) % DEMO_TRACKS.length]);
  }, [currentTrack, currentTime, activateLocalTrack]);

  const handlePrev = useCallback(() => {
    if (currentTrack.source.startsWith('macos-')) {
      const targetApp = currentTrack.source === 'macos-spotify' ? 'Spotify' : 'Music';
      void sendMacOSCommand('previous', targetApp);
      return;
    }
    const library = musicLibrary.getSnapshot();
    const previous = library.queue.length ? musicLibrary.previousTrack() : null;
    if (previous) { activateLocalTrack(previous); return; }
    if (library.queue.length) { setSyncFeedback('Beginning of queue'); return; }
    const currentIdx = DEMO_TRACKS.findIndex(t => t.id === currentTrack.id);
    activateLocalTrack(DEMO_TRACKS[(currentIdx - 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length]);
  }, [currentTrack, activateLocalTrack]);

  // Audio element's ended listener is installed only once, and sees fresh controls.
  endedRef.current = () => handleNext(true);

  const handleSeek = useCallback((seconds: number) => {
    if (currentTrack.source.startsWith('macos-')) {
      const targetApp = currentTrack.source === 'macos-spotify' ? 'Spotify' : 'Music';
      sendMacOSCommand('seek', targetApp, { position: seconds });
    }
    if (!currentTrack.source.startsWith('macos-') && audioRef.current && Number.isFinite(seconds)) {
      audioRef.current.currentTime = seconds;
    }
    globalClock.reset(seconds, isPlaying);
    setCurrentTime(seconds);
  }, [currentTrack, isPlaying]);

  const handleSelectSearchedTrack = useCallback((track: Track) => {
    musicLibrary.playNow(track);
    playOnTrackChange.current = true;
    setCurrentTrack(track);
    setDuration(track.duration);
    globalClock.reset(0, true);
    setIsPlaying(true);
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const localTrack = createTrackFromFile(file);
    musicLibrary.playNow(localTrack);
    playOnTrackChange.current = true;
    setCurrentTrack(localTrack);
    globalClock.reset(0, true);
    setIsPlaying(true);
    setIsSettingsOpen(false);
  }, []);

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
          <button
            aria-label="Open music library"
            onClick={() => setIsLibraryOpen(true)}
            className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20">
            <Library className="inline h-4 w-4 mr-1" /> Library
          </button>
          <a href={window.location.pathname + "?mode=spotify"}
            className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
            aria-label="Follow Spotify playback">Follow Spotify</a>
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
              onNext={handleNext}
              onPrev={handlePrev}
              onSeek={handleSeek}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenSearch={() => setIsSearchOpen(true)}
              isMicActive={isMicActive}
              onToggleMic={handleToggleMic}
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

      <MusicLibraryDrawer open={isLibraryOpen} onClose={() => setIsLibraryOpen(false)}
        playing={currentTrack} suggestions={DEMO_TRACKS}
        onPlayTrack={track => { activateLocalTrack(track); setIsLibraryOpen(false); }} />

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
    </div>
  );
};

export default App;
