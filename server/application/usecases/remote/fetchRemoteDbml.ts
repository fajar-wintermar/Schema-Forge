import {
  ExternalGatewayError,
  UnprocessableEntityError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { ParsedGithubUrlMeta } from '../../../domain/entities/types';
import type { IGithubGateway } from '../../../domain/gateways/IGithubGateway';
import type { IRemoteFetcher } from '../../../domain/gateways/IRemoteFetcher';
import {
  isDisallowedHostname,
  parseGithubFileUrl,
} from '../../../domain/policies/urlSafetyPolicy';

export interface FetchRemoteDbmlResult {
  content: string;
  originalUrl: string;
  resolvedUrl: string;
  filename: string;
  githubMeta: (ParsedGithubUrlMeta & { sha?: string; htmlUrl?: string }) | null;
}

export async function executeFetchRemoteDbml(deps: {
  githubGateway: IGithubGateway;
  remoteFetcher: IRemoteFetcher;
  accessToken?: string;
  rawUrlInput: string;
}): Promise<FetchRemoteDbmlResult> {
  const { githubGateway, remoteFetcher, accessToken, rawUrlInput } = deps;
  const trimmed = rawUrlInput.trim();
  if (!trimmed) {
    throw new ValidationError('Please provide a URL.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new ValidationError('Invalid URL format. Include https:// or http://');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ValidationError('Only http:// and https:// URLs are supported.');
  }

  if (isDisallowedHostname(parsedUrl.hostname)) {
    throw new ValidationError('Local or private network URLs are not allowed.');
  }

  let targetUrl = parsedUrl.toString();
  const githubMeta = parseGithubFileUrl(targetUrl);

  if (githubMeta) {
    targetUrl = githubMeta.rawUrl;
  } else if (
    (parsedUrl.hostname === 'gist.github.com' ||
      parsedUrl.hostname === 'www.gist.github.com') &&
    !parsedUrl.pathname.endsWith('/raw')
  ) {
    const gistParts = parsedUrl.pathname.split('/').filter(Boolean);
    const gistId = gistParts[1] || gistParts[0];
    if (gistId) {
      try {
        const gistFile = await githubGateway.getGistFile(gistId);
        if (gistFile) {
          return {
            content: gistFile.content,
            originalUrl: trimmed,
            resolvedUrl: gistFile.rawUrl || targetUrl,
            filename: gistFile.filename,
            githubMeta: null,
          };
        }
      } catch {
        // Fallback to raw gist URL fetch
      }
    }
    targetUrl = `${targetUrl.replace(/\/+$/, '')}/raw`;
  }

  if (githubMeta && accessToken) {
    try {
      const ghFile = await githubGateway.getFileContents(
        githubMeta.owner,
        githubMeta.repo,
        githubMeta.path,
        githubMeta.branch,
        accessToken
      );
      if (ghFile.sha) {
        return {
          content: ghFile.content,
          originalUrl: trimmed,
          resolvedUrl: targetUrl,
          filename:
            ghFile.path.split('/').pop() ||
            githubMeta.path.split('/').pop() ||
            'schema.dbml',
          githubMeta: {
            ...githubMeta,
            sha: ghFile.sha,
            htmlUrl: ghFile.htmlUrl,
          },
        };
      }
    } catch {
      // Fallback to unauthenticated raw URL fetch
    }
  }

  const response = await remoteFetcher.fetchText(targetUrl, {
    timeoutMs: 15000,
    maxRedirects: 3,
    maxBytes: 5 * 1024 * 1024,
    isDisallowedHostname,
  });

  if (!response.ok) {
    throw new ExternalGatewayError(
      `Remote server returned HTTP ${response.status} ${response.statusText}`,
      { upstreamStatus: response.status || 502 }
    );
  }

  if (
    response.contentType.includes('text/html') &&
    /^\s*<!doctype html|^\s*<html/i.test(response.bodyText)
  ) {
    throw new UnprocessableEntityError(
      'The URL returned an HTML webpage instead of a raw DBML file. Use a raw file URL or a GitHub blob URL.'
    );
  }

  const pathParts = new URL(response.resolvedUrl).pathname
    .split('/')
    .filter(Boolean);
  const filename =
    decodeURIComponent(pathParts[pathParts.length - 1] || '') ||
    'remote-schema.dbml';

  let enrichedGithubMeta:
    | (ParsedGithubUrlMeta & { sha?: string; htmlUrl?: string })
    | null = githubMeta;

  if (githubMeta) {
    try {
      const metaFile = await githubGateway.getFileContents(
        githubMeta.owner,
        githubMeta.repo,
        githubMeta.path,
        githubMeta.branch,
        accessToken
      );
      enrichedGithubMeta = {
        ...githubMeta,
        sha: metaFile.sha,
        htmlUrl: metaFile.htmlUrl,
      };
    } catch {
      // Ignore optional metadata lookup errors
    }
  }

  return {
    content: response.bodyText,
    originalUrl: trimmed,
    resolvedUrl: response.resolvedUrl,
    filename,
    githubMeta: enrichedGithubMeta,
  };
}
