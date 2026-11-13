import { hostname } from 'node:os';
import { z } from 'zod';

/**
 * Environment configuration. Validated once at startup; the process refuses to
 * start with a clear message if anything required is missing or malformed.
 * Secrets are never logged.
 */

const csv = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  );

const secret = (name: string) =>
  z
    .string()
    .min(32, `${name} must be at least 32 characters (use 32+ random bytes)`)
    .refine((v) => !v.startsWith('replace-with'), `${name} still has the .env.example placeholder; generate a real value`);

const boolFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  /** Number of trusted reverse-proxy hops in front of the API (for req.ip). 0 = none. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  CLIENT_ORIGINS: csv.pipe(z.array(z.url()).min(1, 'CLIENT_ORIGINS needs at least one origin')),
  APP_PUBLIC_URL: z.url(),

  MONGO_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'MONGO_URI must be a mongodb:// or mongodb+srv:// URI'),
  MONGO_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL must be a redis:// or rediss:// URI'),

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  OTP_SECRET: secret('OTP_SECRET'),
  IP_HASH_SECRET: secret('IP_HASH_SECRET'),

  ALLOWED_EMAIL_DOMAINS: csv.pipe(z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)).min(1)),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: boolFromString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(3),

  /** Refresh cookie `Secure` flag. Must stay true in production. */
  COOKIE_SECURE: boolFromString.default(true),

  /** GeoJSON Polygon/MultiPolygon of the campus; positions outside it are never shared. */
  CAMPUS_BOUNDARY_FILE: z.string().min(1).default('data/campus-boundary.geojson'),
  /** Identifies this process in presence records; defaults to hostname + pid. */
  INSTANCE_ID: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/).optional(),

  /** Only `local` exists so far; an S3-compatible driver is planned for Phase 9. */
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  /** Directory for processed uploads (local driver). */
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  /** Public origin of this API, used to build image URLs. Defaults to http://localhost:PORT. */
  API_PUBLIC_URL: z.url().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export interface Config {
  env: Env['NODE_ENV'];
  isProd: boolean;
  isTest: boolean;
  port: number;
  trustProxy: number;
  clientOrigins: string[];
  appPublicUrl: string;
  mongo: { uri: string; poolSize: number };
  redis: { url: string };
  secrets: { jwtAccess: string; otp: string; ipHash: string };
  allowedEmailDomains: string[];
  smtp: { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
  cookieSecure: boolean;
  logLevel: Env['LOG_LEVEL'];
  campusBoundaryFile: string;
  instanceId: string;
  storage: { driver: 'local'; uploadDir: string };
  apiPublicUrl: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and rule messages; never values.
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}\nSee server/.env.example.`);
  }
  const e = parsed.data;

  if (e.NODE_ENV === 'production' && !e.COOKIE_SECURE) {
    throw new ConfigError('COOKIE_SECURE must be true in production.');
  }
  const distinct = new Set([e.JWT_ACCESS_SECRET, e.OTP_SECRET, e.IP_HASH_SECRET]);
  if (distinct.size !== 3) {
    throw new ConfigError('JWT_ACCESS_SECRET, OTP_SECRET and IP_HASH_SECRET must all be different.');
  }

  return {
    env: e.NODE_ENV,
    isProd: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    trustProxy: e.TRUST_PROXY,
    clientOrigins: e.CLIENT_ORIGINS.map((o) => o.replace(/\/$/, '')),
    appPublicUrl: e.APP_PUBLIC_URL.replace(/\/$/, ''),
    mongo: { uri: e.MONGO_URI, poolSize: e.MONGO_POOL_SIZE },
    redis: { url: e.REDIS_URL },
    secrets: { jwtAccess: e.JWT_ACCESS_SECRET, otp: e.OTP_SECRET, ipHash: e.IP_HASH_SECRET },
    allowedEmailDomains: e.ALLOWED_EMAIL_DOMAINS.map((d) => d.toLowerCase()),
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      ...(e.SMTP_USER ? { user: e.SMTP_USER } : {}),
      ...(e.SMTP_PASS ? { pass: e.SMTP_PASS } : {}),
      from: e.MAIL_FROM,
    },
    cookieSecure: e.COOKIE_SECURE,
    logLevel: e.LOG_LEVEL,
    campusBoundaryFile: e.CAMPUS_BOUNDARY_FILE,
    storage: { driver: e.STORAGE_DRIVER, uploadDir: e.UPLOAD_DIR },
    apiPublicUrl: (e.API_PUBLIC_URL ?? `http://localhost:${e.PORT}`).replace(/\/$/, ''),
    instanceId: e.INSTANCE_ID ?? `${hostname()}:${process.pid}`,
  };
}
