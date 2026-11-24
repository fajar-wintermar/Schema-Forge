import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from 'hono/utils/http-status';

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

export function readBoolean(
  obj: Record<string, unknown>,
  key: string
): boolean | undefined {
  const val = obj[key];
  return typeof val === 'boolean' ? val : undefined;
}

export function readNumber(
  obj: Record<string, unknown>,
  key: string
): number | undefined {
  const val = obj[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

export async function readJsonUnknown(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function sanitizeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
}

export interface ServiceFailure {
  ok: false;
  status: ErrorStatusCode;
  error: string;
  code?: string;
  conflictPaths?: string[];
}

export interface ServiceSuccess<T> {
  ok: true;
  data: T;
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;
