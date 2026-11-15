import { WorkspaceProject } from '../types/schema';

const DB_NAME = 'SchemaForgeLocalDB';
const DB_VERSION = 1;
const STORE_WORKSPACES = 'workspaces';
const STORE_META = 'meta';

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllWorkspaces(): Promise<WorkspaceProject[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORKSPACES, 'readonly');
      const store = tx.objectStore(STORE_WORKSPACES);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as WorkspaceProject[]) || [];
        items.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    const raw = localStorage.getItem('schemaforge_workspaces');
    return raw ? (JSON.parse(raw) as WorkspaceProject[]) : [];
  }
}

export async function saveWorkspace(project: WorkspaceProject): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORKSPACES, 'readwrite');
      const store = tx.objectStore(STORE_WORKSPACES);
      store.put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const all = await loadAllWorkspaces();
    const idx = all.findIndex((p) => p.id === project.id);
    if (idx >= 0) all[idx] = project;
    else all.unshift(project);
    localStorage.setItem('schemaforge_workspaces', JSON.stringify(all));
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
    localStorage.setItem('schemaforge_workspaces', JSON.stringify(all));
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
