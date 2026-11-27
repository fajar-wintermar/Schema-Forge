import {
  ServiceUnavailableError,
  UnauthorizedError,
} from '../../../shared/domain/errors';
import type {
  GithubSessionPayload,
  ServerConfig,
} from '../../domain/entities/types';
import type { IAiSchemaGateway } from '../../domain/gateways/IAiGateway';
import type { IGithubGateway } from '../../domain/gateways/IGithubGateway';
import type { IOAuthGateway } from '../../domain/gateways/IOAuthGateway';
import type { IRemoteFetcher } from '../../domain/gateways/IRemoteFetcher';
import type { ITokenCipher } from '../../domain/gateways/ITokenCipher';
import type { IShareRepository } from '../../domain/repositories/IShareRepository';
import type { IUserRepository } from '../../domain/repositories/IUserRepository';
import type { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { GeminiAiGateway } from '../../infrastructure/ai/geminiAiGateway';
import { FetchGithubGateway } from '../../infrastructure/github/fetchGithubGateway';
import { FetchGithubOAuthGateway } from '../../infrastructure/github/fetchGithubOAuthGateway';
import { D1ShareRepository } from '../../infrastructure/persistence/d1/D1ShareRepository';
import { D1UserRepository } from '../../infrastructure/persistence/d1/D1UserRepository';
import { D1WorkspaceRepository } from '../../infrastructure/persistence/d1/D1WorkspaceRepository';
import { SafeHttpRemoteFetcher } from '../../infrastructure/remote/safeHttpRemoteFetcher';
import { WebCryptoTokenCipher } from '../../infrastructure/security/webCryptoTokenCipher';
import {
  extractGithubSession,
  getCallbackUrl,
  getRequestServerConfig,
  getSessionSecret,
} from './security/httpSecurity';
import type { ApiContext } from './types';

export interface RequestContainer {
  config: ServerConfig;
  sessionSecret: string;
  callbackUrl: string;
  tokenCipher: ITokenCipher;
  oauthGateway: IOAuthGateway;
  githubGateway: IGithubGateway;
  remoteFetcher: IRemoteFetcher;
  aiGateway: IAiSchemaGateway;
  userRepository: IUserRepository | null;
  workspaceRepository: IWorkspaceRepository | null;
  shareRepository: IShareRepository | null;
  getSession(): Promise<GithubSessionPayload | null>;
  requireSession(): Promise<GithubSessionPayload>;
  requireDatabaseRepositories(unavailableMessage?: string): {
    userRepository: IUserRepository;
    workspaceRepository: IWorkspaceRepository;
    shareRepository: IShareRepository;
  };
}

export function createRequestContainer(c: ApiContext): RequestContainer {
  const config = getRequestServerConfig(c);
  const sessionSecret = getSessionSecret(config);
  const callbackUrl = getCallbackUrl(c, config);
  const tokenCipher = new WebCryptoTokenCipher();
  const db = c.env?.DB ?? null;

  const userRepository = db ? new D1UserRepository(db) : null;
  const workspaceRepository = db ? new D1WorkspaceRepository(db) : null;
  const shareRepository = db ? new D1ShareRepository(db) : null;

  let cachedSessionPromise: Promise<GithubSessionPayload | null> | null = null;

  const getSession = (): Promise<GithubSessionPayload | null> => {
    if (!cachedSessionPromise) {
      cachedSessionPromise = extractGithubSession(c, tokenCipher, sessionSecret);
    }
    return cachedSessionPromise;
  };

  return {
    config,
    sessionSecret,
    callbackUrl,
    tokenCipher,
    oauthGateway: new FetchGithubOAuthGateway(),
    githubGateway: new FetchGithubGateway(),
    remoteFetcher: c.env?.REMOTE_FETCHER ?? new SafeHttpRemoteFetcher(),
    aiGateway: new GeminiAiGateway(config.geminiApiKey),
    userRepository,
    workspaceRepository,
    shareRepository,
    getSession,
    async requireSession(): Promise<GithubSessionPayload> {
      const session = await getSession();
      if (!session) {
        throw new UnauthorizedError('Authentication required.');
      }
      return session;
    },
    requireDatabaseRepositories(
      unavailableMessage = 'Cloud database (D1) is not configured.'
    ) {
      if (!userRepository || !workspaceRepository || !shareRepository) {
        throw new ServiceUnavailableError(unavailableMessage);
      }
      return {
        userRepository,
        workspaceRepository,
        shareRepository,
      };
    },
  };
}
