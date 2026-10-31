import React, { useMemo } from 'react';
import { LyricsData, LyricLine, ColorPalette, LyricStyle } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Music2 } from 'lucide-react';

interface SyncedLyricsViewProps {
  lyrics: LyricsData | null;
  currentTime: number;
  duration: number;
  palette: ColorPalette;
  style: LyricStyle;
  onSeek: (seconds: number) => void;
  onSearchOpen?: () => void;
  unavailableMessage?: string;
}

export const SyncedLyricsView: React.FC<SyncedLyricsViewProps> = ({
  lyrics,
  currentTime,
  palette,
  style,
  onSeek,
  onSearchOpen,
  unavailableMessage
}) => {
  // Find active line index
  const activeIndex = useMemo(() => {
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) return -1;
    const lines = lyrics.lines;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      if (currentTime >= line.time) {
        if (!nextLine || currentTime < nextLine.time) {
          return i;
        }
      }
    }

    if (currentTime < lines[0].time) return -1;
    return lines.length - 1;
  }, [lyrics, currentTime]);

  const activeLine: LyricLine | null = useMemo(() => {
    if (!lyrics || activeIndex === -1 || !lyrics.lines[activeIndex]) return null;
    return lyrics.lines[activeIndex];
  }, [lyrics, activeIndex]);

  // Find active word for Single-Word and Smooth-Captions modes
  const { activeWord, activeWordIndex, upcomingWords } = useMemo(() => {
    if (!activeLine || !activeLine.words || activeLine.words.length === 0) {
      return { activeWord: null, activeWordIndex: -1, upcomingWords: [] };
    }

    const words = activeLine.words;
    let idx = -1;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (currentTime >= w.start && currentTime < w.end) {
        idx = i;
        break;
      }
    }

    if (idx === -1) {
      for (let i = words.length - 1; i >= 0; i--) {
        if (currentTime >= words[i].start) {
          idx = i;
          break;
        }
      }
    }

    if (idx === -1 && words.length > 0) idx = 0;

    const w = idx >= 0 ? words[idx] : null;
    const upcoming = idx >= 0 ? words.slice(idx + 1, idx + 4).map(uw => uw.word) : [];

    return { activeWord: w, activeWordIndex: idx, upcomingWords: upcoming };
  }, [activeLine, currentTime]);

  // If no lyrics found
  if (!lyrics || lyrics.lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center mb-4 text-white/70 shadow-lg">
          <Music2 className="w-7 h-7 animate-pulse text-white/80" />
        </div>
        <h3 className="text-xl font-bold text-white mb-1.5">No Synced Lyrics Available</h3>
        <p className="text-sm text-white/50 max-w-sm mb-5 leading-relaxed">
          {unavailableMessage || 'Lyrics have not been indexed for this track on LRCLIB yet, or the song is instrumental.'}
        </p>
        {onSearchOpen && (
          <button
            onClick={onSearchOpen}
            className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/15 text-xs font-semibold text-white transition shadow-sm"
          >
            Search Alternative Releases
          </button>
        )}
      </div>
    );
  }

  const isInst = activeLine ? isInstrumentalLine(activeLine.text) : false;

  // =========================================================
  // MODE 1: VERCI SINGLE WORD AT A TIME
  // =========================================================
  if (style === 'verci-single-word') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center select-none">
        {activeLine && !isInst && activeWord ? (
          <div className="flex flex-col items-center justify-center space-y-7 max-w-2xl">
            {/* Giant Spring Kinetic Single Word */}
            <div className="min-h-[160px] flex items-center justify-center">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`${activeLine.id}-${activeWordIndex}`}
                  initial={{ opacity: 0, y: 35, scale: 0.84, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -25, scale: 1.05, filter: 'blur(6px)' }}
                  transition={{
                    y: { type: 'spring', stiffness: 450, damping: 26, mass: 0.7 },
                    scale: { type: 'spring', stiffness: 450, damping: 26, mass: 0.7 },
                    opacity: { duration: 0.15 },
                    filter: { duration: 0.15, ease: 'easeOut' }
                  }}
                  className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-white text-center tracking-tight leading-none drop-shadow-[0_4px_30px_rgba(255,255,255,0.7)]"
                >
                  {activeWord.word}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Upcoming Words Ghost Preview */}
            {upcomingWords.length > 0 && (
              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white/30 tracking-wide">
                {upcomingWords.join(' ')}
              </div>
            )}

            {/* Full Line Breadcrumb Subtitle */}
            <div className="pt-2">
              <p className="text-xs sm:text-sm font-semibold text-white/45 truncate max-w-lg">
                {activeLine.text}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3.5">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-white animate-pulse shadow-[0_0_12px_white]" />
              <span
                className="w-3.5 h-3.5 rounded-full bg-white animate-pulse shadow-[0_0_12px_white]"
                style={{ animationDelay: '200ms' }}
              />
              <span
                className="w-3.5 h-3.5 rounded-full bg-white animate-pulse shadow-[0_0_12px_white]"
                style={{ animationDelay: '400ms' }}
              />
            </div>
            <p className="text-xs font-mono uppercase tracking-widest text-white/40">
              Instrumental Interlude
            </p>
          </div>
        )}
      </div>
    );
  }

  // =========================================================
  // MODE 2: SMOOTH CAPTIONS (Dynamic Word-by-Word Sentence Pop)
  // =========================================================
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center select-none">
      {activeLine && !isInst ? (
        <div className="space-y-7 max-w-3xl">
          {/* Active Phrase with Bouncy Spring Word Highlights */}
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-snug flex flex-wrap justify-center gap-x-3.5 gap-y-2.5">
            {activeLine.words && activeLine.words.length > 0 ? (
              activeLine.words.map((w, wIdx) => {
                const isCurrent = currentTime >= w.start && currentTime < w.end;
                const isPast = currentTime >= w.end;

                return (
                  <motion.span
                    key={wIdx}
                    animate={{
                      scale: isCurrent ? 1.15 : 1.0,
                      color: isCurrent ? '#ffffff' : isPast ? '#ffffff' : 'rgba(255, 255, 255, 0.25)'
                    }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                    className={`inline-block font-black transition-all duration-75 ${
                      isCurrent
                        ? 'drop-shadow-[0_0_25px_rgba(255,255,255,0.95)] text-white'
                        : isPast
                        ? 'text-white'
                        : 'text-white/25'
                    }`}
                  >
                    {w.word}
                  </motion.span>
                );
              })
            ) : (
              <span className="text-white font-black">{activeLine.text}</span>
            )}
          </div>

          {/* Next line preview */}
          {lyrics.lines[activeIndex + 1] && !isInstrumentalLine(lyrics.lines[activeIndex + 1].text) && (
            <p
              onClick={() => onSeek(lyrics.lines[activeIndex + 1].time)}
              className="text-lg sm:text-xl md:text-2xl text-white/30 font-bold cursor-pointer hover:text-white/60 transition-colors pt-2"
            >
              {lyrics.lines[activeIndex + 1].text}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-white/40 font-bold text-2xl">
          <Music2 className="w-6 h-6 animate-spin text-white/60" />
          <span>Instrumental...</span>
        </div>
      )}
    </div>
  );
};

function isInstrumentalLine(text: string): boolean {
  const clean = text.trim();
  return clean === '♪' || clean === '♫' || /^\[(instrumental|solo)\]$/i.test(clean) || clean === '...';
}
