/**
 * Persistent media store using browser IndexedDB.
 * Allows uploaded video and PDF files to persist across tab reloads,
 * page navigations, and different user logins (tutor -> educator -> student).
 */

const DB_NAME = 'thebodhin_media_db';
const STORE_NAME = 'media_files';
const DB_VERSION = 1;

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Save a video or document Blob/File to IndexedDB. */
export async function saveMediaFile(key: string, file: Blob | File): Promise<void> {
  if (!key) return;
  try {
    const db = await openMediaDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(file, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // ignore storage errors
  }
}

/** Retrieve a video or document Blob from IndexedDB by key. */
export async function getMediaFile(key: string): Promise<Blob | null> {
  if (!key) return null;
  try {
    const db = await openMediaDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
