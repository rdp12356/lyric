import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Heart, ArrowLeft, ListMusic } from 'lucide-react';
import {
  spotifyProfile, spotifyPlaylists, spotifyPlaylistTracks,
  type SpotifyProfile, type SpotifyPlaylist, type SpotifyCatalogTrack
} from '../services/spotifyCatalog';
import { libraryStore, useLibrary } from '../services/libraryStore';
import type { Track } from '../types';

interface Props { open: boolean; onClose(): void; }
const button = 'rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20 disabled:opacity-40';
function message(error: unknown) { return error instanceof Error ? error.message : 'Spotify library is temporarily unavailable.'; }
function SpotifyCatalogPanelComponent({ open, onClose }: Props) {
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selected, setSelected] = useState<SpotifyPlaylist | null>(null);
  const [songs, setSongs] = useState<SpotifyCatalogTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [nextSongsPage, setNextSongsPage] = useState<number | null>(null);
  const library = useLibrary();
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setLoading(true); setError(''); setSelected(null); setSongs([]);
    void Promise.all([
      spotifyProfile(abort.signal),
      spotifyPlaylists(0, abort.signal)
    ]).then(([user, page]) => {
      if (abort.signal.aborted) return;
      setProfile(user); setPlaylists(page.items); setNextPage(page.nextOffset);
    }).catch(problem => { if (!abort.signal.aborted) setError(message(problem)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { abort.abort(); document.removeEventListener('keydown', key); };
  }, [open, onClose]);
  if (!open) return null;
  const loadPlaylist = async (playlist: SpotifyPlaylist) => {
    setSelected(playlist); setSongs([]); setNextSongsPage(null);
    setLoading(true); setError('');
    try {
      const page = await spotifyPlaylistTracks(playlist.id);
      setSongs(page.items); setNextSongsPage(page.nextOffset);
    } catch (problem) { setError(message(problem)); }
    finally { setLoading(false); }
  };
  const morePlaylists = async () => {
    if (nextPage === null) return;
    setLoading(true);
    try {
      const page = await spotifyPlaylists(nextPage);
      setPlaylists(rows => [...rows, ...page.items]); setNextPage(page.nextOffset);
    } catch (problem) { setError(message(problem)); }
    finally { setLoading(false); }
  };
  const moreSongs = async () => {
    if (!selected || nextSongsPage === null) return;
    setLoading(true);
    try {
      const page = await spotifyPlaylistTracks(selected.id, nextSongsPage);
      setSongs(rows => [...rows, ...page.items]); setNextSongsPage(page.nextOffset);
    } catch (problem) { setError(message(problem)); }
    finally { setLoading(false); }
  };
  const toggleFavorite = (song: SpotifyCatalogTrack) => {
    const id = 'spotify:spotify:track:' + song.id;
    const track: Track = {
      id, title: song.name, artist: song.artist,
      album: song.album, albumArt: song.artwork, duration: song.duration,
      position: 0, isPlaying: false, source: 'spotify-web'
    };
    libraryStore.register(track);
    libraryStore.favorite(id);
  };
  return <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
    onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Spotify playlists"
      className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#141a22] text-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Spotify library</h2>
          <p className="truncate text-xs text-white/50">Read-only browsing · Spotify playback stays in Spotify</p>
        </div>
        <button className={button} aria-label="Close Spotify library" onClick={onClose}><X size={17}/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {profile && !selected && <div className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
          {profile.avatar && <img src={profile.avatar} alt="" className="h-12 w-12 object-contain" />}
          <div><p className="text-sm font-semibold">{profile.displayName}</p>
            <p className="text-xs text-white/50">Connected Spotify account</p></div>
        </div>}
        {selected && <div className="flex items-center justify-between">
          <button className={button} onClick={() => setSelected(null)}>
            <ArrowLeft size={14} className="mr-2 inline"/> All playlists</button>
          <a href={selected.url} target="_blank" rel="noopener noreferrer"
            className={button}>Open in Spotify <ExternalLink size={13} className="ml-1 inline"/></a>
        </div>}
        {error && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>}
        {loading && <p role="status" className="animate-pulse p-3 text-center text-xs text-white/50">Loading Spotify metadata…</p>}
        {!selected ? <>
          {playlists.map(playlist => <button key={playlist.id}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 p-3 text-left transition hover:bg-white/10"
            onClick={() => void loadPlaylist(playlist)}>
            {playlist.artwork ? <img loading="lazy" src={playlist.artwork} alt="" className="h-14 w-14 shrink-0 object-contain" /> :
              <ListMusic className="h-12 w-12 shrink-0 text-white/30"/>}
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{playlist.name}</p>
              <p className="text-xs text-white/50">{playlist.itemCount} items · Spotify</p></div>
          </button>)}
          {nextPage !== null && <button className={button} disabled={loading} onClick={() => void morePlaylists()}>Load more playlists</button>}
        </> : <>
          <h3 className="text-base font-semibold">{selected.name}</h3>
          <p className="text-xs text-white/45">Only playlist owners and collaborators may read items via this Spotify API. Save favorites as metadata; no streaming or downloads.</p>
          {songs.map(song => {
            const favoriteId = 'spotify:spotify:track:' + song.id;
            const saved = library.favorites.includes(favoriteId);
            return <div key={song.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-2.5">
              {song.artwork && <img loading="lazy" src={song.artwork} alt="" className="h-12 w-12 shrink-0 object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{song.name}</p>
                <p className="truncate text-xs text-white/50">{song.artist} · {song.album}</p>
              </div>
              <button className={button} onClick={() => toggleFavorite(song)}
                aria-label={saved ? 'Remove ' + song.name + ' favorite' : 'Save ' + song.name + ' favorite'}>
                <Heart size={15} fill={saved ? 'currentColor' : 'none'}/>
              </button>
              <a className={button} href={song.url} target="_blank" rel="noopener noreferrer"
                aria-label={'Open ' + song.name + ' on Spotify'}><ExternalLink size={15}/></a>
            </div>;
          })}
          {nextSongsPage !== null && <button className={button} disabled={loading} onClick={() => void moreSongs()}>Load more tracks</button>}
          {!loading && !songs.length && !error && <p className="text-sm text-white/50">No accessible tracks in this playlist.</p>}
        </>}
        <p className="pt-2 text-center text-[11px] text-white/40">
          Track and playlist information supplied by Spotify. Open links in Spotify to listen.
        </p>
      </div>
    </section>
  </div>;
}

// Playing time changes should not rebuild the modal's playlist rows.
export const SpotifyCatalogPanel = React.memo(SpotifyCatalogPanelComponent);
