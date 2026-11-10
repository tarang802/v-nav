/**
 * Test environment. Uses the Docker Compose MongoDB (separate `vnav_test`
 * database) and Redis (DB 15), never the development data.
 */
export const TEST_MONGO_URI =
  process.env.TEST_MONGO_URI ?? 'mongodb://localhost:27018/vnav_test?directConnection=true';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/15';

export const TEST_ORIGIN = 'http://localhost:5173';

export const testEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '0',
  CLIENT_ORIGINS: TEST_ORIGIN,
  APP_PUBLIC_URL: TEST_ORIGIN,
  MONGO_URI: TEST_MONGO_URI,
  REDIS_URL: TEST_REDIS_URL,
  JWT_ACCESS_SECRET: 'test-jwt-secret-0123456789abcdefghijklmnop',
  OTP_SECRET: 'test-otp-secret-0123456789abcdefghijklmnopq',
  IP_HASH_SECRET: 'test-ip-secret-0123456789abcdefghijklmnopqr',
  ALLOWED_EMAIL_DOMAINS: 'vitstudent.ac.in',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'V-Nav Test <test@vnav.example>',
  COOKIE_SECURE: 'true',
  LOG_LEVEL: 'silent',
};
