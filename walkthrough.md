# Security Summary

**Reviewed Files**: 22
**Issues Resolved**: 9

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Cross-User Snapshot Overwrite | `server/infrastructure/persistence/d1/D1WorkspaceRepository.ts` | 208 | `workspace_versions` used a global primary key `id` with an unscoped `ON CONFLICT(id) DO UPDATE`, and client version IDs used predictable timestamps alongside exposed public share version IDs. | High | Fixed | Migrated `workspace_versions` to composite primary key `(workspace_id, id)` in `migrations/0003_security_hardening.sql`, scoped `ON CONFLICT(workspace_id, id) DO UPDATE` with `WHERE workspace_versions.owner_user_id = excluded.owner_user_id AND workspace_versions.workspace_id = excluded.workspace_id`, switched client IDs to `crypto.randomUUID()`, and masked internal DB version IDs on public share responses. |
| Missing Server-Side Session Expiry & Logout Revocation | `server/presentation/http/security/httpSecurity.ts` | 214 | Session extraction decrypted tokens without validating `iat` expiration, and logout only cleared the browser cookie without invalidating existing tokens server-side. | Medium | Fixed | Added `isSessionTimestampValid()` enforcing a strict 7-day maximum lifetime and future-skew limit, added unique session `jti` identifiers recorded in `revoked_sessions` on logout, and rejected revoked sessions in `extractGithubSession()`. |
| Browser Storage Exposure of OAuth Session Token | `src/services/api/apiClient.ts` | 1 | Encrypted OAuth sessions were transmitted in popup `postMessage`, persisted in `sessionStorage`, and replayed via `x-github-session` headers. | Medium | Fixed | Removed `sessionStorage` persistence, stopped emitting `sessionToken` in OAuth popup scripts (`server/presentation/http/views/oauthPopupHtml.ts`), and dropped `x-github-session` header auth so sessions travel strictly inside `HttpOnly` cookies. |
| OAuth Callback Login Hijacking | `server/application/usecases/auth/completeGithubOAuth.ts` | 65 | OAuth `state` held an encrypted nonce that was not bound to the initiating browser session and could be replayed before expiry. | Medium | Fixed | Bound OAuth initiation (`GET /api/auth/github/url`) to a short-lived `HttpOnly` cookie (`sf_oauth_state`), verified constant-time nonce equality in `executeCompleteGithubOAuth()`, and deleted the state cookie on callback to guarantee single use. |
| Remote Fetcher DNS Rebinding & Unbounded Response Buffering | `server/infrastructure/remote/safeHttpRemoteFetcher.ts` | 100 | Outbound URL fetches only checked hostnames syntactically and buffered full `response.text()` payloads before verifying the 5 MB cap. | Medium | Fixed | Added pinned DNS resolution checking every resolved IPv4/IPv6 address against `isDisallowedHostname()` before opening sockets on Node.js, normalized trailing-dot hostnames, and enforced streaming byte-count aborts at `Content-Length` and chunk boundaries (`maxBytes`). |
| Shared Session Secret Fallback | `server/infrastructure/config/serverEnv.ts` | 153 | Production startup and `getSessionSecret()` fell back to `GITHUB_CLIENT_SECRET` when `SESSION_SECRET` was omitted. | Low | Fixed | Removed `githubClientSecret` fallback in `getSessionSecret()` and required dedicated `SESSION_SECRET` (minimum 16 characters) in production validation. |
| Silent Save Overwrites & Malformed Version Wipe | `server/application/usecases/workspaces/saveWorkspace.ts` | 89 | Concurrent saves ignored `cloudRevision`, deleted client versions remained orphaned on the server, and arrays containing only invalid version entries triggered `clearAllVersions`. | Low | Fixed | Enforced `cloudRevision` checks throwing `409 Conflict`, scoped orphan pruning for deleted versions, and restricted `clearAllVersions` strictly to explicit empty arrays (`body.versions.length === 0`). |
| Spoofable Rate-Limit Client IP Header | `server/presentation/http/middleware/rateLimit.ts` | 46 | Standalone Node deployments accepted untrusted `X-Forwarded-For` headers as rate-limiter keys. | Low | Fixed | Keyed on trusted Cloudflare/proxy headers only when behind an edge/trusted proxy (`TRUST_PROXY=true` or `K_SERVICE`), using server-captured socket peer IP (`x-sf-peer-ip`) otherwise. |
| Broken CI Workflow & Dependency Lockfile Mismatch | `.github/workflows/schemaforge-pr.yml` | 28 | The pull-request check workflow ran `npm ci` against a nonexistent `package-lock.json` while the repository uses `bun.lock`. | Low | Fixed | Updated the workflow to `oven-sh/setup-bun@v2`, `bun install --frozen-lockfile`, and `bun cli/schemaforge.ts`, and updated `package.json` metadata and `engines.node`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server/infrastructure/config/serverEnv.ts` | `GEMINI_API_KEY`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` stay strictly on the server with Zod validation and zero `VITE_` secret exposure. |
| Database Queries & Isolation | `server/infrastructure/persistence/d1/D1WorkspaceRepository.ts` | Every D1/SQLite statement uses bound `.bind(...)` parameters and owner-scoped `WHERE owner_user_id = ?` checks. |
| Authenticated Sessions | `server/presentation/http/security/httpSecurity.ts` | Sessions are AES-GCM encrypted in `HttpOnly` cookies, expire server-side after 7 days, revoke on logout, and enforce `Origin` validation on mutations. |
| UI Rendering | `src/` | Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `new Function()` sinks exist across React components. |

## PoC Verification

### Cross-User Snapshot Overwrite via Version ID Collision
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Ownership Scope on Database Conflict Upsert |
| Impact | High |
| Affected File | `server/infrastructure/persistence/d1/D1WorkspaceRepository.ts:208` |
| Test Scenario | User B saves workspace `ws_bob` with a version sharing User A's published version ID `ver_shared_collision_id`, attempting to alter User A's shared schema. |

#### How It Was Fixed
Added migration `migrations/0003_security_hardening.sql` converting `workspace_versions` primary key to `(workspace_id, id)`, updated `ON CONFLICT(workspace_id, id) DO UPDATE` with `WHERE workspace_versions.owner_user_id = excluded.owner_user_id AND workspace_versions.workspace_id = excluded.workspace_id`, switched client ID generation to `crypto.randomUUID()`, and masked raw version IDs on public share responses.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | User B sends `PUT /api/workspaces/ws_bob` with version ID `ver_shared_collision_id` to `executeSaveWorkspace` (`saveWorkspace.ts:82`). | `ws_bob` ownership check passes for User B. |
| 2 | `D1WorkspaceRepository.upsertWithVersions` (`D1WorkspaceRepository.ts:200`) executes `INSERT ... ON CONFLICT(workspace_id, id) DO UPDATE ... WHERE workspace_versions.owner_user_id = excluded.owner_user_id AND workspace_versions.workspace_id = excluded.workspace_id`. | Conflict targets `(ws_bob, ver_shared_collision_id)` only; `(ws_alice, ver_shared_collision_id)` cannot match or update. |
| 3 | Public share resolution (`resolvePublicShare.ts:96`) serves User A's untouched snapshot and emits `v.tag` rather than internal DB IDs (`tests/unit/serverSecurity.test.ts`). | **Handled Safely** — User A's snapshots and share links stay completely isolated. |

#### Conclusion
**Fix Verified** - Neither colliding version IDs nor cross-account saves can overwrite another user's saved schema snapshots.

### Expired Session Replay, Header Spoofing & Logout Invalidation
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unchecked Session Lifetime & Revocation Bypass |
| Impact | Medium |
| Affected File | `server/presentation/http/security/httpSecurity.ts:214` |
| Test Scenario | Replaying an 8-day-old `sf_gh_session` cookie, sending an `x-github-session` header without cookie, or replaying a cookie after `POST /api/auth/github/logout`. |

#### How It Was Fixed
Removed `x-github-session` header acceptance and `sessionStorage` token storage, added `isSessionTimestampValid()` enforcing a 7-day TTL, and added `jti` revocation tracking via `revoked_sessions`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request with `x-github-session` only enters `extractGithubSession` (`httpSecurity.ts:194`). | Returns `null` because only the `HttpOnly` `sf_gh_session` cookie is accepted (`401`). |
| 2 | Request with an 8-day-old cookie passes AES-GCM decryption and reaches `isSessionTimestampValid(parsed.iat, now)` (`httpSecurity.ts:214`). | Returns `false` because `now - iat > SESSION_MAX_AGE_MS`. |
| 3 | After `POST /api/auth/github/logout` inserts `jti` into `revoked_sessions` (`httpSecurity.ts:258`), replaying the old cookie hits the `revoked_sessions` lookup (`httpSecurity.ts:221`). | **Handled Safely** — rejected with `401 Unauthorized`. |

#### Conclusion
**Fix Verified** - Sessions are confined to `HttpOnly` cookies, expire cleanly after 7 days, and are invalidated immediately on logout.

### OAuth Callback Login Forgery
#### Summary
| Field | Value |
|---|---|
| Issue Type | Cross-Site Login Forgery via Unbound OAuth State |
| Impact | Medium |
| Affected File | `server/application/usecases/auth/completeGithubOAuth.ts:65` |
| Test Scenario | Attacker crafts `/api/auth/github/callback?code=attacker_code&state=attacker_state` and tricks a victim browser without matching `sf_oauth_state` cookie into loading it. |

#### How It Was Fixed
`GET /api/auth/github/url` now sets a short-lived `HttpOnly` cookie (`sf_oauth_state`) containing the encrypted nonce, and `handleGithubCallback` reads and immediately deletes it before calling `executeCompleteGithubOAuth` to verify constant-time nonce equality.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Victim visits forged `/api/auth/github/callback` link (`authRoutes.ts:39`). | Cookie `sf_oauth_state` is missing or contains a different user's nonce; cookie is cleared immediately. |
| 2 | `executeCompleteGithubOAuth` decrypts URL `state` and `cookieState` and runs `timingSafeEqualStrings(parsedState.nonce, parsedCookieState.nonce)` (`completeGithubOAuth.ts:65`). | Nonce check fails before code exchange runs. |
| 3 | Callback returns HTTP `400` error HTML (`oauthPopupHtml.ts:31`). | **Handled Safely** — attacker's code is never exchanged or bound to victim's session. |

#### Conclusion
**Fix Verified** - OAuth callbacks succeed only once for the exact browser context that initiated sign-in.

### Remote URL DNS Rebinding & Streaming Size Cap
#### Summary
| Field | Value |
|---|---|
| Issue Type | Private Network Resolution Bypass & Unbounded Body Read |
| Impact | Medium |
| Affected File | `server/infrastructure/remote/safeHttpRemoteFetcher.ts:100` |
| Test Scenario | Fetching a domain resolving via DNS to `127.0.0.1` or streaming a chunked response exceeding `maxBytes` without a `Content-Length` header. |

#### How It Was Fixed
Added pinned DNS lookup validation on Node (`resolveValidatedAddresses`) that verifies every resolved IP with `isDisallowedHostname()` before socket connect, plus streaming byte-counter aborts (`totalBytes > options.maxBytes`) across both Node and Workers runtimes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `SafeHttpRemoteFetcher.fetchText` invokes `fetchViaNodePinnedHttp` (`safeHttpRemoteFetcher.ts:144`). | Calls `resolveValidatedAddresses` at line `154` before connecting. |
| 2 | `dnsLookup` returns `127.0.0.1`, triggering `isDisallowedHostname('127.0.0.1')` (`urlSafetyPolicy.ts:15`). | Throws `ValidationError` before any TCP socket is opened. |
| 3 | For oversized chunked streams on allowed public hosts, `res.on('data')` checks `totalBytes > options.maxBytes` (`safeHttpRemoteFetcher.ts:257`). | **Handled Safely** — destroys socket immediately and throws `PayloadTooLargeError` (`413`). |

#### Conclusion
**Fix Verified** - Domains resolving to internal addresses are blocked prior to connection and oversized responses abort immediately during streaming.
