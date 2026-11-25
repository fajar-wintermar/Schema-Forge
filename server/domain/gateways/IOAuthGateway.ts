import type { GithubUserSummary } from '../entities/types';

export interface IOAuthGateway {
  buildAuthorizeUrl(params: {
    clientId: string;
    callbackUrl: string;
    state: string;
  }): string;
  exchangeCodeForAccessToken(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    callbackUrl: string;
  }): Promise<string>;
  fetchUserProfile(accessToken: string): Promise<GithubUserSummary>;
}
