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

async function readResponseStreamWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      try {
        await response.body?.cancel();
      } catch {
        // Ignore stream cancel errors
      }
      throw new PayloadTooLargeError('Remote file exceeds 5 MB limit.');
    }
  }

  if (!response.body) {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (byteLength > maxBytes) {
      throw new PayloadTooLargeError('Remote file exceeds 5 MB limit.');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError('Remote file exceeds 5 MB limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

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
    let currentFetchUrl = url;

    try {
      let redirects = 0;
      while (true) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(currentFetchUrl);
        } catch {
          throw new ValidationError('Invalid remote URL.');
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new ValidationError('Only http:// and https:// URLs are supported.');
        }

        if (options.isDisallowedHostname(parsedUrl.hostname)) {
          throw new ValidationError(
            'Local or private network URLs are not allowed.'
          );
        }

        const workerRes = await fetch(currentFetchUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'SchemaForge-DBML-Studio',
            Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
          },
        });

        const status = workerRes.status;
        const statusText = workerRes.statusText;
        const headers = workerRes.headers;
        const redirectLocation =
          status >= 300 && status < 400 ? headers.get('location') : null;

        if (redirectLocation) {
          try {
            await workerRes.body?.cancel();
          } catch {
            // Ignore stream cancel errors
          }
          if (redirects >= options.maxRedirects) {
            throw new ValidationError('Too many redirects from remote URL.');
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(redirectLocation, currentFetchUrl);
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

        const bodyText = await readResponseStreamWithLimit(
          workerRes,
          options.maxBytes
        );
        const contentType = headers.get('content-type') || '';
        return {
          resolvedUrl: currentFetchUrl,
          status,
          statusText,
          ok: status >= 200 && status < 300,
          contentType,
          bodyText,
        };
      }
    } catch (err) {
      if (
        err instanceof ValidationError ||
        err instanceof PayloadTooLargeError ||
        err instanceof GatewayTimeoutError ||
        err instanceof ExternalGatewayError
      ) {
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
  }
}
