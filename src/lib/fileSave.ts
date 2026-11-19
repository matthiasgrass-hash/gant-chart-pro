/**
 * Speichern in eine echte Datei auf dem Rechner (File System Access API, Chrome/Edge am Desktop).
 * Beim ersten Speichern wählt man im System-Dialog Ordner und Dateinamen; danach wird genau
 * diese Datei überschrieben. Der Datei-Verweis wird in IndexedDB gemerkt, damit er auch nach
 * einem Neuladen der Seite noch gilt.
 */

// Minimale Typen – die API ist (noch) nicht in den Standard-DOM-Typen von TypeScript enthalten
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}
type PickerTypes = { description: string; accept: Record<string, string[]> }[];
type FsWindow = Window & {
  showSaveFilePicker?: (opts: { suggestedName?: string; types?: PickerTypes; id?: string }) => Promise<FileHandle>;
  showOpenFilePicker?: (opts: { types?: PickerTypes; multiple?: boolean; id?: string }) => Promise<FileHandle[]>;
};

export type { FileHandle };

const TYPES: PickerTypes = [{ description: 'Gantt-Projekt (JSON)', accept: { 'application/json': ['.json'] } }];

export function fileSaveSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as FsWindow).showSaveFilePicker === 'function';
}

/** Nutzer hat den Dialog abgebrochen – kein Fehler. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** „Speichern unter“: System-Dialog für Ordner und Dateiname. */
export function pickSaveFile(suggestedName: string): Promise<FileHandle> {
  return (window as FsWindow).showSaveFilePicker!({ suggestedName, types: TYPES, id: 'gantt-project' });
}

/** „Öffnen“: System-Dialog zum Auswählen einer JSON-Datei. */
export async function pickOpenFile(): Promise<FileHandle> {
  const [handle] = await (window as FsWindow).showOpenFilePicker!({ types: TYPES, multiple: false, id: 'gantt-project' });
  return handle;
}

/** Schreibrecht sicherstellen (nach einem Neuladen fragt der Browser einmal nach). */
export async function ensureWritePermission(handle: FileHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

export async function writeFile(handle: FileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

// ---------- Datei-Verweis in IndexedDB merken ----------

const DB = 'gant-chart-pro';
const STORE = 'handles';
const KEY = 'project-file';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberHandle(handle: FileHandle | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (handle) tx.objectStore(STORE).put(handle, KEY);
      else tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ohne IndexedDB gilt der Verweis nur bis zum Neuladen */
  }
}

export async function recallHandle(): Promise<FileHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileHandle | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as FileHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}
