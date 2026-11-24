import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';

export const SAFE_ID_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;
export const SAFE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;
export const GITHUB_SLUG_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;

export const optionalSessionHeadersSchema = z.object({
  'x-github-session': z
    .string()
    .max(4096, 'Session header is too large.')
    .regex(/^[A-Za-z0-9_-]*$/, 'Invalid session header format.')
    .optional(),
  'x-requested-with': z
    .string()
    .max(128, 'Invalid custom request header.')
    .optional(),
});

interface ZodIssueLike {
  message: string;
  path: ReadonlyArray<PropertyKey>;
}

function formatZodError(error: { issues: ReadonlyArray<ZodIssueLike> }): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request payload.';
  const path = first.path.length > 0 ? `${first.path.map(String).join('.')}: ` : '';
  return `${path}${first.message}`.slice(0, 200);
}

const validationHook = (
  result:
    | { success: true }
    | { success: false; error: { issues: ReadonlyArray<ZodIssueLike> } },
  c: Context<{ Bindings: AppEnv }>
) => {
  if (!result.success) {
    return c.json({ error: formatZodError(result.error) }, 400);
  }
  return undefined;
};

export function zValidate<
  T extends z.ZodType,
  Target extends keyof ValidationTargets,
>(target: Target, schema: T) {
  return zValidator<
    T,
    Target,
    { Bindings: AppEnv },
    string,
    typeof validationHook
  >(target, schema, validationHook);
}
