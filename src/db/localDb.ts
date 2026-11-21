import { WorkspaceProject } from '../types/schema';
import {
  createRandomSaltBase64,
  deriveFallbackAesKey,
  generateNonExtractableAesKey,
  hasWebCryptoAes,
  isSealedWorkspaceRecord,
  sealWorkspace,
  type StoredWorkspaceRecord,
  unsealWorkspace,
} from './localCrypto';

const DB_NAME = 'SchemaForgeLocalDB';
const DB_VERSION = 2;
const STORE_WORKSPACES = 'workspaces';
const STORE_META = 'meta';
const STORE_KEYSTORE = 'keystore';
const MASTER_KEY_ID = 'workspace_master_key';
const FALLBACK_SALT_STORAGE_KEY = 'schemaforge_vault_salt';

const dbKeyPromiseMap = new WeakMap<IDBDatabase, Promise<CryptoKey | null>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
        db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_KEYSTORE)) {
        db.createObjectStore(STORE_KEYSTORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getOrCreateFallbackSaltSync(): string {
  try {
    const existing = localStorage.getItem(FALLBACK_SALT_STORAGE_KEY);
    if (existing) return existing;
    const created = createRandomSaltBase64();
    localStorage.setItem(FALLBACK_SALT_STORAGE_KEY, created);
    return created;
  } catch {
    return 'schemaforge-static-fallback';
  }
}

async function readKeystoreEntry(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYSTORE, 'readonly');
    const req = tx.objectStore(STORE_KEYSTORE).get(MASTER_KEY_ID);
    req.onsuccess = () => {
      const res = req.result as { id: string; key?: CryptoKey } | undefined;
      resolve(res?.key || null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function storeKeystoreEntryIfMissing(
  db: IDBDatabase,
  candidate: CryptoKey
): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYSTORE, 'readwrite');
    const store = tx.objectStore(STORE_KEYSTORE);
    const getReq = store.get(MASTER_KEY_ID);
    let chosenKey = candidate;

    getReq.onsuccess = () => {
      const existing = getReq.result as { id: string; key?: CryptoKey } | undefined;
      if (existing?.key) {
        chosenKey = existing.key;
        return;
      }
      try {
        store.put({ id: MASTER_KEY_ID, key: candidate });
      } catch (err) {
        reject(err);
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve(chosenKey);
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateIndexedDbAesKey(
  db: IDBDatabase
): Promise<CryptoKey | null> {
  if (!hasWebCryptoAes()) return null;

  const cached = dbKeyPromiseMap.get(db);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const existing = await readKeystoreEntry(db);
      if (existing) return existing;

      // Generate non-extractable AES-256-GCM key outside any IDB transaction
      const generated = await generateNonExtractableAesKey();
      try {
        return await storeKeystoreEntryIfMissing(db, generated);
      } catch {
        // Fallback if browser IDB rejects structured cloning of CryptoKey
        return await deriveFallbackAesKey(getOrCreateFallbackSaltSync());
      }
    } catch {
      try {
        return await deriveFallbackAesKey(getOrCreateFallbackSaltSync());
      } catch {
        return null;
      }
    }
  })();

  dbKeyPromiseMap.set(db, promise);
  return promise;
}

async function getLocalStorageAesKey(): Promise<{
  key: CryptoKey | null;
  salt: string;
}> {
  const salt = getOrCreateFallbackSaltSync();
  if (!hasWebCryptoAes()) {
    return { key: null, salt };
  }
  try {
    const key = await deriveFallbackAesKey(salt);
    return { key, salt };
  } catch {
    return { key: null, salt };
  }
}

function isLegacyPlaintextWorkspace(
  value: unknown
): value is WorkspaceProject {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.dbml === 'string';
}

export async function loadAllWorkspaces(): Promise<WorkspaceProject[]> {
  try {
    const db = await openDb();
    const aesKey = await getOrCreateIndexedDbAesKey(db);

    const rawRows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(STORE_WORKSPACES, 'readonly');
      const store = tx.objectStore(STORE_WORKSPACES);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as unknown[]) || []);
      req.onerror = () => reject(req.error);
    });

    const workspaces: WorkspaceProject[] = [];
    const legacyToUpgrade: WorkspaceProject[] = [];

    for (const row of rawRows) {
      if (isSealedWorkspaceRecord(row)) {
        const decrypted = await unsealWorkspace(row, aesKey);
        if (decrypted) {
          workspaces.push(decrypted);
        }
      } else if (isLegacyPlaintextWorkspace(row)) {
        workspaces.push(row);
        legacyToUpgrade.push(row);
      }
    }

    // Automatically encrypt any pre-existing plaintext IndexedDB workspaces at rest
    if (legacyToUpgrade.length > 0) {
      void Promise.all(legacyToUpgrade.map((ws) => saveWorkspace(ws)));
    }

    workspaces.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return workspaces;
  } catch {
    const raw = localStorage.getItem('schemaforge_workspaces');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return [];
      const { key, salt } = await getLocalStorageAesKey();
      const out: WorkspaceProject[] = [];
      let hadLegacy = false;

      for (const item of parsed) {
        if (isSealedWorkspaceRecord(item)) {
          const decrypted = await unsealWorkspace(item, key, salt);
          if (decrypted) out.push(decrypted);
        } else if (isLegacyPlaintextWorkspace(item)) {
          out.push(item);
          hadLegacy = true;
        }
      }

      if (hadLegacy && out.length > 0) {
        const sealed = await Promise.all(
          out.map((ws) => sealWorkspace(ws, key, salt))
        );
        localStorage.setItem('schemaforge_workspaces', JSON.stringify(sealed));
      }

      out.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      return out;
    } catch {
      return [];
    }
  }
}

export async function saveWorkspace(project: WorkspaceProject): Promise<void> {
  try {
    const db = await openDb();
    const aesKey = await getOrCreateIndexedDbAesKey(db);
    const sealed = await sealWorkspace(project, aesKey);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORKSPACES, 'readwrite');
      const store = tx.objectStore(STORE_WORKSPACES);
      store.put(sealed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const all = await loadAllWorkspaces();
    const idx = all.findIndex((p) => p.id === project.id);
    if (idx >= 0) all[idx] = project;
    else all.unshift(project);
    const { key, salt } = await getLocalStorageAesKey();
    const sealedAll = await Promise.all(
      all.map((ws) => sealWorkspace(ws, key, salt))
    );
    localStorage.setItem('schemaforge_workspaces', JSON.stringify(sealedAll));
  }
}

export async function deleteWorkspace(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORKSPACES, 'readwrite');
      tx.objectStore(STORE_WORKSPACES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const all = (await loadAllWorkspaces()).filter((p) => p.id !== id);
    const { key, salt } = await getLocalStorageAesKey();
    const sealedAll = await Promise.all(
      all.map((ws) => sealWorkspace(ws, key, salt))
    );
    localStorage.setItem('schemaforge_workspaces', JSON.stringify(sealedAll));
  }
}

export async function getMetaValue<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => {
        resolve(req.result ? (req.result.value as T) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    const raw = localStorage.getItem(`schemaforge_meta_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }
}

export async function setMetaValue<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(`schemaforge_meta_${key}`, JSON.stringify(value));
  }
}
