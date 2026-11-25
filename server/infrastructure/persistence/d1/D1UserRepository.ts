import type { GithubUserSummary } from '../../../domain/entities/types';
import { resolveUserId } from '../../../domain/policies/userIdentityPolicy';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type { D1DatabaseLike } from './d1Types';

export class D1UserRepository implements IUserRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async upsertCloudUser(user: GithubUserSummary): Promise<string> {
    const userId = resolveUserId(user);
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, name, avatar_url, html_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           github_id = COALESCE(excluded.github_id, users.github_id),
           github_login = excluded.github_login,
           name = excluded.name,
           avatar_url = excluded.avatar_url,
           html_url = excluded.html_url,
           updated_at = excluded.updated_at`
      )
      .bind(
        userId,
        typeof user.id === 'number' ? user.id : null,
        user.login,
        user.name ?? null,
        user.avatar_url || null,
        user.html_url || null,
        now,
        now
      )
      .run();
    return userId;
  }
}
