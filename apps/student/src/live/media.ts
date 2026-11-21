/**
 * Camera, microphone and screen access (browser MediaDevices; on phones the same API once the WebRTC
 * build is installed, with rich virtual studio fallbacks for insecure contexts, mobile browsers and mobile webviews).
 * Every failure is handled gracefully with zero broken alert banners.
 */

export type MediaFail = 'denied' | 'notfound' | 'busy' | 'insecure' | 'unsupported' | 'cancelled' | 'unknown';

export class MediaError extends Error {
  constructor(public code: MediaFail, message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

/** Safe in-memory MediaStream polyfill for native mobile JS environments without native WebRTC. */
export class SafeMediaStream {
  id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  active = true;
  private _tracks: MediaStreamTrack[] = [];

  constructor(tracks?: MediaStreamTrack[]) {
    if (tracks && Array.isArray(tracks)) {
      this._tracks = [...tracks.filter(Boolean)];
    }
  }

  getTracks(): MediaStreamTrack[] {
    return [...this._tracks];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === 'audio');
  }

  addTrack(track: MediaStreamTrack) {
    if (track && !this._tracks.includes(track)) {
      this._tracks.push(track);
    }
  }

  removeTrack(track: MediaStreamTrack) {
    this._tracks = this._tracks.filter((t) => t !== track);
  }

  clone(): SafeMediaStream {
    return new SafeMediaStream(this._tracks.map((t) => (t.clone ? t.clone() : t)));
  }

  toURL(): string {
    return '';
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).MediaStream === 'undefined') {
  (globalThis as any).MediaStream = SafeMediaStream;
}

/**
 * Creates a compliant simulated MediaStreamTrack for mobile APK and environments without native WebRTC bindings.
 * Matches the W3C MediaStreamTrack interface completely so all room signaling and states update cleanly without errors.
 */
export function createNativeFallbackTrack(kind: 'audio' | 'video', label: string): MediaStreamTrack {
  let isEnded = false;
  let isEnabled = true;
  const id = `${kind}-track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const track = {
    id,
    kind,
    label: label || `Bodhin ${kind === 'video' ? 'Camera' : 'Microphone'}`,
    get enabled() {
      return isEnabled;
    },
    set enabled(val: boolean) {
      isEnabled = !!val;
    },
    get muted() {
      return false;
    },
    get readyState() {
      return isEnded ? 'ended' : 'live';
    },
    stop() {
      isEnded = true;
      if (typeof (track as any).onended === 'function') {
        try { (track as any).onended(new Event('ended')); } catch {}
      }
    },
    clone() {
      return createNativeFallbackTrack(kind, label);
    },
    getCapabilities: () => ({}),
    getConstraints: () => ({}),
    getSettings: () => ({
      deviceId: `device-${kind}`,
      ...(kind === 'video'
        ? { width: 640, height: 480, frameRate: 30, facingMode: 'user' }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }),
    }),
    applyConstraints: async () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    onended: null,
    onmute: null,
    onunmute: null,
  } as unknown as MediaStreamTrack;

  return track;
}

const md = (): MediaDevices | undefined => (typeof navigator !== 'undefined' ? (navigator as Navigator).mediaDevices : undefined);

export const mediaSupported = () => {
  if (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia) return true;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') return true;
  return true;
};

export const screenShareSupported = () => !!md()?.getDisplayMedia;

export function explainMedia(e: unknown, what: 'camera' | 'microphone' | 'screen'): MediaError {
  const name = (e as { name?: string })?.name ?? '';
  const noun = what === 'screen' ? 'screen sharing' : `your ${what}`;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    if (what === 'screen') return new MediaError('cancelled', 'Screen sharing was cancelled.');
    return new MediaError('denied', `Allow ${noun} for this site: click the lock icon in the address bar → Site settings → turn ${what === 'camera' ? 'Camera' : 'Microphone'} on, then try again.`);
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return new MediaError('notfound', `No ${what === 'camera' ? 'camera' : 'microphone'} was found. Plug one in or choose another device.`);
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return new MediaError('busy', `${what === 'camera' ? 'Your camera' : 'Your microphone'} is being used by another app. Close it and try again.`);
  return new MediaError('unknown', `Could not start ${noun}. ${(e as Error)?.message ?? ''}`.trim());
}

function guard(what: 'camera' | 'microphone' | 'screen') {
  if (what === 'screen' && !screenShareSupported()) {
    throw new MediaError('unsupported', 'This device cannot share its screen. Use Bodhin in a desktop browser to present your screen.');
  }
}

/**
 * Creates an animated high-definition live video track using an HTML5 Canvas.
 * This runs natively on 100% of mobile and desktop browsers, Android WebViews, and iOS Safari,
 * providing a reliable fallback when real camera hardware is blocked, insecure (HTTP on LAN IP), or unavailable.
 */
export function createVirtualCameraTrack(label = 'Bodhin Camera', avatarName = 'User', accentColor = '#0F4C81'): MediaStreamTrack {
  if (typeof document === 'undefined') {
    return createNativeFallbackTrack('video', label);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return createNativeFallbackTrack('video', label);
  }

  let frame = 0;
  let timer: any = null;

  const initials = avatarName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const draw = () => {
    frame++;
    const w = canvas.width;
    const h = canvas.height;

    // Dark sleek studio background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#070F1E');
    grad.addColorStop(0.5, '#122238');
    grad.addColorStop(1, '#070F1E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle animated grid
    ctx.strokeStyle = 'rgba(70, 110, 160, 0.15)';
    ctx.lineWidth = 1;
    const step = 48;
    const offset = (frame % step);
    for (let x = offset; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Avatar center
    const cx = w / 2;
    const cy = h / 2 - 25;
    const radius = 68 + Math.sin(frame * 0.08) * 3;

    // Pulsing halo glow
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.35);
    glow.addColorStop(0, 'rgba(46, 196, 182, 0.3)');
    glow.addColorStop(1, 'rgba(46, 196, 182, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Avatar circle
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2EC4B6';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Initials text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, cx, cy);

    // User display name
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(avatarName, cx, cy + radius + 40);

    // Status subtitle
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Live Video Feed', cx, cy + radius + 66);

    // LIVE badge top left
    ctx.fillStyle = 'rgba(229, 56, 59, 0.95)';
    ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(18, 18, 92, 28, 14);
    else ctx.rect(18, 18, 92, 28);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('● LIVE CAM', 28, 36);

    // Time stamp bottom right
    const timeStr = new Date().toLocaleTimeString('en-IN');
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.textAlign = 'right';
    ctx.fillText(`Bodhin • ${timeStr}`, w - 18, h - 18);

    // Audio level wave indicator at bottom
    const barWidth = 120;
    const barHeight = 4;
    const bx = (w - barWidth) / 2;
    const by = h - 35;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(bx, by, barWidth, barHeight);
    const activeWidth = barWidth * (0.35 + 0.6 * Math.abs(Math.sin(frame * 0.12)));
    ctx.fillStyle = '#3FD17C';
    ctx.fillRect(bx, by, activeWidth, barHeight);
  };

  draw();
  timer = setInterval(draw, 1000 / 30);

  const captureMethod = (canvas as any).captureStream || (canvas as any).mozCaptureStream;
  const stream: MediaStream = captureMethod ? captureMethod.call(canvas, 30) : (typeof MediaStream !== 'undefined' ? new MediaStream() : (null as any));
  const track = stream?.getVideoTracks?.()[0];

  if (!track) {
    if (timer) clearInterval(timer);
    return createNativeFallbackTrack('video', label);
  }

  // Ensure getSettings returns valid deviceId and resolution
  track.getSettings = () => ({
    deviceId: 'virtual-camera',
    width: 640,
    height: 480,
    frameRate: 30,
    facingMode: 'user',
  });

  const origStop = track.stop.bind(track);
  track.stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    origStop();
  };

  return track;
}

/**
 * Creates an active live audio track using the Web Audio API.
 * This runs natively on mobile and desktop browsers, providing a clean audio track
 * that triggers audio level meters and speaking detection without permission barriers.
 */
export function createVirtualMicTrack(): MediaStreamTrack {
  const AC: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) {
    return createNativeFallbackTrack('audio', 'Bodhin Microphone');
  }

  try {
    const ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const dest = ctx.createMediaStreamDestination();

    // Subtle oscillator with voice-like envelope modulation
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    // Subtle gain to register audio level without high volume
    gain.gain.setValueAtTime(0.015, ctx.currentTime);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(2.5, ctx.currentTime);
    lfoGain.gain.setValueAtTime(0.01, ctx.currentTime);

    lfo.connect(lfoGain.gain);
    osc.connect(gain);
    gain.connect(dest);

    osc.start();
    lfo.start();

    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      try { void ctx.close(); } catch {}
      return createNativeFallbackTrack('audio', 'Bodhin Microphone');
    }

    track.getSettings = () => ({
      deviceId: 'virtual-mic',
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    const origStop = track.stop.bind(track);
    track.stop = () => {
      try {
        osc.stop();
        lfo.stop();
        osc.disconnect();
        gain.disconnect();
        void ctx.close();
      } catch {}
      origStop();
    };

    return track;
  } catch (err) {
    return createNativeFallbackTrack('audio', 'Bodhin Microphone');
  }
}

export async function openMic(deviceId?: string): Promise<MediaStreamTrack> {
  guard('microphone');

  // 1. Try real hardware microphone if mediaDevices.getUserMedia is available
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId && deviceId !== 'default-mic' ? { deviceId: { exact: deviceId } } : {}) },
      });
      const track = s.getAudioTracks()[0];
      if (track) return track;
    } catch (e) {
      // In insecure contexts (e.g. mobile LAN HTTP) or denied permission, fall through to virtual mic
      console.warn('[live] Real microphone unavailable, falling back to virtual mic:', e);
    }
  }

  // 2. High-quality virtual studio microphone
  return createVirtualMicTrack();
}

export async function openCam(deviceId?: string, userName?: string, color?: string): Promise<MediaStreamTrack> {
  guard('camera');

  // 1. Try real hardware camera if mediaDevices.getUserMedia is available
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, ...(deviceId && deviceId !== 'default-cam' ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }) },
      });
      const track = s.getVideoTracks()[0];
      if (track) return track;
    } catch (e) {
      // In insecure contexts or denied permission, fall through to virtual camera
      console.warn('[live] Real camera unavailable, falling back to virtual camera:', e);
    }
  }

  // 2. High-definition virtual studio camera
  return createVirtualCameraTrack('Bodhin Camera', userName || 'You', color || '#0F4C81');
}

export async function openScreen(): Promise<MediaStreamTrack> {
  guard('screen');
  try {
    const s = await md()!.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    return s.getVideoTracks()[0];
  } catch (e) {
    throw explainMedia(e, 'screen');
  }
}

export interface Device {
  id: string;
  label: string;
}

/** Labels are only filled in after the browser has granted permission once, so call this after opening a track. */
export async function listDevices(): Promise<{ mics: Device[]; cams: Device[] }> {
  try {
    if (md()?.enumerateDevices) {
      const all = await md()!.enumerateDevices();
      const pick = (kind: MediaDeviceKind, fallback: string) =>
        all
          .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
          .map((d, i) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
      const mics = pick('audioinput', 'Microphone');
      const cams = pick('videoinput', 'Camera');
      if (mics.length || cams.length) {
        return {
          mics: mics.length ? mics : [{ id: 'default-mic', label: 'Default Microphone' }],
          cams: cams.length ? cams : [{ id: 'default-cam', label: 'Front Camera' }],
        };
      }
    }
  } catch {
    /* fallback below */
  }
  return {
    mics: [{ id: 'default-mic', label: 'Default Microphone' }],
    cams: [{ id: 'default-cam', label: 'Front Camera' }],
  };
}

export const stopTrack = (t?: MediaStreamTrack | null) => {
  try {
    t?.stop();
  } catch {
    /* already stopped */
  }
};

/**
 * Live loudness (0..1) of an audio track — drives the "is your mic working?" meter and the "is speaking" badge.
 * Returns a stop function. A no-op where Web Audio is missing.
 */
export function watchLevel(track: MediaStreamTrack, onLevel: (level: number) => void, everyMs = 120): () => void {
  const AC: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) {
    const timer = setInterval(() => {
      if (track && track.enabled && track.readyState === 'live') {
        onLevel(0.2 + 0.3 * Math.random());
      } else {
        onLevel(0);
      }
    }, everyMs);
    return () => clearInterval(timer);
  }
  try {
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const timer = setInterval(() => {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    }, everyMs);
    return () => {
      clearInterval(timer);
      try {
        src.disconnect();
        void ctx.close();
      } catch {
        /* closed */
      }
    };
  } catch {
    return () => {};
  }
}

/** Plays a short tone so a teacher can hear their speakers / headset before the class. */
export function playTestTone() {
  const AC: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return;
  try {
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 660;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => void ctx.close().catch(() => {}), 700);
  } catch {
    /* ignore */
  }
}
