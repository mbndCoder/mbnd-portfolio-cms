import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import {
  authenticateAdminUser,
  bumpAdminTokenVersion,
  changeAdminCredentials,
  clearSystemLogs,
  configureDb,
  createMessage,
  deleteCategory,
  deleteMessage,
  deletePost,
  deleteProject,
  ensureDbInitialized,
  exportFullBackup,
  getAdminUserByUsername,
  getAiConfigPublic,
  getOrCreateSessionSecret,
  getPostBySlug,
  getSettings,
  hasAnyAdminUser,
  importFullBackup,
  isPlaceholderEnv,
  listCategories,
  listMessages,
  listPosts,
  listProjects,
  listSystemLogs,
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
  writeSystemLog,
} from './db.ts';
import {
  createSessionToken,
  extractClientIp,
  validateStrongPassword,
  verifySessionToken,
} from './auth.ts';
import {
  runAdminAiAssist,
  testAdminAiConnection,
  translateAdminContentToEnglish,
  validateBaseUrl,
  type TranslateTargetKind,
} from './ai.ts';
import {
  deleteUploadedMedia,
  listUploadedMedia,
  UploadValidationError,
  uploadMediaToCloudinary,
} from './uploads.ts';
import { BackupValidationError } from './backup.ts';
import { inferLogSourceFromPath } from './logs.ts';
import { getEnvVar, type RuntimeEnv } from './env.ts';
import { normalizeBlocks } from '../src/lib/blocks.ts';
import { normalizeDigitsToAscii } from '../src/lib/slug.ts';
import type { SiteLanguage, SiteSettings } from '../src/types/cms.ts';

type AdminUserContext = {
  username: string;
  role: string;
  tokenVersion: number;
};

type AppEnv = {
  Bindings: RuntimeEnv;
  Variables: {
    adminUser?: AdminUserContext;
  };
};

type AppContext = Context<AppEnv>;

const COOKIE_NAME = 'mbnd_session';
const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;
const MAX_BACKUP_BODY_BYTES = 10 * 1024 * 1024;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const contactAttempts = new Map<string, { count: number; resetAt: number }>();
const clientErrorAttempts = new Map<string, { count: number; resetAt: number }>();
const vcardAvatarCache = new Map<string, { cachedAt: number; base64: string }>();

function resolveAdminRoute(env?: RuntimeEnv): string {
  const raw = getEnvVar('ADMIN_ROUTE', env).trim();
  if (!raw || isPlaceholderEnv(raw)) return '';
  return raw.replace(/^\/+|\/+$/g, '');
}

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

function checkClientErrorRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = clientErrorAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    clientErrorAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 25) return false;
  entry.count += 1;
  return true;
}

function normalizePhoneForVCard(raw: string): string {
  return normalizeDigitsToAscii(raw)
    .replace(/[^\d+\-()#*.\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSafeVCardFilename(rawName: string): string {
  const ascii = normalizeDigitsToAscii(rawName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${ascii || 'contact'}.vcf`;
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function isHttpsRequest(c: AppContext): boolean {
  const cfVisitor = c.req.header('cf-visitor');
  if (cfVisitor && cfVisitor.includes('"https"')) {
    return true;
  }
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto === 'https') {
    return true;
  }
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeCanonicalHost(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const hostLower = parsed.hostname.toLowerCase();
    if (hostLower.startsWith('www.') && hostLower.length > 4) {
      parsed.hostname = hostLower.slice(4);
      if (parsed.protocol === 'https:' && parsed.port === '443') parsed.port = '';
    }
    return parsed.origin;
  } catch {
    return urlStr.replace(/\/+$/, '');
  }
}

function getBaseOrigin(c: AppContext): string {
  const envUrl = getEnvVar('APP_URL', c.env).trim();
  if (envUrl && !isPlaceholderEnv(envUrl)) {
    return normalizeCanonicalHost(envUrl);
  }
  const proto = isHttpsRequest(c) ? 'https' : 'http';
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || c.req.header('host') || new URL(c.req.url).host || 'localhost:3000';
  return normalizeCanonicalHost(`${proto}://${host}`);
}

function buildDynamicSeoProfile(s: SiteSettings, origin: string): {
  brandName: string;
  authorName: string;
  hostname: string;
  alternateNames: string[];
  keywords: string;
  knowsAbout: string[];
} {
  let hostname = '';
  try {
    hostname = new URL(origin).hostname.replace(/^www\./i, '');
  } catch {
    hostname = '';
  }

  const brandName = (s.brandName || s.siteTitle || 'Portfolio').trim();
  const authorName = (s.vcardFullName || s.brandName || 'Site Owner').trim();
  const titleParts = [
    s.brandName,
    s.vcardFullName,
    s.siteTitle,
    s.heroTitleEn,
    hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' ? hostname : '',
    hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' ? `www.${hostname}` : '',
  ]
    .map((v) => (v || '').trim())
    .filter(Boolean);

  const alternateNames = Array.from(new Set(titleParts));

  const focusTokens = [s.aboutFocusText, s.aboutFocusTextEn, s.vcardTitle]
    .filter((v): v is string => Boolean(v && v.trim()))
    .flatMap((v) => v.split(/[،,·|/•\n]+/))
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 70);

  const knowsAbout = Array.from(new Set(focusTokens)).slice(0, 12);
  const keywordList = Array.from(new Set([...alternateNames, ...knowsAbout])).slice(0, 22);

  return {
    brandName,
    authorName,
    hostname,
    alternateNames,
    keywords: keywordList.join(', '),
    knowsAbout,
  };
}

function setSessionCookie(c: AppContext, token: string): void {
  const secure = isHttpsRequest(c);
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
  c.header('Set-Cookie', parts.join('; '), { append: true });
}

function clearSessionCookie(c: AppContext): void {
  const secure = isHttpsRequest(c);
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
  c.header('Set-Cookie', parts.join('; '), { append: true });
}

function extractSessionToken(c: AppContext): { token: string; viaBearer: boolean } {
  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, viaBearer: true };
  }
  const cookieToken = getCookie(c, COOKIE_NAME);
  return { token: typeof cookieToken === 'string' ? cookieToken : '', viaBearer: false };
}

async function verifyActiveAdminSession(c: AppContext): Promise<{
  username: string;
  role: string;
  tokenVersion: number;
  viaBearer: boolean;
} | null> {
  const { token, viaBearer } = extractSessionToken(c);
  if (!token) return null;
  const secret = await getOrCreateSessionSecret(c.env);
  const session = verifySessionToken(token, secret);
  if (!session || session.role !== 'admin') return null;

  const dbUser = await getAdminUserByUsername(session.username);
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

function passesCsrfCheck(c: AppContext): boolean {
  if (c.req.header('x-requested-with') === 'XMLHttpRequest') {
    return true;
  }
  const origin = c.req.header('origin');
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = c.req.header('host');
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

async function readJsonBody(
  c: AppContext,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const contentLength = Number(c.req.header('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HTTPException(413, { message: 'حجم داده‌های ارسالی بیش از حد مجاز است.' });
  }
  const raw = await c.req.text();
  if (raw.length > maxBytes) {
    throw new HTTPException(413, { message: 'حجم داده‌های ارسالی بیش از حد مجاز است.' });
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new HTTPException(400, { message: 'فرمت JSON درخواست نامعتبر است.' });
  }
}

const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const active = await verifyActiveAdminSession(c);
  if (!active) {
    return c.json({ error: 'احراز هویت انجام نشده است یا نشست منقضی شده.' }, 401);
  }
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method.toUpperCase());
  if (isMutation && !active.viaBearer && !passesCsrfCheck(c)) {
    return c.json({ error: 'درخواست نامعتبر است (خطای امنیتی مبدا).' }, 403);
  }
  c.set('adminUser', {
    username: active.username,
    role: active.role,
    tokenVersion: active.tokenVersion,
  });
  await next();
};

async function fetchStaticAsset(c: AppContext, assetPath: string): Promise<Response | null> {
  if (!c.env?.ASSETS) return null;
  try {
    const assetUrl = new URL(assetPath.startsWith('/') ? assetPath : `/${assetPath}`, c.req.url);
    const resp = await c.env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }));
    return resp.ok ? resp : null;
  } catch {
    return null;
  }
}

async function resolveVCardAvatarBase64(c: AppContext, avatarSetting: string): Promise<string> {
  const cleaned = avatarSetting.trim();

  // 1. Cloudinary HTTPS avatar (strictly allowlisted host to prevent SSRF)
  if (cleaned.startsWith('https://')) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.hostname === 'res.cloudinary.com') {
        const cached = vcardAvatarCache.get(cleaned);
        if (cached && Date.now() - cached.cachedAt < 10 * 60 * 1000) {
          return cached.base64;
        }
        const transformedUrl = cleaned.includes('/image/upload/')
          ? cleaned.replace('/image/upload/', '/image/upload/w_320,h_320,c_fill,f_jpg,q_auto/')
          : cleaned;
        const resp = await fetch(transformedUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > 0 && buf.byteLength <= 2 * 1024 * 1024) {
            const base64 = arrayBufferToBase64(buf);
            vcardAvatarCache.set(cleaned, { cachedAt: Date.now(), base64 });
            return base64;
          }
        }
      }
    } catch {
      // fall back to static asset avatar
    }
  }

  // 2. Static avatar served from Cloudflare Static Assets (env.ASSETS)
  const candidates: string[] = [];
  if (cleaned.startsWith('/') && !cleaned.includes('..') && /\.(jpe?g)$/i.test(cleaned)) {
    candidates.push(cleaned);
  }
  candidates.push('/vcard-avatar.jpg');

  for (const candidate of candidates) {
    const cacheKey = `asset:${candidate}`;
    const cached = vcardAvatarCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 10 * 60 * 1000) {
      return cached.base64;
    }
    const resp = await fetchStaticAsset(c, candidate);
    if (resp) {
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength <= 2 * 1024 * 1024) {
        const base64 = arrayBufferToBase64(buf);
        vcardAvatarCache.set(cacheKey, { cachedAt: Date.now(), base64 });
        return base64;
      }
    }
  }

  return '';
}

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
  /\.(js|mjs|cjs|ts|tsx|jsx|css|scss|map|png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|mov|mp3|wav|ogg|m4a|woff2?|ttf|eot|pdf|vcf|json|xml|webmanifest)$/i;

// ==================== HONO APP (CLOUDFLARE WORKERS + LOCAL NODE) ====================
export const app = new Hono<AppEnv>();

// Bind Cloudflare Workers env + Security headers on every request
app.use('*', async (c, next) => {
  configureDb(c.env);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// Cache discipline for API endpoints
app.use('/api/public/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  c.header('Pragma', 'no-cache');
});

app.use('/api/admin/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  c.header('Pragma', 'no-cache');
});

// Automatic API error, warning, and admin-mutation logging
app.use('/api/*', async (c, next) => {
  const reqPath = c.req.path;
  const method = c.req.method.toUpperCase();
  const startedAt = Date.now();
  await next();

  // Never log log-inspection requests to avoid self-referential noise
  if (reqPath === '/api/admin/logs' || reqPath === '/api/public/client-error') {
    return;
  }

  const status = c.res.status;
  const elapsedMs = Date.now() - startedAt;
  const source = inferLogSourceFromPath(reqPath);

  if (status >= 400) {
    let errorMsg = `HTTP ${status} on ${method} ${reqPath}`;
    try {
      const ct = c.res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const cloned = await c.res.clone().json().catch(() => null);
        if (cloned && typeof cloned === 'object' && 'error' in cloned && typeof cloned.error === 'string') {
          errorMsg = cloned.error;
        }
      }
    } catch {
      // ignore clone errors
    }
    await writeSystemLog({
      level: status >= 500 ? 'error' : 'warn',
      source,
      method,
      path: reqPath,
      status,
      message: errorMsg,
      details: `${method} ${reqPath} -> ${status} (${elapsedMs}ms)`,
    });
  } else if (
    reqPath.startsWith('/api/admin/') &&
    method !== 'GET' &&
    method !== 'HEAD' &&
    method !== 'OPTIONS'
  ) {
    await writeSystemLog({
      level: 'info',
      source,
      method,
      path: reqPath,
      status,
      message: `${method} ${reqPath} succeeded`,
      details: `Completed in ${elapsedMs}ms`,
    });
  }
});

app.get('/favicon.ico', async (c) => {
  const fav = await fetchStaticAsset(c, '/favicon.png');
  if (fav) {
    const body = await fav.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800',
      },
    });
  }
  return c.body(null, 204);
});

// ==================== SEO & AI DISCOVERABILITY ENDPOINTS ====================
app.get('/robots.txt', (c) => {
  const origin = getBaseOrigin(c);
  const body = [
    '# Search Engines & AI Search Crawlers',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: Googlebot',
    'Allow: /',
    '',
    'User-agent: Bingbot',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: anthropic-ai',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: Applebot-Extended',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    `# RSS Feed: ${origin}/rss.xml`,
    `# LLMs context: ${origin}/llms.txt`,
    `# LLMs full index: ${origin}/llms-full.txt`,
  ].join('\n');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.text(body, 200);
});

app.get('/llms.txt', async (c) => {
  const origin = getBaseOrigin(c);
  const [s, publishedPosts, projects] = await Promise.all([
    getSettings(),
    listPosts(false),
    listProjects(),
  ]);
  const seo = buildDynamicSeoProfile(s, origin);
  const socials = parseSocialLinks(s.socialLinksJson).filter((l) => l.enabled !== false);

  const lines = [
    `# ${seo.brandName}${seo.authorName && seo.authorName !== seo.brandName ? ` (${seo.authorName})` : ''}${seo.hostname ? ` — ${seo.hostname}` : ''}`,
    '',
    `> ${s.siteDescription}`,
    '',
    '## Identity & Discovery',
    `- Brand / Site: ${seo.brandName}`,
    seo.authorName ? `- Author: ${seo.authorName}` : '',
    seo.alternateNames.length > 0 ? `- Names & Aliases: ${seo.alternateNames.join(', ')}` : '',
    `- Canonical Website: ${origin}/`,
    s.email ? `- Email: ${s.email}` : '',
    `- RSS Feed: ${origin}/rss.xml`,
    `- Full Markdown Index: ${origin}/llms-full.txt`,
    `- Sitemap: ${origin}/sitemap.xml`,
    '',
    '## Focus & Expertise',
    s.vcardTitle ? `- Role: ${s.vcardTitle}` : '',
    `- Focus: ${s.aboutFocusText}${s.aboutFocusTextEn ? ` | ${s.aboutFocusTextEn}` : ''}`,
    '',
    '## Key Pages',
    `- [Home](${origin}/): ${s.heroTitle}${s.heroTitleEn ? ` / ${s.heroTitleEn}` : ''}`,
    `- [Blog](${origin}/blog): ${s.blogPageSubtitle || s.blogSectionTitle}`,
    `- [Projects](${origin}/projects): ${s.projectsPageSubtitle || s.projectsSectionTitle}`,
    `- [About & Contact](${origin}/about): ${s.aboutTitle}`,
    '',
    '## Direct Channels',
    ...socials.map((l) => `- ${l.label}${l.labelEn ? ` (${l.labelEn})` : ''}: ${l.url}${l.handle ? ` (${l.handle})` : ''}`),
    '',
    '## Projects',
    ...projects.map(
      (p) =>
        `- [${p.title}${p.titleEn ? ` / ${p.titleEn}` : ''}](${p.url.startsWith('http') ? p.url : `${origin}${p.url}`}) (${p.role}): ${p.summary}${p.summaryEn ? ` — ${p.summaryEn}` : ''}`,
    ),
    '',
    '## Published Articles',
    ...publishedPosts.map(
      (post) =>
        `- [${post.title}${post.titleEn ? ` / ${post.titleEn}` : ''}](${origin}/blog/${encodeURIComponent(post.slug)}) [${post.category}]: ${post.excerpt}${post.excerptEn ? ` | ${post.excerptEn}` : ''}`,
    ),
  ].filter((line) => line !== undefined);

  c.header('Cache-Control', 'no-cache');
  return c.text(`${lines.join('\n')}\n`, 200);
});

app.get('/llms-full.txt', async (c) => {
  const origin = getBaseOrigin(c);
  const [s, publishedPosts, projects] = await Promise.all([
    getSettings(),
    listPosts(false),
    listProjects(),
  ]);
  const seo = buildDynamicSeoProfile(s, origin);

  const sections: string[] = [
    `# ${seo.brandName}${seo.authorName && seo.authorName !== seo.brandName ? ` (${seo.authorName})` : ''} — Complete Site Content`,
    '',
    `Canonical URL: ${origin}/`,
    seo.alternateNames.length ? `Aliases: ${seo.alternateNames.join(', ')}` : '',
    `Author: ${seo.authorName} (${seo.brandName})`,
    s.vcardTitle ? `Role: ${s.vcardTitle}` : '',
    '',
    '## About',
    s.aboutBio,
    s.aboutBioEn ? `\n${s.aboutBioEn}` : '',
    '',
    `Focus Areas: ${s.aboutFocusText}${s.aboutFocusTextEn ? ` | ${s.aboutFocusTextEn}` : ''}`,
    '',
    '## Projects',
    ...projects.map(
      (p) =>
        `### ${p.title}${p.titleEn ? ` (${p.titleEn})` : ''}\n- Role: ${p.role}${p.roleEn ? ` / ${p.roleEn}` : ''}\n- Period: ${p.period}\n- Stack: ${p.stack.join(', ')}\n- URL: ${
          p.url.startsWith('http') ? p.url : `${origin}${p.url}`
        }\n\n${p.summary}${p.summaryEn ? `\n\n${p.summaryEn}` : ''}`,
    ),
    '',
    '## Blog Articles',
    ...publishedPosts.map((post) => {
      const bodyMd = blocksToPlainMarkdown(post.blocks);
      const bodyEnMd = post.blocksEn?.length ? blocksToPlainMarkdown(post.blocksEn) : '';
      return [
        `### ${post.title}${post.titleEn ? ` (${post.titleEn})` : ''}`,
        `- URL: ${origin}/blog/${encodeURIComponent(post.slug)}`,
        `- Category: ${post.category}`,
        `- Published: ${post.createdAt}`,
        `- Updated: ${post.updatedAt || post.createdAt}`,
        `- Reading Time: ${post.readingMinutes} min`,
        '',
        post.excerpt,
        post.excerptEn ? `\n${post.excerptEn}` : '',
        '',
        bodyMd,
        bodyEnMd ? `\n\n#### English Version\n${bodyEnMd}` : '',
      ]
        .filter((line) => line !== '')
        .join('\n');
    }),
  ].filter((section) => section !== '');

  c.header('Cache-Control', 'no-cache');
  return c.text(`${sections.join('\n\n')}\n`, 200);
});

app.get('/rss.xml', async (c) => {
  const origin = getBaseOrigin(c);
  const [s, publishedPosts] = await Promise.all([getSettings(), listPosts(false)]);
  const channelTitle = s.siteTitle || s.brandName || 'Blog RSS Feed';
  const channelDescription = s.siteDescription;
  const latestDate = publishedPosts[0]?.updatedAt || publishedPosts[0]?.createdAt || new Date().toISOString();
  const parsedBuildDate = new Date(latestDate);
  const lastBuildDate = Number.isNaN(parsedBuildDate.getTime())
    ? new Date().toUTCString()
    : parsedBuildDate.toUTCString();

  const itemsXml = publishedPosts
    .map((post) => {
      const link = `${origin}/blog/${encodeURIComponent(post.slug)}`;
      const parsedDate = new Date(post.createdAt);
      const pubDate = Number.isNaN(parsedDate.getTime())
        ? new Date().toUTCString()
        : parsedDate.toUTCString();
      const desc = post.excerptEn ? `${post.excerpt} — ${post.excerptEn}` : post.excerpt;
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
        `      <category>${escapeXml(post.category)}</category>`,
        `      <description>${escapeXml(desc)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(`${origin}/`)}</link>`,
    `    <atom:link href="${escapeXml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    `    <language>${s.defaultLanguage === 'en' ? 'en-US' : 'fa-IR'}</language>`,
    `    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`,
    itemsXml,
    '  </channel>',
    '</rss>',
  ]
    .filter(Boolean)
    .join('\n');

  return c.body(xml, 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
});

app.get('/sitemap.xml', async (c) => {
  const origin = getBaseOrigin(c);
  const publishedPosts = await listPosts(false);
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
  return c.body(xml, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
});

// ==================== HEALTH ====================
app.get('/api/health', async (c) => {
  try {
    await ensureDbInitialized();
    c.header('Cache-Control', 'no-store');
    return c.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    return c.json(
      {
        ok: false,
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Database connection error',
      },
      503,
    );
  }
});

// ==================== PUBLIC API ====================
app.get('/api/public/site', async (c) => {
  const [siteSettings, siteCategories, sitePosts, siteProjects] = await Promise.all([
    getSettings(),
    listCategories(),
    listPosts(false),
    listProjects(),
  ]);
  return c.json({
    settings: siteSettings,
    categories: siteCategories,
    posts: sitePosts,
    projects: siteProjects,
  });
});

app.get('/api/public/posts', async (c) => {
  const [sitePosts, siteCategories] = await Promise.all([listPosts(false), listCategories()]);
  return c.json({ posts: sitePosts, categories: siteCategories });
});

app.get('/api/public/posts/:slug', async (c) => {
  const post = await getPostBySlug(c.req.param('slug'), false);
  if (!post) {
    return c.json({ error: 'نوشته مورد نظر پیدا نشد.' }, 404);
  }
  return c.json({ post });
});

app.get('/api/save-contact', async (c) => {
  const s = await getSettings();
  if (s.vcardEnabled === 'false') {
    return c.json({ error: 'کارت مخاطب در حال حاضر غیرفعال است.' }, 404);
  }

  const origin = getBaseOrigin(c);
  const fullNameRaw = (s.vcardFullName || s.brandName || 'Contact').trim();
  const fullName = escapeVCardField(fullNameRaw);
  const org = s.vcardOrg?.trim() ? escapeVCardField(s.vcardOrg.trim()) : '';
  const title = s.vcardTitle?.trim() ? escapeVCardField(s.vcardTitle.trim()) : '';
  const email = s.email?.trim() ? escapeVCardField(s.email.trim()) : '';
  const normalizedPhone = s.vcardPhone?.trim() ? normalizePhoneForVCard(s.vcardPhone) : '';
  const phone = normalizedPhone ? escapeVCardField(normalizedPhone) : '';
  const website = s.vcardWebsite?.trim() || origin;

  const socials = parseSocialLinks(s.socialLinksJson).filter((l) => l.enabled !== false);
  const extraSocialLines = socials
    .filter((l) => l.url.startsWith('http://') || l.url.startsWith('https://'))
    .map((l) => `URL;TYPE=${escapeVCardField(l.iconKey)}:${escapeVCardField(l.url)}`);

  const extraFields = parseVCardExtraFields(s.vcardExtraFieldsJson || '[]');
  const extraFieldLines: string[] = [];
  const extraNotes: string[] = [];
  let itemIndex = 1;

  for (const field of extraFields) {
    const rawVal = field.value.trim();
    if (!rawVal) continue;
    const safeLabel = field.label ? escapeVCardField(field.label.trim()) : '';

    if (field.type === 'tel') {
      const normalizedExtraPhone = normalizePhoneForVCard(rawVal);
      if (!normalizedExtraPhone) continue;
      const safePhone = escapeVCardField(normalizedExtraPhone);
      if (safeLabel) {
        extraFieldLines.push(`item${itemIndex}.TEL;TYPE=CELL,VOICE:${safePhone}`);
        extraFieldLines.push(`item${itemIndex}.X-ABLabel;CHARSET=UTF-8:${safeLabel}`);
        itemIndex += 1;
      } else {
        extraFieldLines.push(`TEL;TYPE=CELL,VOICE:${safePhone}`);
      }
    } else if (field.type === 'email') {
      const safeEmail = escapeVCardField(rawVal);
      if (safeLabel) {
        extraFieldLines.push(`item${itemIndex}.EMAIL;TYPE=INTERNET:${safeEmail}`);
        extraFieldLines.push(`item${itemIndex}.X-ABLabel;CHARSET=UTF-8:${safeLabel}`);
        itemIndex += 1;
      } else {
        extraFieldLines.push(`EMAIL;TYPE=INTERNET:${safeEmail}`);
      }
    } else if (field.type === 'url') {
      const safeUrl = escapeVCardField(rawVal);
      if (safeLabel) {
        extraFieldLines.push(`item${itemIndex}.URL:${safeUrl}`);
        extraFieldLines.push(`item${itemIndex}.X-ABLabel;CHARSET=UTF-8:${safeLabel}`);
        itemIndex += 1;
      } else {
        extraFieldLines.push(`URL:${safeUrl}`);
      }
    } else if (field.type === 'address') {
      const safeAddr = escapeVCardField(rawVal);
      if (safeLabel) {
        extraFieldLines.push(`item${itemIndex}.ADR;CHARSET=UTF-8:;;${safeAddr};;;;`);
        extraFieldLines.push(`item${itemIndex}.X-ABLabel;CHARSET=UTF-8:${safeLabel}`);
        itemIndex += 1;
      } else {
        extraFieldLines.push(`ADR;TYPE=HOME;CHARSET=UTF-8:;;${safeAddr};;;;`);
      }
    } else if (field.type === 'note') {
      extraNotes.push(field.label ? `${field.label.trim()}: ${rawVal}` : rawVal);
    }
  }

  const noteParts = [
    s.vcardNote?.trim(),
    ...extraNotes,
    ...socials.filter((l) => l.handle).map((l) => `${l.label}: ${l.handle}`),
  ].filter(Boolean);
  const note = escapeVCardField(Array.from(new Set(noteParts)).join(' | '));

  const b64Avatar = await resolveVCardAvatarBase64(c, s.vcardAvatar || '/vcard-avatar.jpg');
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

  const vcardBody = `${lines.join('\r\n')}\r\n`;
  const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline';
  const filename = buildSafeVCardFilename(s.brandName || s.vcardOrg || 'contact');
  return c.body(vcardBody, 200, {
    'Content-Type': 'text/vcard; charset=utf-8',
    'Content-Disposition': `${disposition}; filename="${filename}"`,
    'Cache-Control': 'no-cache',
  });
});

app.post('/api/public/client-error', async (c) => {
  const ip = extractClientIp(c.req.raw.headers, 'unknown');
  if (!checkClientErrorRateLimit(ip)) {
    return c.json({ ok: false }, 429);
  }
  const body = await readJsonBody(c, 32 * 1024);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return c.json({ ok: false }, 400);
  }
  const path = typeof body.path === 'string' ? body.path.trim() : '/';
  const stack = typeof body.stack === 'string' ? body.stack.trim() : '';
  await writeSystemLog({
    level: 'error',
    source: 'client',
    method: 'CLIENT',
    path: path.slice(0, 200),
    status: 0,
    message: message.slice(0, 400),
    details: stack.slice(0, 2500),
  });
  return c.json({ ok: true }, 201);
});

app.post('/api/public/contact', async (c) => {
  const ip = extractClientIp(c.req.raw.headers, 'unknown');
  if (!checkContactRateLimit(ip)) {
    return c.json(
      {
        error: 'تعداد پیام‌های ارسالی شما زیاد بوده است. لطفاً چند دقیقه دیگر دوباره تلاش کن.',
      },
      429,
    );
  }

  const body = await readJsonBody(c);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : 'پیام از سایت';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (name.length < 2) {
    return c.json({ error: 'لطفاً اسمت رو وارد کن (حداقل ۲ حرف).' }, 400);
  }
  if (contact.length < 4 || !contact.includes('@')) {
    return c.json({ error: 'لطفاً یک ایمیل معتبر وارد کن.' }, 400);
  }
  if (message.length < 5) {
    return c.json({ error: 'متن پیام خیلی کوتاهه (حداقل ۵ حرف بنویس).' }, 400);
  }

  const created = await createMessage({
    name: name.slice(0, 120),
    contact: contact.slice(0, 160),
    subject: subject.slice(0, 180) || 'پیام از سایت',
    message: message.slice(0, 4000),
  });

  return c.json({ ok: true, id: created.id }, 201);
});

// ==================== SECRET ADMIN API ====================
app.get('/api/admin/session', async (c) => {
  if (!resolveAdminRoute(c.env)) {
    return c.json({ authenticated: false, needsSetup: false });
  }
  const [hasAdmin, active] = await Promise.all([
    hasAnyAdminUser(),
    verifyActiveAdminSession(c),
  ]);
  if (!active) {
    return c.json({ authenticated: false, needsSetup: !hasAdmin });
  }
  return c.json({ authenticated: true, username: active.username, needsSetup: false });
});

app.post('/api/admin/setup', async (c) => {
  if (!resolveAdminRoute(c.env)) {
    return c.json({ error: 'مسیر پنل مدیریت در تنظیمات سرور فعال نشده است.' }, 403);
  }
  if (!passesCsrfCheck(c)) {
    return c.json({ error: 'درخواست نامعتبر (بررسی امنیتی مبدا).' }, 403);
  }
  if (await hasAnyAdminUser()) {
    return c.json({ error: 'حساب مدیر قبلاً راه‌اندازی شده است.' }, 403);
  }

  const body = await readJsonBody(c);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const strengthError = validateStrongPassword(password);
  if (strengthError) {
    return c.json({ error: strengthError }, 400);
  }

  const created = await setupFirstAdminUser({ username, password });
  if (!created.ok) {
    return c.json({ error: created.error }, 400);
  }

  const secret = await getOrCreateSessionSecret(c.env);
  const token = createSessionToken(created.user, secret);
  setSessionCookie(c, token);
  return c.json({ ok: true, username: created.user.username, token }, 201);
});

app.post('/api/admin/login', async (c) => {
  if (!resolveAdminRoute(c.env)) {
    return c.json({ error: 'مسیر پنل مدیریت در تنظیمات سرور فعال نشده است.' }, 403);
  }
  if (!passesCsrfCheck(c)) {
    return c.json({ error: 'درخواست نامعتبر (بررسی امنیتی مبدا).' }, 403);
  }
  const ip = extractClientIp(c.req.raw.headers, 'unknown');
  if (!checkRateLimit(ip)) {
    return c.json(
      {
        error: 'تلاش‌های ناموفق بیش از حد مجاز بود (۵ بار). لطفاً ۱۵ دقیقه بعد دوباره امتحان کن.',
      },
      429,
    );
  }

  if (!(await hasAnyAdminUser())) {
    return c.json({ error: 'ابتدا حساب مدیر را در فرم راه‌اندازی اولیه ایجاد کن.' }, 400);
  }

  const body = await readJsonBody(c);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return c.json({ error: 'نام کاربری و رمز عبور الزامی است.' }, 400);
  }

  const user = await authenticateAdminUser(username, password);
  if (!user) {
    recordFailedLogin(ip);
    return c.json({ error: 'نام کاربری یا رمز عبور اشتباه است.' }, 401);
  }

  clearFailedLogin(ip);
  const secret = await getOrCreateSessionSecret(c.env);
  const token = createSessionToken(user, secret);
  setSessionCookie(c, token);
  return c.json({ ok: true, username: user.username, token });
});

app.post('/api/admin/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get('/api/admin/bootstrap', requireAdmin, async (c) => {
  const adminUser = c.get('adminUser');
  const [
    siteSettings,
    siteCategories,
    sitePosts,
    siteProjects,
    siteMessages,
    siteMedia,
    aiConfig,
  ] = await Promise.all([
    getSettings(),
    listCategories(),
    listPosts(true),
    listProjects(),
    listMessages(),
    listUploadedMedia(),
    getAiConfigPublic(),
  ]);
  return c.json({
    username: adminUser?.username || 'admin',
    settings: siteSettings,
    categories: siteCategories,
    posts: sitePosts,
    projects: siteProjects,
    messages: siteMessages,
    media: siteMedia,
    aiConfig,
  });
});

// Security: Change Credentials & Revoke Sessions
app.put('/api/admin/security/credentials', requireAdmin, async (c) => {
  const adminUser = c.get('adminUser')!;
  const body = await readJsonBody(c);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newUsername = typeof body.newUsername === 'string' ? body.newUsername.trim() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword) {
    return c.json({ error: 'وارد کردن رمز عبور فعلی الزامی است.' }, 400);
  }
  if (!newPassword && (!newUsername || newUsername === adminUser.username)) {
    return c.json({ error: 'تغییری برای نام کاربری یا رمز عبور وارد نشده است.' }, 400);
  }
  if (newPassword) {
    const pwErr = validateStrongPassword(newPassword);
    if (pwErr) {
      return c.json({ error: pwErr }, 400);
    }
  }

  const result = await changeAdminCredentials({
    currentUsername: adminUser.username,
    currentPassword,
    newUsername: newUsername || undefined,
    newPassword: newPassword || undefined,
  });

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const secret = await getOrCreateSessionSecret(c.env);
  const freshToken = createSessionToken(result.user, secret);
  setSessionCookie(c, freshToken);
  return c.json({ ok: true, username: result.user.username, token: freshToken });
});

app.post('/api/admin/security/revoke-all', requireAdmin, async (c) => {
  const adminUser = c.get('adminUser')!;
  await bumpAdminTokenVersion(adminUser.username);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.put('/api/admin/settings', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const updated = await updateSettings(body);
  return c.json({ settings: updated });
});

// Categories CRUD + Drag-and-Drop Reorder
app.put('/api/admin/categories/reorder', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const updated = await reorderCategories(ids);
  return c.json({ categories: updated });
});

app.post('/api/admin/categories', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!name) {
    return c.json({ error: 'نام دسته‌بندی نمی‌تواند خالی باشد.' }, 400);
  }
  try {
    const category = await upsertCategory({
      name,
      nameEn: typeof body.nameEn === 'string' ? body.nameEn.trim() : '',
      description,
      descriptionEn: typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : '',
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    });
    return c.json({ category }, 201);
  } catch {
    return c.json({ error: 'این دسته‌بندی قبلاً ثبت شده است.' }, 409);
  }
});

app.put('/api/admin/categories/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJsonBody(c);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!Number.isInteger(id) || !name) {
    return c.json({ error: 'اطلاعات دسته‌بندی ناقص است.' }, 400);
  }
  try {
    const category = await upsertCategory({
      id,
      name,
      nameEn: typeof body.nameEn === 'string' ? body.nameEn.trim() : '',
      description,
      descriptionEn: typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : '',
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    });
    return c.json({ category });
  } catch {
    return c.json({ error: 'نام دسته‌بندی تکراری است.' }, 409);
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  return c.json({ ok: await deleteCategory(id) });
});

// Posts CRUD
app.post('/api/admin/posts', requireAdmin, async (c) => {
  try {
    const body = await readJsonBody(c);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
    if (!title) {
      return c.json({ error: 'عنوان نوشته نمی‌تواند خالی باشد.' }, 400);
    }
    const post = await upsertPost({
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
    return c.json({ post }, 201);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('POST /api/admin/posts failed:', err);
    return c.json({ error: 'خطا در ذخیره نوشته. لطفاً دوباره امتحان کن.' }, 500);
  }
});

app.put('/api/admin/posts/:id', requireAdmin, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'شناسه نوشته نامعتبر است.' }, 400);
    }
    const body = await readJsonBody(c);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return c.json({ error: 'عنوان نوشته نمی‌تواند خالی باشد.' }, 400);
    }
    const post = await upsertPost({
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
    return c.json({ post });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('PUT /api/admin/posts/:id failed:', err);
    return c.json({ error: 'خطا در به‌روزرسانی نوشته.' }, 500);
  }
});

app.delete('/api/admin/posts/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  return c.json({ ok: await deletePost(id) });
});

// Projects CRUD + Drag-and-Drop Reorder
app.put('/api/admin/projects/reorder', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const updated = await reorderProjects(ids);
  return c.json({ projects: updated });
});

app.post('/api/admin/projects', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return c.json({ error: 'عنوان پروژه الزامی است.' }, 400);
  }
  const existingCount = (await listProjects()).length;
  const project = await upsertProject({
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
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : existingCount + 1,
  });
  return c.json({ project }, 201);
});

app.put('/api/admin/projects/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJsonBody(c);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!Number.isInteger(id) || !title) {
    return c.json({ error: 'اطلاعات پروژه ناقص است.' }, 400);
  }
  const project = await upsertProject({
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
  return c.json({ project });
});

app.delete('/api/admin/projects/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  return c.json({ ok: await deleteProject(id) });
});

// Messages
app.patch('/api/admin/messages/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJsonBody(c);
  const read = Boolean(body.read);
  return c.json({ ok: await markMessageRead(id, read) });
});

app.delete('/api/admin/messages/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  return c.json({ ok: await deleteMessage(id) });
});

// ==================== CLOUDINARY MEDIA UPLOADS (CLOUDFLARE EDGE NATIVE) ====================
app.post('/api/admin/upload', requireAdmin, async (c) => {
  try {
    const body = await c.req.parseBody();
    const rawFile = body['file'];
    if (!(rawFile instanceof File)) {
      return c.json({ error: 'هیچ فایلی انتخاب نشده است.' }, 400);
    }
    const result = await uploadMediaToCloudinary(rawFile, c.env);
    return c.json({ file: result }, 201);
  } catch (uploadErr) {
    if (uploadErr instanceof UploadValidationError) {
      return c.json({ error: uploadErr.message }, 400);
    }
    const msg =
      uploadErr instanceof Error ? uploadErr.message : 'خطا در آپلود فایل روی Cloudinary.';
    return c.json({ error: msg }, 500);
  }
});

app.delete('/api/admin/media/*', requireAdmin, async (c) => {
  const prefix = '/api/admin/media/';
  const pathname = new URL(c.req.url).pathname;
  const rawKey = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  const ok = await deleteUploadedMedia(rawKey, c.env);
  return c.json({ ok });
});

// ==================== ADMIN-ONLY AI ASSISTANT API ====================
app.get('/api/admin/ai/config', requireAdmin, async (c) => {
  return c.json({ aiConfig: await getAiConfigPublic() });
});

app.put('/api/admin/ai/config', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const adminLang: SiteLanguage = body.adminLang === 'en' ? 'en' : 'fa';
  const provider =
    body.provider === 'openai_compatible' || body.provider === 'gemini'
      ? body.provider
      : undefined;
  const rawBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined;
  let validatedBaseUrl = rawBaseUrl;
  if (rawBaseUrl) {
    try {
      validatedBaseUrl = validateBaseUrl(rawBaseUrl, adminLang);
    } catch (err) {
      return c.json(
        {
          error:
            err instanceof Error
              ? err.message
              : adminLang === 'en'
                ? 'Provider Base URL is invalid.'
                : 'آدرس ارائه‌دهنده (Base URL) معتبر نیست.',
        },
        400,
      );
    }
  }

  const updated = await updateAiConfig({
    provider,
    model: typeof body.model === 'string' ? body.model : undefined,
    baseUrl: validatedBaseUrl,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
    clearCustomApiKey: Boolean(body.clearCustomApiKey),
  });
  return c.json({ aiConfig: updated });
});

app.post('/api/admin/ai/test', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const adminLang: SiteLanguage = body.adminLang === 'en' ? 'en' : 'fa';
  try {
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
      adminLang,
    };
    const result = await testAdminAiConnection(override);
    return c.json(result);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : adminLang === 'en'
              ? 'Could not connect to the AI provider.'
              : 'اتصال به ارائه‌دهنده هوش مصنوعی برقرار نشد.',
      },
      400,
    );
  }
});

app.post('/api/admin/ai/assist', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const adminLang: SiteLanguage = body.adminLang === 'en' ? 'en' : 'fa';
  try {
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
      return c.json(
        {
          error:
            adminLang === 'en'
              ? 'Please enter a prompt for the AI assistant.'
              : 'لطفاً درخواستت را برای دستیار بنویس.',
        },
        400,
      );
    }

    const rawPost = (body.currentPost ?? {}) as Record<string, unknown>;
    const contentLang: SiteLanguage = body.contentLang === 'en' ? 'en' : 'fa';
    const allCats = await listCategories();
    const result = await runAdminAiAssist({
      prompt:
        prompt ||
        (contentLang === 'en'
          ? 'Act on the current post fields.'
          : 'بر اساس متن و فیلدهای فعلی اقدام کن.'),
      action,
      contentLang,
      adminLang,
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
      categories: allCats.map((cat) => cat.name),
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : adminLang === 'en'
              ? 'Failed to process the AI request.'
              : 'خطا در پردازش درخواست هوش مصنوعی.',
      },
      400,
    );
  }
});

app.post('/api/admin/ai/translate', requireAdmin, async (c) => {
  const body = await readJsonBody(c);
  const adminLang: SiteLanguage = body.adminLang === 'en' ? 'en' : 'fa';
  try {
    const kind = body.kind;
    if (kind !== 'post' && kind !== 'category' && kind !== 'project' && kind !== 'settings') {
      return c.json(
        {
          error:
            adminLang === 'en'
              ? 'Invalid content type for translation.'
              : 'نوع محتوای انتخابی برای ترجمه نامعتبر است.',
        },
        400,
      );
    }
    const payload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      return c.json(
        {
          error:
            adminLang === 'en'
              ? 'No content provided for translation.'
              : 'داده‌ای برای ترجمه ارسال نشده است.',
        },
        400,
      );
    }
    const result = await translateAdminContentToEnglish({
      kind: kind as TranslateTargetKind,
      payload,
      adminLang,
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : adminLang === 'en'
              ? 'Smart translation failed.'
              : 'ترجمه هوشمند با خطا مواجه شد.',
      },
      400,
    );
  }
});

// ==================== ADMIN BACKUP (EXPORT / IMPORT) ====================
app.get('/api/admin/backup/export', requireAdmin, async (c) => {
  const payload = await exportFullBackup();
  const dateStamp = new Date().toISOString().slice(0, 10);
  await writeSystemLog({
    level: 'info',
    source: 'backup',
    method: 'GET',
    path: '/api/admin/backup/export',
    status: 200,
    message: `Exported full site backup (${payload.posts.length} posts, ${payload.projects.length} projects, ${payload.mediaAssets.length} media)`,
  });
  return c.body(JSON.stringify(payload, null, 2), 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="site-backup-${dateStamp}.json"`,
    'Cache-Control': 'private, no-store',
  });
});

app.post('/api/admin/backup/import', requireAdmin, async (c) => {
  const body = await readJsonBody(c, MAX_BACKUP_BODY_BYTES);
  const mode = body.mode === 'merge' ? 'merge' : 'replace';
  const rawBackup = body.backup !== undefined ? body.backup : body;
  try {
    const result = await importFullBackup(rawBackup, mode);
    return c.json({ ok: true, mode, restored: result.restored });
  } catch (err) {
    if (err instanceof BackupValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

// ==================== ADMIN SYSTEM & ERROR LOGS ====================
app.get('/api/admin/logs', requireAdmin, async (c) => {
  const level = c.req.query('level') || 'all';
  const source = c.req.query('source') || 'all';
  const q = c.req.query('q') || '';
  const limit = Number(c.req.query('limit') || '150');
  const data = await listSystemLogs({ level, source, q, limit });
  return c.json(data);
});

app.delete('/api/admin/logs', requireAdmin, async (c) => {
  await clearSystemLogs();
  return c.json({ ok: true });
});

// Catch-all for unknown /api/* routes
app.all('/api/*', (c) => {
  return c.json({ error: 'مسیر API پیدا نشد.' }, 404);
});

// ==================== SSR HTML + DYNAMIC SEO HANDLER ====================
app.get('*', async (c) => {
  const reqPath = c.req.path;

  // Serve static files from Cloudflare ASSETS binding if routed to worker
  if (
    STATIC_OR_MODULE_PREFIXES.some((prefix) => reqPath.startsWith(prefix)) ||
    STATIC_OR_MODULE_EXT_RE.test(reqPath)
  ) {
    if (c.env?.ASSETS) {
      const assetRes = await c.env.ASSETS.fetch(c.req.raw);
      if (assetRes.status !== 404) {
        return assetRes;
      }
    }
    return c.text('Not Found', 404);
  }

  const templateRes = await fetchStaticAsset(c, '/index.html');
  if (!templateRes) {
    return c.text('HTML template not found', 500);
  }
  let html = await templateRes.text();

  if (c.env?.__TRANSFORM_HTML__) {
    const urlObj = new URL(c.req.url);
    html = await c.env.__TRANSFORM_HTML__(urlObj.pathname + urlObj.search, html);
  }

  const adminRoute = resolveAdminRoute(c.env);
  const cleanPath = reqPath.replace(/^\/+|\/+$/g, '');
  const isSecretAdminRoute =
    Boolean(adminRoute) && (cleanPath === adminRoute || cleanPath.startsWith(`${adminRoute}/`));

  const origin = getBaseOrigin(c);
  const canonicalUrl = `${origin}${reqPath === '/' ? '/' : reqPath}`;
  const siteSettings = await getSettings();
  const seo = buildDynamicSeoProfile(siteSettings, origin);
  let pageTitle = siteSettings.siteTitle;
  let pageDescription = siteSettings.siteDescription;
  let pageKeywords = seo.keywords;
  const defaultPoster = siteSettings.heroPosterDesktop?.trim() || '/poster.webp';
  let ogImage = defaultPoster.startsWith('http') ? defaultPoster : `${origin}${defaultPoster}`;
  let ogType = 'website';
  let httpStatus: 200 | 404 = 200;
  let articleMeta: {
    publishedTime: string;
    modifiedTime: string;
    section: string;
    author: string;
  } | null = null;

  const [publicCategories, publicPosts, publicProjects] = isSecretAdminRoute
    ? [[], [], []]
    : await Promise.all([listCategories(), listPosts(false), listProjects()]);

  const sameAsLinks = parseSocialLinks(siteSettings.socialLinksJson)
    .filter((s) => s.enabled !== false && s.url.startsWith('http'))
    .map((s) => s.url);

  const personNode = {
    '@type': 'Person',
    '@id': `${origin}/#person`,
    name: seo.authorName,
    alternateName: seo.alternateNames,
    url: origin,
    image: `${origin}/logo.png`,
    email: siteSettings.email ? `mailto:${siteSettings.email}` : undefined,
    jobTitle: siteSettings.vcardTitle || siteSettings.aboutFocusText || undefined,
    description: siteSettings.aboutBio || siteSettings.siteDescription,
    knowsLanguage: ['fa-IR', 'en-US'],
    knowsAbout: seo.knowsAbout.length > 0 ? seo.knowsAbout : undefined,
    sameAs: sameAsLinks,
  };

  let jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: seo.brandName,
        alternateName: seo.alternateNames,
        url: origin,
        description: siteSettings.siteDescription,
        inLanguage: ['fa-IR', 'en-US'],
        publisher: { '@id': `${origin}/#person` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${origin}/blog?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      personNode,
    ],
  };

  if (isSecretAdminRoute) {
    c.header('X-Robots-Tag', 'noindex, nofollow');
    c.header('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    pageTitle = `پنل مدیریت | ${seo.brandName}`;
  } else {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (reqPath === '/') {
      // Home uses default WebSite + Person JSON-LD
    } else if (reqPath === '/blog') {
      pageTitle = `${siteSettings.blogSectionTitle || 'نوشته‌ها و تجربه‌ها'} | ${seo.brandName}`;
      pageDescription = siteSettings.blogPageSubtitle || siteSettings.siteDescription;
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Blog',
            name: siteSettings.blogSectionTitle || seo.brandName,
            description: pageDescription,
            url: canonicalUrl,
            inLanguage: ['fa-IR', 'en-US'],
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
    } else if (reqPath.startsWith('/blog/') && reqPath.length > 6) {
      const slug = reqPath.slice('/blog/'.length);
      const post = await getPostBySlug(slug, false);
      if (post) {
        pageTitle = `${post.title} | ${seo.brandName}`;
        pageDescription = post.excerpt;
        pageKeywords = [post.title, post.category, seo.keywords].filter(Boolean).join(', ');
        ogType = 'article';
        articleMeta = {
          publishedTime: post.createdAt,
          modifiedTime: post.updatedAt || post.createdAt,
          section: post.category,
          author: seo.authorName,
        };
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
              alternativeHeadline: post.titleEn || undefined,
              description: post.excerpt,
              articleSection: post.category,
              datePublished: post.createdAt,
              dateModified: post.updatedAt || post.createdAt,
              timeRequired: `PT${Math.max(1, post.readingMinutes || 1)}M`,
              wordCount,
              inLanguage: post.blocksEn?.length ? ['fa-IR', 'en-US'] : 'fa-IR',
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
        pageTitle = `نوشته پیدا نشد | ${seo.brandName}`;
      }
    } else if (reqPath === '/projects') {
      pageTitle = `${siteSettings.projectsSectionTitle || 'پروژه‌ها'} | ${seo.brandName}`;
      pageDescription = siteSettings.projectsPageSubtitle || siteSettings.siteDescription;
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            name: pageTitle,
            description: pageDescription,
            url: canonicalUrl,
            inLanguage: ['fa-IR', 'en-US'],
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: publicProjects.map((proj, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                item: {
                  '@type': 'CreativeWork',
                  name: proj.title,
                  alternateName: proj.titleEn || undefined,
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
    } else if (reqPath === '/about') {
      pageTitle = `${siteSettings.aboutTitle || 'درباره من و ارتباط'} | ${seo.brandName}`;
      pageDescription = siteSettings.aboutBio || siteSettings.siteDescription;
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'ProfilePage',
            name: pageTitle,
            description: pageDescription,
            url: canonicalUrl,
            inLanguage: ['fa-IR', 'en-US'],
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
      pageTitle = `صفحه پیدا نشد | ${seo.brandName}`;
    }
  }

  const faviconHref = siteSettings.faviconImage?.trim() || '/favicon.png';
  const hasKeywordsMeta = /<meta\s+name="keywords"\s+content="[^"]*"\s*\/>/s.test(html);
  html = html
    .replace(
      /<link\s+rel="icon"[^>]*\/>/s,
      `<link rel="icon" href="${escapeHtmlAttr(faviconHref)}" />`,
    )
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtmlAttr(pageTitle)}</title>`)
    .replace(
      /<meta\s+name="author"\s+content="[^"]*"\s*\/>/s,
      `<meta name="author" content="${escapeHtmlAttr(seo.authorName)}" />`,
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
      `<meta name="description" content="${escapeHtmlAttr(pageDescription)}" />`,
    )
    .replace(
      /<meta\s+name="keywords"\s+content="[^"]*"\s*\/>/s,
      `<meta name="keywords" content="${escapeHtmlAttr(pageKeywords)}" />`,
    )
    .replace(
      /<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/>/s,
      `<meta property="og:site_name" content="${escapeHtmlAttr(seo.brandName)}" />`,
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
  const isIndexablePublic = httpStatus === 200 && !isSecretAdminRoute;

  const injectedHeadTags = [
    !hasKeywordsMeta && isIndexablePublic
      ? `<meta name="keywords" content="${escapeHtmlAttr(pageKeywords)}" />`
      : '',
    isIndexablePublic
      ? `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`
      : '',
    isIndexablePublic
      ? `<link rel="alternate" hreflang="fa-IR" href="${escapeHtmlAttr(canonicalUrl)}" />`
      : '',
    isIndexablePublic
      ? `<link rel="alternate" hreflang="en" href="${escapeHtmlAttr(canonicalUrl)}" />`
      : '',
    isIndexablePublic
      ? `<link rel="alternate" hreflang="x-default" href="${escapeHtmlAttr(canonicalUrl)}" />`
      : '',
    `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />`,
    `<meta property="og:image:alt" content="${escapeHtmlAttr(pageTitle)}" />`,
    articleMeta
      ? `<meta property="article:published_time" content="${escapeHtmlAttr(articleMeta.publishedTime)}" />`
      : '',
    articleMeta
      ? `<meta property="article:modified_time" content="${escapeHtmlAttr(articleMeta.modifiedTime)}" />`
      : '',
    articleMeta
      ? `<meta property="article:section" content="${escapeHtmlAttr(articleMeta.section)}" />`
      : '',
    articleMeta
      ? `<meta property="article:author" content="${escapeHtmlAttr(articleMeta.author)}" />`
      : '',
    `<meta name="twitter:title" content="${escapeHtmlAttr(pageTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlAttr(pageDescription)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />`,
    !isIndexablePublic
      ? ''
      : `<script type="application/ld+json">${safeJsonLd}</script>`,
    isSecretAdminRoute
      ? `<script>window.__ADMIN_PORTAL_ACTIVE__ = true;</script>`
      : `<script id="__INITIAL_SITE_DATA__" type="application/json">${safeInitialJson}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');

  html = html.replace('</head>', `    ${injectedHeadTags}\n  </head>`);
  if (c.env?.__HMR_DISABLED__) {
    html = html.replace(/<script\s+type="module"\s+src="\/@vite\/client"><\/script>\s*/g, '');
  }

  return c.html(html, httpStatus);
});

// Global error handler — ensures /api/* always returns clean JSON and logs unhandled errors
app.onError(async (err, c) => {
  if (err instanceof HTTPException) {
    await writeSystemLog({
      level: err.status >= 500 ? 'error' : 'warn',
      source: inferLogSourceFromPath(c.req.path),
      method: c.req.method,
      path: c.req.path,
      status: err.status,
      message: err.message || `HTTP ${err.status}`,
    });
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: err.message || 'درخواست نامعتبر است.' }, err.status);
    }
    return c.text(err.message || 'Error', err.status);
  }
  console.error('Unhandled Hono error:', err);
  await writeSystemLog({
    level: 'error',
    source: inferLogSourceFromPath(c.req.path),
    method: c.req.method,
    path: c.req.path,
    status: 500,
    message: err instanceof Error ? err.message : 'Unhandled server error',
    details: err instanceof Error ? err.stack || err.message : String(err),
  });
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'خطای داخلی سرور رخ داد.' }, 500);
  }
  return c.text('Internal Server Error', 500);
});

export default app;
