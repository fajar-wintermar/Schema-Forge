export function generateUniqueId(prefix = ''): string {
  let randomPart: string;
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    randomPart = globalThis.crypto.randomUUID();
  } else if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    randomPart = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      ''
    );
  } else {
    throw new Error('Cryptographic random generator is unavailable.');
  }

  return prefix ? `${prefix}_${randomPart}` : randomPart;
}
