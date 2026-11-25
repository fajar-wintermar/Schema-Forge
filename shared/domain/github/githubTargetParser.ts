export interface ParsedGithubTarget {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

export function parseGithubTargetInput(raw: string): ParsedGithubTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match "owner/repo"
  const shortMatch = trimmed.match(
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/
  );
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  try {
    const u = new URL(trimmed);
    const parts = u.pathname.split('/').filter(Boolean);
    if (
      (u.hostname === 'github.com' || u.hostname === 'www.github.com') &&
      parts.length >= 2
    ) {
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/, '');
      if (
        parts.length >= 5 &&
        (parts[2] === 'blob' || parts[2] === 'tree' || parts[2] === 'raw')
      ) {
        const branch = decodeURIComponent(parts[3]);
        const path = decodeURIComponent(parts.slice(4).join('/'));
        return {
          owner,
          repo,
          branch,
          path: parts[2] === 'tree' ? undefined : path,
        };
      }
      return { owner, repo };
    }
    if (u.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
      return {
        owner: parts[0],
        repo: parts[1],
        branch: decodeURIComponent(parts[2]),
        path: decodeURIComponent(parts.slice(3).join('/')),
      };
    }
  } catch {
    return null;
  }
  return null;
}
