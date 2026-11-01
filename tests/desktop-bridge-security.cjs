const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const PORT = 4898;
const origin = 'http://127.0.0.1:' + PORT;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(), stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT) }
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const response = await fetch(origin + '/api/health');
        if (response.ok) { ready = true; break; }
      } catch { await sleep(100); }
    }
    assert(ready, 'Desktop bridge did not start');
    let response = await fetch(origin + '/api/health', {
      headers: { Origin: 'https://attacker.example' }
    });
    assert.equal(response.status, 403, 'Untrusted cross-origin pages cannot control localhost');
    response = await fetch(origin + '/api/health', {
      headers: { Origin: 'https://rdp12356.github.io' }
    });
    assert.equal(response.status, 200, 'Owned web origin is allowed');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://rdp12356.github.io');
    response = await fetch(origin + '/api/player/seek', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetApp: 'Spotify', position: '12; malicious command'
      })
    });
    assert.equal(response.status, 400, 'Seek injection must be rejected');
    response = await fetch(origin + '/api/player/next', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetApp: 'Unknown' })
    });
    assert.equal(response.status, 400, 'Unsupported target cannot trigger local media commands');
    console.log('PASS: local bridge origin restrictions, JSON validation and seek injection rejection.');
  } finally {
    child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); child.kill('SIGTERM'); process.exit(1); });
