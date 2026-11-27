import type { ParsedGithubUrlMeta } from '../entities/types';

function isDisallowedIpv4Octets(a: number, b: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export function isDisallowedHostname(hostname: string): boolean {
  const raw = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (!raw) return true;

  if (
    raw === 'localhost' ||
    raw.endsWith('.localhost') ||
    raw === 'metadata' ||
    raw === 'metadata.google.internal' ||
    raw.endsWith('.local') ||
    raw.endsWith('.internal')
  ) {
    return true;
  }

  // Block integer, hex, or octal encoded IPv4 bypasses
  if (/^(0x[0-9a-f]+|\d+)$/.test(raw)) {
    return true;
  }

  const ipv4Match = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((seg) => Number(seg));
    if (octets.some((n) => n < 0 || n > 255)) return true;
    return isDisallowedIpv4Octets(octets[0], octets[1]);
  }

  if (/^(0\d+\.|\d+\.0\d+)/.test(raw)) {
    return true;
  }

  if (raw.includes(':')) {
    if (
      raw === '::' ||
      raw === '::1' ||
      raw === '0:0:0:0:0:0:0:1' ||
      raw === '0:0:0:0:0:0:0:0' ||
      raw.startsWith('fe80:') ||
      raw.startsWith('fc') ||
      raw.startsWith('fd') ||
      raw.startsWith('ff')
    ) {
      return true;
    }
    const v4Mapped = raw.match(
      /::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    );
    if (v4Mapped) {
      const octets = v4Mapped.slice(1).map((seg) => Number(seg));
      return isDisallowedIpv4Octets(octets[0], octets[1]);
    }
    if (raw.startsWith('::ffff:')) {
      return true;
    }
  }

  return false;
}

export function encodeGithubPath(filePath: string): string {
  return filePath
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function parseGithubFileUrl(
  inputUrl: string
): ParsedGithubUrlMeta | null {
  try {
    const u = new URL(inputUrl);
    if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
        const [owner, repo, , branch, ...rest] = parts;
        const filePath = decodeURIComponent(rest.join('/'));
        return {
          owner,
          repo,
          branch: decodeURIComponent(branch),
          path: filePath,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join('/')}`,
        };
      }
    }
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const [owner, repo, branch, ...rest] = parts;
        return {
          owner,
          repo,
          branch: decodeURIComponent(branch),
          path: decodeURIComponent(rest.join('/')),
          rawUrl: inputUrl,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function isValidGithubBranchName(branch: string): boolean {
  return Boolean(branch) && !/[\s~^:?*\[]/.test(branch);
}
