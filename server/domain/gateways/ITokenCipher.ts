export interface ITokenCipher {
  encrypt<T>(payload: T, secret: string): Promise<string>;
  decrypt<T>(
    token: string,
    secret: string,
    guard: (value: unknown) => value is T
  ): Promise<T | null>;
  randomHex(byteLen?: number): string;
}
