import {
  deleteMediaAssetRecord,
  findMediaAsset,
  isPlaceholderEnv,
  listMediaAssets,
  recordMediaAsset,
} from './db.ts';
import { getEnvVar, type RuntimeEnv } from './env.ts';
import type { UploadedMediaItem } from '../src/types/cms.ts';

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
const ALLOWED_DOC_EXTS = new Set(['.pdf', '.vcf']);

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export class UploadValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'UploadValidationError';
    this.status = status;
  }
}

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

export interface ProcessedUploadResult {
  url: string;
  filename: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  sizeBytes: number;
  optimized: boolean;
}

interface CloudinaryUploadApiResponse {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  error?: { message?: string };
}

export function getFileExtension(filename: string): string {
  const clean = (filename || '').trim();
  const lastDot = clean.lastIndexOf('.');
  const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  if (lastDot <= lastSlash || lastDot === -1) return '';
  return clean.slice(lastDot).toLowerCase();
}

export function isAllowedExtension(ext: string): boolean {
  return (
    ALLOWED_IMAGE_EXTS.has(ext) ||
    ALLOWED_VIDEO_EXTS.has(ext) ||
    ALLOWED_AUDIO_EXTS.has(ext) ||
    ALLOWED_DOC_EXTS.has(ext)
  );
}

export function resolveCloudinaryCredentials(env?: RuntimeEnv): CloudinaryCredentials | null {
  const folder = (getEnvVar('CLOUDINARY_FOLDER', env) || 'mbnd-uploads')
    .trim()
    .replace(/^\/+|\/+$/g, '');

  const rawUrl = getEnvVar('CLOUDINARY_URL', env).trim();
  if (rawUrl && !isPlaceholderEnv(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      const cloudName = decodeURIComponent(parsed.hostname || '').trim();
      const apiKey = decodeURIComponent(parsed.username || '').trim();
      const apiSecret = decodeURIComponent(parsed.password || '').trim();
      if (cloudName && apiKey && apiSecret) {
        return { cloudName, apiKey, apiSecret, folder };
      }
    } catch {
      // Fall through to discrete env vars
    }
  }

  const cloudName = getEnvVar('CLOUDINARY_CLOUD_NAME', env).trim();
  const apiKey = getEnvVar('CLOUDINARY_API_KEY', env).trim();
  const apiSecret = getEnvVar('CLOUDINARY_API_SECRET', env).trim();

  if (
    cloudName &&
    apiKey &&
    apiSecret &&
    !isPlaceholderEnv(cloudName) &&
    !isPlaceholderEnv(apiKey) &&
    !isPlaceholderEnv(apiSecret)
  ) {
    return { cloudName, apiKey, apiSecret, folder };
  }

  return null;
}

export function isCloudinaryConfigured(env?: RuntimeEnv): boolean {
  return resolveCloudinaryCredentials(env) !== null;
}

function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha1Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a Cloudinary REST API SHA-1 signature using Web Standard crypto.subtle.
 * Parameters are sorted alphabetically, joined with `&`, suffixed with `apiSecret`, and hashed.
 */
export async function signCloudinaryParams(
  params: Record<string, string | undefined>,
  apiSecret: string,
): Promise<string> {
  const pairs = Object.keys(params)
    .filter((k) => {
      const v = params[k];
      return typeof v === 'string' && v.length > 0;
    })
    .sort()
    .map((k) => `${k}=${params[k]}`);

  return sha1Hex(`${pairs.join('&')}${apiSecret}`);
}

export function classifyExtension(ext: string): {
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
  file: File,
  env?: RuntimeEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<ProcessedUploadResult> {
  const ext = getFileExtension(file.name);
  if (!isAllowedExtension(ext)) {
    throw new UploadValidationError(
      'فرمت فایل مجاز نیست. تصویر (png/jpg/webp/gif)، ویدیو (mp4/webm/mov)، صوت (mp3/wav/ogg/m4a) و PDF پشتیبانی می‌شوند.',
      400,
    );
  }

  if (file.size <= 0) {
    throw new UploadValidationError('فایل انتخاب‌شده خالی است.', 400);
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new UploadValidationError('حجم فایل بیشتر از حد مجاز (۵۰ مگابایت) است.', 400);
  }

  const creds = resolveCloudinaryCredentials(env);
  if (!creds) {
    throw new Error(
      'تنظیمات Cloudinary کامل نیست. لطفاً متغیرهای CLOUDINARY_CLOUD_NAME، CLOUDINARY_API_KEY و CLOUDINARY_API_SECRET را در تنظیمات Cloudflare Workers وارد کن.',
    );
  }

  const { kind, resourceType } = classifyExtension(ext);
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomId = generateRandomHex(6);
  const publicIdBase =
    resourceType === 'raw' ? `${datePrefix}-${randomId}${ext}` : `${datePrefix}-${randomId}`;

  const timestamp = String(Math.floor(Date.now() / 1000));
  const transformation =
    kind === 'image' && ext !== '.gif' ? 'c_limit,f_auto,q_auto,w_1600' : undefined;

  const signedParams: Record<string, string | undefined> = {
    folder: creds.folder || undefined,
    overwrite: 'false',
    public_id: publicIdBase,
    timestamp,
    transformation,
  };

  const signature = await signCloudinaryParams(signedParams, creds.apiSecret);

  const formData = new FormData();
  formData.append('file', file, file.name || `upload${ext}`);
  formData.append('api_key', creds.apiKey);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);
  formData.append('overwrite', 'false');
  formData.append('public_id', publicIdBase);
  if (creds.folder) {
    formData.append('folder', creds.folder);
  }
  if (transformation) {
    formData.append('transformation', transformation);
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/${resourceType}/upload`;
  const resp = await fetchImpl(endpoint, {
    method: 'POST',
    body: formData,
  });

  let payload: CloudinaryUploadApiResponse = {};
  try {
    payload = (await resp.json()) as CloudinaryUploadApiResponse;
  } catch {
    payload = {};
  }

  if (!resp.ok || !payload.public_id || !payload.secure_url) {
    const detail = payload.error?.message || `HTTP ${resp.status}`;
    throw new Error(`آپلود در Cloudinary با خطا مواجه شد: ${detail}`);
  }

  const saved = await recordMediaAsset({
    publicId: payload.public_id,
    filename: payload.public_id,
    url: payload.secure_url,
    kind,
    resourceType,
    sizeBytes: payload.bytes || file.size,
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

export async function deleteUploadedMedia(
  filenameOrPublicId: string,
  env?: RuntimeEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  let cleanKey = (filenameOrPublicId || '').trim();
  try {
    cleanKey = decodeURIComponent(cleanKey).trim();
  } catch {
    // Keep original trimmed value if malformed URI encoding
  }
  if (!cleanKey) return false;

  const asset = await findMediaAsset(cleanKey);
  if (!asset) return false;

  const creds = resolveCloudinaryCredentials(env);
  if (creds) {
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = await signCloudinaryParams(
        {
          public_id: asset.publicId,
          timestamp,
        },
        creds.apiSecret,
      );

      const formData = new FormData();
      formData.append('public_id', asset.publicId);
      formData.append('timestamp', timestamp);
      formData.append('api_key', creds.apiKey);
      formData.append('signature', signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/${asset.resourceType}/destroy`;
      const resp = await fetchImpl(endpoint, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('Cloudinary destroy failed:', resp.status, text.slice(0, 200));
      }
    } catch (err) {
      console.error('Cloudinary destroy failed:', err);
    }
  }

  return deleteMediaAssetRecord(asset.publicId);
}
