import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LyricsData } from '../types';

interface Props {
  lyrics: LyricsData | null;
  time: number;
  offsetMs: number;
  fontSize: number;
  onSeek?: (seconds: number) => void;
}
function findLine(lines: LyricsData['lines'], time: number): number {
  let left = 0, right = lines.length - 1, found = -1;
  while (left <= right) {
    const mid = (left + right) >>> 1;
    if (lines[mid].time <= time) { found = mid; left = mid + 1; }
    else right = mid - 1;
  }
  return found;
}
const LyricRow = React.memo(function LyricRow({
  text, active, passed, scale, index, lineTime, onSeek
}: { text: string; active: boolean; passed: boolean; scale: number; index: number; lineTime: number; onSeek?: (seconds: number) => void }) {
  return (
    <p data-line={index} aria-current={active ? 'true' : undefined}
      role={onSeek ? "button" : undefined} tabIndex={onSeek ? 0 : undefined}
      onClick={onSeek ? () => onSeek(lineTime) : undefined}
      onKeyDown={onSeek ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSeek(lineTime); } } : undefined}
      className={'relative mx-auto my-2 rounded-2xl px-4 py-3 leading-relaxed font-semibold transition-[opacity,transform,color] duration-300 ' +
        (active ? 'opacity-100 text-white scale-100' : passed ? 'opacity-45 text-white/70 scale-[0.97]' : 'opacity-30 text-white scale-[0.97]')}
      style={{ fontSize: scale + 'px', transformOrigin: 'center' }}>
      {text || '♪'}
    </p>
  );
});
export function SpotifyLyricsPanel({ lyrics, time, offsetMs, fontSize, onSeek }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const reduceMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const effectiveTime = Math.max(0, time + offsetMs / 1000);
  const index = useMemo(() => findLine(lyrics?.lines || [], effectiveTime), [lyrics, effectiveTime]);
  const key = lyrics ? String(lyrics.id || '') + '|' + lyrics.trackName + '|' + lyrics.artistName : '';
  useEffect(() => { setFollowing(true); }, [key]);
  useEffect(() => {
    if (!following || index < 0 || !viewport.current) return;
    const element = viewport.current.querySelector<HTMLElement>('[data-line="' + index + '"]');
    if (!element) return;
    const container = viewport.current;
    const desired = element.offsetTop - container.offsetTop - container.clientHeight * 0.36 + element.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, desired), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [index, following, reduceMotion, key]);
  if (!lyrics || !lyrics.lines.length) return (
    <div className="flex flex-1 items-center justify-center text-center text-white/55 px-6">
      Lyrics will appear here when a matching recording is found.
    </div>
  );
  const onUserScroll = () => setFollowing(false);
  return <div className="relative flex flex-1 min-h-0 flex-col">
    {lyrics.synced ? <p className="text-center text-[11px] text-emerald-200/80 pb-2">
      {lyrics.hasWordSync ? 'Original word timing available' : 'Line-synchronized lyrics · word timing not verified'}
    </p> : <p className="text-center text-[11px] text-amber-200/80 pb-2">Plain lyrics · estimated line positions, not synchronized</p>}
    <div ref={viewport} onWheel={onUserScroll} onTouchStart={onUserScroll} onPointerDown={onUserScroll}
      aria-label="Lyrics lines" className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 text-center"
      style={{ scrollBehavior: reduceMotion ? 'auto' : 'smooth', scrollbarWidth: 'thin' }}>
      <div style={{ height: '34%' }} aria-hidden="true" />
      {lyrics.lines.map((line, i) => <LyricRow key={line.id + ':' + line.time}
        index={i} text={line.text} active={i === index} passed={i < index} scale={fontSize} lineTime={line.time} onSeek={onSeek} />)}
      <div style={{ height: '50%' }} aria-hidden="true" />
    </div>
    {!following && <button onClick={() => setFollowing(true)}
      className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-slate-950 shadow-xl">
      Resume Sync
    </button>}
  </div>;
}
