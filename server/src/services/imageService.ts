import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { IMAGE_MAX_INPUT_PIXELS } from '../constants/events.js';
import { ErrorCode } from '../constants/errorCodes.js';
import type { Logger } from '../observability/logger.js';
import type { StorageAdapter } from '../storage/storage.js';
import { AppError } from '../utils/AppError.js';

export interface StoredImage {
  key: string;
  url: string;
}

const unsupported = () => new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Upload a JPEG, PNG or WebP image');

/**
 * The file type is decided from the first bytes of the file, never from the
 * filename or the Content-Type the client sent. SVG and everything else is
 * refused.
 */
export function sniffImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Upload pipeline: sniff type, decode with sharp, apply the EXIF rotation,
 * resize, re-encode as WebP. Re-encoding drops all metadata (phone photos
 * carry GPS coordinates) and anything hidden after the image data.
 */
export class ImageService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly logger: Logger,
  ) {}

  async store(input: Buffer, folder: 'events' | 'avatars', maxPx: number): Promise<StoredImage> {
    if (!sniffImageType(input)) throw unsupported();
    let output: Buffer;
    try {
      output = await sharp(input, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate() // bake in the EXIF orientation before the metadata is dropped
        .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      // Truncated, corrupt, too many pixels, or not really an image.
      throw unsupported();
    }
    const key = `${folder}/${randomBytes(16).toString('hex')}.webp`;
    await this.storage.put(key, output, 'image/webp');
    return { key, url: this.storage.urlFor(key) };
  }

  /** Best effort: a file that fails to delete is logged, never surfaced to the user. */
  async remove(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn({ err, key }, 'could not delete stored image');
    }
  }
}
