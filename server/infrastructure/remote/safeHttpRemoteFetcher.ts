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

export interface DnsLookupAddress {
  address: string;
  family: 4 | 6;
}

export type DnsLookupAllFn = (hostname: string) => Promise<DnsLookupAddress[]>;

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions && process.versions.node)
  );
}

async function defaultNodeDnsLookupAll(
  hostname: string
): Promise<DnsLookupAddress[]> {
  const dns = await import(/* @vite-ignore */ 'node:dns/promises');
  const cleanHost = hostname.replace(/^\[|\]$/g, '');
  const records = await dns.lookup(cleanHost, { all: true, verbatim: true });
  return records.map((rec) => ({
    address: rec.address,
    family: rec.family === 6 ? 6 : 4,
  }));
}

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
  private readonly customDnsLookup?: DnsLookupAllFn;

  constructor(options?: { dnsLookup?: DnsLookupAllFn }) {
    this.customDnsLookup = options?.dnsLookup;
  }

  private async resolveValidatedAddresses(
    hostname: string,
    isDisallowedHostname: (host: string) => boolean
  ): Promise<DnsLookupAddress[]> {
    if (isDisallowedHostname(hostname)) {
      throw new ValidationError(
        'Local or private network URLs are not allowed.'
      );
    }

    const net = await import(/* @vite-ignore */ 'node:net');
    const cleanHost = hostname.trim().replace(/^\[|\]$/g, '');
    const ipFamily = net.isIP(cleanHost);
    if (ipFamily === 4 || ipFamily === 6) {
      return [{ address: cleanHost, family: ipFamily }];
    }

    const lookupFn = this.customDnsLookup ?? defaultNodeDnsLookupAll;
    let records: DnsLookupAddress[];
    try {
      records = await lookupFn(cleanHost);
    } catch {
      throw new ExternalGatewayError('Failed to resolve remote host.');
    }

    if (!records || records.length === 0) {
      throw new ExternalGatewayError('Remote host returned no DNS records.');
    }

    for (const rec of records) {
      if (isDisallowedHostname(rec.address)) {
        throw new ValidationError(
          'Remote host resolves to a disallowed local or private network address.'
        );
      }
    }

    return records;
  }

  private async fetchViaNodePinnedHttp(
    targetUrl: URL,
    options: {
      maxBytes: number;
      signal: AbortSignal;
      isDisallowedHostname: (hostname: string) => boolean;
    }
  ): Promise<{
    status: number;
    statusText: string;
    headers: Headers;
    redirectLocation: string | null;
    bodyText?: string;
  }> {
    const validatedRecords = await this.resolveValidatedAddresses(
      targetUrl.hostname,
      options.isDisallowedHostname
    );

    const httpMod = await import(/* @vite-ignore */ 'node:http');
    const httpsMod = await import(/* @vite-ignore */ 'node:https');
    const isHttps = targetUrl.protocol === 'https:';

    return await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const reqOptions: import('node:http').RequestOptions = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname.replace(/^\[|\]$/g, ''),
        port: targetUrl.port
          ? Number(targetUrl.port)
          : isHttps
            ? 443
            : 80,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: 'GET',
        signal: options.signal,
        headers: {
          'User-Agent': 'SchemaForge-DBML-Studio',
          Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
        },
        // Pin socket connection strictly to the already-validated DNS result
        lookup: (_hostname, lookupOptions, callback) => {
          const wantAll =
            typeof lookupOptions === 'object' &&
            lookupOptions !== null &&
            Boolean(lookupOptions.all);
          if (wantAll) {
            (
              callback as unknown as (
                err: NodeJS.ErrnoException | null,
                addresses: DnsLookupAddress[]
              ) => void
            )(null, validatedRecords);
          } else {
            callback(
              null,
              validatedRecords[0].address,
              validatedRecords[0].family
            );
          }
        },
      };

      const handleResponse = (res: import('node:http').IncomingMessage) => {
          const headers = new Headers();
          for (const [key, val] of Object.entries(res.headers)) {
            if (Array.isArray(val)) {
              for (const item of val) headers.append(key, item);
            } else if (typeof val === 'string') {
              headers.set(key, val);
            }
          }

          const status = res.statusCode ?? 502;
          const statusText = res.statusMessage ?? '';
          const location = headers.get('location');

          if (status >= 300 && status < 400 && location) {
            res.resume();
            if (!settled) {
              settled = true;
              resolve({
                status,
                statusText,
                headers,
                redirectLocation: location,
              });
            }
            return;
          }

          const contentLengthHeader = headers.get('content-length');
          if (contentLengthHeader) {
            const declaredLength = Number(contentLengthHeader);
            if (
              Number.isFinite(declaredLength) &&
              declaredLength > options.maxBytes
            ) {
              res.destroy();
              fail(new PayloadTooLargeError('Remote file exceeds 5 MB limit.'));
              return;
            }
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          res.on('data', (chunk: Buffer | string) => {
            const buf =
              typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
            totalBytes += buf.byteLength;
            if (totalBytes > options.maxBytes) {
              res.destroy();
              fail(new PayloadTooLargeError('Remote file exceeds 5 MB limit.'));
              return;
            }
            chunks.push(buf);
          });

          res.on('end', () => {
            if (settled) return;
            settled = true;
            const bodyText = Buffer.concat(chunks).toString('utf8');
            resolve({
              status,
              statusText,
              headers,
              redirectLocation: null,
              bodyText,
            });
          });

          res.on('error', (err) => fail(err));
      };

      const req = isHttps
        ? httpsMod.request(reqOptions, handleResponse)
        : httpMod.request(reqOptions, handleResponse);

      req.on('error', (err) => fail(err));
      req.end();
    });
  }

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

        let status: number;
        let statusText: string;
        let headers: Headers;
        let redirectLocation: string | null = null;
        let bodyText: string | undefined;

        if (isNodeRuntime()) {
          const nodeRes = await this.fetchViaNodePinnedHttp(parsedUrl, {
            maxBytes: options.maxBytes,
            signal: controller.signal,
            isDisallowedHostname: options.isDisallowedHostname,
          });
          status = nodeRes.status;
          statusText = nodeRes.statusText;
          headers = nodeRes.headers;
          redirectLocation = nodeRes.redirectLocation;
          bodyText = nodeRes.bodyText;
        } else {
          const workerRes = await fetch(currentFetchUrl, {
            signal: controller.signal,
            redirect: 'manual',
            headers: {
              'User-Agent': 'SchemaForge-DBML-Studio',
              Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
            },
          });
          status = workerRes.status;
          statusText = workerRes.statusText;
          headers = workerRes.headers;
          if (status >= 300 && status < 400 && headers.get('location')) {
            redirectLocation = headers.get('location');
          } else {
            bodyText = await readResponseStreamWithLimit(
              workerRes,
              options.maxBytes
            );
          }
        }

        if (redirectLocation) {
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

        const contentType = headers.get('content-type') || '';
        return {
          resolvedUrl: currentFetchUrl,
          status,
          statusText,
          ok: status >= 200 && status < 300,
          contentType,
          bodyText: bodyText ?? '',
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
