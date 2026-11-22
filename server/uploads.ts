import multer from 'multer';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || './public/uploads',
);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
const ALLOWED_DOC_EXTS = new Set(['.pdf', '.vcf']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const id = crypto.randomBytes(6).toString('hex');
    cb(null, `${datePrefix}-${id}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
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

export async function optimizeUploadedMedia(
  filePath: string,
  originalExt: string,
): Promise<ProcessedUploadResult> {
  const ext = originalExt.toLowerCase();
  const isVideo = ALLOWED_VIDEO_EXTS.has(ext);
  const isAudio = ALLOWED_AUDIO_EXTS.has(ext);
  const isDoc = ALLOWED_DOC_EXTS.has(ext);
  const stat = fs.statSync(filePath);

  if (isAudio) {
    const filename = path.basename(filePath);
    return {
      url: `/uploads/${filename}`,
      filename,
      kind: 'audio',
      sizeBytes: stat.size,
      optimized: false,
    };
  }

  if (isDoc) {
    const filename = path.basename(filePath);
    return {
      url: `/uploads/${filename}`,
      filename,
      kind: 'file',
      sizeBytes: stat.size,
      optimized: false,
    };
  }

  if (!isVideo) {
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      const targetPath = filePath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            filePath,
            '-vf',
            "scale='min(1600,iw)':-1",
            '-c:v',
            'libwebp',
            '-quality',
            '82',
            targetPath,
          ],
          { timeout: 15000 },
        );
        if (fs.existsSync(targetPath)) {
          const newStat = fs.statSync(targetPath);
          if (newStat.size > 0 && newStat.size < stat.size) {
            fs.unlinkSync(filePath);
            const filename = path.basename(targetPath);
            return {
              url: `/uploads/${filename}`,
              filename,
              kind: 'image',
              sizeBytes: newStat.size,
              optimized: true,
            };
          }
          fs.unlinkSync(targetPath);
        }
      } catch {
        // Fallback silently to original uploaded image
      }
    }
    const filename = path.basename(filePath);
    return {
      url: `/uploads/${filename}`,
      filename,
      kind: 'image',
      sizeBytes: stat.size,
      optimized: false,
    };
  }

  if (ext === '.mp4' || ext === '.mov') {
    const targetMp4 = ext === '.mov' ? filePath.replace(/\.mov$/i, '.mp4') : filePath;
    const tempOut = targetMp4.replace(/\.mp4$/i, '.opt.mp4');
    try {
      const needsTranscode = ext === '.mov' || stat.size > 4 * 1024 * 1024;
      const args = needsTranscode
        ? [
            '-y',
            '-i',
            filePath,
            '-c:v',
            'libx264',
            '-crf',
            '27',
            '-preset',
            'veryfast',
            '-vf',
            "scale='min(1280,iw)':-2",
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            '-movflags',
            '+faststart',
            tempOut,
          ]
        : ['-y', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', tempOut];

      await execFileAsync('ffmpeg', args, { timeout: 35000 });
      if (fs.existsSync(tempOut)) {
        const optStat = fs.statSync(tempOut);
        if (optStat.size > 0) {
          if (ext === '.mov' && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          fs.renameSync(tempOut, targetMp4);
          return {
            url: `/uploads/${path.basename(targetMp4)}`,
            filename: path.basename(targetMp4),
            kind: 'video',
            sizeBytes: optStat.size,
            optimized: true,
          };
        }
      }
    } catch {
      if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
    }
  }

  return {
    url: `/uploads/${path.basename(filePath)}`,
    filename: path.basename(filePath),
    kind: 'video',
    sizeBytes: stat.size,
    optimized: false,
  };
}

export function listUploadedMedia(): Array<{
  filename: string;
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  sizeBytes: number;
}> {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  const entries = fs.readdirSync(UPLOAD_DIR);
  const items: Array<{
    filename: string;
    url: string;
    kind: 'image' | 'video' | 'audio' | 'file';
    sizeBytes: number;
    mtimeMs: number;
  }> = [];

  for (const name of entries) {
    if (name === '.gitkeep' || name.startsWith('.')) continue;
    const ext = path.extname(name).toLowerCase();
    const isImage = ALLOWED_IMAGE_EXTS.has(ext);
    const isVideo = ALLOWED_VIDEO_EXTS.has(ext);
    const isAudio = ALLOWED_AUDIO_EXTS.has(ext);
    const isDoc = ALLOWED_DOC_EXTS.has(ext);
    if (!isImage && !isVideo && !isAudio && !isDoc) continue;
    const full = path.join(UPLOAD_DIR, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    items.push({
      filename: name,
      url: `/uploads/${name}`,
      kind: isVideo ? 'video' : isAudio ? 'audio' : isDoc ? 'file' : 'image',
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }

  return items
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ filename, url, kind, sizeBytes }) => ({ filename, url, kind, sizeBytes }));
}

export function deleteUploadedMedia(filename: string): boolean {
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.gitkeep' || safeName.startsWith('.')) return false;
  const resolvedRoot = path.resolve(UPLOAD_DIR);
  const full = path.resolve(resolvedRoot, safeName);
  if (!full.startsWith(resolvedRoot + path.sep)) return false;
  if (!fs.existsSync(full)) return false;
  fs.unlinkSync(full);
  return true;
}
