/**
 * Camera, microphone and screen access (browser MediaDevices; on phones the same API once the WebRTC
 * build is installed). Every failure is turned into a sentence a teacher or learner can act on.
 */

export type MediaFail = 'denied' | 'notfound' | 'busy' | 'insecure' | 'unsupported' | 'cancelled' | 'unknown';

export class MediaError extends Error {
  constructor(public code: MediaFail, message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

const md = (): MediaDevices | undefined => (typeof navigator !== 'undefined' ? (navigator as Navigator).mediaDevices : undefined);

export const mediaSupported = () => !!md()?.getUserMedia;
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
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new MediaError('insecure', 'Camera and microphone only work on a secure page (https:// or localhost). Open Bodhin from its https address.');
  }
  const ok = what === 'screen' ? screenShareSupported() : mediaSupported();
  if (!ok) {
    throw new MediaError('unsupported', what === 'screen' ? 'This device cannot share its screen. Use Bodhin in a desktop browser to present your screen.' : 'Camera and microphone are not available here. Use Bodhin in Chrome, Edge, Safari or Firefox, or install the Bodhin app build.');
  }
}

export async function openMic(deviceId?: string): Promise<MediaStreamTrack> {
  guard('microphone');
  try {
    const s = await md()!.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
    });
    return s.getAudioTracks()[0];
  } catch (e) {
    throw explainMedia(e, 'microphone');
  }
}

export async function openCam(deviceId?: string): Promise<MediaStreamTrack> {
  guard('camera');
  try {
    const s = await md()!.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }) },
    });
    return s.getVideoTracks()[0];
  } catch (e) {
    throw explainMedia(e, 'camera');
  }
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
  if (!md()?.enumerateDevices) return { mics: [], cams: [] };
  const all = await md()!.enumerateDevices();
  const pick = (kind: MediaDeviceKind, fallback: string) =>
    all
      .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
  return { mics: pick('audioinput', 'Microphone'), cams: pick('videoinput', 'Camera') };
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
  if (!AC) return () => {};
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
