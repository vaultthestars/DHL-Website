import type { SpotifyImportSession } from "./spotifyImportSession";

const DB_NAME = "music-cue-spotify-import";
const DB_VERSION = 1;
const SESSION_STORE = "session";
const SESSION_KEY = "active";

const openImportDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open import database."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

export const saveImportSessionToIndexedDb = async (session: SpotifyImportSession): Promise<void> => {
  const db = await openImportDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save import session."));
    transaction.objectStore(SESSION_STORE).put(session, SESSION_KEY);
  });
  db.close();
};

export const loadImportSessionFromIndexedDb = async (): Promise<SpotifyImportSession | null> => {
  const db = await openImportDb();
  const session = await new Promise<SpotifyImportSession | null>((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, "readonly");
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not load import session."));
    const request = transaction.objectStore(SESSION_STORE).get(SESSION_KEY);
    request.onsuccess = () => {
      resolve((request.result as SpotifyImportSession | undefined) ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not load import session."));
  });
  db.close();
  return session;
};

export const clearImportSessionFromIndexedDb = async (): Promise<void> => {
  const db = await openImportDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear import session."));
    transaction.objectStore(SESSION_STORE).delete(SESSION_KEY);
  });
  db.close();
};
