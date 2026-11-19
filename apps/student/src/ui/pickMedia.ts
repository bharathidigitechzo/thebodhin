/**
 * File pickers for course media and certificate designs (same API on phone and web).
 * Images are scaled down to at most 1280 px wide on the web so the preview is light (real: upload the original to media
 * storage and keep its URL). Videos keep the picked file's address for the preview (real: upload → HLS).
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { saveMediaFile } from './mediaStore';

export interface PickedFile { name: string; mime: string | null; sizeBytes: number | null; uri: string; file?: File; durationSec?: number }

export function getVideoDuration(fileOrUri: File | Blob | string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') return resolve(null);
      const video = document.createElement('video');
      video.preload = 'metadata';
      let urlToRevoke: string | undefined;
      let settled = false;

      const finish = (dur: number | null) => {
        if (settled) return;
        settled = true;
        if (urlToRevoke) {
          try { URL.revokeObjectURL(urlToRevoke); } catch {}
        }
        video.src = '';
        resolve(dur);
      };

      // Timeout safeguard after 4 seconds
      const timer = setTimeout(() => finish(null), 4000);

      const checkDur = () => {
        const d = video.duration;
        if (d && !isNaN(d) && isFinite(d) && d > 0) {
          clearTimeout(timer);
          finish(Math.round(d));
        }
      };

      video.onloadedmetadata = checkDur;
      video.ondurationchange = checkDur;
      video.onerror = () => {
        clearTimeout(timer);
        finish(null);
      };

      if (typeof fileOrUri === 'string') {
        video.src = fileOrUri;
      } else if (fileOrUri instanceof Blob) {
        urlToRevoke = URL.createObjectURL(fileOrUri);
        video.src = urlToRevoke;
      } else {
        clearTimeout(timer);
        finish(null);
      }
    } catch {
      resolve(null);
    }
  });
}

async function pick(type: string): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type, multiple: false, copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: File };
  let uri = a.uri;
  if (Platform.OS === 'web' && a.file) {
    try {
      uri = URL.createObjectURL(a.file);
      saveMediaFile(a.name, a.file);
    } catch {
      // fallback to a.uri
    }
  }
  return { name: a.name, mime: a.mimeType ?? a.file?.type ?? null, sizeBytes: a.size ?? a.file?.size ?? null, uri, file: a.file };
}

function shrink(file: File, maxW = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new (globalThis as unknown as { Image: { new (): HTMLImageElement } }).Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
    img.src = url;
  });
}

export async function pickImage(): Promise<PickedFile | null> {
  const f = await pick('image/*');
  if (!f) return null;
  if (Platform.OS === 'web' && f.file && /^image\/(jpeg|png|webp)$/.test(f.mime ?? '')) {
    try { return { name: f.name, mime: f.mime, sizeBytes: f.sizeBytes, uri: await shrink(f.file) }; } catch { /* keep the original address */ }
  }
  return { name: f.name, mime: f.mime, sizeBytes: f.sizeBytes, uri: f.uri };
}

export async function pickVideo(): Promise<PickedFile | null> {
  const f = await pick('video/*');
  if (!f) return null;
  let durationSec: number | undefined;
  if (Platform.OS === 'web' && (f.file || f.uri)) {
    const d = await getVideoDuration(f.file || f.uri);
    if (d) durationSec = d;
  }
  return { name: f.name, mime: f.mime, sizeBytes: f.sizeBytes, uri: f.uri, file: f.file, durationSec };
}
