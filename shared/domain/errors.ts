export type DomainErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'expired'
  | 'payload_too_large'
  | 'unprocessable'
  | 'external_gateway'
  | 'gateway_timeout'
  | 'service_unavailable';

export interface DomainErrorOptions {
  code?: string;
  conflictPaths?: string[];
  callbackUrl?: string;
  upstreamStatus?: number;
}

export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  readonly code?: string;
  readonly conflictPaths?: string[];
  readonly callbackUrl?: string;
  readonly upstreamStatus?: number;

  constructor(
    kind: DomainErrorKind,
    message: string,
    options: DomainErrorOptions = {}
  ) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.code = options.code;
    this.conflictPaths = options.conflictPaths;
    this.callbackUrl = options.callbackUrl;
    this.upstreamStatus = options.upstreamStatus;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('validation', message, options);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('unauthorized', message, options);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('forbidden', message, options);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('not_found', message, options);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('conflict', message, options);
  }
}

export class ExpiredError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('expired', message, options);
  }
}

export class PayloadTooLargeError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('payload_too_large', message, options);
  }
}

export class UnprocessableEntityError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('unprocessable', message, options);
  }
}

export class ExternalGatewayError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('external_gateway', message, options);
  }
}

export class GatewayTimeoutError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('gateway_timeout', message, options);
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super('service_unavailable', message, options);
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
