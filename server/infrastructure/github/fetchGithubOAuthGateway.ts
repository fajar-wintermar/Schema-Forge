import { ExternalGatewayError } from '../../../shared/domain/errors';
import type { GithubUserSummary } from '../../domain/entities/types';
import type { IOAuthGateway } from '../../domain/gateways/IOAuthGateway';
import {
  isRecord,
  readNumber,
  readString,
} from '../../domain/policies/typeGuards';

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export class FetchGithubOAuthGateway implements IOAuthGateway {
  buildAuthorizeUrl(params: {
    clientId: string;
    callbackUrl: string;
    state: string;
  }): string {
    const qs = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.callbackUrl,
      scope: 'repo',
      state: params.state,
    });
    return `https://github.com/login/oauth/authorize?${qs.toString()}`;
  }

  async exchangeCodeForAccessToken(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    callbackUrl: string;
  }): Promise<string> {
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: params.clientId,
          client_secret: params.clientSecret,
          code: params.code,
          redirect_uri: params.callbackUrl,
        }),
      }
    );

    const tokenJson = await readJsonSafe(tokenRes);
    const tokenRecord = isRecord(tokenJson) ? tokenJson : {};
    const accessToken = readString(tokenRecord, 'access_token');

    if (!tokenRes.ok || !accessToken) {
      throw new ExternalGatewayError(
        readString(tokenRecord, 'error_description') ||
          readString(tokenRecord, 'error') ||
          'Failed to exchange authorization code with GitHub.',
        { upstreamStatus: 400 }
      );
    }

    return accessToken;
  }

  async fetchUserProfile(accessToken: string): Promise<GithubUserSummary> {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SchemaForge-DBML-Studio',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      throw new ExternalGatewayError('Failed to fetch GitHub user profile.', {
        upstreamStatus: userRes.status,
      });
    }

    const userJson = await readJsonSafe(userRes);
    if (!isRecord(userJson)) {
      throw new ExternalGatewayError('Invalid GitHub user profile response.');
    }

    const login = readString(userJson, 'login');
    const avatarUrl = readString(userJson, 'avatar_url');
    const htmlUrl = readString(userJson, 'html_url');
    if (!login || !avatarUrl || !htmlUrl) {
      throw new ExternalGatewayError(
        'Incomplete GitHub user profile response.'
      );
    }

    const rawName = userJson.name;
    return {
      id: readNumber(userJson, 'id'),
      login,
      name: typeof rawName === 'string' ? rawName : null,
      avatar_url: avatarUrl,
      html_url: htmlUrl,
    };
  }
}
