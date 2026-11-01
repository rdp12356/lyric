const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText, filename
);
const {
  initialLibrary, registerTrack, queueTrack, removeQueueTrack, reorderQueue, nextTrackId,
  markPlayed, toggleFavorite, addPlaylist, addToPlaylist,
  exportLibrary, normalizeLibrary, mergeLibraryBackup
} = require(path.resolve('src/services/libraryModel.ts'));
const track = (id, source = 'demo') => ({
  id, title: 'Song ' + id, artist: 'Artist', album: 'Album', duration: 180,
  albumArt: 'https://i.scdn.co/test.jpg', source, audioUrl: 'blob:https://secret.example/123',
  refreshToken: 'NEVER_EXPORT_THIS'
});
let state = initialLibrary([track('one'), track('two'), track('three')]);
assert.deepEqual(state.queue, ['one', 'two', 'three']);
assert.equal(nextTrackId(state, 'one'), 'two');
assert.equal(nextTrackId(state, 'three'), null, 'Off repeat must not silently wrap');
state = { ...state, repeat: 'all' };
assert.equal(nextTrackId(state, 'three'), 'one');
state = { ...state, repeat: 'one' };
assert.equal(nextTrackId(state, 'two', 1, true), 'two', 'Auto-ended repeat-one should replay current');
assert.equal(nextTrackId(state, 'two', 1, false), 'three', 'Manual skip must not be blocked by repeat-one');
state = { ...state, shuffle: true };
assert.equal(nextTrackId(state, 'one', 1, false, () => 0), 'two');
assert.equal(nextTrackId(state, 'one', 1, false, () => 0.999), 'three');
state = reorderQueue(state, 'one', 1);
assert.deepEqual(state.queue, ['two', 'one', 'three']);
state = removeQueueTrack(state, 'one');
assert.deepEqual(state.queue, ['two', 'three']);
state = queueTrack(state, 'one');
state = queueTrack(state, 'one');
assert.deepEqual(state.queue, ['two', 'three', 'one'], 'Queue cannot duplicate same track');
state = markPlayed(state, 'two', 1234);
assert.equal(state.history[0].trackId, 'two');
state = markPlayed(state, 'two', 4567);
assert.equal(state.history.length, 1);
state = toggleFavorite(state, 'two');
assert.deepEqual(state.favorites, ['two']);
state = toggleFavorite(state, 'two');
assert.deepEqual(state.favorites, []);
state = addPlaylist(state, 'Road Trip', 'playlist1', 10);
state = addToPlaylist(state, 'playlist1', 'one');
state = addToPlaylist(state, 'playlist1', 'one');
assert.deepEqual(state.playlists[0].trackIds, ['one']);
state = registerTrack(state, track('four', 'local-file'));
assert(state.catalog.some(item => item.id === 'four'));
const backup = exportLibrary(state);
const parsed = JSON.parse(backup);
assert.equal(parsed.app, 'Lyric');
assert.equal(parsed.version, 1);
assert(!backup.includes('blob:'), 'Audio blob links must not enter backups');
assert(!backup.includes('NEVER_EXPORT_THIS'), 'Unrecognized credentials must never enter backups');
assert(!backup.includes('refreshToken'));
let destination = initialLibrary([track('five')]);
destination = addPlaylist(destination, 'Road Trip', 'playlist1', 10);
destination = addToPlaylist(destination, 'playlist1', 'five');
const before = JSON.stringify(destination);
const restored = mergeLibraryBackup(destination, backup);
assert.equal(JSON.stringify(destination), before, 'Import may not mutate current state');
assert(restored.catalog.some(item => item.id === 'four'));
assert.deepEqual(restored.playlists[0].trackIds, ['five', 'one']);
assert(restored.queue.includes('one'));
assert(restored.queue.includes('five'));
assert.throws(() => mergeLibraryBackup(destination, JSON.stringify({ app: 'Lyric', version: 999, library: state })), /supported/);
assert.throws(() => mergeLibraryBackup(destination, JSON.stringify({ app: 'Wrong', version: 1, library: state })), /supported/);
assert.throws(() => mergeLibraryBackup(destination, '{ invalid'), /JSON/);
assert.throws(() => mergeLibraryBackup(destination, 'a'.repeat(2200000)), /too large/);
const injected = normalizeLibrary({ schemaVersion: 1,
  catalog: [{ ...track('safe'), albumArt: 'javascript:alert(1)' }, track('safe'), { title: 'no id' }],
  favorites: ['safe', 'safe', 'unknown'], queue: ['safe', 'unknown'], currentId: 'unknown',
  playlists: [], history: [], volume: 999 });
assert.equal(injected.catalog.length, 1);
assert.equal(injected.catalog[0].albumArt, '');
assert.equal(injected.volume, 1);
assert.deepEqual(injected.favorites, ['safe']);
console.log('PASS: queue, repeat/shuffle, playlist/history, immutable merge, strict backup schema and safe metadata.');
