import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 4892;

// Browser requests may originate from our own web app, not arbitrary pages
// issuing commands to the user's localhost playback service.
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4892',
  'http://127.0.0.1:4892',
  'https://rdp12356.github.io',
  ...String(process.env.LYRIC_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origin is not allowed for local companion control.' });
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '16kb' }));

const isMac = os.platform() === 'darwin';
const isWin = os.platform() === 'win32';

// Execute AppleScript safely with timeout (macOS)
function runAppleScript(script, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    if (!isMac) {
      return reject(new Error('AppleScript is only available on macOS'));
    }

    const command = `osascript -e '${script.replace(/'/g, "'\\''")}'`;
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          return reject(new Error('AppleScript timed out'));
        }
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout.trim());
    });
  });
}

// Execute PowerShell command safely with timeout (Windows)
function runPowerShell(cmd, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    if (!isWin) {
      return reject(new Error('PowerShell is only available on Windows'));
    }
    const escaped = cmd.replace(/"/g, '\\"');
    const command = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${escaped}"`;
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          return reject(new Error('PowerShell timed out'));
        }
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout.trim());
    });
  });
}

// Check which music players are running
async function getRunningMusicApps() {
  if (isMac) {
    const script = `
      tell application "System Events"
        set isSpotify to (exists (processes where name is "Spotify"))
        set isMusic to (exists (processes where name is "Music"))
      end tell
      return (isSpotify as string) & "<|>" & (isMusic as string)
    `;
    try {
      const res = await runAppleScript(script, 1500);
      const [spotify, music] = res.split('<|>').map(s => s.trim() === 'true');
      return { spotify, music };
    } catch (e) {
      return { spotify: false, music: false };
    }
  } else if (isWin) {
    try {
      const ps = `
        $s = (Get-Process -Name spotify -ErrorAction SilentlyContinue) -ne $null
        $m = (Get-Process -Name "AppleMusic" -ErrorAction SilentlyContinue) -ne $null
        Write-Output "$s<|>$m"
      `;
      const res = await runPowerShell(ps, 1500);
      const [spotify, music] = res.split('<|>').map(s => s.trim().toLowerCase() === 'true');
      return { spotify, music };
    } catch (e) {
      return { spotify: false, music: false };
    }
  }
  return { spotify: false, music: false };
}

// Query Spotify
async function getSpotifyState() {
  if (isMac) {
    const script = `
      tell application "Spotify"
        set pState to player state as string
        if pState is "stopped" then
          return "stopped<|>none<|>none<|>none<|>0<|>0<|>"
        end if
        set tName to name of current track
        set tArtist to artist of current track
        set tAlbum to album of current track
        set tPos to player position
        set tDur to (duration of current track) / 1000
        set tArt to artwork url of current track
        return pState & "<|>" & tName & "<|>" & tArtist & "<|>" & tAlbum & "<|>" & (tPos as string) & "<|>" & (tDur as string) & "<|>" & tArt
      end tell
    `;
    const t0 = Date.now();
    const res = await runAppleScript(script, 2000);
    const latencyMs = Date.now() - t0;
    const [state, track, artist, album, position, duration, artworkUrl] = res.split('<|>');
    return {
      state,
      track,
      artist,
      album,
      position: parseFloat(position) || 0,
      duration: parseFloat(duration) || 0,
      artworkUrl: artworkUrl || undefined,
      latencyMs,
      sampledAt: Date.now()
    };
  } else if (isWin) {
    const t0 = Date.now();
    try {
      const ps = `
        $p = Get-Process -Name spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
        if (-not $p) {
          Write-Output "stopped"
        } else {
          Write-Output $p.MainWindowTitle
        }
      `;
      const title = await runPowerShell(ps, 1500);
      const latencyMs = Date.now() - t0;
      if (!title || title === 'stopped' || title === 'Spotify' || title === 'Spotify Free' || title === 'Spotify Premium') {
        return {
          state: 'paused',
          track: '',
          artist: '',
          album: '',
          position: 0,
          duration: 0,
          latencyMs,
          sampledAt: Date.now()
        };
      }
      const parts = title.split(' - ');
      const artist = parts[0] ? parts[0].trim() : '';
      const track = parts.slice(1).join(' - ') ? parts.slice(1).join(' - ').trim() : title;
      return {
        state: 'playing',
        track,
        artist,
        album: '',
        position: 0,
        duration: 0,
        latencyMs,
        sampledAt: Date.now()
      };
    } catch (e) {
      return {
        state: 'paused',
        track: '',
        artist: '',
        album: '',
        position: 0,
        duration: 0,
        latencyMs: Date.now() - t0,
        sampledAt: Date.now()
      };
    }
  }
  return { state: 'stopped', track: '', artist: '', album: '', position: 0, duration: 0 };
}

// Query Apple Music
async function getAppleMusicState() {
  if (isMac) {
    const script = `
      tell application "Music"
        set pState to player state as string
        if pState is "stopped" then
          return "stopped<|>none<|>none<|>none<|>0<|>0"
        end if
        set tName to name of current track
        set tArtist to artist of current track
        set tAlbum to album of current track
        set tPos to player position
        set tDur to duration of current track
        return pState & "<|>" & tName & "<|>" & tArtist & "<|>" & tAlbum & "<|>" & (tPos as string) & "<|>" & (tDur as string)
      end tell
    `;
    const t0 = Date.now();
    const res = await runAppleScript(script, 2000);
    const latencyMs = Date.now() - t0;
    const [state, track, artist, album, position, duration] = res.split('<|>');
    return {
      state,
      track,
      artist,
      album,
      position: parseFloat(position) || 0,
      duration: parseFloat(duration) || 0,
      latencyMs,
      sampledAt: Date.now()
    };
  }
  return { state: 'stopped', track: '', artist: '', album: '', position: 0, duration: 0 };
}

// Send media key on Windows (179 = Play/Pause, 176 = Next, 177 = Prev)
function sendWindowsMediaKey(key) {
  const script = `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]${key})`;
  return runPowerShell(script);
}

// API Routes
app.get('/api/players', async (req, res) => {
  try {
    const apps = await getRunningMusicApps();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/now-playing', async (req, res) => {
  try {
    const running = await getRunningMusicApps();
    if (!running.spotify && !running.music) {
      return res.json({
        activeApp: 'none',
        state: 'stopped'
      });
    }

    if (running.spotify) {
      try {
        const spotState = await getSpotifyState();
        if (spotState.state === 'playing') {
          return res.json({
            activeApp: 'Spotify',
            ...spotState
          });
        }
      } catch (e) {}
    }

    if (running.music) {
      try {
        const musicState = await getAppleMusicState();
        if (musicState.state === 'playing') {
          return res.json({
            activeApp: 'Music',
            ...musicState
          });
        }
      } catch (e) {}
    }

    if (running.spotify) {
      try {
        const spotState = await getSpotifyState();
        return res.json({ activeApp: 'Spotify', ...spotState });
      } catch (e) {
        return res.json({
          activeApp: 'Spotify',
          state: 'permission_needed',
          error: e.message
        });
      }
    }

    if (running.music) {
      try {
        const musicState = await getAppleMusicState();
        return res.json({ activeApp: 'Music', ...musicState });
      } catch (e) {
        return res.json({
          activeApp: 'Music',
          state: 'permission_needed',
          error: e.message
        });
      }
    }

    return res.json({
      activeApp: 'none',
      state: 'stopped'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Controls
app.post('/api/player/play-pause', async (req, res) => {
  const { targetApp } = req.body || {};
  if (targetApp !== 'Spotify' && targetApp !== 'Music') return res.status(400).json({ error: 'Invalid player.' });
  if (isMac) {
    const appName = targetApp === 'Spotify' ? 'Spotify' : 'Music';
    try {
      await runAppleScript(`tell application "${appName}" to playpause`);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else if (isWin) {
    try {
      await sendWindowsMediaKey(179);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ success: false, reason: 'unsupported platform' });
});

app.post('/api/player/next', async (req, res) => {
  const { targetApp } = req.body || {};
  if (targetApp !== 'Spotify' && targetApp !== 'Music') return res.status(400).json({ error: 'Invalid player.' });
  if (isMac) {
    const appName = targetApp === 'Spotify' ? 'Spotify' : 'Music';
    try {
      await runAppleScript(`tell application "${appName}" to next track`);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else if (isWin) {
    try {
      await sendWindowsMediaKey(176);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ success: false, reason: 'unsupported platform' });
});

app.post('/api/player/previous', async (req, res) => {
  const { targetApp } = req.body || {};
  if (targetApp !== 'Spotify' && targetApp !== 'Music') return res.status(400).json({ error: 'Invalid player.' });
  if (isMac) {
    const appName = targetApp === 'Spotify' ? 'Spotify' : 'Music';
    try {
      await runAppleScript(`tell application "${appName}" to previous track`);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else if (isWin) {
    try {
      await sendWindowsMediaKey(177);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ success: false, reason: 'unsupported platform' });
});

app.post('/api/player/seek', async (req, res) => {
  const { targetApp, position } = req.body || {};
  const positionSeconds = Number(position);
  if ((targetApp !== 'Spotify' && targetApp !== 'Music')
      || !Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds > 86400) {
    return res.status(400).json({ error: 'Invalid player or playback position.' });
  }
  if (isMac) {
    const appName = targetApp;
    try {
      await runAppleScript(`tell application "${appName}" to set player position to ${positionSeconds}`);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ success: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: os.platform(),
    isMac,
    isWin,
    service: 'Lyric Companion Server'
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✨ Lyric Companion Server running on http://127.0.0.1:${PORT}`);
});
