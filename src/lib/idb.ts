// Tiny IndexedDB wrapper for storing wardrobe item images locally per browser.
// We keep just (id -> Blob); the metadata (category, color, etc.) lives in Postgres.

const DB_NAME = "fitcheck";
const DB_VERSION = 1;
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const result = fn(store);
        t.oncomplete = () => {
          if (result instanceof IDBRequest) resolve(result.result as T);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
        if (!(result instanceof IDBRequest)) {
          // Promise path (e.g. cursor walks)
          Promise.resolve(result).then(resolve, reject);
        }
      }),
  );
}

export async function putImage(id: string, blob: Blob): Promise<void> {
  await tx("readwrite", (s) => s.put(blob, id));
}

export async function getImage(id: string): Promise<Blob | null> {
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(id));
  return blob ?? null;
}

export async function deleteImage(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function hasImage(id: string): Promise<boolean> {
  const key = await tx<IDBValidKey | undefined>("readonly", (s) =>
    s.getKey(id),
  );
  return key !== undefined;
}

// Returns ids that exist locally so callers can quickly compute "missing on this device".
export async function listImageIds(): Promise<string[]> {
  return tx<string[]>("readonly", (s) =>
    s.getAllKeys() as IDBRequest<string[]>,
  );
}

// Convenience: turn the stored blob into an object URL the UI can render.
// Caller is responsible for URL.revokeObjectURL when no longer needed.
export async function getImageUrl(id: string): Promise<string | null> {
  const blob = await getImage(id);
  return blob ? URL.createObjectURL(blob) : null;
}
