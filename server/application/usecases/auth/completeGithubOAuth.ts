import type {
  GithubSessionPayload,
  GithubUserSummary,
  ServerConfig,
} from '../../../domain/entities/types';
import type { IOAuthGateway } from '../../../domain/gateways/IOAuthGateway';
import type { ITokenCipher } from '../../../domain/gateways/ITokenCipher';
import { isOAuthStatePayload } from '../../../domain/policies/typeGuards';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';

export type CompleteGithubOAuthResult =
  | { ok: true; sessionToken: string; user: GithubUserSummary }
  | { ok: false; error: string };

export async function executeCompleteGithubOAuth(
  deps: {
    config: ServerConfig;
    sessionSecret: string;
    callbackUrl: string;
    tokenCipher: ITokenCipher;
    oauthGateway: IOAuthGateway;
    userRepository: IUserRepository | null;
  },
  params: { code: string; state: string; oauthError: string }
): Promise<CompleteGithubOAuthResult> {
  if (params.oauthError) {
    return { ok: false, error: params.oauthError };
  }

  const {
    config,
    sessionSecret,
    callbackUrl,
    tokenCipher,
    oauthGateway,
    userRepository,
  } = deps;

  const parsedState = params.state
    ? await tokenCipher.decrypt(params.state, sessionSecret, isOAuthStatePayload)
    : null;

  if (!params.code || !parsedState || parsedState.exp < Date.now()) {
    return {
      ok: false,
      error: 'Invalid or expired OAuth state. Please try connecting again.',
    };
  }

  if (!config.githubClientId || !config.githubClientSecret) {
    return {
      ok: false,
      error:
        'GitHub OAuth is not configured on the server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
    };
  }

  try {
    const accessToken = await oauthGateway.exchangeCodeForAccessToken({
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      code: params.code,
      callbackUrl,
    });

    const user = await oauthGateway.fetchUserProfile(accessToken);

    if (userRepository) {
      try {
        await userRepository.upsertCloudUser(user);
      } catch {
        // Non-fatal if D1 migrations haven't run yet
      }
    }

    const sessionToken = await tokenCipher.encrypt<GithubSessionPayload>(
      {
        accessToken,
        user,
        iat: Date.now(),
      },
      sessionSecret
    );

    return { ok: true, sessionToken, user };
  } catch (err) {
    if (err instanceof Error && err.name === 'ExternalGatewayError') {
      return { ok: false, error: err.message };
    }
    console.error('[completeGithubOAuth] OAuth callback exchange failed:', err);
    return { ok: false, error: 'Unexpected OAuth callback error.' };
  }
}
