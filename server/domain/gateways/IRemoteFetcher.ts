export interface RemoteHttpFetchResult {
  resolvedUrl: string;
  status: number;
  statusText: string;
  ok: boolean;
  contentType: string;
  bodyText: string;
}

export interface IRemoteFetcher {
  fetchText(
    url: string,
    options: {
      timeoutMs: number;
      maxRedirects: number;
      maxBytes: number;
      isDisallowedHostname: (hostname: string) => boolean;
    }
  ): Promise<RemoteHttpFetchResult>;
}
