import { z } from 'zod';
import type { ServerConfig } from '../../domain/entities/types';
import { isRecord } from '../../domain/policies/typeGuards';

const PLACEHOLDER_VALUES = new Set([
  'MY_GEMINI_API_KEY',
  'MY_APP_URL',
  'CHANGE_ME',
  'REPLACE_ME',
]);

function isNonPlaceholderString(val: string): boolean {
  return val.length > 0 && !PLACEHOLDER_VALUES.has(val);
}

export function parseOriginsList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function areValidHttpOrigins(raw: string): boolean {
  const origins = parseOriginsList(raw);
  if (origins.length === 0) return false;
  for (const item of origins) {
    if (item === '*') return false;
    try {
      const parsed = new URL(item);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      if (parsed.origin !== item.replace(/\/+$/, '')) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

const optionalNonEmptyString = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined));

export const baseServerEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  DATABASE_URL: optionalNonEmptyString.refine(
    (val) => val === undefined || !val.includes('\0'),
    'DATABASE_URL contains invalid characters.'
  ),
  GEMINI_API_KEY: optionalNonEmptyString.refine(
    (val) => val === undefined || isNonPlaceholderString(val),
    'GEMINI_API_KEY must not be a placeholder value.'
  ),
  ALLOWED_ORIGIN: optionalNonEmptyString.refine(
    (val) => val === undefined || areValidHttpOrigins(val),
    'ALLOWED_ORIGIN must be a valid http(s) origin without wildcards.'
  ),
  ALLOWED_ORIGINS: optionalNonEmptyString.refine(
    (val) => val === undefined || areValidHttpOrigins(val),
    'ALLOWED_ORIGINS must be comma-separated valid http(s) origins without wildcards.'
  ),
  APP_URL: optionalNonEmptyString.refine((val) => {
    if (val === undefined || val === 'MY_APP_URL') return true;
    try {
      const parsed = new URL(val);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'APP_URL must be a valid http(s) URL.'),
  SESSION_SECRET: optionalNonEmptyString.refine(
    (val) => val === undefined || val.length >= 16,
    'SESSION_SECRET must be at least 16 characters when configured.'
  ),
  GITHUB_CLIENT_ID: optionalNonEmptyString,
  GITHUB_CLIENT_SECRET: optionalNonEmptyString,
});

export const serverEnvSchema = baseServerEnvSchema.extend({
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required.' })
    .trim()
    .min(1, 'DATABASE_URL is required.')
    .refine(
      (val) => !val.includes('\0'),
      'DATABASE_URL contains invalid characters.'
    ),
  GEMINI_API_KEY: z
    .string({ error: 'GEMINI_API_KEY is required.' })
    .trim()
    .min(1, 'GEMINI_API_KEY is required.')
    .refine(isNonPlaceholderString, 'GEMINI_API_KEY must not be a placeholder.'),
  ALLOWED_ORIGIN: z
    .string({ error: 'ALLOWED_ORIGIN is required.' })
    .trim()
    .min(1, 'ALLOWED_ORIGIN is required.')
    .refine(
      areValidHttpOrigins,
      'ALLOWED_ORIGIN must be a valid http(s) origin without wildcards.'
    ),
});

export type BaseServerEnv = z.infer<typeof baseServerEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatZodIssues(issues: ReadonlyArray<z.ZodIssue>): string {
  return issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'env';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
}

let cachedValidatedEnv: BaseServerEnv | null = null;

export function validateServerEnv(
  rawEnv: Record<string, string | undefined> = process.env,
  options?: { strict?: boolean }
): BaseServerEnv {
  const baseParsed = baseServerEnvSchema.safeParse(rawEnv);
  if (!baseParsed.success) {
    throw new Error(
      `Invalid server environment configuration: ${formatZodIssues(baseParsed.error.issues)}`
    );
  }

  const isProduction =
    options?.strict === true || baseParsed.data.NODE_ENV === 'production';

  const strictParsed = serverEnvSchema.safeParse(rawEnv);
  if (!strictParsed.success) {
    const details = formatZodIssues(strictParsed.error.issues);
    if (isProduction) {
      throw new Error(
        `Missing or invalid required environment variables for production: ${details}`
      );
    }
    console.warn(
      `[env] Non-production mode running with optional defaults (${details})`
    );
  }

  if (isProduction && !baseParsed.data.SESSION_SECRET) {
    throw new Error(
      'Missing or invalid required environment variables for production: SESSION_SECRET: SESSION_SECRET (min 16 chars) is required in production.'
    );
  }

  cachedValidatedEnv = baseParsed.data;
  return baseParsed.data;
}

export function getValidatedEnv(): BaseServerEnv {
  if (!cachedValidatedEnv) {
    return validateServerEnv(process.env);
  }
  return cachedValidatedEnv;
}

export function readNodeProcessEnv(key: string): string {
  if (!('process' in globalThis)) return '';
  const maybeProcess = Reflect.get(globalThis, 'process');
  if (!isRecord(maybeProcess)) return '';
  const maybeEnv = maybeProcess.env;
  if (!isRecord(maybeEnv)) return '';
  const val = maybeEnv[key];
  return typeof val === 'string' ? val.trim() : '';
}

export function buildServerConfig(
  bindings?: Record<string, unknown>
): ServerConfig {
  const readStr = (key: string): string | undefined => {
    const bound = bindings?.[key];
    if (typeof bound === 'string' && bound.trim()) return bound.trim();
    const fromProc = readNodeProcessEnv(key);
    return fromProc || undefined;
  };

  const rawEnv = readStr('NODE_ENV');
  const nodeEnv: ServerConfig['nodeEnv'] =
    rawEnv === 'production' || rawEnv === 'test' ? rawEnv : 'development';

  const allowedOrigins = [
    ...parseOriginsList(readStr('ALLOWED_ORIGIN') || ''),
    ...parseOriginsList(readStr('ALLOWED_ORIGINS') || ''),
  ];

  const appUrlRaw = readStr('APP_URL');
  const appUrl =
    appUrlRaw && appUrlRaw !== 'MY_APP_URL'
      ? appUrlRaw.replace(/\/+$/, '')
      : undefined;

  return {
    nodeEnv,
    appUrl,
    allowedOrigins,
    sessionSecret: readStr('SESSION_SECRET'),
    githubClientId: readStr('GITHUB_CLIENT_ID'),
    githubClientSecret: readStr('GITHUB_CLIENT_SECRET'),
    geminiApiKey: readStr('GEMINI_API_KEY'),
  };
}
