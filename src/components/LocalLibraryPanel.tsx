import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../types';
import { libraryStore, useLibrary } from '../services/libraryStore';
import { Download, Upload, Heart, ListMusic, History, ListPlus, Shuffle, Repeat, Repeat1, X, ArrowUp, ArrowDown, Play, MinusCircle, Search, Check } from 'lucide-react';

type Section = 'queue' | 'favorites' | 'playlists' | 'history' | 'backup';
interface Props {
  open: boolean;
  onClose(): void;
  onPlay(track: Track): void;
  nowPlayingId?: string;
}
const button = 'rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20 disabled:opacity-35';
const inputClass = 'w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400';
const headings: { id: Section; label: string }[] = [
  { id: 'queue', label: 'Queue' }, { id: 'favorites', label: 'Favorites' },
  { id: 'playlists', label: 'Playlists' }, { id: 'history', label: 'History' },
  { id: 'backup', label: 'Backup' }
];
export function LocalLibraryPanel({ open, onClose, onPlay, nowPlayingId }: Props) {
  const library = useLibrary();
  const [section, setSection] = useState<Section>('queue');
  const [newPlaylist, setNewPlaylist] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const tracks = useMemo(() => new Map(library.catalog.map(track => [track.id, track])), [library.catalog]);
  const activePlaylist = library.playlists.find(playlist => playlist.id === selectedPlaylist);
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [open, onClose]);
  if (!open) return null;

  const play = (id: string) => {
    const playable = libraryStore.getPlayable(id);
    if (!playable || !playable.audioUrl) {
      setNotice('This is saved metadata, not an offline audio download. Reopen the original local file or search for a licensed preview.');
      return;
    }
    libraryStore.play(playable);
    onPlay(playable);
    setNotice('Playing in Lyric.');
  };
  const restore = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice('Backup is larger than 2 MB.'); return; }
    try {
      const state = libraryStore.import(await file.text());
      setNotice('Backup merged: ' + state.playlists.length + ' playlists, ' + state.favorites.length + ' favorites. Existing items were retained.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import backup.');
    }
  };
  const exportNow = () => {
    const blob = new Blob([libraryStore.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Lyric-library-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(anchor);
    anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Backup created locally. It contains metadata and playlists, never passwords, Spotify tokens or audio files.');
  };
  const renderTracks = (ids: string[], canReorder = false, allowRemove = false) => {
    const list = ids.filter(id => tracks.has(id) && (
      !query || (tracks.get(id)!.title + ' ' + tracks.get(id)!.artist).toLowerCase().includes(query.toLowerCase())
    ));
    return list.length ? list.map(id => {
      const track = tracks.get(id)!;
      const available = !!libraryStore.getPlayable(id)?.audioUrl;
      return <div key={id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
        {track.albumArt ? <img loading="lazy" src={track.albumArt} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> :
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10"><ListMusic size={17}/></div>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{track.title}</p>
          <p className="truncate text-[11px] text-white/50">{track.artist} · {track.album || 'Music'}{!available ? ' · metadata only' : ''}</p>
        </div>
        <button title="Toggle favorite" aria-label={'Favorite ' + track.title} className={button}
          onClick={() => libraryStore.favorite(id)}><Heart size={14}
            fill={library.favorites.includes(id) ? 'currentColor' : 'none'} /></button>
        <button title="Play track" aria-label={'Play ' + track.title} className={button} onClick={() => play(id)}
          disabled={!available}><Play size={14}/></button>
        {canReorder && <>
          <button className={button} aria-label={'Move ' + track.title + ' up'} onClick={() => libraryStore.moveQueue(id, -1)}><ArrowUp size={13}/></button>
          <button className={button} aria-label={'Move ' + track.title + ' down'} onClick={() => libraryStore.moveQueue(id, 1)}><ArrowDown size={13}/></button>
        </>}
        {allowRemove && <button className={button} title="Remove" aria-label={'Remove ' + track.title}
          onClick={() => selectedPlaylist ? libraryStore.removeFromPlaylist(selectedPlaylist, id) : libraryStore.dequeue(id)}>
          <MinusCircle size={14}/>
        </button>}
      </div>;
    }) : <div className="rounded-xl border border-dashed border-white/15 p-7 text-center text-xs text-white/45">No tracks in this section yet.</div>;
  };

  return <div role="presentation" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Your music library"
      className="flex max-h-[93dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#151921] text-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 p-4 sm:p-6">
        <div><h2 className="text-xl font-bold">Your Lyric library</h2>
          <p className="text-xs text-white/50">Personal playlists, saved songs and queue — stored on this device</p></div>
        <button className={button} onClick={onClose} aria-label="Close library"><X size={18}/></button>
      </header>
      <div role="tablist" aria-label="Library sections" className="flex gap-1 overflow-x-auto border-b border-white/10 p-3">
        {headings.map(tab => <button key={tab.id} role="tab" aria-selected={section === tab.id}
          className={button + (section === tab.id ? ' !bg-white/25' : '')}
          onClick={() => { setSection(tab.id); setQuery(''); }}>{tab.label}</button>)}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
        {(section === 'queue' || section === 'favorites' || section === 'history' || section === 'playlists') && (
          <div className="flex gap-2"><Search size={17} className="mt-3 text-white/50" />
            <input className={inputClass} placeholder="Filter this library section" value={query} onChange={event => setQuery(event.target.value)} /></div>
        )}
        {section === 'queue' && <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/50">Queue order applies to local files and authorized previews, not Spotify's external queue.</p>
            <div className="flex gap-2">
              <button className={button} aria-pressed={library.shuffle} onClick={() => libraryStore.setShuffle(!library.shuffle)}>
                <Shuffle className="mr-1 inline" size={14}/> Shuffle {library.shuffle ? 'On' : 'Off'}</button>
              <button className={button} onClick={() => libraryStore.setRepeat(
                library.repeat === 'off' ? 'all' : library.repeat === 'all' ? 'one' : 'off')}>
                {library.repeat === 'one' ? <Repeat1 className="mr-1 inline" size={14}/> : <Repeat className="mr-1 inline" size={14}/>}
                Repeat {library.repeat}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-3 text-xs text-white/70">Local player volume
            <input aria-label="Local player volume" type="range" min="0" max="100" step="1"
              value={Math.round(library.volume * 100)}
              onChange={event => libraryStore.setVolume(Number(event.target.value) / 100)}/>
            {Math.round(library.volume * 100)}%
          </label>
          {renderTracks(library.queue, true, true)}
        </>}
        {section === 'favorites' && <>
          {nowPlayingId && tracks.has(nowPlayingId) && <button className={button}
            onClick={() => libraryStore.favorite(nowPlayingId)}>
            <Heart size={14} className="inline mr-2"/> {library.favorites.includes(nowPlayingId) ? 'Remove current favorite' : 'Favorite current song'}
          </button>}
          {renderTracks(library.favorites)}
        </>}
        {section === 'history' && <>
          <p className="text-xs text-white/50">Latest 100 distinct tracks selected in this player. No listening history is uploaded.</p>
          {renderTracks(library.history.map(entry => entry.trackId))}
        </>}
        {section === 'playlists' && <>
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); libraryStore.createPlaylist(newPlaylist); setNewPlaylist(''); }}>
            <input className={inputClass} aria-label="New playlist name" placeholder="New playlist name" maxLength={80}
              value={newPlaylist} onChange={event => setNewPlaylist(event.target.value)} />
            <button className={button} disabled={!newPlaylist.trim()}><ListPlus size={15} className="inline mr-1"/> Create</button>
          </form>
          <div className="flex flex-wrap gap-2">{library.playlists.map(p => <button key={p.id} className={button + (selectedPlaylist === p.id ? ' !bg-white/25' : '')}
            onClick={() => setSelectedPlaylist(p.id)}>{p.name} ({p.trackIds.length})</button>)}</div>
          {activePlaylist && <>
            <p className="text-xs text-white/50">Playlist: {activePlaylist.name}</p>
            {nowPlayingId && tracks.has(nowPlayingId) && <button className={button}
              onClick={() => libraryStore.addToPlaylist(activePlaylist.id, nowPlayingId)}>
              <ListPlus className="inline mr-2" size={14}/> Add current song</button>}
            {renderTracks(activePlaylist.trackIds, false, true)}
          </>}
          {!library.playlists.length && <p className="text-xs text-white/45">Create your first playlist to organize local tracks, previews and song metadata.</p>}
        </>}
        {section === 'backup' && <>
          <p className="text-sm text-white/70">Export all playlists, favorites, queue and history as a versioned JSON backup. Spotify credentials and copyrighted audio are never included.</p>
          <div className="flex flex-wrap gap-3">
            <button className={button} onClick={exportNow}><Download size={15} className="inline mr-2"/> Export backup</button>
            <button className={button} onClick={() => fileInput.current?.click()}><Upload size={15} className="inline mr-2"/> Import and merge</button>
            <input type="file" ref={fileInput} accept=".json,application/json" className="hidden"
              aria-label="Library backup file" onChange={event => { void restore(event.target.files?.[0]); event.target.value = ''; }}/>
          </div>
          <p className="text-xs text-white/50">Import is non-destructive: existing lists are merged, not overwritten. Backups restore metadata; local audio files must be reselected after a browser restart.</p>
        </>}
        {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">
          <Check className="shrink-0" size={16}/>{notice}</p>}
      </div>
    </section>
  </div>;
}
