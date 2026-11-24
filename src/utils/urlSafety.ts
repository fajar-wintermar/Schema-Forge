export function sanitizeExternalUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function isTrustedOAuthMessageOrigin(origin: string): boolean {
  if (typeof window === 'undefined' || !origin) return false;
  return origin === window.location.origin;
}
