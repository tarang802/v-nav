import { pino, type Logger } from 'pino';
import type { Config } from '../config/env.js';

/**
 * Structured JSON logger. Redacts credentials, tokens and coordinates so that
 * secrets and precise student locations never reach log storage.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.code',
  '*.lat',
  '*.lng',
  '*.latitude',
  '*.longitude',
];

export function createLogger(config: Pick<Config, 'logLevel' | 'isProd' | 'isTest'>): Logger {
  return pino({
    level: config.isTest ? 'silent' : config.logLevel,
    base: { service: 'vnav-api' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Pretty output only for a human at a terminal; containers and log drains always get JSON.
    ...(config.isProd || config.isTest || !process.stdout.isTTY
      ? {}
      : { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } } }),
  });
}

export type { Logger };
