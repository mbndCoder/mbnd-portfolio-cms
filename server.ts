import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  authenticateAdminUser,
  bumpAdminTokenVersion,
  changeAdminCredentials,
  createMessage,
  deleteCategory,
  deleteMessage,
  deletePost,
  deleteProject,
  getAdminUserByUsername,
  getAiConfigPublic,
  getOrCreateSessionSecret,
  getPostBySlug,
  getSettings,
  hasAnyAdminUser,
  isPlaceholderEnv,
  listCategories,
  listMessages,
  listPosts,
  listProjects,
  markMessageRead,
  parseSocialLinks,
  parseVCardExtraFields,
  reorderCategories,
  reorderProjects,
  setupFirstAdminUser,
  updateAiConfig,
  updateSettings,
  upsertCategory,
  upsertPost,
  upsertProject,
} from './server/db.ts';
import {
  createSessionToken,
  extractClientIp,
  validateStrongPassword,
  verifySessionToken,
} from './server/auth.ts';
import {
  runAdminAiAssist,
  testAdminAiConnection,
  translateAdminContentToEnglish,
  validateBaseUrl,
  type TranslateTargetKind,
} from './server/ai.ts';
import {
  deleteUploadedMedia,
  listUploadedMedia,
  optimizeUploadedMedia,
  UPLOAD_DIR,
  uploadMiddleware,
} from './server/uploads.ts';
import { normalizeBlocks } from './src/lib/blocks.ts';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  const appPort = Number(process.env.APP_PORT);
  if (Number.isInteger(appPort) && appPort > 0) return appPort;
  return 3000;
}

const PORT = resolvePort();
const IS_PROD = process.env.NODE_ENV === 'production';

const RAW_ADMIN_ROUTE = (process.env.ADMIN_ROUTE || '').trim();
const ADMIN_ROUTE =
  RAW_ADMIN_ROUTE && !isPlaceholderEnv(RAW_ADMIN_ROUTE)
    ? RAW_ADMIN_ROUTE.replace(/^\/+|\/+$/g, '')
    : '';

const SESSION_SECRET = getOrCreateSessionSecret();
const COOKIE_NAME = 'mbnd_session';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const contactAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    return true;
  }
  return entry.count < 5;
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  entry.count += 1;
}

function clearFailedLogin(ip: string): void {
  loginAttempts.delete(ip);
}

function checkContactRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = contactAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    contactAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count += 1;
  return true;
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeVCardField(str: string): string {
  return str.replace(/[\r\n]+/g, ' ').replace(/[;,\\]/g, (m) => `\\${m}`);
}

function foldVCardLine(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 74));
  let idx = 74;
  while (idx < line.length) {
    parts.push(` ${line.slice(idx, idx + 73)}`);
    idx += 73;
  }
  return parts.join('\r\n');
}

function isHttpsRequest(req: express.Request): boolean {
  const cfVisitor = req.get('cf-visitor');
  if (cfVisitor && cfVisitor.includes('"https"')) {
    return true;
  }
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return req.secure || req.protocol === 'https' || forwardedProto === 'https';
}

function getBaseOrigin(req: express.Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && !isPlaceholderEnv(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  const proto = isHttpsRequest(req) ? 'https' : req.protocol || 'http';
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function setSessionCookie(req: express.Request, res: express.Response, token: string): void {
  const secure = isHttpsRequest(req);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${24 * 60 * 60}`,
    `SameSite=${secure ? 'None' : 'Lax'}`,
  ];
  if (secure) {
    parts.push('Secure', 'Partitioned');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response): void {
  const secure = isHttpsRequest(req);
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    `SameSite=${secure ? 'None' : 'Lax'}`,
  ];
  if (secure) {
    parts.push('Secure', 'Partitioned');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function extractSessionToken(req: express.Request): { token: string; viaBearer: boolean } {
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, viaBearer: true };
  }
  const cookieToken = req.cookies?.[COOKIE_NAME];
  return { token: typeof cookieToken === 'string' ? cookieToken : '', viaBearer: false };
}

function verifyActiveAdminSession(req: express.Request): {
  username: string;
  role: string;
  tokenVersion: number;
  viaBearer: boolean;
} | null {
  const { token, viaBearer } = extractSessionToken(req);
  const session = verifySessionToken(token, SESSION_SECRET);
  if (!session || session.role !== 'admin') return null;

  const dbUser = getAdminUserByUsername(session.username);
  if (!dbUser || dbUser.tokenVersion !== session.ver) {
    return null;
  }
  return {
    username: dbUser.username,
    role: dbUser.role,
    tokenVersion: dbUser.tokenVersion,
    viaBearer,
  };
}

function passesCsrfCheck(req: express.Request): boolean {
  if (req.get('x-requested-with') === 'XMLHttpRequest') {
    return true;
  }
  const origin = req.get('origin');
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = req.get('host');
  if (origin && (forwardedHost || host)) {
    try {
      const parsed = new URL(origin);
      if ((forwardedHost && parsed.host === forwardedHost) || (host && parsed.host === host)) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

type AuthedRequest = express.Request & {
  adminUser?: { username: string; role: string; tokenVersion: number };
};

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const active = verifyActiveAdminSession(req);
  if (!active) {
    res.status(401).json({ error: 'احراز هویت انجام نشده است یا نشست منقضی شده.' });
    return;
  }
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  if (isMutation && !active.viaBearer && !passesCsrfCheck(req)) {
    res.status(403).json({ error: 'درخواست نامعتبر است (خطای امنیتی مبدا).' });
    return;
  }
  (req as AuthedRequest).adminUser = {
    username: active.username,
    role: active.role,
    tokenVersion: active.tokenVersion,
  };
  next();
}

const vcardAvatarCache = new Map<string, { mtimeMs: number; base64: string }>();

async function resolveVCardAvatarBase64(avatarSetting: string): Promise<string> {
  const publicDir = path.resolve(__dirname, 'public');
  const uploadRoot = path.resolve(UPLOAD_DIR);
  const cleaned = avatarSetting.trim();

  let targetPath = '';
  if (cleaned.startsWith('/uploads/')) {
    const safeName = path.basename(cleaned.slice('/uploads/'.length));
    const candidate = path.resolve(uploadRoot, safeName);
    if (candidate.startsWith(uploadRoot + path.sep) && fs.existsSync(candidate)) {
      targetPath = candidate;
    }
  } else if (cleaned.startsWith('/') && !cleaned.includes('..')) {
    const candidate = path.resolve(publicDir, cleaned.replace(/^\/+/, ''));
    if (candidate.startsWith(publicDir + path.sep) && fs.existsSync(candidate)) {
      targetPath = candidate;
    }
  }

  if (!targetPath) {
    const defaultAvatar = path.resolve(publicDir, 'vcard-avatar.jpg');
    if (fs.existsSync(defaultAvatar)) {
      targetPath = defaultAvatar;
    }
  }

  if (!targetPath) return '';

  try {
    const stat = fs.statSync(targetPath);
    const cached = vcardAvatarCache.get(targetPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.base64;
    }

    const ext = path.extname(targetPath).toLowerCase();
    let jpgBuffer: Buffer;
    if (ext === '.jpg' || ext === '.jpeg') {
      jpgBuffer = fs.readFileSync(targetPath);
    } else {
      const tmpJpg = path.join(os.tmpdir(), `mbnd-vcard-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            targetPath,
            '-vf',
            'scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=#121212',
            '-q:v',
            '3',
            tmpJpg,
          ],
          { timeout: 10000 },
        );
        jpgBuffer = fs.readFileSync(tmpJpg);
      } finally {
        if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg);
      }
    }

    const base64 = jpgBuffer.toString('base64');
    vcardAvatarCache.set(targetPath, { mtimeMs: stat.mtimeMs, base64 });
    return base64;
  } catch {
    return '';
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Lightweight native gzip/br compression for weak/slow connections (zero extra packages)
  app.use((req, res, next) => {
    const accept = String(req.headers['accept-encoding'] || '');
    const supportsBr = accept.includes('br');
    const supportsGzip = accept.includes('gzip');
    if (!supportsBr && !supportsGzip) {
      next();
      return;
    }

    const origEnd = res.end.bind(res);
    const origSend = res.send.bind(res);

    res.send = function compressedSend(body?: unknown): express.Response {
      if (
        res.headersSent ||
        res.getHeader('Content-Encoding') ||
        req.method === 'HEAD' ||
        body === undefined ||
        body === null
      ) {
        return origSend(body as never);
      }

      const contentType = String(res.getHeader('Content-Type') || '');
      const isTextLike =
        typeof body === 'string' ||
        contentType.includes('text/') ||
        contentType.includes('application/json') ||
        contentType.includes('application/javascript') ||
        contentType.includes('application/xml') ||
        contentType.includes('image/svg+xml');

      if (!isTextLike) {
        return origSend(body as never);
      }

      const buf = Buffer.isBuffer(body)
        ? body
        : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');

      if (buf.length < 1024) {
        return origSend(body as never);
      }

      try {
        const compressed = supportsBr
          ? zlib.brotliCompressSync(buf, {
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
            })
          : zlib.gzipSync(buf, { level: 6 });
        res.setHeader('Content-Encoding', supportsBr ? 'br' : 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', String(compressed.length));
        return origEnd(compressed) as unknown as express.Response;
      } catch {
        return origSend(body as never);
      }
    };

    next();
  });

  app.get('/favicon.ico', (_req, res) => {
    const favPath = path.resolve(__dirname, 'public/favicon.png');
    if (fs.existsSync(favPath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.type('image/png').sendFile(favPath);
      return;
    }
    res.status(204).end();
  });

  app.use(
    '/fonts',
    express.static(path.resolve(__dirname, 'public/fonts'), {
      maxAge: '365d',
      immutable: true,
    }),
  );
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      maxAge: '30d',
    }),
  );
  app.use(
    express.static(path.resolve(__dirname, 'public'), {
      index: false,
      maxAge: '7d',
    }),
  );

  // ==================== SEO & AI DISCOVERABILITY ENDPOINTS ====================
  app.get('/robots.txt', (req, res) => {
    const origin = getBaseOrigin(req);
    const body = [
      '# Search Engines & AI Search Crawlers',
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      'User-agent: Googlebot',
      'Allow: /',
      '',
      'User-agent: OAI-SearchBot',
      'Allow: /',
      '',
      'User-agent: ChatGPT-User',
      'Allow: /',
      '',
      'User-agent: PerplexityBot',
      'Allow: /',
      '',
      'User-agent: ClaudeBot',
      'Allow: /',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      `# LLMs context: ${origin}/llms.txt`,
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(body);
  });

  function blocksToPlainMarkdown(blocks: ReturnType<typeof normalizeBlocks>): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case 'h2':
            return `## ${block.text}`;
          case 'h3':
            return `### ${block.text}`;
          case 'paragraph':
            return block.text;
          case 'quote':
            return `> ${block.text}${block.author ? ` — ${block.author}` : ''}`;
          case 'list':
            return block.items
              .map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`))
              .join('\n');
          case 'code':
            return `\`\`\`${block.language || ''}\n${block.code}\n\`\`\``;
          case 'card':
            return `**${block.title}**: ${block.body}`;
          case 'embed':
            return `[${block.title}](${block.url})${block.description ? ` — ${block.description}` : ''}`;
          case 'button':
            return `[${block.label}](${block.url})`;
          case 'image':
            return block.caption || block.alt ? `Image: ${block.caption || block.alt}` : '';
          case 'video':
            return block.caption ? `Video: ${block.caption}` : '';
          case 'audio':
            return block.title ? `Audio: ${block.title}` : '';
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
  }

  app.get('/llms.txt', (req, res) => {
    const origin = getBaseOrigin(req);
    const s = getSettings();
    const publishedPosts = listPosts(false);
    const projects = listProjects();
    const socials = parseSocialLinks(s.socialLinksJson).filter((l) => l.enabled !== false);

    const lines = [
      `# ${s.brandName || 'Mohammad Bagher'} (${s.vcardFullName || 'محمدباقر نوری'})`,
      '',
      `> ${s.siteDescription}`,
      '',
      `- Website: ${origin}/`,
      `- Focus: ${s.aboutFocusText}`,
      `- Full Markdown Index: ${origin}/llms-full.txt`,
      `- Sitemap: ${origin}/sitemap.xml`,
      '',
      '## Key Pages',
      `- [Home](${origin}/): ${s.heroTitle}`,
      `- [Blog](${origin}/blog): ${s.blogPageSubtitle || s.blogSectionTitle}`,
      `- [Projects](${origin}/projects): ${s.projectsPageSubtitle || s.projectsSectionTitle}`,
      `- [About & Contact](${origin}/about): ${s.aboutTitle}`,
      '',
      '## Direct Channels',
      ...socials.map((l) => `- ${l.label}: ${l.url}${l.handle ? ` (${l.handle})` : ''}`),
      '',
      '## Projects',
      ...projects.map(
        (p) =>
          `- [${p.title}](${p.url.startsWith('http') ? p.url : `${origin}${p.url}`}) (${p.role}): ${p.summary}`,
      ),
      '',
      '## Published Articles',
      ...publishedPosts.map(
        (post) =>
          `- [${post.title}](${origin}/blog/${encodeURIComponent(post.slug)}) [${post.category}]: ${post.excerpt}`,
      ),
    ];

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(lines.join('\n') + '\n');
  });

  app.get('/llms-full.txt', (req, res) => {
    const origin = getBaseOrigin(req);
    const s = getSettings();
    const publishedPosts = listPosts(false);
    const projects = listProjects();

    const sections: string[] = [
      `# ${s.brandName || 'Mohammad Bagher'} — Complete Site Content`,
      '',
      `Canonical URL: ${origin}/`,
      `Author: ${s.vcardFullName || 'محمدباقر نوری'} (${s.brandName})`,
      '',
      '## About',
      s.aboutBio,
      '',
      `Focus Areas: ${s.aboutFocusText}`,
      '',
      '## Projects',
      ...projects.map(
        (p) =>
          `### ${p.title}\n- Role: ${p.role}\n- Period: ${p.period}\n- Stack: ${p.stack.join(', ')}\n- URL: ${
            p.url.startsWith('http') ? p.url : `${origin}${p.url}`
          }\n\n${p.summary}`,
      ),
      '',
      '## Blog Articles',
      ...publishedPosts.map((post) => {
        const bodyMd = blocksToPlainMarkdown(post.blocks);
        return [
          `### ${post.title}`,
          `- URL: ${origin}/blog/${encodeURIComponent(post.slug)}`,
          `- Category: ${post.category}`,
          `- Published: ${post.createdAt}`,
          `- Updated: ${post.updatedAt || post.createdAt}`,
          `- Reading Time: ${post.readingMinutes} min`,
          '',
          post.excerpt,
          '',
          bodyMd,
        ].join('\n');
      }),
    ];

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(sections.join('\n\n') + '\n');
  });

  app.get('/sitemap.xml', (req, res) => {
    const origin = getBaseOrigin(req);
    const publishedPosts = listPosts(false);
    const latestLastMod = publishedPosts[0]?.updatedAt || publishedPosts[0]?.createdAt;
    const staticRoutes: Array<{
      loc: string;
      changefreq: string;
      priority: string;
      lastmod?: string;
    }> = [
      { loc: `${origin}/`, changefreq: 'weekly', priority: '1.0', lastmod: latestLastMod },
      { loc: `${origin}/blog`, changefreq: 'daily', priority: '0.9', lastmod: latestLastMod },
      { loc: `${origin}/projects`, changefreq: 'monthly', priority: '0.8' },
      { loc: `${origin}/about`, changefreq: 'monthly', priority: '0.7' },
    ];

    const postEntries = publishedPosts.map((post) => ({
      loc: `${origin}/blog/${encodeURIComponent(post.slug)}`,
      lastmod: post.updatedAt || post.createdAt,
      changefreq: 'weekly',
      priority: '0.8',
    }));

    const urls = [...staticRoutes, ...postEntries]
      .map(
        (u) =>
          `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n${
            u.lastmod ? `    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n` : ''
          }    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(xml);
  });

  // ==================== HEALTH & CACHE DISCIPLINE (CLOUDFLARE-READY) ====================
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
  });

  app.use('/api/public', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use('/api/admin', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // ==================== PUBLIC API ====================
  app.get('/api/public/site', (_req, res) => {
    const siteSettings = getSettings();
    const siteCategories = listCategories();
    const sitePosts = listPosts(false);
    const siteProjects = listProjects();
    res.json({
      settings: siteSettings,
      categories: siteCategories,
      posts: sitePosts,
      projects: siteProjects,
    });
  });

  app.get('/api/public/posts', (_req, res) => {
    res.json({ posts: listPosts(false), categories: listCategories() });
  });

  app.get('/api/public/posts/:slug', (req, res) => {
    const post = getPostBySlug(req.params.slug, false);
    if (!post) {
      res.status(404).json({ error: 'نوشته مورد نظر پیدا نشد.' });
      return;
    }
    res.json({ post });
  });

  app.get('/api/save-contact', async (req, res) => {
    const s = getSettings();
    if (s.vcardEnabled === 'false') {
      res.status(404).json({ error: 'کارت مخاطب در حال حاضر غیرفعال است.' });
      return;
    }

    const origin = getBaseOrigin(req);
    const fullName = escapeVCardField(s.vcardFullName || 'محمدباقر نوری');
    const org = escapeVCardField(s.vcardOrg || s.brandName || 'Mohammad Bagher');
    const title = escapeVCardField(
      s.vcardTitle || 'طراحی اپ و سایت با هوش مصنوعی · اتوماسیون و تعمیر نرم‌افزاری سیستم‌ها',
    );
    const email = escapeVCardField(s.email || 'mbnd1224@gmail.com');
    const phone = s.vcardPhone?.trim() ? escapeVCardField(s.vcardPhone.trim()) : '';
    const website = s.vcardWebsite?.trim() || origin;

    const socials = parseSocialLinks(s.socialLinksJson).filter((l) => l.enabled !== false);
    const extraSocialLines = socials
      .filter((l) => l.url.startsWith('http://') || l.url.startsWith('https://'))
      .map((l) => `URL;TYPE=${escapeVCardField(l.iconKey)}:${escapeVCardField(l.url)}`);

    const extraFields = parseVCardExtraFields(s.vcardExtraFieldsJson || '[]');
    const extraFieldLines: string[] = [];
    const extraNotes: string[] = [];

    for (const field of extraFields) {
      const safeVal = escapeVCardField(field.value);
      const safeLabel = field.label ? escapeVCardField(field.label) : '';
      if (field.type === 'tel') {
        extraFieldLines.push(`TEL;TYPE=CELL,VOICE:${safeVal}`);
      } else if (field.type === 'email') {
        extraFieldLines.push(`EMAIL;TYPE=INTERNET:${safeVal}`);
      } else if (field.type === 'url') {
        extraFieldLines.push(
          safeLabel ? `URL;TYPE=${safeLabel}:${safeVal}` : `URL:${safeVal}`,
        );
      } else if (field.type === 'address') {
        extraFieldLines.push(`ADR;TYPE=HOME;CHARSET=UTF-8:;;${safeVal};;;;`);
      } else if (field.type === 'note') {
        extraNotes.push(field.label ? `${field.label}: ${field.value}` : field.value);
      }
    }

    const noteParts = [
      s.vcardNote?.trim(),
      ...extraNotes,
      ...socials.filter((l) => l.handle).map((l) => `${l.label}: ${l.handle}`),
    ].filter(Boolean);
    const note = escapeVCardField(Array.from(new Set(noteParts)).join(' | '));

    const b64Avatar = await resolveVCardAvatarBase64(s.vcardAvatar || '/vcard-avatar.jpg');
    const photoLine = b64Avatar ? foldVCardLine(`PHOTO;ENCODING=b;TYPE=JPEG:${b64Avatar}`) : '';

    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN;CHARSET=UTF-8:${fullName}`,
      `N;CHARSET=UTF-8:${fullName};;;;`,
      org ? `ORG;CHARSET=UTF-8:${org}` : '',
      title ? `TITLE;CHARSET=UTF-8:${title}` : '',
      email ? `EMAIL;TYPE=INTERNET,PREF:${email}` : '',
      phone ? `TEL;TYPE=CELL,VOICE:${phone}` : '',
      website ? `URL;TYPE=HOME:${escapeVCardField(website)}` : '',
      ...extraSocialLines,
      ...extraFieldLines,
      note ? `NOTE;CHARSET=UTF-8:${note}` : '',
      photoLine,
      'END:VCARD',
    ].filter(Boolean);

    const vcardBody = lines.join('\r\n') + '\r\n';
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `${disposition}; filename="mohammad-bagher.vcf"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(vcardBody);
  });

  app.post('/api/public/contact', (req, res) => {
    const ip = extractClientIp(req.headers, req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkContactRateLimit(ip)) {
      res.status(429).json({
        error: 'تعداد پیام‌های ارسالی شما زیاد بوده است. لطفاً چند دقیقه دیگر دوباره تلاش کن.',
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : 'پیام از سایت';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (name.length < 2) {
      res.status(400).json({ error: 'لطفاً اسمت رو وارد کن (حداقل ۲ حرف).' });
      return;
    }
    if (contact.length < 4 || !contact.includes('@')) {
      res.status(400).json({ error: 'لطفاً یک ایمیل معتبر وارد کن.' });
      return;
    }
    if (message.length < 5) {
      res.status(400).json({ error: 'متن پیام خیلی کوتاهه (حداقل ۵ حرف بنویس).' });
      return;
    }

    const created = createMessage({
      name: name.slice(0, 120),
      contact: contact.slice(0, 160),
      subject: subject.slice(0, 180) || 'پیام از سایت',
      message: message.slice(0, 4000),
    });

    res.status(201).json({ ok: true, id: created.id });
  });

  // ==================== SECRET ADMIN API ====================
  app.get('/api/admin/session', (req, res) => {
    if (!ADMIN_ROUTE) {
      res.json({ authenticated: false, needsSetup: false });
      return;
    }
    const needsSetup = !hasAnyAdminUser();
    const active = verifyActiveAdminSession(req);
    if (!active) {
      res.json({ authenticated: false, needsSetup });
      return;
    }
    res.json({ authenticated: true, username: active.username, needsSetup: false });
  });

  app.post('/api/admin/setup', (req, res) => {
    if (!ADMIN_ROUTE) {
      res.status(403).json({ error: 'مسیر پنل مدیریت در تنظیمات سرور فعال نشده است.' });
      return;
    }
    if (!passesCsrfCheck(req)) {
      res.status(403).json({ error: 'درخواست نامعتبر (بررسی امنیتی مبدا).' });
      return;
    }
    if (hasAnyAdminUser()) {
      res.status(403).json({ error: 'حساب مدیر قبلاً راه‌اندازی شده است.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const strengthError = validateStrongPassword(password);
    if (strengthError) {
      res.status(400).json({ error: strengthError });
      return;
    }

    const created = setupFirstAdminUser({ username, password });
    if (!created.ok) {
      res.status(400).json({ error: created.error });
      return;
    }

    const token = createSessionToken(created.user, SESSION_SECRET);
    setSessionCookie(req, res, token);
    res.status(201).json({ ok: true, username: created.user.username, token });
  });

  app.post('/api/admin/login', (req, res) => {
    if (!ADMIN_ROUTE) {
      res.status(403).json({ error: 'مسیر پنل مدیریت در تنظیمات سرور فعال نشده است.' });
      return;
    }
    if (!passesCsrfCheck(req)) {
      res.status(403).json({ error: 'درخواست نامعتبر (بررسی امنیتی مبدا).' });
      return;
    }
    const ip = extractClientIp(req.headers, req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkRateLimit(ip)) {
      res.status(429).json({
        error: 'تلاش‌های ناموفق بیش از حد مجاز بود (۵ بار). لطفاً ۱۵ دقیقه بعد دوباره امتحان کن.',
      });
      return;
    }

    if (!hasAnyAdminUser()) {
      res.status(400).json({ error: 'ابتدا حساب مدیر را در فرم راه‌اندازی اولیه ایجاد کن.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است.' });
      return;
    }

    const user = authenticateAdminUser(username, password);
    if (!user) {
      recordFailedLogin(ip);
      res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
      return;
    }

    clearFailedLogin(ip);
    const token = createSessionToken(user, SESSION_SECRET);
    setSessionCookie(req, res, token);
    res.json({ ok: true, username: user.username, token });
  });

  app.post('/api/admin/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/admin/bootstrap', requireAdmin, (req, res) => {
    const adminUser = (req as AuthedRequest).adminUser;
    res.json({
      username: adminUser?.username || 'admin',
      settings: getSettings(),
      categories: listCategories(),
      posts: listPosts(true),
      projects: listProjects(),
      messages: listMessages(),
      media: listUploadedMedia(),
      aiConfig: getAiConfigPublic(),
    });
  });

  // Security: Change Credentials & Revoke Sessions
  app.put('/api/admin/security/credentials', requireAdmin, (req, res) => {
    const adminUser = (req as AuthedRequest).adminUser!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newUsername = typeof body.newUsername === 'string' ? body.newUsername.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword) {
      res.status(400).json({ error: 'وارد کردن رمز عبور فعلی الزامی است.' });
      return;
    }
    if (!newPassword && (!newUsername || newUsername === adminUser.username)) {
      res.status(400).json({ error: 'تغییری برای نام کاربری یا رمز عبور وارد نشده است.' });
      return;
    }
    if (newPassword) {
      const pwErr = validateStrongPassword(newPassword);
      if (pwErr) {
        res.status(400).json({ error: pwErr });
        return;
      }
    }

    const result = changeAdminCredentials({
      currentUsername: adminUser.username,
      currentPassword,
      newUsername: newUsername || undefined,
      newPassword: newPassword || undefined,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const freshToken = createSessionToken(result.user, SESSION_SECRET);
    setSessionCookie(req, res, freshToken);
    res.json({ ok: true, username: result.user.username, token: freshToken });
  });

  app.post('/api/admin/security/revoke-all', requireAdmin, (req, res) => {
    const adminUser = (req as AuthedRequest).adminUser!;
    bumpAdminTokenVersion(adminUser.username);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const updated = updateSettings(req.body ?? {});
    res.json({ settings: updated });
  });

  // Categories CRUD + Drag-and-Drop Reorder
  app.put('/api/admin/categories/reorder', requireAdmin, (req, res) => {
    const ids = Array.isArray((req.body as Record<string, unknown>)?.ids)
      ? ((req.body as Record<string, unknown>).ids as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const updated = reorderCategories(ids);
    res.json({ categories: updated });
  });

  app.post('/api/admin/categories', requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'نام دسته‌بندی نمی‌تواند خالی باشد.' });
      return;
    }
    try {
      const category = upsertCategory({
        name,
        nameEn: typeof body.nameEn === 'string' ? body.nameEn.trim() : '',
        description,
        descriptionEn: typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : '',
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      });
      res.status(201).json({ category });
    } catch {
      res.status(409).json({ error: 'این دسته‌بندی قبلاً ثبت شده است.' });
    }
  });

  app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!Number.isInteger(id) || !name) {
      res.status(400).json({ error: 'اطلاعات دسته‌بندی ناقص است.' });
      return;
    }
    try {
      const category = upsertCategory({
        id,
        name,
        nameEn: typeof body.nameEn === 'string' ? body.nameEn.trim() : '',
        description,
        descriptionEn: typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : '',
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      });
      res.json({ category });
    } catch {
      res.status(409).json({ error: 'نام دسته‌بندی تکراری است.' });
    }
  });

  app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    res.json({ ok: deleteCategory(id) });
  });

  // Posts CRUD
  app.post('/api/admin/posts', requireAdmin, (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
      if (!title) {
        res.status(400).json({ error: 'عنوان نوشته نمی‌تواند خالی باشد.' });
        return;
      }
      const post = upsertPost({
        title,
        titleEn: typeof body.titleEn === 'string' ? body.titleEn.trim() : '',
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        excerpt: excerpt || title,
        excerptEn: typeof body.excerptEn === 'string' ? body.excerptEn.trim() : '',
        category: typeof body.category === 'string' ? body.category.trim() : 'یادگیری',
        coverImage: typeof body.coverImage === 'string' ? body.coverImage.trim() : '',
        blocks: normalizeBlocks(body.blocks),
        blocksEn: Array.isArray(body.blocksEn) ? normalizeBlocks(body.blocksEn) : [],
        published: body.published !== false,
      });
      res.status(201).json({ post });
    } catch (err) {
      console.error('POST /api/admin/posts failed:', err);
      res.status(500).json({ error: 'خطا در ذخیره نوشته. لطفاً دوباره امتحان کن.' });
    }
  });

  app.put('/api/admin/posts/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'شناسه نوشته نامعتبر است.' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        res.status(400).json({ error: 'عنوان نوشته نمی‌تواند خالی باشد.' });
        return;
      }
      const post = upsertPost({
        id,
        title,
        titleEn: typeof body.titleEn === 'string' ? body.titleEn.trim() : '',
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        excerpt: typeof body.excerpt === 'string' ? body.excerpt.trim() : title,
        excerptEn: typeof body.excerptEn === 'string' ? body.excerptEn.trim() : '',
        category: typeof body.category === 'string' ? body.category.trim() : 'یادگیری',
        coverImage: typeof body.coverImage === 'string' ? body.coverImage.trim() : '',
        blocks: normalizeBlocks(body.blocks),
        blocksEn: Array.isArray(body.blocksEn) ? normalizeBlocks(body.blocksEn) : [],
        published: Boolean(body.published),
      });
      res.json({ post });
    } catch (err) {
      console.error('PUT /api/admin/posts/:id failed:', err);
      res.status(500).json({ error: 'خطا در به‌روزرسانی نوشته.' });
    }
  });

  app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    res.json({ ok: deletePost(id) });
  });

  // Projects CRUD + Drag-and-Drop Reorder
  app.put('/api/admin/projects/reorder', requireAdmin, (req, res) => {
    const ids = Array.isArray((req.body as Record<string, unknown>)?.ids)
      ? ((req.body as Record<string, unknown>).ids as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const updated = reorderProjects(ids);
    res.json({ projects: updated });
  });

  app.post('/api/admin/projects', requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'عنوان پروژه الزامی است.' });
      return;
    }
    const project = upsertProject({
      title,
      titleEn: typeof body.titleEn === 'string' ? body.titleEn.trim() : '',
      role: typeof body.role === 'string' ? body.role.trim() : '',
      roleEn: typeof body.roleEn === 'string' ? body.roleEn.trim() : '',
      period: typeof body.period === 'string' ? body.period.trim() : '',
      periodEn: typeof body.periodEn === 'string' ? body.periodEn.trim() : '',
      summary: typeof body.summary === 'string' ? body.summary.trim() : '',
      summaryEn: typeof body.summaryEn === 'string' ? body.summaryEn.trim() : '',
      stack: Array.isArray(body.stack)
        ? body.stack.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [],
      url: typeof body.url === 'string' ? body.url.trim() : '',
      featured: body.featured !== false,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : listProjects().length + 1,
    });
    res.status(201).json({ project });
  });

  app.put('/api/admin/projects/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!Number.isInteger(id) || !title) {
      res.status(400).json({ error: 'اطلاعات پروژه ناقص است.' });
      return;
    }
    const project = upsertProject({
      id,
      title,
      titleEn: typeof body.titleEn === 'string' ? body.titleEn.trim() : '',
      role: typeof body.role === 'string' ? body.role.trim() : '',
      roleEn: typeof body.roleEn === 'string' ? body.roleEn.trim() : '',
      period: typeof body.period === 'string' ? body.period.trim() : '',
      periodEn: typeof body.periodEn === 'string' ? body.periodEn.trim() : '',
      summary: typeof body.summary === 'string' ? body.summary.trim() : '',
      summaryEn: typeof body.summaryEn === 'string' ? body.summaryEn.trim() : '',
      stack: Array.isArray(body.stack)
        ? body.stack.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [],
      url: typeof body.url === 'string' ? body.url.trim() : '',
      featured: body.featured !== false,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    });
    res.json({ project });
  });

  app.delete('/api/admin/projects/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    res.json({ ok: deleteProject(id) });
  });

  // Messages
  app.patch('/api/admin/messages/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const read = Boolean((req.body as Record<string, unknown>)?.read);
    res.json({ ok: markMessageRead(id, read) });
  });

  app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    res.json({ ok: deleteMessage(id) });
  });

  // Uploads
  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    uploadMiddleware.single('file')(req, res, async (err) => {
      if (err) {
        const msg =
          err instanceof Error && err.message.includes('File too large')
            ? 'حجم فایل بیشتر از ۵۰ مگابایت است.'
            : err instanceof Error
              ? err.message
              : 'خطا در آپلود فایل.';
        res.status(400).json({ error: msg });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'هیچ فایلی انتخاب نشده است.' });
        return;
      }
      try {
        const result = await optimizeUploadedMedia(
          req.file.path,
          path.extname(req.file.originalname),
        );
        res.status(201).json({ file: result });
      } catch {
        res.status(500).json({ error: 'خطا در پردازش فایل آپلودشده.' });
      }
    });
  });

  app.delete('/api/admin/media/:filename', requireAdmin, (req, res) => {
    const ok = deleteUploadedMedia(req.params.filename);
    res.json({ ok });
  });

  // ==================== ADMIN-ONLY AI ASSISTANT API ====================
  app.get('/api/admin/ai/config', requireAdmin, (_req, res) => {
    res.json({ aiConfig: getAiConfigPublic() });
  });

  app.put('/api/admin/ai/config', requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const provider =
      body.provider === 'openai_compatible' || body.provider === 'gemini'
        ? body.provider
        : undefined;
    const rawBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined;
    let validatedBaseUrl = rawBaseUrl;
    if (rawBaseUrl) {
      try {
        validatedBaseUrl = validateBaseUrl(rawBaseUrl);
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'آدرس ارائه‌دهنده (Base URL) معتبر نیست.',
        });
        return;
      }
    }

    const updated = updateAiConfig({
      provider,
      model: typeof body.model === 'string' ? body.model : undefined,
      baseUrl: validatedBaseUrl,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      clearCustomApiKey: Boolean(body.clearCustomApiKey),
    });
    res.json({ aiConfig: updated });
  });

  app.post('/api/admin/ai/test', requireAdmin, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const providerOverride: 'openai_compatible' | 'gemini' | undefined =
        body.provider === 'openai_compatible'
          ? 'openai_compatible'
          : body.provider === 'gemini'
            ? 'gemini'
            : undefined;
      const override = {
        provider: providerOverride,
        model: typeof body.model === 'string' ? body.model : undefined,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      };
      const result = await testAdminAiConnection(override);
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'اتصال به ارائه‌دهنده هوش مصنوعی برقرار نشد.',
      });
    }
  });

  app.post('/api/admin/ai/assist', requireAdmin, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const action =
        body.action === 'write_full' ||
        body.action === 'polish' ||
        body.action === 'proofread' ||
        body.action === 'suggest' ||
        body.action === 'fill_meta' ||
        body.action === 'add_summary'
          ? body.action
          : 'chat';

      if (!prompt && action === 'chat') {
        res.status(400).json({ error: 'لطفاً درخواستت را برای دستیار بنویس.' });
        return;
      }

      const rawPost = (body.currentPost ?? {}) as Record<string, unknown>;
      const result = await runAdminAiAssist({
        prompt: prompt || 'بر اساس متن و فیلدهای فعلی اقدام کن.',
        action,
        history: Array.isArray(body.history)
          ? (body.history as Array<{ role: 'user' | 'assistant'; text: string }>)
          : [],
        currentPost: {
          title: typeof rawPost.title === 'string' ? rawPost.title : '',
          slug: typeof rawPost.slug === 'string' ? rawPost.slug : '',
          excerpt: typeof rawPost.excerpt === 'string' ? rawPost.excerpt : '',
          category: typeof rawPost.category === 'string' ? rawPost.category : '',
          coverImage: typeof rawPost.coverImage === 'string' ? rawPost.coverImage : '',
          blocks: normalizeBlocks(rawPost.blocks),
        },
        categories: listCategories().map((c) => c.name),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'خطا در پردازش درخواست هوش مصنوعی.',
      });
    }
  });

  app.post('/api/admin/ai/translate', requireAdmin, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const kind = body.kind;
      if (kind !== 'post' && kind !== 'category' && kind !== 'project' && kind !== 'settings') {
        res.status(400).json({ error: 'نوع محتوای انتخابی برای ترجمه نامعتبر است.' });
        return;
      }
      const payload =
        body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : null;
      if (!payload) {
        res.status(400).json({ error: 'داده‌ای برای ترجمه ارسال نشده است.' });
        return;
      }
      const result = await translateAdminContentToEnglish({
        kind: kind as TranslateTargetKind,
        payload,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'ترجمه هوشمند با خطا مواجه شد.',
      });
    }
  });

  // Ensure API errors always return clean Persian JSON (never English HTML stack traces)
  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('API Error:', err);
      const isPayload =
        typeof err === 'object' &&
        err !== null &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.too.large';
      res.status(isPayload ? 413 : 500).json({
        error: isPayload ? 'حجم داده‌های ارسالی بیش از حد مجاز است.' : 'خطای داخلی سرور رخ داد.',
      });
    },
  );

  // ==================== VITE / STATIC SPA + DYNAMIC SEO ====================
  const httpServer = http.createServer(app);
  let vite: Awaited<ReturnType<typeof import('vite')['createServer']>> | null = null;
  const hmrDisabled =
    process.env.DISABLE_HMR === 'true' ||
    Boolean(process.env.APP_URL?.includes('.run.app')) ||
    Boolean(process.env.K_SERVICE);

  if (!IS_PROD) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: hmrDisabled ? false : undefined,
      },
      appType: 'custom',
    });
    if (hmrDisabled) {
      // When HMR is disabled (e.g. DISABLE_HMR=true or Cloud Run / AI Studio proxy),
      // Vite's dev CSS/React transforms still import updateStyle/createHotContext from
      // /@vite/client. Serving a lightweight WebSocket-free shim preserves CSS injection
      // while eliminating recurring WebSocket connection errors.
      const NO_WS_VITE_CLIENT_SHIM = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`.trim();
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(NO_WS_VITE_CLIENT_SHIM);
      });
    }
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.resolve(distDir, 'assets'), {
        maxAge: '365d',
        immutable: true,
      }),
    );
    app.use(express.static(distDir, { index: false, maxAge: '7d' }));
  }

  const STATIC_OR_MODULE_PREFIXES = [
    '/src/',
    '/assets/',
    '/@vite/',
    '/@fs/',
    '/@id/',
    '/node_modules/',
    '/uploads/',
    '/fonts/',
  ];
  const STATIC_OR_MODULE_EXT_RE =
    /\.(js|mjs|cjs|ts|tsx|jsx|css|scss|map|png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|mov|mp3|wav|ogg|m4a|woff2?|ttf|eot|pdf|vcf|json|xml)$/i;

  app.get('*', async (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'مسیر API پیدا نشد.' });
      return;
    }

    if (
      STATIC_OR_MODULE_PREFIXES.some((prefix) => req.path.startsWith(prefix)) ||
      STATIC_OR_MODULE_EXT_RE.test(req.path)
    ) {
      res.status(404).type('text/plain; charset=utf-8').send('Not Found');
      return;
    }

    try {
      const templatePath = IS_PROD
        ? path.resolve(__dirname, 'dist/index.html')
        : path.resolve(__dirname, 'index.html');
      let html = fs.readFileSync(templatePath, 'utf-8');

      if (!IS_PROD && vite) {
        html = await vite.transformIndexHtml(req.originalUrl, html);
      }

      const cleanPath = req.path.replace(/^\/+|\/+$/g, '');
      const isSecretAdminRoute =
        Boolean(ADMIN_ROUTE) &&
        (cleanPath === ADMIN_ROUTE || cleanPath.startsWith(`${ADMIN_ROUTE}/`));

      const origin = getBaseOrigin(req);
      const canonicalUrl = `${origin}${req.path === '/' ? '/' : req.path}`;
      const siteSettings = getSettings();
      let pageTitle = siteSettings.siteTitle;
      let pageDescription = siteSettings.siteDescription;
      const defaultPoster = siteSettings.heroPosterDesktop?.trim() || '/poster.webp';
      let ogImage = defaultPoster.startsWith('http') ? defaultPoster : `${origin}${defaultPoster}`;
      let ogType = 'website';
      let httpStatus = 200;

      const publicCategories = isSecretAdminRoute ? [] : listCategories();
      const publicPosts = isSecretAdminRoute ? [] : listPosts(false);
      const publicProjects = isSecretAdminRoute ? [] : listProjects();
      const sameAsLinks = parseSocialLinks(siteSettings.socialLinksJson)
        .filter((s) => s.enabled !== false && s.url.startsWith('http'))
        .map((s) => s.url);

      const personNode = {
        '@type': 'Person',
        '@id': `${origin}/#person`,
        name: siteSettings.vcardFullName || 'محمدباقر نوری',
        alternateName: siteSettings.brandName,
        url: origin,
        image: `${origin}/logo.png`,
        jobTitle: siteSettings.vcardTitle,
        description: siteSettings.aboutBio,
        knowsAbout: [
          'AI-Assisted Web & App Development',
          'AI Agents & Automation',
          'Software Troubleshooting & Optimization',
          'Local-First Web Architecture',
        ],
        sameAs: sameAsLinks,
      };

      let jsonLd: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${origin}/#website`,
            name: siteSettings.brandName,
            alternateName: siteSettings.siteTitle,
            url: origin,
            description: siteSettings.siteDescription,
            inLanguage: 'fa-IR',
            publisher: { '@id': `${origin}/#person` },
          },
          personNode,
        ],
      };

      if (isSecretAdminRoute) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        pageTitle = `پنل مدیریت | ${siteSettings.brandName}`;
      } else {
        // Ensure Cloudflare never serves stale SSR HTML after creating/editing/deleting posts or site texts
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        if (req.path === '/') {
          // Home uses default WebSite + Person JSON-LD
        } else if (req.path === '/blog') {
          pageTitle = `${siteSettings.blogSectionTitle || 'نوشته‌ها و تجربه‌ها'} | ${siteSettings.brandName}`;
          pageDescription = siteSettings.blogPageSubtitle || siteSettings.siteDescription;
          jsonLd = {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Blog',
                name: siteSettings.blogSectionTitle || 'وبلاگ',
                description: pageDescription,
                url: canonicalUrl,
                inLanguage: 'fa-IR',
                author: personNode,
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'خانه', item: `${origin}/` },
                  { '@type': 'ListItem', position: 2, name: 'وبلاگ', item: canonicalUrl },
                ],
              },
            ],
          };
        } else if (req.path.startsWith('/blog/') && req.path.length > 6) {
          const slug = req.path.slice('/blog/'.length);
          const post = getPostBySlug(slug, false);
          if (post) {
            pageTitle = `${post.title} | ${siteSettings.brandName}`;
            pageDescription = post.excerpt;
            ogType = 'article';
            if (post.coverImage) {
              ogImage = post.coverImage.startsWith('http')
                ? post.coverImage
                : `${origin}${post.coverImage}`;
            }
            const plainBody = blocksToPlainMarkdown(post.blocks);
            const wordCount = plainBody.split(/\s+/).filter(Boolean).length;
            jsonLd = {
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'BlogPosting',
                  headline: post.title,
                  description: post.excerpt,
                  articleSection: post.category,
                  datePublished: post.createdAt,
                  dateModified: post.updatedAt || post.createdAt,
                  timeRequired: `PT${Math.max(1, post.readingMinutes || 1)}M`,
                  wordCount,
                  inLanguage: 'fa-IR',
                  image: ogImage,
                  author: personNode,
                  publisher: personNode,
                  mainEntityOfPage: canonicalUrl,
                },
                {
                  '@type': 'BreadcrumbList',
                  itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'خانه', item: `${origin}/` },
                    { '@type': 'ListItem', position: 2, name: 'وبلاگ', item: `${origin}/blog` },
                    { '@type': 'ListItem', position: 3, name: post.title, item: canonicalUrl },
                  ],
                },
              ],
            };
          } else {
            httpStatus = 404;
            pageTitle = `نوشته پیدا نشد | ${siteSettings.brandName}`;
          }
        } else if (req.path === '/projects') {
          pageTitle = `${siteSettings.projectsSectionTitle || 'پروژه‌ها'} | ${siteSettings.brandName}`;
          pageDescription = siteSettings.projectsPageSubtitle || siteSettings.siteDescription;
          jsonLd = {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'CollectionPage',
                name: pageTitle,
                description: pageDescription,
                url: canonicalUrl,
                inLanguage: 'fa-IR',
                mainEntity: {
                  '@type': 'ItemList',
                  itemListElement: publicProjects.map((proj, idx) => ({
                    '@type': 'ListItem',
                    position: idx + 1,
                    item: {
                      '@type': 'CreativeWork',
                      name: proj.title,
                      description: proj.summary,
                      url: proj.url.startsWith('http') ? proj.url : `${origin}${proj.url}`,
                      creator: personNode,
                    },
                  })),
                },
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'خانه', item: `${origin}/` },
                  { '@type': 'ListItem', position: 2, name: 'پروژه‌ها', item: canonicalUrl },
                ],
              },
            ],
          };
        } else if (req.path === '/about') {
          pageTitle = `${siteSettings.aboutTitle || 'درباره من و ارتباط'} | ${siteSettings.brandName}`;
          pageDescription = siteSettings.aboutBio || siteSettings.siteDescription;
          jsonLd = {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'ProfilePage',
                name: pageTitle,
                description: pageDescription,
                url: canonicalUrl,
                inLanguage: 'fa-IR',
                mainEntity: personNode,
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'خانه', item: `${origin}/` },
                  { '@type': 'ListItem', position: 2, name: 'درباره من', item: canonicalUrl },
                ],
              },
            ],
          };
        } else {
          httpStatus = 404;
          pageTitle = `صفحه پیدا نشد | ${siteSettings.brandName}`;
        }
      }

      const faviconHref = siteSettings.faviconImage?.trim() || '/favicon.png';
      html = html
        .replace(
          /<link\s+rel="icon"[^>]*\/>/s,
          `<link rel="icon" href="${escapeHtmlAttr(faviconHref)}" />`,
        )
        .replace(/<title>.*?<\/title>/s, `<title>${escapeHtmlAttr(pageTitle)}</title>`)
        .replace(
          /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
          `<meta name="description" content="${escapeHtmlAttr(pageDescription)}" />`,
        )
        .replace(
          /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/s,
          `<meta property="og:title" content="${escapeHtmlAttr(pageTitle)}" />`,
        )
        .replace(
          /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/s,
          `<meta property="og:description" content="${escapeHtmlAttr(pageDescription)}" />`,
        )
        .replace(
          /<meta\s+property="og:type"\s+content="[^"]*"\s*\/>/s,
          `<meta property="og:type" content="${escapeHtmlAttr(ogType)}" />`,
        );

      if (isSecretAdminRoute || httpStatus === 404) {
        html = html.replace(
          /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/s,
          `<meta name="robots" content="noindex, nofollow" />`,
        );
      }

      const safeInitialJson = !isSecretAdminRoute
        ? JSON.stringify({
            settings: siteSettings,
            categories: publicCategories,
            posts: publicPosts,
            projects: publicProjects,
          }).replace(/</g, '\\u003c')
        : '';

      const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

      const injectedHeadTags = [
        httpStatus === 200 && !isSecretAdminRoute
          ? `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`
          : '',
        `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
        `<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />`,
        `<meta name="twitter:title" content="${escapeHtmlAttr(pageTitle)}" />`,
        `<meta name="twitter:description" content="${escapeHtmlAttr(pageDescription)}" />`,
        `<meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />`,
        isSecretAdminRoute || httpStatus === 404
          ? ''
          : `<script type="application/ld+json">${safeJsonLd}</script>`,
        isSecretAdminRoute
          ? `<script>window.__ADMIN_PORTAL_ACTIVE__ = true;</script>`
          : `<script id="__INITIAL_SITE_DATA__" type="application/json">${safeInitialJson}</script>`,
      ]
        .filter(Boolean)
        .join('\n    ');

      html = html.replace('</head>', `    ${injectedHeadTags}\n  </head>`);
      if (hmrDisabled) {
        html = html.replace(/<script\s+type="module"\s+src="\/@vite\/client"><\/script>\s*/g, '');
      }

      res.status(httpStatus).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(html);
    } catch (err) {
      if (vite && err instanceof Error) {
        vite.ssrFixStacktrace(err);
      }
      next(err);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
