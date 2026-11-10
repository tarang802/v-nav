import { ErrorCode } from '../constants/errorCodes.js';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** An expected, client-safe error. Anything else thrown becomes a generic 500. */
export class AppError extends Error {
  override name = 'AppError';
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
  }

  static validation(details: ErrorDetail[]) {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', details);
  }
  static unauthenticated(message = 'Authentication required', code: ErrorCode = ErrorCode.UNAUTHENTICATED) {
    return new AppError(401, code, message);
  }
  static forbidden(message = 'You do not have permission to do that', code: ErrorCode = ErrorCode.FORBIDDEN) {
    return new AppError(403, code, message);
  }
  static notFound(message = 'Not found') {
    return new AppError(404, ErrorCode.NOT_FOUND, message);
  }
  static conflict(code: ErrorCode, message: string) {
    return new AppError(409, code, message);
  }
  static rateLimited(retryAfterSeconds: number) {
    const s = Math.max(1, Math.ceil(retryAfterSeconds));
    return new AppError(429, ErrorCode.RATE_LIMITED, 'Too many requests, try again later', undefined, {
      'Retry-After': String(s),
    });
  }
  static unavailable(message = 'Service temporarily unavailable') {
    return new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}
