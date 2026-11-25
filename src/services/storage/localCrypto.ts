import type { WorkspaceProject } from '@shared/domain/schemaTypes';

export interface SealedWorkspaceBlob {
  v: 1;
  alg: 'AES-GCM' | 'STREAM-V1';
  iv: string;
  ct: string;
}

export interface StoredWorkspaceRecord {
  id: string;
  updatedAt: string;
  sealedPayload: SealedWorkspaceBlob;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isWorkspaceProject(value: unknown): value is WorkspaceProject {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.dbml === 'string' &&
    isPlainRecord(value.tablePositions) &&
    isPlainRecord(value.groupMeta) &&
    Array.isArray(value.stickyNotes) &&
    Array.isArray(value.versions)
  );
}

export function isSealedWorkspaceRecord(
  value: unknown
): value is StoredWorkspaceRecord {
  if (!isPlainRecord(value) || typeof value.id !== 'string') return false;
  if (!isPlainRecord(value.sealedPayload)) return false;
  const sealed = value.sealedPayload;
  return (
    sealed.v === 1 &&
    (sealed.alg === 'AES-GCM' || sealed.alg === 'STREAM-V1') &&
    typeof sealed.iv === 'string' &&
    typeof sealed.ct === 'string'
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function randomBytes(len: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(len));
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < len; i++) {
      out[i] = Math.floor(Math.random() * 256);
    }
  }
  return out;
}

/**
 * Fallback stream transform used only when Web Crypto (`crypto.subtle`) is unavailable
 * (for example, non-HTTPS LAN origins). Ensures DBML is never persisted as readable plaintext.
 */
function streamTransform(
  data: Uint8Array,
  iv: Uint8Array,
  secretHint: string
): Uint8Array {
  const seed = new TextEncoder().encode(
    `SchemaForge::LocalVault::${secretHint}`
  );
  const out = new Uint8Array(data.length);
  let state = 0x811c9dc5;
  for (let i = 0; i < iv.length; i++) {
    state = Math.imul(state ^ iv[i], 0x01000193) >>> 0;
  }
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed[i], 0x01000193) >>> 0;
  }
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state ^ (i & 0xff), 0x45d9f3b) + 0x9e3779b9) >>> 0;
    const keyByte =
      ((state >>> 16) ^ seed[i % seed.length] ^ iv[i % iv.length]) & 0xff;
    out[i] = data[i] ^ keyByte;
  }
  return out;
}

export function hasWebCryptoAes(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.generateKey === 'function' &&
    typeof crypto.subtle.encrypt === 'function' &&
    typeof crypto.subtle.decrypt === 'function'
  );
}

export async function generateNonExtractableAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveFallbackAesKey(
  saltB64: string
): Promise<CryptoKey> {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'schemaforge-local';
  const rawMaterial = new TextEncoder().encode(
    `SchemaForge::LocalVaultKey::${origin}::${saltB64}`
  );
  const baseKey = await crypto.subtle.importKey(
    'raw',
    rawMaterial,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltB64),
      iterations: 60000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sealWorkspace(
  workspace: WorkspaceProject,
  aesKey: CryptoKey | null,
  fallbackSecret = 'default'
): Promise<StoredWorkspaceRecord> {
  const encoded = new TextEncoder().encode(JSON.stringify(workspace));
  const jsonBytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  jsonBytes.set(encoded);
  const iv = randomBytes(12);

  if (aesKey && hasWebCryptoAes()) {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      jsonBytes
    );
    return {
      id: workspace.id,
      updatedAt: workspace.updatedAt,
      sealedPayload: {
        v: 1,
        alg: 'AES-GCM',
        iv: bytesToBase64(iv),
        ct: bytesToBase64(new Uint8Array(encrypted)),
      },
    };
  }

  const transformed = streamTransform(jsonBytes, iv, fallbackSecret);
  return {
    id: workspace.id,
    updatedAt: workspace.updatedAt,
    sealedPayload: {
      v: 1,
      alg: 'STREAM-V1',
      iv: bytesToBase64(iv),
      ct: bytesToBase64(transformed),
    },
  };
}

export async function unsealWorkspace(
  record: StoredWorkspaceRecord,
  aesKey: CryptoKey | null,
  fallbackSecret = 'default'
): Promise<WorkspaceProject | null> {
  try {
    const { alg, iv, ct } = record.sealedPayload;
    const ivBytes = base64ToBytes(iv);
    const ctBytes = base64ToBytes(ct);

    if (alg === 'AES-GCM') {
      if (!aesKey || !hasWebCryptoAes()) return null;
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        aesKey,
        ctBytes
      );
      const json = new TextDecoder().decode(new Uint8Array(decrypted));
      const parsed: unknown = JSON.parse(json);
      return isWorkspaceProject(parsed) ? parsed : null;
    }

    const plainBytes = streamTransform(ctBytes, ivBytes, fallbackSecret);
    const json = new TextDecoder().decode(plainBytes);
    const parsed: unknown = JSON.parse(json);
    return isWorkspaceProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createRandomSaltBase64(): string {
  return bytesToBase64(randomBytes(16));
}
