import {
  ExternalGatewayError,
  GatewayTimeoutError,
  PayloadTooLargeError,
  ValidationError,
} from '../../../shared/domain/errors';
import type {
  IRemoteFetcher,
  RemoteHttpFetchResult,
} from '../../domain/gateways/IRemoteFetcher';

export class SafeHttpRemoteFetcher implements IRemoteFetcher {
  async fetchText(
    url: string,
    options: {
      timeoutMs: number;
      maxRedirects: number;
      maxBytes: number;
      isDisallowedHostname: (hostname: string) => boolean;
    }
  ): Promise<RemoteHttpFetchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    let currentFetchUrl = url;

    try {
      let redirects = 0;
      while (true) {
        response = await fetch(currentFetchUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'SchemaForge-DBML-Studio',
            Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
          },
        });

        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.get('location')
        ) {
          if (redirects >= options.maxRedirects) {
            throw new ValidationError('Too many redirects from remote URL.');
          }
          const location = response.headers.get('location') || '';
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, currentFetchUrl);
          } catch {
            throw new ValidationError('Invalid redirect URL.');
          }
          if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
            throw new ValidationError(
              'Redirect to unsupported URL scheme blocked.'
            );
          }
          if (options.isDisallowedHostname(nextUrl.hostname)) {
            throw new ValidationError(
              'Redirect to local or private network URL is not allowed.'
            );
          }
          currentFetchUrl = nextUrl.toString();
          redirects++;
          continue;
        }
        break;
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GatewayTimeoutError(
          `Timed out waiting for URL response (${Math.round(
            options.timeoutMs / 1000
          )}s).`
        );
      }
      throw new ExternalGatewayError('Failed to fetch remote DBML file.');
    } finally {
      clearTimeout(timer);
    }

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    if (bodyText.length > options.maxBytes) {
      throw new PayloadTooLargeError('Remote file exceeds 5 MB limit.');
    }

    return {
      resolvedUrl: currentFetchUrl,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType,
      bodyText,
    };
  }
}
