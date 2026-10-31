import React, { useState } from 'react';
import { Track } from '../types';
import { searchTracksOnline } from '../services/audioManager';
import { Search, Music, Sparkles, X, Play } from 'lucide-react';

interface TrackSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: Track) => void;
  previewsOnly?: boolean;
}

export const TrackSearchModal: React.FC<TrackSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectTrack,
  previewsOnly = false
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const tracks = await searchTracksOnline(query);
      setResults(tracks);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (track: Track) => {
    onSelectTrack(track);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-xl max-h-[80vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-white/15">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-bold text-white">{previewsOnly ? 'Search song previews' : 'Search Music & Synced Lyrics'}</h2>
          </div>
          <button
            aria-label="Close search"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input form */}
        <div className="p-4 border-b border-white/10 bg-black/30">
          <form onSubmit={handleSearch} className="relative flex items-center">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by song name, artist, or album..."
              className="w-full bg-white/10 border border-white/15 rounded-2xl pl-10 pr-24 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-cyan-400/80 transition"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-1.5 px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black text-xs font-bold transition shadow-sm"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/50">
              <Sparkles className="w-6 h-6 animate-spin text-cyan-400 mb-2" />
              <p className="text-xs">Searching global catalog and LRCLIB...</p>
            </div>
          ) : results.length > 0 ? (
            results.map((track) => (
              <div
                key={track.id}
                onClick={() => handleSelect(track)}
                className="group flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 cursor-pointer transition border border-transparent hover:border-white/10"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md">
                    <img
                      src={track.albumArt}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Play className="w-4 h-4 fill-white text-white" />
                    </div>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-semibold text-white truncate group-hover:text-cyan-300 transition">
                      {track.title}
                    </h4>
                    <p className="text-xs text-white/60 truncate">
                      {track.artist} • <span className="text-white/40">{track.album}</span>
                    </p>
                  </div>
                </div>

                <button className="px-3 py-1.5 rounded-xl text-xs font-medium glass-button text-white/80 group-hover:text-white shrink-0">
                  {previewsOnly ? 'Play preview' : 'Play & Sync'}
                </button>
              </div>
            ))
          ) : hasSearched ? (
            <div className="text-center py-12 text-white/40 text-xs">
              No results found for "{query}". Try a different spelling.
            </div>
          ) : (
            <div className="text-center py-12 text-white/40 text-xs">
              {previewsOnly ? 'Search short audio previews. For full-song lyric sync, open a local file or connect your music player.' : 'Type a song or artist name above to find any track with synced lyrics!'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
