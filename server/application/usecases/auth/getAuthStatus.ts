import type {
  CloudAuthStatusResponse,
  CloudUser,
} from '../../../../shared/domain/schemaTypes';
import type {
  GithubSessionPayload,
  GithubUserSummary,
  ServerConfig,
} from '../../../domain/entities/types';
import { resolveUserId } from '../../../domain/policies/userIdentityPolicy';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';

export interface GithubStatusResult {
  configured: boolean;
  connected: boolean;
  user: GithubUserSummary | null;
  callbackUrl: string;
}

export async function executeGetAuthMeStatus(deps: {
  config: ServerConfig;
  userRepository: IUserRepository | null;
  session: GithubSessionPayload | null;
  callbackUrl: string;
}): Promise<CloudAuthStatusResponse> {
  const { config, userRepository, session, callbackUrl } = deps;

  let user: CloudUser | null = null;
  if (session) {
    const userId = resolveUserId(session.user);
    if (userRepository) {
      try {
        await userRepository.upsertCloudUser(session.user);
      } catch {
        // Non-fatal if D1 migrations have not been applied yet
      }
    }
    user = {
      id: userId,
      login: session.user.login,
      name: session.user.name,
      avatar_url: session.user.avatar_url,
      html_url: session.user.html_url,
    };
  }

  return {
    cloudEnabled: Boolean(userRepository),
    githubConfigured: Boolean(config.githubClientId && config.githubClientSecret),
    authenticated: Boolean(session),
    user,
    callbackUrl,
  };
}

export function executeGetGithubConnectionStatus(deps: {
  config: ServerConfig;
  session: GithubSessionPayload | null;
  callbackUrl: string;
}): GithubStatusResult {
  return {
    configured: Boolean(
      deps.config.githubClientId && deps.config.githubClientSecret
    ),
    connected: Boolean(deps.session),
    user: deps.session?.user ?? null,
    callbackUrl: deps.callbackUrl,
  };
}
