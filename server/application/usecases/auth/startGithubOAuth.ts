import { ValidationError } from '../../../../shared/domain/errors';
import type {
  OAuthStatePayload,
  ServerConfig,
} from '../../../domain/entities/types';
import type { IOAuthGateway } from '../../../domain/gateways/IOAuthGateway';
import type { ITokenCipher } from '../../../domain/gateways/ITokenCipher';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function executeStartGithubOAuth(deps: {
  config: ServerConfig;
  sessionSecret: string;
  callbackUrl: string;
  tokenCipher: ITokenCipher;
  oauthGateway: IOAuthGateway;
}): Promise<{ url: string; stateBindingToken: string }> {
  const { config, sessionSecret, callbackUrl, tokenCipher, oauthGateway } =
    deps;

  if (!config.githubClientId || !config.githubClientSecret) {
    throw new ValidationError(
      'GitHub OAuth is not configured on the server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      { callbackUrl }
    );
  }

  const nonce = tokenCipher.randomHex(16);
  const exp = Date.now() + OAUTH_STATE_TTL_MS;

  const state = await tokenCipher.encrypt<OAuthStatePayload>(
    { nonce, exp },
    sessionSecret
  );
  const stateBindingToken = await tokenCipher.encrypt<OAuthStatePayload>(
    { nonce, exp },
    sessionSecret
  );

  return {
    url: oauthGateway.buildAuthorizeUrl({
      clientId: config.githubClientId,
      callbackUrl,
      state,
    }),
    stateBindingToken,
  };
}
