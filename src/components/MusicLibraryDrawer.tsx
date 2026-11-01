import React, { useRef, useState } from 'react';
import {
  Library, X, Heart, ListMusic, Download, Upload, Plus, Trash2,
  ArrowUp, ArrowDown, Play, Shuffle, Repeat, Repeat1, Save,
  Music2, Check, AlertCircle, History
} from 'lucide-react';
import type { Track } from '../types';
import {
  musicLibrary, useMusicLibrary, canPlaySavedTrack,
  type SavedTrack, type RepeatMode
} from '../services/musicLibrary';

interface Props {
  open: boolean;
  onClose: () => void;
  playing?: Track | null;
  onPlayTrack: (track: SavedTrack) => void;
  suggestions?: Track[];
}
type Section = 'queue' | 'favorites' | 'playlists' | 'history' | 'backup';
const ACTION = 'rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-30';
const TABS: readonly { id: Section; title: string }[] = [
  { id: 'queue', title: 'Queue' },
  { id: 'favorites', title: 'Favorites' },
  { id: 'playlists', title: 'Playlists' },
  { id: 'history', title: 'History' },
  { id: 'backup', title: 'Backup' }
];
function SongRow({
  track, index, onPlay, actions
}: {
  track: SavedTrack; index?: number; onPlay: () => void; actions?: React.ReactNode
}) {
  const playable = canPlaySavedTrack(track);
  return <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[.045] p-2.5">
    {track.albumArt ? <img src={track.albumArt} alt="" loading="lazy"
      className="h-10 w-10 shrink-0 rounded-lg object-cover" /> :
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10"><Music2 size={17} /></div>}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-white">{index != null ? (index + 1) + '. ' : ''}{track.title}</p>
      <p className="truncate text-[11px] text-white/50">{track.artist || 'Unknown artist'}</p>
      {!playable && <p className="text-[10px] text-amber-200/70">
        {track.source === 'local-file' ? 'Re-import local audio to play' : 'External player · metadata only'}
      </p>}
    </div>
    <button className={ACTION + ' shrink-0'} aria-label={'Play ' + track.title}
      disabled={!playable} onClick={onPlay}><Play size={14} /></button>
    {actions}
  </div>;
}
export function MusicLibraryDrawer({ open, onClose, playing, onPlayTrack, suggestions = [] }: Props) {
  const state = useMusicLibrary();
  const [tab, setTab] = useState<Section>('queue');
  const [playlistName, setPlaylistName] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  if (!open) return null;
  const favorite = playing && musicLibrary.isFavorite(playing.id);
  const notify = (value: string) => { setNotice(value); };
  const attemptPlay = (track: SavedTrack) => {
    if (!canPlaySavedTrack(track)) {
      notify('This track is metadata only. Re-import the local file or play it in the official music app.');
      return;
    }
    onPlayTrack(track);
  };
  const doExport = () => {
    const content = musicLibrary.exportBackup();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lyric-library-backup.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoke after the click handler rather than before the browser starts the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Library backup exported. Audio files, Spotify tokens and online lyrics are not included.');
  };
  const doImport = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { notify('Backup must be smaller than 4 MB.'); return; }
    try {
      const result = musicLibrary.restoreBackup(await file.text(), true);
      notify('Merged ' + result.playlists + ' playlists, ' + result.favorites + ' favorites and ' + result.queue + ' queued tracks.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not restore backup.'); }
  };
  const repeatLabel: Record<RepeatMode, string> = {
    off: 'Repeat off', all: 'Repeat queue', one: 'Repeat one'
  };
  const selected = state.playlists.find(p => p.id === selectedList);
  return <div className="fixed inset-0 z-[90] flex justify-end bg-black/80 backdrop-blur-md"
    role="presentation" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <button aria-label="Close library overlay" className="absolute inset-0 cursor-default" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-label="Music Library"
      className="relative flex h-full w-full max-w-xl flex-col border-l border-white/15 bg-[#10151f] text-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2"><Library className="text-emerald-300" size={19} />
          <div><h2 className="font-semibold">Your Lyric Library</h2>
            <p className="text-[11px] text-white/45">Private on this device · no account needed</p></div>
        </div>
        <button className={ACTION} onClick={onClose} aria-label="Close music library"><X size={17} /></button>
      </header>
      <nav aria-label="Library sections" className="flex shrink-0 overflow-x-auto border-b border-white/10 px-3 py-2">
        {TABS.map(item => <button key={item.id} className={'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ' +
          (tab === item.id ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10')}
          aria-current={tab === item.id ? 'page' : undefined} onClick={() => { setTab(item.id); setNotice(''); }}>
          {item.title}
        </button>)}
      </nav>
      {notice && <p role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />{notice}
      </p>}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        {playing && <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300/75">Now playing</p>
            <p className="truncate text-sm font-semibold">{playing.title}</p>
            <p className="truncate text-xs text-white/45">{playing.artist}</p>
          </div>
          <button className={ACTION} onClick={() => musicLibrary.toggleFavorite(playing)}
            aria-label={favorite ? 'Remove current favorite' : 'Favorite current song'}>
            <Heart size={15} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Saved' : 'Favorite'}
          </button>
          <button className={ACTION} onClick={() => musicLibrary.queueTrack(playing)}>Add to queue</button>
        </section>}
        {tab === 'queue' && <>
          <section className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Your queue · {state.queue.length}</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className={ACTION} aria-label="Toggle shuffle"
                aria-pressed={state.shuffle} onClick={() => musicLibrary.setShuffle(!state.shuffle)}>
                <Shuffle size={14} /> <span className="sr-only">Shuffle</span>{state.shuffle ? 'On' : 'Off'}
              </button>
              <button className={ACTION} aria-label={repeatLabel[state.repeat]}
                onClick={() => musicLibrary.setRepeat(state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off')}>
                {state.repeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />} {repeatLabel[state.repeat]}
              </button>
              <button className={ACTION} disabled={!state.queue.length}
                onClick={() => { if (window.confirm('Clear all queued songs? Your playlists and favorites will stay saved.')) musicLibrary.clearQueue(); }}>Clear queue</button>
            </div>
          </section>
          {!state.queue.length && <p className="text-xs text-white/50">Your queue is empty. Add a demo preview or search for music.</p>}
          <div className="space-y-2">{state.queue.map((song, i) => <div key={song.id} className={song.id === state.currentId ? 'rounded-xl ring-1 ring-emerald-500/50' : ''}>
            <SongRow track={song} index={i} onPlay={() => attemptPlay(song)}
              actions={<div className="flex shrink-0 gap-1">
                <button aria-label={'Move up ' + song.title} className={ACTION} disabled={i === 0}
                  onClick={() => musicLibrary.reorderQueue(i, i - 1)}><ArrowUp size={13}/></button>
                <button aria-label={'Move down ' + song.title} className={ACTION} disabled={i === state.queue.length - 1}
                  onClick={() => musicLibrary.reorderQueue(i, i + 1)}><ArrowDown size={13}/></button>
                <button aria-label={'Remove ' + song.title + ' from queue'} className={ACTION}
                  onClick={() => musicLibrary.removeFromQueue(song.id)}><X size={13}/></button>
              </div>} />
          </div>)}</div>
          {!!suggestions.length && <section className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Available previews</h3>
            {suggestions.slice(0, 12).map(song => <div key={song.id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{song.title} · {song.artist}</span>
              <button className={ACTION} onClick={() => musicLibrary.queueTrack(song)}
                aria-label={'Queue ' + song.title}><Plus size={14}/></button>
              <button className={ACTION} onClick={() => { musicLibrary.playNow(song); onPlayTrack(song); }}
                aria-label={'Play preview ' + song.title}><Play size={14}/></button>
            </div>)}
          </section>}
        </>}
        {tab === 'favorites' && <>
          <h3 className="text-sm font-semibold">Favorites · {state.favorites.length}</h3>
          {!state.favorites.length && <p className="text-xs text-white/45">Tap Favorite while a song is playing to save it here.</p>}
          {state.favorites.map(song => <SongRow key={song.id} track={song} onPlay={() => attemptPlay(song)}
            actions={<button className={ACTION} aria-label={'Remove favorite ' + song.title}
              onClick={() => musicLibrary.toggleFavorite(song)}><Heart size={14} fill="currentColor"/></button>} />)}
        </>}
        {tab === 'playlists' && <>
          <h3 className="text-sm font-semibold">Playlists · {state.playlists.length}</h3>
          <form className="flex gap-2" onSubmit={e => {
            e.preventDefault();
            const id = musicLibrary.createPlaylist(playlistName);
            if (id) { setSelectedList(id); setPlaylistName(''); notify('Playlist created.'); }
            else notify('Enter a playlist name (or remove an old playlist first).');
          }}>
            <input aria-label="New playlist name" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              maxLength={120} placeholder="New playlist name" value={playlistName} onChange={e => setPlaylistName(e.target.value)}/>
            <button className={ACTION} type="submit"><Plus size={14} className="inline" /> Create</button>
          </form>
          <div className="space-y-2">{state.playlists.map(item => <button key={item.id}
            onClick={() => setSelectedList(item.id)} className={'flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm ' +
              (selectedList === item.id ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-white/5')}>
            <ListMusic size={16} className="text-emerald-300" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-xs text-white/45">{item.tracks.length} tracks</span>
          </button>)}</div>
          {selected && <section className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="min-w-0 truncate text-sm font-semibold">{selected.name}</h4>
              <button className={ACTION} aria-label={'Delete playlist ' + selected.name}
                onClick={() => { if (window.confirm('Delete playlist "' + selected.name + '"? Songs and favorites will remain in your library.')) { musicLibrary.deletePlaylist(selected.id); setSelectedList(''); } }}>
                <Trash2 size={14} />
              </button>
            </div>
            {playing && <button className={ACTION} onClick={() => musicLibrary.addToPlaylist(selected.id, playing)}>
              <Plus size={14} className="inline" /> Add now playing
            </button>}
            {selected.tracks.map(track => <SongRow key={track.id} track={track} onPlay={() => attemptPlay(track)}
              actions={<button className={ACTION} aria-label={'Remove ' + track.title + ' from playlist'}
                onClick={() => musicLibrary.removeFromPlaylist(selected.id, track.id)}><X size={13}/></button>}/>)}
            {!selected.tracks.length && <p className="text-xs text-white/40">Add your current song to this playlist.</p>}
          </section>}
        </>}
        {tab === 'history' && <>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><History size={16}/> Recently played</h3>
          {!state.recent.length && <p className="text-xs text-white/40">Play a preview or a local file to see it here.</p>}
          {state.recent.map(track => <SongRow key={track.id} track={track} onPlay={() => attemptPlay(track)}/>)}
        </>}
        {tab === 'backup' && <div className="space-y-4">
          <h3 className="text-sm font-semibold">Private library backup</h3>
          <p className="text-sm leading-relaxed text-white/60">
            Export playlists, favorites, queue and metadata as a versioned JSON file. Your audio files, Spotify account,
            OAuth tokens and copyrighted lyrics are never exported.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={ACTION} onClick={doExport}><Download size={15} className="inline" /> Export JSON</button>
            <button className={ACTION} onClick={() => input.current?.click()}><Upload size={15} className="inline" /> Import & merge</button>
          </div>
          <input ref={input} className="hidden" aria-label="Library backup JSON" type="file"
            accept=".json,application/json" onChange={e => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-xs text-emerald-100/75">
            <Save size={16} className="shrink-0" />Changes are saved automatically on this device. Import merges by ID without overwriting existing playlists.
          </div>
        </div>}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-white/10 px-4 py-3 text-[11px] text-white/45">
        <span className="flex items-center gap-1"><Check size={13} className="text-emerald-300"/> Saved locally</span>
        <span>Preview availability depends on the source</span>
      </footer>
    </aside>
  </div>;
}
