import type { ITokenCipher } from '../../domain/gateways/ITokenCipher';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', secretBytes);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export function randomHex(byteLen = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLen));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class WebCryptoTokenCipher implements ITokenCipher {
  async encrypt<T>(payload: T, secret: string): Promise<string> {
    const key = await deriveAesKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const encryptedBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    const encrypted = new Uint8Array(encryptedBuf);
    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv, 0);
    combined.set(encrypted, iv.length);
    return bytesToBase64Url(combined);
  }

  async decrypt<T>(
    token: string,
    secret: string,
    guard: (value: unknown) => value is T
  ): Promise<T | null> {
    try {
      const raw = base64UrlToBytes(token);
      if (raw.length < 28) return null;
      const iv = new Uint8Array(raw.subarray(0, 12));
      const body = new Uint8Array(raw.subarray(12));
      const key = await deriveAesKey(secret);
      const decryptedBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        body
      );
      const text = new TextDecoder().decode(decryptedBuf);
      const parsed: unknown = JSON.parse(text);
      return guard(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  randomHex(byteLen = 16): string {
    return randomHex(byteLen);
  }
}
