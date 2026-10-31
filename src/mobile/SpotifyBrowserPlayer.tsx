import React, { useEffect, useRef, useState } from 'react';
import type { BrowserPlayback, SpotifyEmbedController } from '../services/spotifyBrowser';
interface EmbedApi { createController(element: HTMLElement, options: {uri: string; width: string; height: number}, callback: (controller: SpotifyEmbedController) => void): void }
let apiPromise: Promise<EmbedApi> | null = null;
function loadApi(): Promise<EmbedApi> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { apiPromise = null; reject(new Error('Spotify web player did not load. Check your connection and try again.')); }, 15000);
    (window as any).onSpotifyIframeApiReady = (api: EmbedApi) => { clearTimeout(timer); resolve(api); };
    script.src = 'https://open.spotify.com/embed/iframe-api/v1'; script.async = true;
    script.onerror = () => { clearTimeout(timer); apiPromise = null; reject(new Error('Spotify web player is unavailable.')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}
export function SpotifyBrowserPlayer({ uri, onPlayback, onController, onError }: {
  uri: string; onPlayback: (state: BrowserPlayback) => void; onController: (controller: SpotifyEmbedController | null) => void; onError: (message: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({onPlayback,onController,onError}); callbacks.current={onPlayback,onController,onError};
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false; let controller: SpotifyEmbedController | null = null;
    setReady(false); setFailed('');
    const element = document.createElement('div'); root.current?.appendChild(element);
    void loadApi().then(api => {
      if (cancelled) return;
      api.createController(element, {uri,width:'100%',height:152}, value => {
        if (cancelled) { value.destroy(); return; }
        controller=value;callbacks.current.onController(value);
        value.addListener('ready', () => { if (!cancelled) setReady(true); });
        value.addListener('playback_update', event => {
          if (cancelled) return;
          const data=event.data || {};
          if (!Number.isFinite(data.position) || !Number.isFinite(data.duration)) return;
          callbacks.current.onPlayback({position:Math.max(0,data.position/1000),duration:Math.max(0,data.duration/1000),playing:!data.isPaused && !data.isBuffering});
        });
      });
    }).catch(error=>{if(!cancelled){setFailed(error.message);callbacks.current.onError(error.message);}});
    return () => {cancelled=true;controller?.destroy();callbacks.current.onController(null);element.remove();};
  }, [uri,retry]);
  return <section className="mobile-browser-player" aria-label="Spotify embedded web player"><div ref={root}/>{!ready&&!failed&&<p className="mobile-note">Loading Spotify’s web player…</p>}{failed&&<button className="mobile-secondary" onClick={()=>setRetry(value=>value+1)}>Retry Spotify web player</button>}<small>Spotify controls playback availability; previews may be limited. Use the player above to start playback.</small></section>;
}
