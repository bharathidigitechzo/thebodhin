/**
 * File pickers for course media and certificate designs (same API on phone and web).
 * Images are scaled down to at most 1280 px wide on the web so the preview is light (real: upload the original to media
 * storage and keep its URL). Videos keep the picked file's address for the preview (real: upload → HLS).
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { saveMediaFile } from './mediaStore';

export interface PickedFile { name: string; mime: string | null; sizeBytes: number | null; uri: string; file?: File }

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
  return f ? { name: f.name, mime: f.mime, sizeBytes: f.sizeBytes, uri: f.uri, file: f.file } : null;
}
