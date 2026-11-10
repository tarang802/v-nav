import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { ErrorCode } from '../constants/errorCodes.js';
import type { Logger } from '../observability/logger.js';
import { AppError } from '../utils/AppError.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** Accepts a well-formed upstream X-Request-Id (e.g. from Nginx) or generates one. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const httpLogger = (logger: Logger) =>
  pinoHttp({
    logger,
    genReqId: (_req, res) => (res as unknown as { locals: { requestId: string } }).locals.requestId,
    customProps: (_req, res) => {
      const userId = (res as unknown as { locals: { auth?: { userId: string } } }).locals.auth?.userId;
      return userId ? { userId } : {};
    },
    // Keep request logs small: no headers, no bodies.
    serializers: {
      req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
  });

export const notFound: RequestHandler = (_req, _res, next) => next(AppError.notFound('Route not found'));

/** The single place errors become HTTP responses. Internal details never leave the server. */
export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, req, res, _next) => {
    const requestId = res.locals.requestId as string | undefined;
    let appErr: AppError;

    if (err instanceof AppError) {
      appErr = err;
    } else if (err?.type === 'entity.too.large') {
      appErr = new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body is too large');
    } else if (err?.type === 'entity.parse.failed') {
      appErr = AppError.validation([{ path: 'body', message: 'Malformed JSON' }]);
    } else if (err?.type === 'charset.unsupported' || err?.type === 'encoding.unsupported') {
      appErr = new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported content encoding');
    } else {
      (req.log ?? logger).error({ err, requestId }, 'unhandled error');
      appErr = new AppError(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong');
    }

    if (appErr.headers) res.set(appErr.headers);
    res.status(appErr.status).json({
      error: {
        code: appErr.code,
        message: appErr.message,
        requestId,
        ...(appErr.details ? { details: appErr.details } : {}),
      },
    });
  };
