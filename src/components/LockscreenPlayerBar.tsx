import React from 'react';
import { Track, LyricStyle } from '../types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  MoreHorizontal,
  MessageSquare,
  ListMusic,
  Radio,
  Volume2,
  VolumeX,
  Mic
} from 'lucide-react';

interface LockscreenPlayerBarProps {
  track: Track;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyricStyle: LyricStyle;
  syncOffset: number;
  onAdjustSync: (deltaMs: number) => void;
  onToggleLyricStyle: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (seconds: number) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  isMicActive?: boolean;
  onToggleMic?: () => void;
  volume?: number;
  onToggleMute?: () => void;
}

export const LockscreenPlayerBar = React.forwardRef<HTMLDivElement, LockscreenPlayerBarProps>(({
  track,
  currentTime: _currentTime,
  duration: _duration,
  isPlaying,
  lyricStyle,
  syncOffset,
  onAdjustSync,
  onToggleLyricStyle,
  onPlayPause,
  onNext,
  onPrev,
  onSeek: _onSeek,
  onOpenSettings,
  onOpenSearch,
  isMicActive,
  onToggleMic,
  volume = 0.8,
  onToggleMute
}, ref) => {
  const isMuted = volume <= 0;

  return (
    <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-40 select-none animate-in fade-in slide-in-from-bottom-5 duration-300">
      {/* Floating Pill Bar with Dark Translucent Liquid Glass Effect & Purely White Icons */}
      <div
        ref={ref}
        data-liquidglass="true"
        className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-2.5 rounded-full bg-black/45 backdrop-blur-2xl border border-white/[0.14] shadow-[0_25px_60px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.22)] text-white relative overflow-hidden"
      >
        {/* ======================================= */}
        {/* 1. LEFT CONTROLS: Pure White Icons (Prev, Play/Pause, Next) */}
        {/* ======================================= */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Previous Track */}
          <button
            onClick={onPrev}
            className="text-white/80 hover:text-white active:scale-90 transition p-1.5 focus:outline-none"
            title="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-white text-white" />
          </button>

          {/* Play / Pause - Pure White Icon without circular button pod */}
          <button
            onClick={onPlayPause}
            className="text-white hover:text-white/80 active:scale-90 transition p-1.5 focus:outline-none"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-white text-white" />
            ) : (
              <Play className="w-5 h-5 fill-white text-white translate-x-0.5" />
            )}
          </button>

          {/* Next Track */}
          <button
            onClick={onNext}
            className="text-white/80 hover:text-white active:scale-90 transition p-1.5 focus:outline-none"
            title="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-white text-white" />
          </button>
        </div>

        {/* Vertical divider */}
        <div className="w-[1px] h-6 bg-white/15 hidden sm:block" />

        {/* ======================================= */}
        {/* 2. MIDDLE TRACK INFO (No progress bar) */}
        {/* ======================================= */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Rounded Album Art Thumbnail */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden shrink-0 border border-white/15 bg-zinc-900 shadow-md">
            <img
              src={track.albumArt}
              alt={track.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Track Name & Artist */}
          <div className="flex flex-col text-left justify-center min-w-[120px] max-w-[180px] sm:max-w-[240px]">
            <span className="text-xs sm:text-[13px] font-bold text-white truncate leading-tight">
              {track.title}
            </span>
            <span className="text-[10px] text-white/65 truncate font-medium leading-tight mt-0.5">
              {track.artist} {track.album ? `— ${track.album}` : ''}
            </span>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="w-[1px] h-6 bg-white/15 hidden sm:block" />

        {/* ======================================= */}
        {/* 3. SYNC CALIBRATION OPTION (- / + ms) */}
        {/* ======================================= */}
        <div
          className="flex items-center bg-white/[0.08] hover:bg-white/[0.14] rounded-full px-2 py-0.5 border border-white/15 transition select-none"
          title="Sync Offset: Click − if lyrics are too early, + if lyrics are too late. Hotkeys: [ and ]"
        >
          <button
            onClick={() => onAdjustSync(-50)}
            className="text-white/60 hover:text-white px-1 font-mono text-xs font-bold active:scale-90 transition focus:outline-none"
            title="Delay lyrics (use if lyrics are too early) • Hotkey ["
          >
            −
          </button>
          <span className="text-[10px] font-mono font-bold text-white px-1 whitespace-nowrap">
            {syncOffset === 0 ? 'Sync 0ms' : `${syncOffset > 0 ? '+' : ''}${syncOffset}ms`}
          </span>
          <button
            onClick={() => onAdjustSync(50)}
            className="text-white/60 hover:text-white px-1 font-mono text-xs font-bold active:scale-90 transition focus:outline-none"
            title="Speed up lyrics (use if lyrics are too late / lagging) • Hotkey ]"
          >
            +
          </button>
        </div>

        {/* ======================================= */}
        {/* 4. RIGHT ICONS: Lyrics, More, Mic, AirPlay, Volume */}
        {/* ======================================= */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Settings / More */}
          <button
            onClick={onOpenSettings}
            className="text-white/80 hover:text-white active:scale-90 transition p-1.5 focus:outline-none"
            title="Settings & Customization"
          >
            <MoreHorizontal className="w-4 h-4 text-white" />
          </button>

          {/* Lyrics Style Toggle (Single Word <-> Smooth Captions) */}
          <button
            onClick={onToggleLyricStyle}
            className="text-white/80 hover:text-white active:scale-90 transition p-1.5 focus:outline-none"
            title={`Current: ${lyricStyle === 'verci-single-word' ? 'Single Word' : 'Smooth Captions'} (Click to switch)`}
          >
            <MessageSquare className="w-4 h-4 text-white" />
          </button>

          {/* Mic / Live Acoustic Visualizer Toggle */}
          {onToggleMic && (
            <button
              onClick={onToggleMic}
              className={`p-1.5 transition active:scale-90 focus:outline-none ${
                isMicActive ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]' : 'text-white/50 hover:text-white'
              }`}
              title={isMicActive ? 'Mic Audio Sync: ACTIVE (Click to toggle)' : 'Enable Live Mic Audio Sync'}
            >
              <Mic className="w-4 h-4 text-white" />
            </button>
          )}

          {/* Search / Global catalog */}
          <button
            onClick={onOpenSearch}
            className="text-white/80 hover:text-white active:scale-90 transition p-1.5 focus:outline-none"
            title="Search Tracks & Lyrics"
          >
            <ListMusic className="w-4 h-4 text-white" />
          </button>

          {/* Audio Source / AirPlay icon */}
          <div
            className="text-white/80 transition p-1.5 cursor-default"
            title={track.source.startsWith('macos-') ? 'macOS Desktop Sync' : 'Local Audio'}
          >
            <Radio className="w-4 h-4 text-white" />
          </div>

          {/* Volume toggle */}
          <button
            onClick={onToggleMute}
            disabled={track.source.startsWith('macos-') || !onToggleMute}
            className="text-white/80 hover:text-white active:scale-90 transition p-1.5 focus:outline-none"
            title={track.source.startsWith('macos-') ? 'Volume controlled by external player' : isMuted ? 'Unmute local audio' : 'Mute local audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
});

LockscreenPlayerBar.displayName = 'LockscreenPlayerBar';
