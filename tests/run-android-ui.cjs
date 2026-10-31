const { spawnSync } = require('node:child_process');
const tests = [
  'tests/sync-audio.cjs',
  'tests/android-smoke.cjs',
  'tests/android-media-smoke.cjs',
  'tests/spotify-reconnect-smoke.cjs',
  'tests/spotify-event-sync-smoke.cjs',
  'tests/android-ux-smoke.cjs',
];
for (const test of tests) {
  console.log('\n=== RUN ' + test + ' ===');
  const result = spawnSync(process.execPath, [test], {
    stdio: 'inherit', timeout: 60000, killSignal: 'SIGTERM',
    windowsHide: true, env: process.env
  });
  if (result.error || result.status !== 0) {
    console.error('FAIL ' + test + ': ' + (result.error?.message || 'exit code ' + result.status));
    process.exit(1);
  }
  console.log('=== PASS ' + test + ' ===');
}
console.log('PASS: all Android UI and Spotify synchronization regressions.');
