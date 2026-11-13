import type { RequestHandler } from 'express';
import multer from 'multer';
import { ErrorCode } from '../constants/errorCodes.js';
import { UPLOAD_MAX_BYTES } from '../constants/events.js';
import { AppError } from '../utils/AppError.js';

const parser = multer({
  storage: multer.memoryStorage(), // never written to disk until it has been re-encoded
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 0, parts: 2 },
}).single('image');

/**
 * Accepts exactly one file in the multipart field `image`, up to 5 MB, held in
 * memory. The bytes are validated and re-encoded by ImageService; the
 * client-supplied filename and Content-Type are ignored.
 */
export const imageUpload: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next(new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Send the image as multipart/form-data'));
  }
  parser(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Images can be at most 5 MB'));
      }
      return next(AppError.validation([{ path: 'body.image', message: 'Send one file in the "image" field' }]));
    }
    if (err) return next(AppError.validation([{ path: 'body', message: 'Malformed upload' }]));
    if (!req.file?.buffer?.length) {
      return next(AppError.validation([{ path: 'body.image', message: 'Send one file in the "image" field' }]));
    }
    next();
  });
};
