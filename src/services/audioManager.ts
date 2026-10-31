import { Track } from '../types';

export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo-1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6f/bc/e6/6fbce6c4-c38c-72d8-4fd0-66cfff32f679/20UMGIM12176.rgb.jpg/600x600bb.jpg',
    duration: 200,
    position: 0,
    isPlaying: false,
    source: 'demo',
    audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/19/d6/60/19d660ff-e3a9-8377-15a3-ce4b28e89cac/mzaf_18422426156481158187.plus.aac.p.m4a',
    badge: 'Lossless • Dolby Atmos'
  },
  {
    id: 'demo-2',
    title: 'Starboy',
    artist: 'The Weeknd ft. Daft Punk',
    album: 'Starboy',
    albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/35/65/56/3565561a-0746-b605-7832-6bf6f16f3938/16UMGIM52378.rgb.jpg/600x600bb.jpg',
    duration: 230,
    position: 0,
    isPlaying: false,
    source: 'demo',
    audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/38/59/82/3859828e-324b-3d60-31d2-a7d558d1912a/mzaf_11306631481546736203.plus.aac.p.m4a',
    badge: 'Apple Digital Master'
  },
  {
    id: 'demo-3',
    title: 'As It Was',
    artist: 'Harry Styles',
    album: "Harry's House",
    albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/be/89/36/be8936b8-2a29-b684-2977-fa26c8b4fb55/886449982436.jpg/600x600bb.jpg',
    duration: 167,
    position: 0,
    isPlaying: false,
    source: 'demo',
    audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/3d/8c/d7/3d8cd7ef-7b7c-0e77-5054-055db321f5fb/mzaf_14099569766943085025.plus.aac.p.m4a',
    badge: 'Lossless'
  },
  {
    id: 'demo-4',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/21/df/b6/21dfb689-ffbb-70c8-ab35-e109d3b73307/190295254142.jpg/600x600bb.jpg',
    duration: 203,
    position: 0,
    isPlaying: false,
    source: 'demo',
    audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/71/3d/ca/713dca7c-722d-3fae-c1fe-465451fa1222/mzaf_10332824632381283624.plus.aac.p.m4a',
    badge: 'Dolby Atmos'
  },
  {
    id: 'demo-5',
    title: 'STAY',
    artist: 'The Kid LAROI & Justin Bieber',
    album: 'F*CK LOVE 3: OVER YOU',
    albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2a/35/0f/2a350fe0-1563-0cfa-fa41-bb0a38f3223f/886449495752.jpg/600x600bb.jpg',
    duration: 141,
    position: 0,
    isPlaying: false,
    source: 'demo',
    audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/7c/49/7f/7c497fb2-c172-277e-2cf0-a681c8ea3fa4/mzaf_13385750239108169974.plus.aac.p.m4a',
    badge: 'Lossless • Spatial Audio'
  }
];

class AudioVisualizerEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private dataArray: Uint8Array | null = null;
  private isConnected = false;

  public init(audioEl: HTMLAudioElement) {
    if (this.audioElement !== audioEl) {
      this.sourceNode?.disconnect();
      this.sourceNode = null;
      this.isConnected = false;
    }
    this.audioElement = audioEl;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
    }

    if (!this.isConnected && this.audioCtx && this.analyser) {
      try {
        this.sourceNode = this.audioCtx.createMediaElementSource(audioEl);
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        this.isConnected = true;
      } catch (e) {
        // Source already connected or cross-origin restrictions
        console.warn('Audio node connection notice:', e);
      }
    }
  }

  public resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public isMicActive = false;
  private micStream: MediaStream | null = null;

  public async toggleMicrophone(): Promise<boolean> {
    if (this.isMicActive) {
      if (this.micStream) {
        this.micStream.getTracks().forEach(track => track.stop());
        this.micStream = null;
      }
      this.isMicActive = false;
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const micSource = this.audioCtx.createMediaStreamSource(stream);
      micSource.connect(this.analyser);
      this.isMicActive = true;
      return true;
    } catch (err) {
      console.warn('Microphone permission denied or not available:', err);
      this.isMicActive = false;
      return false;
    }
  }

  /**
   * Returns current audio frequency energy values:
   * bass (0..1), mid (0..1), treble (0..1), and average volume (0..1).
   * Works with live audio, microphone acoustic capture, or procedural rhythm beat-sync.
   */
  public getAudioEnergy(playbackTime: number = 0, isPlaying: boolean = true): { bass: number; mid: number; treble: number; overall: number } {
    if (!isPlaying) {
      return { bass: 0.05, mid: 0.05, treble: 0.05, overall: 0.05 };
    }

    // 1. If mic is active or HTML audio is streaming, use live acoustic FFT data
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray as any);

      let total = 0;
      for (let i = 0; i < 16; i++) {
        total += this.dataArray[i];
      }

      // If we are actively receiving sound from speakers/mic/audio tag
      if (total > 12) {
        let bassSum = 0;
        const bassBins = Math.min(8, this.dataArray.length);
        for (let i = 0; i < bassBins; i++) {
          bassSum += this.dataArray[i];
        }
        const bass = Math.min(1.0, (bassSum / (bassBins * 255)) * 1.6);

        let midSum = 0;
        const midEnd = Math.min(32, this.dataArray.length);
        for (let i = bassBins; i < midEnd; i++) {
          midSum += this.dataArray[i];
        }
        const mid = midSum / ((midEnd - bassBins) * 255);

        let trebleSum = 0;
        const trebleEnd = Math.min(64, this.dataArray.length);
        for (let i = midEnd; i < trebleEnd; i++) {
          trebleSum += this.dataArray[i];
        }
        const treble = trebleSum / ((trebleEnd - midEnd) * 255);

        const overall = (bass * 0.55 + mid * 0.3 + treble * 0.15);
        return { bass, mid, treble, overall };
      }
    }

    // 2. Dynamic Procedural Rhythm Visualizer Engine
    // Synthesizes live beat & sub-bass frequency dynamics synced with playback clock
    const tempoPeriod = 0.485; // ~124 BPM standard pop/hip-hop tempo
    const phase = (playbackTime % tempoPeriod) / tempoPeriod; // 0..1 beat phase
    
    // Punchy sub-bass kick envelope (sharp rise, exponential decay)
    const kick = Math.pow(Math.max(0, 1 - phase * 2.2), 3.2);

    // Snare / clap on beats 2 and 4
    const beatIndex = Math.floor(playbackTime / tempoPeriod);
    const isSnareBeat = beatIndex % 2 === 1;
    const snare = isSnareBeat ? Math.pow(Math.max(0, 1 - phase * 2.8), 2.5) : 0;

    // Rolling organic sub-bass groove
    const subGroove = 0.5 + 0.5 * Math.sin(playbackTime * Math.PI * 2 * 1.2);

    const bass = Math.min(1.0, 0.25 + kick * 0.72 + subGroove * 0.12);
    const mid = Math.min(1.0, 0.18 + snare * 0.62 + Math.sin(playbackTime * 5.5) * 0.1);
    const treble = Math.min(1.0, 0.15 + (1 - phase) * 0.4);
    const overall = bass * 0.6 + mid * 0.25 + treble * 0.15;

    return { bass, mid, treble, overall };
  }
}

export const visualizerEngine = new AudioVisualizerEngine();

/**
 * Search tracks using iTunes Search API
 */
export async function searchTracksOnline(query: string): Promise<Track[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&media=music&limit=12`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results) return [];

    return data.results.map((r: any) => ({
      id: `online-${r.trackId || Math.random()}`,
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName || 'Single',
      albumArt: (r.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      duration: Math.round((r.trackTimeMillis || 180000) / 1000),
      position: 0,
      isPlaying: false,
      source: 'search' as const,
      audioUrl: r.previewUrl,
      badge: 'Preview • Hi-Fi'
    }));
  } catch (e) {
    console.error('Online track search error:', e);
    return [];
  }
}

/**
 * Parse local audio file into a playable Track object
 */
export function createTrackFromFile(file: File): Track {
  const objectUrl = URL.createObjectURL(file);
  // Simple heuristic filename parsing: "Artist - Title.mp3" or "Title.mp3"
  const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
  let artist = 'Local Artist';
  let title = nameWithoutExt;

  if (nameWithoutExt.includes(' - ')) {
    const parts = nameWithoutExt.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  return {
    id: `local-${Date.now()}`,
    title,
    artist,
    album: 'Local Music Library',
    albumArt: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&auto=format&fit=crop&q=80',
    duration: 180, // will update when metadata loads
    position: 0,
    isPlaying: false,
    source: 'local-file',
    audioUrl: objectUrl,
    badge: 'Local Lossless'
  };
}
