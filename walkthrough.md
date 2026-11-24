# Security Summary

**Reviewed Files**: 26
**Issues Resolved**: 9

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unescaped OAuth HTML & Wildcard PostMessage | `server/routes/auth.ts` | 47 | OAuth error parameters were interpolated directly into HTML and inline script blocks, and `postMessage` used wildcard `*` as its target origin. | High | Fixed | Added HTML entity escaping (`escapeHtml`), inline script JSON character escaping (`serializeJsonForInlineScript`), and explicit target-origin scoping (`getSafeTargetOrigin`), plus exact origin matching in frontend listeners (`src/utils/urlSafety.ts`). |
| Permissive Cross-Window Message Origin Check | `src/utils/cloudService.ts` | 222 | Popup OAuth listeners accepted messages from any `.run.app` or `localhost` origin instead of strictly verifying the app's own origin. | High | Fixed | Replaced suffix/substring checks with strict equality against `window.location.origin` via `isTrustedOAuthMessageOrigin` in `src/utils/cloudService.ts` and `src/features/github/hooks/useGithubAuthAndRepo.ts`. |
| SVG Attribute Injection in Diagram Export | `src/utils/io/diagramExport.ts` | 214 | Schema-provided group, relationship, and table header colors were written directly into SVG attribute strings without format validation. | Medium | Fixed | Added `sanitizeSvgColor()` to allow only valid hex codes and alphabetic color names before rendering SVG attributes. |
| Protocol-Relative & Untrusted External URLs | `src/features/markdown/markdownUtils.ts` | 27 | Markdown link sanitization permitted protocol-relative (`//`) URLs, and external GitHub/workspace links were rendered without scheme checks. | Medium | Fixed | Blocked protocol-relative URLs and control characters in `sanitizeHref()`, routed bare autolinks through `sanitizeHref()`, and added `sanitizeExternalUrl()` (`http:`/`https:` only) across UI link surfaces. |
| Redirect & Extended IP Bypass in URL Fetcher | `server/services/fetchUrlService.ts` | 153 | Remote schema fetches followed HTTP redirects automatically and network host checks did not block hex/octal/integer IPv4 or IPv4-mapped IPv6 addresses. | High | Fixed | Switched to manual redirect handling (up to 3 hops) re-validating protocol and host on every hop, and expanded `isDisallowedHostname()` in `server/lib/githubClient.ts` to block alternate IP encodings, CGNAT, metadata hosts, and private IPv6 ranges. |
| Unbounded Input Validation Across API Routes | `server/lib/validation.ts` | 48 | Request bodies, query strings, route parameters, and session headers relied on ad-hoc checks without unified strict schemas. | Medium | Fixed | Added `@hono/zod-validator` (`zValidate`) with strict Zod schemas for all `POST`, `PUT`, `PATCH`, `DELETE`, `GET` query/param inputs, and `/api/*` session/request headers. |
| Missing Security Headers & Permissive Origin Checks | `server/api.ts` | 18 | Responses lacked standard HTTP hardening headers, and mutating endpoints could bypass `Origin` checks when custom headers were supplied. | Medium | Fixed | Added Hono `secureHeaders()` (configured for iframe and OAuth popup compatibility), explicit origin-allowlist `cors()` (no `*`), and unconditional `Origin` validation in `verifyMutatingRequestOrigin()` whenever an `Origin` header is present. |
| Unsanitized Error Handling | `server/api.ts` | 54 | Unhandled backend errors lacked a global JSON error sanitizer, and service catch blocks could return raw error messages to clients. | Medium | Fixed | Added global `app.onError` and `app.notFound` JSON handlers that log full error details server-side while returning generic safe error messages to clients, and sanitized error returns in backend services. |
| Production Static Path Boundary Check | `server.ts` | 118 | Malformed percent-encoded URLs could throw during decoding and static path resolution needed an explicit directory separator boundary check. | Low | Fixed | Added `try/catch` around `decodeURIComponent` returning HTTP `400` and enforced a strict `distDir + path.sep` prefix check when serving static files. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server/types.ts` | All secrets (`GEMINI_API_KEY`, `GITHUB_CLIENT_SECRET`, `AUTH_SESSION_SECRET`) stay strictly in server-side bindings/environment variables; zero `VITE_` or `NEXT_PUBLIC_` secret references exist in `src/`. |
| Database Queries | `server/services/workspaceService.ts` | All Cloudflare D1 queries use bound `.bind(...)` parameters rather than string interpolation. |
| Authenticated Requests | `server/lib/crypto.ts` | Session tokens are encrypted with AES-GCM, stored in `HttpOnly; Secure; SameSite=None; Partitioned` cookies, and mutating routes verify request origin. |
| UI Rendering | `src/` | Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `new Function()` usage exists across frontend components. |

## PoC Verification

### Unescaped OAuth Callback HTML & Wildcard PostMessage
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unescaped HTML / Script Reflection and Wildcard Window Messaging |
| Impact | High |
| Affected File | `server/routes/auth.ts:47` |
| Test Scenario | `GET /api/auth/github/callback?error=</script><script>alert(1)</script>` |

#### How It Was Fixed
Added `escapeHtml()` for HTML text nodes, `serializeJsonForInlineScript()` to escape `<`, `>`, `&`, and Unicode line separators in inline JSON payloads, and `getSafeTargetOrigin()` to scope `window.opener.postMessage` strictly to the application's own origin.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `GET /api/auth/github/callback` enters Zod query validation at `server/routes/auth.ts:138` and reaches `handleGithubCallback`. | Query strings are bounded by `githubCallbackQuerySchema`. |
| 2 | `renderOAuthErrorHtml()` encodes `<p>${escapeHtml(msg)}</p>` at `server/routes/auth.ts:60` and passes the payload through `serializeJsonForInlineScript()` at `server/routes/auth.ts:48`. | `<` and `>` become `&lt;` / `&gt;` in HTML and `\u003c` / `\u003e` inside `<script>`. |
| 3 | `window.opener.postMessage` uses `safeTargetOrigin` instead of `'*'` at `server/routes/auth.ts:63`. | **Handled Safely** — script breakout is impossible and messages target only the app origin. |

#### Conclusion
**Fix Verified** - Crafted OAuth error strings cannot execute injected script tags or leak tokens to unrelated opener windows.

### Redirect & Alternate IP Bypass in Remote URL Fetcher
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unvalidated Outbound Redirects and IP Encoding Bypasses |
| Impact | High |
| Affected File | `server/services/fetchUrlService.ts:153` |
| Test Scenario | `POST /api/fetch-url` with `{"url":"http://[::ffff:127.0.0.1]/"}` or a public URL redirecting to `http://169.254.169.254/latest/meta-data/` |

#### How It Was Fixed
Replaced automatic redirect following (`redirect: 'follow'`) with a manual redirect loop (`redirect: 'manual'`, max 3 hops) that re-validates protocol and host on every hop, and extended `isDisallowedHostname()` in `server/lib/githubClient.ts` to block alternate IP representations (`::ffff:...`, integer/hex/octal IPv4, CGNAT, and metadata hostnames).

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request reaches Zod JSON validation at `server/routes/fetchUrl.ts:23` (`{ url: string }`), then enters `fetchRemoteDbmlFromUrl()`. | Non-string or empty payloads fail immediately with HTTP `400`. |
| 2 | Initial hostname check calls `isDisallowedHostname()` (`server/lib/githubClient.ts:23`) at `server/services/fetchUrlService.ts:53`, blocking `[::ffff:127.0.0.1]`, `2130706433`, and `metadata.google.internal`. | Blocked with HTTP `400` before `fetch()` is called. |
| 3 | Any `3xx` `Location` header is resolved in `server/services/fetchUrlService.ts:162-201` and re-checked via `isDisallowedHostname()` at line `192`. | **Handled Safely** — private redirect targets are rejected with HTTP `400`. |

#### Conclusion
**Fix Verified** - Neither alternate IP encodings nor HTTP redirects can reach loopback, private, or cloud metadata addresses.

### Strict Schema Validation & Error Sanitization
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unvalidated Request Payloads and Internal Error Leakage |
| Impact | Medium |
| Affected File | `server/api.ts:39` |
| Test Scenario | `POST /api/fetch-url` with `{}` or `GET /api/auth/me` with header `x-github-session: invalid!value` |

#### How It Was Fixed
Added `@hono/zod-validator` via `zValidate()` across all request inputs and headers, plus a global `app.onError` handler in `server/api.ts` that logs full stacks server-side while returning generic JSON messages to callers.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Every `/api/*` request passes `zValidate('header', optionalSessionHeadersSchema)` at `server/api.ts:39`. | Malformed session headers return HTTP `400` with a concise field error. |
| 2 | `POST /api/fetch-url` runs `zValidate('json', fetchUrlInputSchema)` at `server/routes/fetchUrl.ts:23`. | Missing or invalid JSON fields return HTTP `400` without stack traces. |
| 3 | Any unexpected runtime exception is caught by `app.onError` at `server/api.ts:54`. | **Handled Safely** — server logs full stack; client receives `{"error":"An internal server error occurred."}` with HTTP `500`. |

#### Conclusion
**Fix Verified** - Malformed payloads are rejected before reaching business logic and internal errors never expose stack traces.
