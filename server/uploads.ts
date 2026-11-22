import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  deleteMediaAssetRecord,
  findMediaAsset,
  isPlaceholderEnv,
  listMediaAssets,
  recordMediaAsset,
} from './db.ts';
import type { UploadedMediaItem } from '../src/types/cms.ts';

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
const ALLOWED_DOC_EXTS = new Set(['.pdf', '.vcf']);

let cloudinaryConfigured = false;

export function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL && !isPlaceholderEnv(process.env.CLOUDINARY_URL)) {
    return true;
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';
  return (
    Boolean(cloudName && apiKey && apiSecret) &&
    !isPlaceholderEnv(cloudName) &&
    !isPlaceholderEnv(apiKey) &&
    !isPlaceholderEnv(apiSecret)
  );
}

function ensureCloudinaryConfig(): void {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'تنظیمات Cloudinary در فایل .env کامل نیست. لطفاً متغیرهای CLOUDINARY_CLOUD_NAME، CLOUDINARY_API_KEY و CLOUDINARY_API_SECRET را تنظیم کن.',
    );
  }
  if (cloudinaryConfigured) return;

  if (process.env.CLOUDINARY_URL && !isPlaceholderEnv(process.env.CLOUDINARY_URL)) {
    cloudinary.config({ secure: true });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
      api_key: process.env.CLOUDINARY_API_KEY?.trim(),
      api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
      secure: true,
    });
  }
  cloudinaryConfigured = true;
}

// Ephemeral-filesystem safe: keep uploads strictly in memory and stream directly to Cloudinary
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max (Note: Vercel Hobby serverless body limit is 4.5MB)
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      ALLOWED_IMAGE_EXTS.has(ext) ||
      ALLOWED_VIDEO_EXTS.has(ext) ||
      ALLOWED_AUDIO_EXTS.has(ext) ||
      ALLOWED_DOC_EXTS.has(ext)
    ) {
      cb(null, true);
      return;
    }
    cb(
      new Error(
        'فرمت فایل مجاز نیست. تصویر (png/jpg/webp/gif)، ویدیو (mp4/webm/mov)، صوت (mp3/wav/ogg/m4a) و PDF پشتیبانی می‌شوند.',
      ),
    );
  },
});

export interface ProcessedUploadResult {
  url: string;
  filename: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  sizeBytes: number;
  optimized: boolean;
}

function classifyExtension(ext: string): {
  kind: 'image' | 'video' | 'audio' | 'file';
  resourceType: 'image' | 'video' | 'raw';
} {
  if (ALLOWED_IMAGE_EXTS.has(ext)) {
    return { kind: 'image', resourceType: 'image' };
  }
  if (ALLOWED_VIDEO_EXTS.has(ext)) {
    return { kind: 'video', resourceType: 'video' };
  }
  if (ALLOWED_AUDIO_EXTS.has(ext)) {
    // Cloudinary handles audio streams under the "video" resource_type
    return { kind: 'audio', resourceType: 'video' };
  }
  return { kind: 'file', resourceType: 'raw' };
}

export async function uploadMediaToCloudinary(
  file: Express.Multer.File,
): Promise<ProcessedUploadResult> {
  ensureCloudinaryConfig();

  const ext = path.extname(file.originalname).toLowerCase();
  const { kind, resourceType } = classifyExtension(ext);
  const folder = (process.env.CLOUDINARY_FOLDER || 'mbnd-uploads').trim().replace(/^\/+|\/+$/g, '');
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomId = crypto.randomBytes(6).toString('hex');
  const publicIdBase =
    resourceType === 'raw' ? `${datePrefix}-${randomId}${ext}` : `${datePrefix}-${randomId}`;

  const uploaded = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicIdBase,
        resource_type: resourceType,
        overwrite: false,
        ...(kind === 'image' && ext !== '.gif'
          ? {
              transformation: [{ width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
            }
          : {}),
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('آپلود در Cloudinary با خطا مواجه شد.'));
          return;
        }
        resolve(result);
      },
    );
    stream.end(file.buffer);
  });

  const saved = await recordMediaAsset({
    publicId: uploaded.public_id,
    filename: uploaded.public_id,
    url: uploaded.secure_url,
    kind,
    resourceType,
    sizeBytes: uploaded.bytes || file.size || file.buffer.length,
  });

  return {
    url: saved.url,
    filename: saved.publicId,
    kind: saved.kind,
    sizeBytes: saved.sizeBytes,
    optimized: kind === 'image',
  };
}

export async function listUploadedMedia(): Promise<UploadedMediaItem[]> {
  return listMediaAssets();
}

export async function deleteUploadedMedia(filenameOrPublicId: string): Promise<boolean> {
  const cleanKey = decodeURIComponent(filenameOrPublicId || '').trim();
  if (!cleanKey) return false;

  const asset = await findMediaAsset(cleanKey);
  if (!asset) return false;

  if (isCloudinaryConfigured()) {
    ensureCloudinaryConfig();
    try {
      await cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
      });
    } catch (err) {
      console.error('Cloudinary destroy failed:', err);
    }
  }

  return deleteMediaAssetRecord(asset.publicId);
}
