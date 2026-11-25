import { HTTPException } from 'hono/http-exception';
import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from 'hono/utils/http-status';
import {
  isDomainError,
  type DomainError,
} from '../../../../shared/domain/errors';
import type { ApiContext } from '../types';

export type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

export function toErrorStatus(
  status: number,
  fallback: ErrorStatusCode = 400
): ErrorStatusCode {
  switch (status) {
    case 400:
    case 401:
    case 402:
    case 403:
    case 404:
    case 405:
    case 406:
    case 407:
    case 408:
    case 409:
    case 410:
    case 411:
    case 412:
    case 413:
    case 414:
    case 415:
    case 416:
    case 417:
    case 418:
    case 421:
    case 422:
    case 423:
    case 424:
    case 425:
    case 426:
    case 428:
    case 429:
    case 431:
    case 451:
    case 500:
    case 501:
    case 502:
    case 503:
    case 504:
    case 505:
    case 506:
    case 507:
    case 508:
    case 510:
    case 511:
      return status;
    default:
      return fallback;
  }
}

export function domainErrorToHttpStatus(err: DomainError): ErrorStatusCode {
  switch (err.kind) {
    case 'validation':
      return 400;
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    case 'expired':
      return 410;
    case 'payload_too_large':
      return 413;
    case 'unprocessable':
      return 422;
    case 'gateway_timeout':
      return 504;
    case 'service_unavailable':
      return 503;
    case 'external_gateway':
      return err.upstreamStatus
        ? toErrorStatus(err.upstreamStatus, 502)
        : 502;
  }
}

export function mapErrorToHttpResponse(err: unknown, c: ApiContext): Response {
  if (isDomainError(err)) {
    const status = domainErrorToHttpStatus(err);
    const body: Record<string, unknown> = { error: err.message };
    if (err.code !== undefined) body.code = err.code;
    if (err.conflictPaths !== undefined) body.conflictPaths = err.conflictPaths;
    if (err.callbackUrl !== undefined) body.callbackUrl = err.callbackUrl;
    return c.json(body, status);
  }

  console.error('[API Unhandled Error]', {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.stack || err.message : String(err),
  });

  if (err instanceof HTTPException) {
    const status = err.status;
    const safeMessage =
      status >= 500
        ? 'An internal server error occurred.'
        : err.message || 'Request failed.';
    return c.json({ error: safeMessage }, status);
  }

  return c.json({ error: 'An internal server error occurred.' }, 500);
}
