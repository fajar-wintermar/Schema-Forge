export type ExpirationMode = 'never' | '1' | '7' | '30' | '90' | 'custom';

export function parseExpirationMode(value: string): ExpirationMode {
  switch (value) {
    case '1':
    case '7':
    case '30':
    case '90':
    case 'custom':
      return value;
    default:
      return 'never';
  }
}

function formatLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getDefaultCustomExpirationValue(
  existingIso?: string | null
): string {
  if (existingIso) {
    const parsed = new Date(existingIso);
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalDateTimeInput(parsed);
    }
  }
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  nextWeek.setSeconds(0, 0);
  return formatLocalDateTimeInput(nextWeek);
}

export function getMinDateTimeLocalValue(): string {
  const soon = new Date(Date.now() + 60 * 1000);
  soon.setSeconds(0, 0);
  return formatLocalDateTimeInput(soon);
}

export function formatExpirationSummary(expiresAt: string | null): string {
  if (!expiresAt) return 'Never expires';
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return 'Invalid expiration';
  const formatted = new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return ms <= Date.now()
    ? `Expired ${formatted}`
    : `Expires ${formatted}`;
}

export function buildExpirationPayload(
  mode: ExpirationMode,
  customDateTime: string
): { expiresInDays?: number | null; expiresAt?: string | null } {
  if (mode === 'never') {
    return { expiresAt: null };
  }
  if (mode === 'custom') {
    if (!customDateTime.trim()) {
      throw new Error('Please choose a custom expiration date and time.');
    }
    const ms = new Date(customDateTime).getTime();
    if (!Number.isFinite(ms)) {
      throw new Error('Invalid custom expiration date and time.');
    }
    if (ms <= Date.now()) {
      throw new Error('Custom expiration date must be in the future.');
    }
    return { expiresAt: new Date(ms).toISOString() };
  }
  const days = Number.parseInt(mode, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return { expiresAt: null };
  }
  return { expiresInDays: days };
}
