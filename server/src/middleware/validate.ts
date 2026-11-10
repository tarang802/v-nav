import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/AppError.js';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates and replaces req.body / req.params, and stores the parsed query in
 * res.locals.query (Express 5 makes req.query read-only). Because every input
 * is parsed into typed primitives, objects such as { "$gt": "" } can never
 * reach a MongoDB query.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    const details: { path: string; message: string }[] = [];
    const run = (key: keyof Schemas, value: unknown) => {
      const schema = schemas[key];
      if (!schema) return undefined;
      const result = schema.safeParse(value ?? {});
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        details.push({ path: [key, ...issue.path.map(String)].join('.'), message: issue.message });
      }
      return undefined;
    };

    const body = run('body', req.body);
    const query = run('query', req.query);
    const params = run('params', req.params);
    if (details.length) return next(AppError.validation(details));

    if (schemas.body) req.body = body;
    if (schemas.params) req.params = params as typeof req.params;
    if (schemas.query) res.locals.query = query;
    next();
  };
