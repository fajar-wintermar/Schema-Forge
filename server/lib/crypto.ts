import { getCookie } from 'hono/cookie';
import type {
  ApiContext,
  AppEnv,
  GithubSessionPayload,
  GithubUserSummary,
  OAuthStatePayload,
} from '../types';
import { isRecord } from './http';

function readNodeProcessEnv(key: keyof AppEnv): string {
  if (!('process' in globalThis)) return '';
  const maybeProcess = Reflect.get(globalThis, 'process');
  if (!isRecord(maybeProcess)) return '';
  const maybeEnv = maybeProcess.env;
  if (!isRecord(maybeEnv)) return '';
  const val = maybeEnv[key];
  return typeof val === 'string' ? val.trim() : '';
}

export function getEnv(c: ApiContext, key: keyof AppEnv): string {
  const bindingVal = c.env?.[key];
  if (typeof bindingVal === 'string' && bindingVal.trim()) {
    return bindingVal.trim();
  }
  return readNodeProcessEnv(key);
}

export function getAppUrl(c: ApiContext): string {
  const envUrl = getEnv(c, 'APP_URL');
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  return new URL(c.req.url).origin;
}

export function getCallbackUrl(c: ApiContext): string {
  return `${getAppUrl(c)}/api/auth/github/callback`;
}

let ephemeralFallbackSecret: string | null = null;

export function getSessionSecret(c: ApiContext): string {
  const configured =
    getEnv(c, 'SESSION_SECRET') || getEnv(c, 'GITHUB_CLIENT_SECRET');
  if (configured) return configured;
  if (!ephemeralFallbackSecret) {
    ephemeralFallbackSecret = randomHex(32);
  }
  return ephemeralFallbackSecret;
}

export function verifyMutatingRequestOrigin(c: ApiContext): boolean {
  // Requests carrying an encrypted session token header or explicit custom header are not simple cross-site form submits
  if (c.req.header('x-github-session') || c.req.header('x-requested-with')) {
    return true;
  }
  const origin = c.req.header('origin');
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const forwardedHost = c.req.header('x-forwarded-host');
    const host =
      forwardedHost || c.req.header('host') || new URL(c.req.url).host;
    if (originHost === host) return true;
    const appUrl = getEnv(c, 'APP_URL');
    if (appUrl && appUrl !== 'MY_APP_URL') {
      return new URL(appUrl).host === originHost;
    }
    return false;
  } catch {
    return false;
  }
}

// ---------- Web-Standard Base64 & Web Crypto Helpers (Node + Cloudflare Edge) ----------

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

export async function encryptToken<T>(
  payload: T,
  secret: string
): Promise<string> {
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

export async function decryptToken<T>(
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

export function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.nonce === 'string' &&
    typeof value.exp === 'number' &&
    Number.isFinite(value.exp)
  );
}

export function isGithubUserSummary(value: unknown): value is GithubUserSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.login === 'string' &&
    (value.id === undefined || typeof value.id === 'number') &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.avatar_url === 'string' &&
    typeof value.html_url === 'string'
  );
}

export function isGithubSessionPayload(
  value: unknown
): value is GithubSessionPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.iat === 'number' &&
    isGithubUserSummary(value.user)
  );
}

export function randomHex(byteLen = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLen));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getGithubSession(
  c: ApiContext
): Promise<GithubSessionPayload | null> {
  const secret = getSessionSecret(c);
  const headerToken = c.req.header('x-github-session');
  if (headerToken && headerToken.trim()) {
    const parsed = await decryptToken(
      headerToken.trim(),
      secret,
      isGithubSessionPayload
    );
    if (parsed && parsed.user.login) return parsed;
  }
  const cookieToken = getCookie(c, 'sf_gh_session');
  if (cookieToken) {
    const parsed = await decryptToken(
      cookieToken,
      secret,
      isGithubSessionPayload
    );
    if (parsed && parsed.user.login) return parsed;
  }
  return null;
}
