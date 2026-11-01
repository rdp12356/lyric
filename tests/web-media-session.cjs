const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, file);
class MediaMetadata { constructor(value) { Object.assign(this, value); } }
global.MediaMetadata = MediaMetadata;
const actions = new Map();
let playbackState = 'none', metadata = null, position = null;
const session = {
  setActionHandler(action, handler) { actions.set(action, handler); },
  setPositionState(value) { position = value; },
  get metadata() { return metadata; }, set metadata(value) { metadata = value; },
  get playbackState() { return playbackState; }, set playbackState(value) { playbackState = value; }
};
Object.defineProperty(global, 'navigator', {
  configurable: true, value: { mediaSession: session }
});
const { setLyricMediaMetadata, setLyricMediaPosition, attachLyricMediaControls } =
  require(path.resolve('src/services/webMediaSession.ts'));
const local = {
  id: 'preview-1', title: 'Original Preview', artist: 'Original Artist',
  album: 'Original Album', albumArt: 'https://images.example.com/cover.jpg',
  duration: 160, source: 'demo'
};
setLyricMediaMetadata(local, true);
assert.equal(session.metadata.title, local.title);
assert.equal(session.metadata.artist, local.artist);
assert.equal(session.playbackState, 'playing');
setLyricMediaPosition(170, 160, true);
assert.equal(position.position, 160, 'Position is bounded by duration');
const called = [];
const detach = attachLyricMediaControls(() => ({
  playPause: () => called.push('toggle'),
  next: () => called.push('next'),
  previous: () => called.push('prev'),
  seek: seconds => called.push('seek:' + seconds)
}));
actions.get('play')();
actions.get('pause')();
actions.get('nexttrack')();
actions.get('previoustrack')();
actions.get('seekto')({ seekTime: 30 });
actions.get('seekto')({ seekTime: undefined });
assert.deepEqual(called, ['toggle','toggle','next','prev','seek:30']);
setLyricMediaMetadata({ ...local, source: 'spotify-web' }, true);
assert.equal(session.metadata, null, 'Spotify external playback is not claimed by Lyric');
assert.equal(session.playbackState, 'none');
detach();
assert.equal(actions.get('play'), null, 'Media actions are cleaned up');
console.log('PASS: browser headset/media keys, valid positions and no Spotify metadata hijacking.');
