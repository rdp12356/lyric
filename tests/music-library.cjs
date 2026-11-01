const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText, file
);
function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}
global.localStorage = storage();
const { MusicLibraryStore, sanitizeTrack, playbackTrack, canPlaySavedTrack } =
  require(path.resolve('src/services/musicLibrary.ts'));
const sample = (i, source = 'demo') => ({
  id: 'demo-' + i,
  title: 'Song ' + i,
  artist: 'Artist ' + i, album: 'Sample Album', albumArt: 'https://example.com/art.jpg',
  duration: 150 + i, position: 10, isPlaying: false, source,
  audioUrl: 'https://audio-ssl.itunes.apple.com/previews/' + i + '.m4a'
});
const a = sample(1), b = sample(2), c = sample(3);
const bad = sanitizeTrack({
  ...a, albumArt: 'javascript:alert(1)', audioUrl: 'blob:https://local/secret'
});
assert.equal(bad.albumArt, '');
assert.equal(bad.audioUrl, undefined);
assert.equal(canPlaySavedTrack(bad), true, 'built-in demo preview can be resolved by ID');
const local = sanitizeTrack({ ...a, id: 'local-blob', source: 'local-file', audioUrl: 'blob:secret' });
assert.equal(local.audioUrl, undefined);
assert.equal(canPlaySavedTrack(local), false);
const external = sanitizeTrack({ ...a, id: 'spotify:track:one', source: 'spotify-web' });
assert.equal(canPlaySavedTrack(external), false);
assert.equal(playbackTrack(sanitizeTrack(a)).isPlaying, false);

const library = new MusicLibraryStore(undefined, () => 0);
let notifications = 0;
const unsubscribe = library.subscribe(() => notifications++);
assert.equal(library.queueTrack(a), true);
library.queueTrack(a);
library.queueTrack(b);
library.queueTrack(c);
assert.deepEqual(library.getSnapshot().queue.map(t => t.id), ['demo-1', 'demo-2', 'demo-3']);
library.playNow(a);
assert.equal(library.getSnapshot().currentId, 'demo-1');
assert.equal(library.nextTrack().id, 'demo-2');
assert.equal(library.nextTrack().id, 'demo-3');
assert.equal(library.nextTrack(), null, 'No wrapping with repeat=off');
library.setRepeat('all');
assert.equal(library.nextTrack().id, 'demo-1');
library.setRepeat('one');
assert.equal(library.nextTrack(true).id, 'demo-1', 'repeat one stays on current at track end');
assert.equal(library.nextTrack(false).id, 'demo-2', 'Manual next advances even with repeat one');
library.setRepeat('off');
library.setShuffle(true);
library.playNow(a);
assert.equal(library.nextTrack().id, 'demo-3', 'Shuffle excludes songs already played in this cycle');
assert.equal(library.nextTrack(), null, 'Shuffle off-repeat ends when queue exhausted');
library.setShuffle(false);
library.reorderQueue(2, 0);
assert.deepEqual(library.getSnapshot().queue.map(t => t.id), ['demo-3', 'demo-1', 'demo-2']);
library.removeFromQueue('demo-1');
assert(!library.getSnapshot().queue.some(t => t.id === 'demo-1'));

library.toggleFavorite(a);
library.toggleFavorite(a);
assert.equal(library.getSnapshot().favorites.length, 0);
library.toggleFavorite(b);
const playlistId = library.createPlaylist('Roadtrip');
assert(playlistId);
library.addToPlaylist(playlistId, b);
library.addToPlaylist(playlistId, b);
library.addToPlaylist(playlistId, c);
assert.equal(library.getSnapshot().playlists[0].tracks.length, 2);
library.renamePlaylist(playlistId, 'Evening Drive');
assert.equal(library.getSnapshot().playlists[0].name, 'Evening Drive');
library.removeFromPlaylist(playlistId, b.id);
assert.equal(library.getSnapshot().playlists[0].tracks[0].id, c.id);
library.addToPlaylist(playlistId, b);

const backup = library.exportBackup();
const document = JSON.parse(backup);
assert.equal(document.schema, 'lyric.music-library');
assert.equal(document.version, 1);
assert.equal(document.library.favorites[0].id, 'demo-2');
assert(!backup.includes('access_token') && !backup.includes('refresh_token'));
assert(!backup.includes('blob:'));
const restored = new MusicLibraryStore();
assert.equal(restored.getSnapshot().playlists[0].name, 'Evening Drive', 'Reload persists playlists');
assert.equal(restored.getSnapshot().repeat, 'off', 'Repeat persists');
assert.equal(restored.getSnapshot().queue.length, 2, 'Queue persists');
assert.throws(() => restored.restoreBackup('{"schema":"unknown"}'), /Unsupported/);
assert.throws(() => restored.restoreBackup('not json'), /valid JSON/);
restored.restoreBackup(backup, true);
assert.equal(restored.getSnapshot().playlists.length, 1, 'Merging same backup deduplicates playlists');
assert.equal(restored.getSnapshot().playlists[0].tracks.length, 2, 'Merging deduplicates playlist tracks');
restored.deletePlaylist(playlistId);
assert.equal(restored.getSnapshot().playlists.length, 0);
restored.restoreBackup(backup, false);
assert.equal(restored.getSnapshot().playlists.length, 1, 'Replace mode honors backup data');
assert(notifications > 10, 'Subscribers get updates');
unsubscribe();
console.log('PASS: secure metadata, queue ordering, next/prev, shuffle/repeat, favorites, playlists, persistence and versioned backups.');
