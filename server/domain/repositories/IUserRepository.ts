import type { GithubUserSummary } from '../entities/types';

export interface IUserRepository {
  upsertCloudUser(user: GithubUserSummary): Promise<string>;
}
