import { normalizeBlocks, sanitizeMediaUrl } from '../src/lib/blocks.ts';
import { estimateReadingMinutes, slugifyPersian } from '../src/lib/slug.ts';
import type {
  AiProviderType,
  BackupMediaRecord,
  SiteBackupPayload,
  SiteSettings,
} from '../src/types/cms.ts';

export const BACKUP_FORMAT_ID = 'cms-full-backup';
export const BACKUP_VERSION = 1;

export interface NormalizedBackupImport {
  settings: Partial<SiteSettings>;
  aiConfig?: {
    provider: AiProviderType;
    model: string;
    baseUrl: string;
  };
  categories: Array<{
    name: string;
    nameEn: string;
    slug: string;
    description: string;
    descriptionEn: string;
    sortOrder: number;
  }>;
  posts: Array<{
    title: string;
    titleEn: string;
    slug: string;
    excerpt: string;
    excerptEn: string;
    category: string;
    coverImage: string;
    blocks: ReturnType<typeof normalizeBlocks>;
    blocksEn: ReturnType<typeof normalizeBlocks>;
    published: boolean;
    readingMinutes: number;
    createdAt: string;
    updatedAt: string;
  }>;
  projects: Array<{
    title: string;
    titleEn: string;
    role: string;
    roleEn: string;
    period: string;
    periodEn: string;
    summary: string;
    summaryEn: string;
    stack: string[];
    url: string;
    featured: boolean;
    sortOrder: number;
  }>;
  messages: Array<{
    name: string;
    contact: string;
    subject: string;
    message: string;
    read: boolean;
    createdAt: string;
  }>;
  mediaAssets: BackupMediaRecord[];
}

export class BackupValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

function asTrimmedString(val: unknown, maxLen = 10000): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function asIsoDate(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim()) {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback;
}

/**
 * Strictly validates and sanitizes a backup JSON payload prior to database restore.
 * - Rejects internal `_`-prefixed setting keys so session secrets, encrypted API keys,
 *   and admin credentials can never be overwritten via backup import.
 * - Sanitizes all URLs and normalizes all post blocks to prevent unsafe markup/schemes.
 */
export function validateAndNormalizeBackupPayload(
  raw: unknown,
  allowedSettingKeys: ReadonlySet<string>,
): NormalizedBackupImport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BackupValidationError('فرمت فایل بک‌آپ نامعتبر است.');
  }

  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT_ID || obj.version !== BACKUP_VERSION) {
    throw new BackupValidationError(
      'نسخه یا ساختار فایل بک‌آپ پشتیبانی نمی‌شود (باید فایل JSON خروجی همین سیستم باشد).',
    );
  }

  const now = new Date().toISOString();

  // 1. Settings (strict allowlist; never allow internal `_` keys)
  const cleanSettings: Partial<SiteSettings> = {};
  if (obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
    for (const [k, v] of Object.entries(obj.settings as Record<string, unknown>)) {
      if (k.startsWith('_') || !allowedSettingKeys.has(k)) continue;
      if (typeof v === 'string') {
        (cleanSettings as Record<string, string>)[k] = v.slice(0, 100000);
      }
    }
  }

  // 2. Non-secret AI config metadata (never accepts API keys)
  let aiConfig: NormalizedBackupImport['aiConfig'];
  if (obj.aiConfig && typeof obj.aiConfig === 'object' && !Array.isArray(obj.aiConfig)) {
    const rawAi = obj.aiConfig as Record<string, unknown>;
    const provider: AiProviderType =
      rawAi.provider === 'openai_compatible' ? 'openai_compatible' : 'gemini';
    aiConfig = {
      provider,
      model: asTrimmedString(rawAi.model, 120),
      baseUrl: asTrimmedString(rawAi.baseUrl, 500),
    };
  }

  // 3. Categories
  const seenCatNames = new Set<string>();
  const seenCatSlugs = new Set<string>();
  const categories: NormalizedBackupImport['categories'] = [];
  if (Array.isArray(obj.categories)) {
    for (let i = 0; i < Math.min(obj.categories.length, 200); i++) {
      const item = obj.categories[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = asTrimmedString(rec.name, 160);
      if (!name || seenCatNames.has(name)) continue;
      let slug = asTrimmedString(rec.slug, 180) || slugifyPersian(name);
      if (seenCatSlugs.has(slug)) slug = `${slug}-${i + 1}`;
      seenCatNames.add(name);
      seenCatSlugs.add(slug);
      categories.push({
        name,
        nameEn: asTrimmedString(rec.nameEn, 160),
        slug,
        description: asTrimmedString(rec.description, 1000),
        descriptionEn: asTrimmedString(rec.descriptionEn, 1000),
        sortOrder: typeof rec.sortOrder === 'number' && Number.isFinite(rec.sortOrder)
          ? Math.trunc(rec.sortOrder)
          : i + 1,
      });
    }
  }

  // 4. Posts
  const seenPostSlugs = new Set<string>();
  const posts: NormalizedBackupImport['posts'] = [];
  if (Array.isArray(obj.posts)) {
    for (let i = 0; i < Math.min(obj.posts.length, 1000); i++) {
      const item = obj.posts[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const title = asTrimmedString(rec.title, 300);
      if (!title) continue;
      const baseSlug = asTrimmedString(rec.slug, 240) || slugifyPersian(title);
      let slug = baseSlug;
      let suffix = 2;
      while (seenPostSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix++}`;
      }
      seenPostSlugs.add(slug);
      const blocks = normalizeBlocks(rec.blocks);
      const blocksEn = Array.isArray(rec.blocksEn) ? normalizeBlocks(rec.blocksEn) : [];
      const createdAt = asIsoDate(rec.createdAt, now);
      const updatedAt = asIsoDate(rec.updatedAt, createdAt);
      posts.push({
        title,
        titleEn: asTrimmedString(rec.titleEn, 300),
        slug,
        excerpt: asTrimmedString(rec.excerpt, 1000) || title,
        excerptEn: asTrimmedString(rec.excerptEn, 1000),
        category: asTrimmedString(rec.category, 160) || 'General',
        coverImage: sanitizeMediaUrl(asTrimmedString(rec.coverImage, 1500)),
        blocks,
        blocksEn,
        published: rec.published !== false,
        readingMinutes:
          typeof rec.readingMinutes === 'number' && rec.readingMinutes >= 1
            ? Math.trunc(rec.readingMinutes)
            : estimateReadingMinutes(blocks),
        createdAt,
        updatedAt,
      });
    }
  }

  // 5. Projects
  const projects: NormalizedBackupImport['projects'] = [];
  if (Array.isArray(obj.projects)) {
    for (let i = 0; i < Math.min(obj.projects.length, 300); i++) {
      const item = obj.projects[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const title = asTrimmedString(rec.title, 240);
      if (!title) continue;
      const stack = Array.isArray(rec.stack)
        ? rec.stack
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 60))
            .slice(0, 20)
        : [];
      projects.push({
        title,
        titleEn: asTrimmedString(rec.titleEn, 240),
        role: asTrimmedString(rec.role, 160),
        roleEn: asTrimmedString(rec.roleEn, 160),
        period: asTrimmedString(rec.period, 80),
        periodEn: asTrimmedString(rec.periodEn, 80),
        summary: asTrimmedString(rec.summary, 2000),
        summaryEn: asTrimmedString(rec.summaryEn, 2000),
        stack,
        url: sanitizeMediaUrl(asTrimmedString(rec.url, 1500)),
        featured: rec.featured !== false,
        sortOrder:
          typeof rec.sortOrder === 'number' && Number.isFinite(rec.sortOrder)
            ? Math.trunc(rec.sortOrder)
            : i + 1,
      });
    }
  }

  // 6. Messages
  const messages: NormalizedBackupImport['messages'] = [];
  if (Array.isArray(obj.messages)) {
    for (let i = 0; i < Math.min(obj.messages.length, 2000); i++) {
      const item = obj.messages[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = asTrimmedString(rec.name, 140);
      const contact = asTrimmedString(rec.contact, 180);
      const message = asTrimmedString(rec.message, 4000);
      if (!name || !message) continue;
      messages.push({
        name,
        contact,
        subject: asTrimmedString(rec.subject, 200) || 'Message',
        message,
        read: Boolean(rec.read),
        createdAt: asIsoDate(rec.createdAt, now),
      });
    }
  }

  // 7. Media Assets
  const seenPublicIds = new Set<string>();
  const mediaAssets: BackupMediaRecord[] = [];
  if (Array.isArray(obj.mediaAssets)) {
    for (let i = 0; i < Math.min(obj.mediaAssets.length, 2000); i++) {
      const item = obj.mediaAssets[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const publicId = asTrimmedString(rec.publicId, 300);
      const url = sanitizeMediaUrl(asTrimmedString(rec.url, 1500));
      if (!publicId || !url || seenPublicIds.has(publicId)) continue;
      seenPublicIds.add(publicId);
      const kind =
        rec.kind === 'video' || rec.kind === 'audio' || rec.kind === 'file' ? rec.kind : 'image';
      const resourceType =
        rec.resourceType === 'video' || rec.resourceType === 'raw' ? rec.resourceType : 'image';
      mediaAssets.push({
        publicId,
        filename: asTrimmedString(rec.filename, 300) || publicId,
        url,
        kind,
        resourceType,
        sizeBytes:
          typeof rec.sizeBytes === 'number' && Number.isFinite(rec.sizeBytes) && rec.sizeBytes >= 0
            ? Math.trunc(rec.sizeBytes)
            : 0,
        createdAt: asIsoDate(rec.createdAt, now),
      });
    }
  }

  return {
    settings: cleanSettings,
    aiConfig,
    categories,
    posts,
    projects,
    messages,
    mediaAssets,
  };
}

export function createBackupEnvelope(data: Omit<SiteBackupPayload, 'format' | 'version' | 'exportedAt'>): SiteBackupPayload {
  return {
    format: BACKUP_FORMAT_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
  };
}
