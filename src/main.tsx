import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AndroidApp from './mobile/AndroidApp';
import WebSpotifyCompanion from './components/WebSpotifyCompanion';
import { isAndroid } from './services/androidMedia';
import { hasSpotifyCallbackParams, hasRememberedSpotifySession } from './services/webSpotifyAuth';
import './index.css';

// No client-side router: both the GitHub Pages root and its Spotify OAuth
// callback are the same real index.html URL, including on direct refresh.
const params = new URLSearchParams(location.search);
let preferSpotify = false;
try {
  preferSpotify = localStorage.getItem('lyric.web.spotify.prefer-mode') === 'true'
    && hasRememberedSpotifySession();
} catch { /* Leave the original Lyric experience available. */ }
const spotifyMode = !isAndroid && (
  params.get('mode') === 'spotify' || hasSpotifyCallbackParams() || preferSpotify
);
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isAndroid || params.has('android') ? <AndroidApp /> :
      spotifyMode ? <WebSpotifyCompanion /> : <App />}
  </React.StrictMode>
);
