import { createClient, type Client } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql/web';
import { asc, desc, eq, inArray, or } from 'drizzle-orm';

type LibSQLDatabase = ReturnType<typeof drizzle>;
import {
  categories,
  mediaAssets,
  messages,
  posts,
  projectsTable,
  settings,
  systemLogs,
  users,
} from './schema.ts';
import {
  decryptSecret,
  encryptSecret,
  hashPasswordScrypt,
  verifyPasswordScrypt,
} from './auth.ts';
import { getEnvVar, setActiveRuntimeEnv, type RuntimeEnv } from './env.ts';
import {
  createBackupEnvelope,
  validateAndNormalizeBackupPayload,
} from './backup.ts';
import { normalizeLogLevel, normalizeLogSource, sanitizeLogText } from './logs.ts';
import { parseBlocksJson } from '../src/lib/blocks.ts';
import { estimateReadingMinutes, slugifyPersian } from '../src/lib/slug.ts';
import type {
  AiConfigPublic,
  AiProviderType,
  BlogPost,
  CategoryItem,
  ContactMessage,
  ContentBlock,
  ProjectItem,
  SiteBackupPayload,
  SiteSettings,
  SocialPlatformLink,
  SystemLogEntry,
  SystemLogLevel,
  SystemLogSource,
  SystemLogsResponse,
  UploadedMediaItem,
  VCardExtraField,
  VCardExtraFieldType,
} from '../src/types/cms.ts';

export function isPlaceholderEnv(value?: string): boolean {
  const v = value?.trim() || '';
  if (!v) return true;
  if (
    v.startsWith('CHANGE_ME') ||
    v === 'MY_GEMINI_API_KEY' ||
    v === 'MY_APP_URL' ||
    v === 'MY_OPENAI_API_KEY' ||
    v.includes('your-database-name') ||
    v.includes('your-turso-auth-token')
  ) {
    return true;
  }
  return false;
}

function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let cachedClient: Client | null = null;
let cachedDb: LibSQLDatabase | null = null;
let cachedConnectionKey = '';
let initPromise: Promise<void> | null = null;
let cachedSessionSecret = '';

function resolveLibsqlCredentials(env?: RuntimeEnv): { url: string; authToken?: string } {
  const rawUrl = getEnvVar('LIBSQL_URL', env).trim();
  const rawToken = getEnvVar('LIBSQL_AUTH_TOKEN', env).trim();
  const url = rawUrl && !isPlaceholderEnv(rawUrl) ? rawUrl : '';
  const authToken = rawToken && !isPlaceholderEnv(rawToken) ? rawToken : undefined;
  return { url, authToken };
}

function createLibsqlConnection(env?: RuntimeEnv): {
  client: Client;
  db: LibSQLDatabase;
  key: string;
} {
  const { url, authToken } = resolveLibsqlCredentials(env);
  if (!url) {
    throw new Error(
      'LIBSQL_URL is required for Edge / Cloudflare Workers execution. Configure LIBSQL_URL and LIBSQL_AUTH_TOKEN in Cloudflare environment secrets.',
    );
  }

  const client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });
  return {
    client,
    db: drizzle(client),
    key: `${url}::${authToken ? 'auth' : 'noauth'}`,
  };
}

/**
 * Binds Cloudflare Workers `env` for the current request and refreshes the
 * Turso `@libsql/client/web` connection if credentials changed.
 */
export function configureDb(env?: RuntimeEnv): void {
  if (env) {
    setActiveRuntimeEnv(env);
  }
  const { url, authToken } = resolveLibsqlCredentials(env);
  if (!url) return;
  const nextKey = `${url}::${authToken ? 'auth' : 'noauth'}`;
  if (cachedClient && cachedConnectionKey === nextKey) return;

  const conn = createLibsqlConnection(env);
  cachedClient = conn.client;
  cachedDb = conn.db;
  cachedConnectionKey = conn.key;
  initPromise = null;
}

/**
 * Injects a custom libSQL Client (used only by local Node.js dev/test fallback
 * when LIBSQL_URL is not configured). Never called on Cloudflare Workers.
 */
export function setCustomLibsqlClient(client: Client, connectionKey = 'custom-local'): void {
  cachedClient = client;
  cachedDb = drizzle(client);
  cachedConnectionKey = connectionKey;
  initPromise = null;
  cachedSessionSecret = '';
}

export function getLibsqlClient(env?: RuntimeEnv): Client {
  if (!cachedClient) {
    const conn = createLibsqlConnection(env);
    cachedClient = conn.client;
    cachedDb = conn.db;
    cachedConnectionKey = conn.key;
  }
  return cachedClient;
}

export function getDb(env?: RuntimeEnv): LibSQLDatabase {
  if (!cachedDb) {
    const conn = createLibsqlConnection(env);
    cachedClient = conn.client;
    cachedDb = conn.db;
    cachedConnectionKey = conn.key;
  }
  return cachedDb;
}

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    description_en TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    title_en TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT NOT NULL,
    excerpt_en TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    cover_image TEXT NOT NULL,
    blocks TEXT NOT NULL,
    blocks_en TEXT NOT NULL DEFAULT '[]',
    published INTEGER NOT NULL DEFAULT 1,
    reading_minutes INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    title_en TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    role_en TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL,
    period_en TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL,
    summary_en TEXT NOT NULL DEFAULT '',
    stack TEXT NOT NULL,
    url TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'image',
    resource_type TEXT NOT NULL DEFAULT 'image',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL DEFAULT 'info',
    source TEXT NOT NULL DEFAULT 'server',
    method TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
];

const MIGRATION_SPECS: Array<{ table: string; col: string; definition: string }> = [
  { table: 'users', col: 'token_version', definition: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'categories', col: 'name_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'categories', col: 'description_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'posts', col: 'title_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'posts', col: 'excerpt_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'posts', col: 'blocks_en', definition: "TEXT NOT NULL DEFAULT '[]'" },
  { table: 'projects', col: 'title_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'projects', col: 'role_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'projects', col: 'period_en', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'projects', col: 'summary_en', definition: "TEXT NOT NULL DEFAULT ''" },
];

export async function getOrCreateSessionSecret(env?: RuntimeEnv): Promise<string> {
  if (cachedSessionSecret) return cachedSessionSecret;

  const fromEnv = getEnvVar('SESSION_SECRET', env).trim();
  if (fromEnv && !isPlaceholderEnv(fromEnv) && fromEnv.length >= 16) {
    cachedSessionSecret = fromEnv;
    return cachedSessionSecret;
  }

  const db = getDb(env);
  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, '_internal_session_secret'))
    .limit(1);

  if (existing?.value && existing.value.length >= 32) {
    cachedSessionSecret = existing.value;
    return cachedSessionSecret;
  }

  const generated = generateRandomHex(32);
  const now = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: '_internal_session_secret', value: generated, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: generated, updatedAt: now },
    });

  cachedSessionSecret = generated;
  return cachedSessionSecret;
}

export const DEFAULT_SOCIAL_LINKS: SocialPlatformLink[] = [
  {
    id: 'github',
    label: 'گیت‌هاب',
    labelEn: 'GitHub',
    handle: '@username',
    url: 'https://github.com',
    iconKey: 'github',
    enabled: true,
  },
  {
    id: 'email',
    label: 'ایمیل',
    labelEn: 'Email',
    handle: 'hello@example.com',
    url: 'mailto:hello@example.com',
    iconKey: 'email',
    enabled: true,
  },
  {
    id: 'telegram',
    label: 'تلگرام',
    labelEn: 'Telegram',
    handle: '@username',
    url: 'https://t.me',
    iconKey: 'telegram',
    enabled: false,
  },
  {
    id: 'linkedin',
    label: 'لینکدین',
    labelEn: 'LinkedIn',
    handle: 'username',
    url: 'https://linkedin.com',
    iconKey: 'linkedin',
    enabled: false,
  },
  {
    id: 'x',
    label: 'ایکس',
    labelEn: 'X',
    handle: '',
    url: 'https://x.com',
    iconKey: 'x',
    enabled: false,
  },
  {
    id: 'youtube',
    label: 'یوتیوب',
    labelEn: 'YouTube',
    handle: '',
    url: 'https://youtube.com',
    iconKey: 'youtube',
    enabled: false,
  },
  {
    id: 'instagram',
    label: 'اینستاگرام',
    labelEn: 'Instagram',
    handle: '',
    url: 'https://instagram.com',
    iconKey: 'instagram',
    enabled: false,
  },
];

export const DEFAULT_NAV_ITEMS_JSON = JSON.stringify([
  { id: 'home', labelFa: 'خانه', labelEn: 'Home', to: '/', enabled: true },
  { id: 'blog', labelFa: 'وبلاگ', labelEn: 'Blog', to: '/blog', enabled: true },
  { id: 'projects', labelFa: 'پروژه‌ها', labelEn: 'Projects', to: '/projects', enabled: true },
  { id: 'about', labelFa: 'درباره من', labelEn: 'About', to: '/about', enabled: true },
]);

export const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: 'پورتفولیو و وبلاگ شخصی | Personal Portfolio & Blog',
  siteDescription:
    'وب‌سایت شخصی، پورتفولیو و وبلاگ دوزبانه سریع با پنل مدیریت اختصاصی، ویرایشگر بلوکی، سئوی پیشرفته و آماده استقرار روی Cloudflare Workers.',
  brandName: 'My Portfolio',
  logoImage: '/logo.webp',
  faviconImage: '/favicon.png',

  heroVideoEnabled: 'true',
  heroVideoDesktop: '/hero-loop.mp4',
  heroVideoMobile: '/hero-loop-mobile.mp4',
  heroPosterDesktop: '/poster.webp',
  heroPosterMobile: '/poster-mobile.webp',

  heroTitle: 'سلام! به وب‌سایت من خوش آمدید.',
  heroSubtitle:
    'اینجا درباره پروژه‌ها، یادداشت‌های فنی و تجربه‌های عملی‌ام می‌نویسم. تمام بخش‌ها، رنگ‌ها، زبان و محتوای این سایت از پنل مدیریت قابل ویرایش است.',
  blogSectionTitle: 'نوشته‌ها و یادداشت‌ها',
  blogPageTitle: 'وبلاگ',
  blogPageSubtitle:
    'مقالات، آموزش‌ها و یادداشت‌های فنی درباره نرم‌افزار، وب، هوش مصنوعی و تجربه‌های روزمره.',
  projectsSectionTitle: 'پروژه‌ها',
  projectsPageSubtitle: 'مجموعه‌ای از پروژه‌ها، وب‌اپلیکیشن‌ها و ابزارهای ساخته‌شده.',
  aboutTitle: 'درباره من و ارتباط',
  aboutBio:
    'خوش آمدید! این یک فضای شخصی برای معرفی کارها، پروژه‌ها و به اشتراک گذاشتن یادداشت‌ها و تجربه‌هاست. می‌توانید تمام این متن‌ها، لینک‌های ارتباطی و کارت مخاطب را از پنل مدیریت شخصی‌سازی کنید.',
  aboutFocusHeading: 'حوزه‌های فعالیت',
  aboutFocusText: 'توسعه وب و اپلیکیشن · طراحی محصول · اتوماسیون و بهینه‌سازی سیستم‌ها',
  aboutConnectHeading: 'راه‌های ارتباطی مستقیم',
  contactFormHeading: 'ارسال پیام مستقیم',
  contactSuccessMessage: 'پیام شما با موفقیت ثبت شد؛ ممنون از ارتباطتان!',
  vcardButtonLabel: 'افزودن به مخاطبین',
  footerText: '© ۱۴۰۵ My Portfolio',

  heroTitleEn: 'Hello! Welcome to my website.',
  heroSubtitleEn:
    'I share my projects, technical notes, and hands-on experiments here. Every section, theme color, language, and block is customizable from the Admin Portal.',
  blogSectionTitleEn: 'Notes & Writing',
  blogPageTitleEn: 'Blog',
  blogPageSubtitleEn:
    'Articles, tutorials, and field notes on software engineering, web architecture, and practical experiments.',
  projectsSectionTitleEn: 'Projects',
  projectsPageSubtitleEn: 'Selected apps, tools, and practical projects I have built.',
  aboutTitleEn: 'About & Contact',
  aboutBioEn:
    'Welcome! This is a personal space for sharing selected projects, technical notes, and direct ways to get in touch. You can customize every section, link, and vCard detail directly from the Admin Portal.',
  aboutFocusHeadingEn: 'Focus Areas',
  aboutFocusTextEn: 'Web & App Development · Product Engineering · Automation & Optimization',
  aboutConnectHeadingEn: 'Direct Channels',
  contactFormHeadingEn: 'Send a Direct Message',
  contactSuccessMessageEn: 'Message received — thank you for reaching out!',
  vcardButtonLabelEn: 'Save Contact',
  footerTextEn: '© 2026 My Portfolio',

  navItemsJson: DEFAULT_NAV_ITEMS_JSON,
  showHeroSection: 'true',
  showBlogCard: 'true',
  showProjectsCard: 'true',
  showAboutCard: 'true',
  contactFormEnabled: 'true',
  showReadingTime: 'true',

  shareEnabled: 'true',
  shareHeading: 'اشتراک‌گذاری این نوشته',
  shareHeadingEn: 'Share this article',
  shareSubtitle: 'اگر این مطلب مفید بود، می‌توانید آن را با دوستانتان به اشتراک بگذارید.',
  shareSubtitleEn: 'Found this helpful? Share it with someone who might enjoy it.',
  shareCopyEnabled: 'true',
  shareTelegramEnabled: 'true',
  shareWhatsappEnabled: 'true',
  shareXEnabled: 'true',
  shareNativeEnabled: 'true',

  themeMode: 'dark',
  allowThemeToggle: 'true',
  accentColor: '#FF502B',
  darkBgColor: '#0E0E0E',
  darkSurfaceColor: '#121212',
  darkInkColor: '#FBEFDD',
  lightBgColor: '#FAF7F2',
  lightSurfaceColor: '#FFFFFF',
  lightInkColor: '#181615',
  defaultLanguage: 'fa',
  allowLanguageToggle: 'true',

  email: 'hello@example.com',
  telegramHandle: '',
  telegramUrl: '',
  vcardEnabled: 'true',
  vcardFullName: 'Your Name',
  vcardOrg: 'My Portfolio',
  vcardTitle: 'Software Developer & Creator',
  vcardNote: '',
  vcardPhone: '',
  vcardWebsite: '',
  vcardAvatar: '/vcard-avatar.jpg',
  vcardExtraFieldsJson: '[]',
  socialLinksJson: JSON.stringify(DEFAULT_SOCIAL_LINKS),
};

const SEED_FLAG_KEY = '_content_seeded_v4';

function createSamplePostBlocks(): ContentBlock[] {
  return [
    {
      id: 'sample_intro',
      type: 'paragraph',
      text: 'این نوشته یک **نمونه جامع** از تمام قابلیت‌های ویرایشگر وبلاگ است. هر زمان بخواهید می‌توانید از داخل پنل مدیریت این نوشته را *ویرایش* یا ==به‌صورت دائمی حذف== کنید. همچنین می‌توانید `کد درون‌خطی` و [لینک خارجی](https://example.com) داخل متن قرار دهید.',
    },
    {
      id: 'sample_h2_media',
      type: 'h2',
      text: 'نمونه رسانه: تصویر، ویدیو و فایل صوتی',
    },
    {
      id: 'sample_image',
      type: 'image',
      url: '/poster.webp',
      alt: 'تصویر نمونه در نوشته وبلاگ',
      caption: 'نمونه بلوک تصویر با آپلود مستقیم به کلودیناری یا لینک خارجی',
    },
    {
      id: 'sample_video',
      type: 'video',
      url: '/hero-loop.mp4',
      caption: 'نمونه بلوک ویدیو (پشتیبانی از آپلود مستقیم MP4/WebM و همچنین لینک مستقیم یوتیوب و آپارات)',
    },
    {
      id: 'sample_audio',
      type: 'audio',
      url: '/sample-audio.mp3',
      title: 'نمونه فایل صوتی / پادکست کوتاه',
      caption: 'پشتیبانی کامل از آپلود فایل صوتی (MP3, WAV, OGG, M4A) یا لینک خارجی',
    },
    {
      id: 'sample_h2_cards',
      type: 'h2',
      text: 'کارت نکته، دکمه اقدام و لینک خارجی',
    },
    {
      id: 'sample_card_flame',
      type: 'card',
      title: 'کارت نکته برجسته (Flame)',
      body: 'با بلوک کارت می‌توانید نکات مهم، چک‌لیست‌ها یا خلاصه مطلب را با **تأکید رنگی** وسط نوشته نمایش دهید.',
      accent: 'flame',
    },
    {
      id: 'sample_card_neutral',
      type: 'card',
      title: 'کارت توضیح خنثی (Neutral)',
      body: 'این مدل کارت برای توضیحات تکمیلی یا یادداشت‌های آرام‌تر در کنار متن اصلی مناسب است.',
      accent: 'neutral',
    },
    {
      id: 'sample_list',
      type: 'list',
      ordered: false,
      items: [
        'قالب‌بندی درون‌خطی: **بولد**، *ایتالیک*، ==هایلایت== و `کد درون‌خطی`',
        'جابه‌جایی ترتیب بلوک‌ها با دستگیره کشیدن و رها کردن (Drag & Drop)',
        'پشتیبان‌گیری کامل (Import/Export)، لاگ خطاها و دستیار هوش مصنوعی اختیاری',
      ],
    },
    {
      id: 'sample_embed',
      type: 'embed',
      title: 'مستندات و نمونه لینک خارجی',
      url: 'https://example.com',
      description: 'نمونه کارت لینک خارجی برای معرفی ابزارها، مخازن کد یا منابع مفید.',
    },
    {
      id: 'sample_button',
      type: 'button',
      label: 'مشاهده پروژه‌ها',
      url: '/projects',
      variant: 'primary',
    },
    {
      id: 'sample_h3_code',
      type: 'h3',
      text: 'نمونه بلوک کد و نقل‌قول',
    },
    {
      id: 'sample_code',
      type: 'code',
      language: 'bash',
      code: '# Build and run locally\nnpm run build && npm run start',
    },
    {
      id: 'sample_quote',
      type: 'quote',
      text: 'بهترین راه یادگیری هر ابزار جدید، ساختن یک پروژه واقعی و حل کردن خطاهای واقعی آن است.',
      author: 'نویسنده',
    },
  ];
}

function createSamplePostBlocksEn(): ContentBlock[] {
  return [
    {
      id: 'sample_intro',
      type: 'paragraph',
      text: 'This article is a **complete showcase** of every capability built into the block editor. Whenever you want, you can *edit* or ==permanently delete== this sample from the Admin Portal. You can also mix `inline code` and [external links](https://example.com) seamlessly.',
    },
    {
      id: 'sample_h2_media',
      type: 'h2',
      text: 'Rich Media: Images, Video & Audio',
    },
    {
      id: 'sample_image',
      type: 'image',
      url: '/poster.webp',
      alt: 'Sample blog illustration',
      caption: 'Image block with direct Cloudinary upload or external image URL',
    },
    {
      id: 'sample_video',
      type: 'video',
      url: '/hero-loop.mp4',
      caption: 'Video block supporting MP4/WebM uploads as well as direct YouTube and Aparat links',
    },
    {
      id: 'sample_audio',
      type: 'audio',
      url: '/sample-audio.mp3',
      title: 'Sample Audio Clip / Short Podcast',
      caption: 'Full support for audio uploads (MP3, WAV, OGG, M4A) or external audio URLs',
    },
    {
      id: 'sample_h2_cards',
      type: 'h2',
      text: 'Callout Cards, Action Buttons & External Links',
    },
    {
      id: 'sample_card_flame',
      type: 'card',
      title: 'Highlighted Note Card (Flame)',
      body: 'Use callout cards to spotlight key takeaways, checklists, or summaries with **accent styling**.',
      accent: 'flame',
    },
    {
      id: 'sample_card_neutral',
      type: 'card',
      title: 'Neutral Info Card',
      body: 'Neutral cards work well for quieter side notes or supporting context alongside the main article.',
      accent: 'neutral',
    },
    {
      id: 'sample_list',
      type: 'list',
      ordered: false,
      items: [
        'Inline rich formatting: **bold**, *italic*, ==highlight==, and `inline code`',
        'Drag-and-drop block reordering using the block handle',
        'Full Backup Import/Export, Site Logs, and optional AI writing assistant',
      ],
    },
    {
      id: 'sample_embed',
      type: 'embed',
      title: 'Sample Resource Link Card',
      url: 'https://example.com',
      description: 'Embed external repositories, documentation, or helpful references cleanly.',
    },
    {
      id: 'sample_button',
      type: 'button',
      label: 'Explore Projects',
      url: '/projects',
      variant: 'primary',
    },
    {
      id: 'sample_h3_code',
      type: 'h3',
      text: 'Code Block & Quote Example',
    },
    {
      id: 'sample_code',
      type: 'code',
      language: 'bash',
      code: '# Build and launch production server\nnpm run build && npm run start',
    },
    {
      id: 'sample_quote',
      type: 'quote',
      text: 'The best way to learn any new tool is to build a real project and solve its real-world bugs.',
      author: 'Author',
    },
  ];
}

async function runDatabaseInit(): Promise<void> {
  const client = getLibsqlClient();
  const db = getDb();

  // 1. Create tables in ONE single batched request (Cloudflare Workers subrequest friendly)
  await client.batch(SCHEMA_STATEMENTS, 'write');

  // 2. Check missing columns across all tables in ONE single batched read
  const tablesToCheck = Array.from(new Set(MIGRATION_SPECS.map((m) => m.table)));
  const pragmaResults = await client.batch(
    tablesToCheck.map((table) => `PRAGMA table_info(${table})`),
    'read',
  );
  const columnsByTable = new Map<string, Set<string>>();
  tablesToCheck.forEach((table, idx) => {
    const rows = pragmaResults[idx]?.rows || [];
    columnsByTable.set(table, new Set(rows.map((r) => String(r.name))));
  });

  const alterStmts: string[] = [];
  for (const spec of MIGRATION_SPECS) {
    if (!columnsByTable.get(spec.table)?.has(spec.col)) {
      alterStmts.push(`ALTER TABLE ${spec.table} ADD COLUMN ${spec.col} ${spec.definition}`);
    }
  }
  if (alterStmts.length > 0) {
    await client.batch(alterStmts, 'write');
  }

  const now = new Date().toISOString();

  // 3. Seed missing settings keys in a single multi-row insert
  const existingSettingsRows = await db.select({ key: settings.key }).from(settings);
  const existingKeys = new Set(existingSettingsRows.map((r) => r.key));
  const missingEntries = Object.entries(DEFAULT_SETTINGS).filter(([k]) => !existingKeys.has(k));
  if (missingEntries.length > 0) {
    await db
      .insert(settings)
      .values(missingEntries.map(([key, value]) => ({ key, value, updatedAt: now })))
      .onConflictDoNothing();
  }

  // 4. Ensure session secret exists
  await getOrCreateSessionSecret();

  // 5. Sync / Seed Admin User strictly from explicit non-placeholder env vars
  const rawEnvUser = getEnvVar('ADMIN_USERNAME').trim();
  const rawEnvHash = getEnvVar('ADMIN_PASSWORD_HASH').trim();
  const rawEnvPassword = getEnvVar('ADMIN_PASSWORD').trim();
  const envUser = rawEnvUser && !isPlaceholderEnv(rawEnvUser) ? rawEnvUser : '';
  const envHash = rawEnvHash && !isPlaceholderEnv(rawEnvHash) ? rawEnvHash : '';
  const envPassword = rawEnvPassword && !isPlaceholderEnv(rawEnvPassword) ? rawEnvPassword : '';

  if (envUser && (envHash || envPassword)) {
    const allUsers = await db.select().from(users);
    if (allUsers.length === 0) {
      const initialHash = envHash || hashPasswordScrypt(envPassword);
      await db.insert(users).values({
        username: envUser,
        passwordHash: initialHash,
        role: 'admin',
        tokenVersion: 1,
        createdAt: now,
      });
    } else {
      const matching = allUsers.find((u) => u.username === envUser);
      if (matching) {
        if (envHash && matching.passwordHash !== envHash) {
          await db
            .update(users)
            .set({ passwordHash: envHash })
            .where(eq(users.id, matching.id));
        } else if (envPassword && !verifyPasswordScrypt(envPassword, matching.passwordHash)) {
          await db
            .update(users)
            .set({ passwordHash: hashPasswordScrypt(envPassword) })
            .where(eq(users.id, matching.id));
        }
      }
    }
  }

  // 6. One-time content seed
  if (!existingKeys.has(SEED_FLAG_KEY)) {
    const existingCategories = await db.select().from(categories);
    if (existingCategories.length === 0) {
      await db
        .insert(categories)
        .values([
          {
            name: 'اقتصاد',
            nameEn: 'Economics',
            slug: 'اقتصاد',
            description: 'در حال تلاش برای بهتر کردن اقتصاد همه‌مون',
            descriptionEn: 'Working toward smarter personal and everyday economics',
            sortOrder: 1,
          },
          {
            name: 'یادگیری',
            nameEn: 'Learning',
            slug: 'یادگیری',
            description: 'یادداشت‌ها و تجربه‌های عملی درباره هوش مصنوعی، اتوماسیون و سیستم‌ها',
            descriptionEn:
              'Hands-on notes and experiments on AI, automation, and software systems',
            sortOrder: 2,
          },
        ])
        .onConflictDoNothing();
    }

    const existingProjects = await db.select().from(projectsTable);
    if (existingProjects.length === 0) {
      await db.insert(projectsTable).values([
        {
          title: 'وب‌سایت شخصی و وبلاگ ابری',
          titleEn: 'Personal Portfolio & Edge CMS',
          role: 'طراحی و توسعه فول‌استک',
          roleEn: 'Design & Full-Stack Dev',
          period: '۱۴۰۵',
          periodEn: '2026',
          summary:
            'پورتفولیو و وبلاگ دوزبانه با Cloudflare Workers، دیتابیس Turso/libSQL، ذخیره رسانه کلودیناری و پنل مدیریت اختصاصی.',
          summaryEn:
            'Bilingual edge portfolio and block-based blog powered by Cloudflare Workers, Turso libSQL, Cloudinary media, and a custom CMS.',
          stack: JSON.stringify(['React', 'TypeScript', 'Hono', 'Turso']),
          url: '/',
          featured: 1,
          sortOrder: 1,
        },
        {
          title: 'پروژه نمونه وب‌اپلیکیشن',
          titleEn: 'Sample Web Application',
          role: 'وب‌اپلیکیشن',
          roleEn: 'Web Application',
          period: '۱۴۰۵',
          periodEn: '2026',
          summary: 'نمونه کارت پروژه قابل ویرایش یا حذف از پنل مدیریت.',
          summaryEn: 'A sample project card that you can edit or delete from the Admin Portal.',
          stack: JSON.stringify(['TypeScript', 'Tailwind CSS']),
          url: 'https://example.com',
          featured: 1,
          sortOrder: 2,
        },
      ]);
    }

    const existingPosts = await db.select().from(posts);
    const sampleBlocks = createSamplePostBlocks();
    const sampleBlocksEn = createSamplePostBlocksEn();
    if (existingPosts.length === 0) {
      await db
        .insert(posts)
        .values({
          title: 'نوشته نمونه: امکانات کامل وبلاگ و ویرایشگر',
          titleEn: 'Sample Post: Complete Blog & Block Editor Showcase',
          slug: 'نوشته-نمونه-امکانات-وبلاگ',
          excerpt:
            'نمایش عملی تمام قابلیت‌های وبلاگ شامل تصویر، ویدیو، صوت، کارت نکته، دکمه، لینک خارجی، کد، نقل‌قول و متن غنی؛ قابل حذف دائمی از پنل مدیریت.',
          excerptEn:
            'A hands-on showcase of all editor blocks — images, video, audio, callout cards, buttons, link embeds, code blocks, quotes, and rich inline formatting.',
          category: 'یادگیری',
          coverImage: '/poster.webp',
          blocks: JSON.stringify(sampleBlocks),
          blocksEn: JSON.stringify(sampleBlocksEn),
          published: 1,
          readingMinutes: estimateReadingMinutes(sampleBlocks),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }

    await db
      .insert(settings)
      .values({ key: SEED_FLAG_KEY, value: '1', updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: '1', updatedAt: now },
      });
  }

  // 7. One-time safe English backfill for pre-existing seeded items
  if (!existingKeys.has('_bilingual_seed_v1')) {
    const catDefaults: Record<string, { nameEn: string; descriptionEn: string }> = {
      اقتصاد: {
        nameEn: 'Economics',
        descriptionEn: 'Working toward smarter personal and everyday economics',
      },
      یادگیری: {
        nameEn: 'Learning',
        descriptionEn: 'Hands-on notes and experiments on AI, automation, and software systems',
      },
    };
    const allCats = await db.select().from(categories);
    for (const c of allCats) {
      const def = catDefaults[c.name];
      if (def && !c.nameEn.trim()) {
        await db
          .update(categories)
          .set({
            nameEn: def.nameEn,
            descriptionEn: c.descriptionEn.trim() ? c.descriptionEn : def.descriptionEn,
          })
          .where(eq(categories.id, c.id));
      }
    }

    const allProjects = await db.select().from(projectsTable);
    for (const p of allProjects) {
      if (p.title === 'masafig.ai.studio' && !p.titleEn.trim()) {
        await db
          .update(projectsTable)
          .set({
            titleEn: 'masafig.ai.studio',
            roleEn: 'Web Application',
            periodEn: 'AI Studio',
            summaryEn: 'A real-world web application designed and built with AI assistance.',
          })
          .where(eq(projectsTable.id, p.id));
      } else if (p.title === 'وب‌سایت شخصی و وبلاگ' && !p.titleEn.trim()) {
        await db
          .update(projectsTable)
          .set({
            titleEn: 'Personal Portfolio & Serverless Blog',
            roleEn: 'Design & Full-Stack Dev',
            periodEn: '2026',
            summaryEn:
              'Serverless portfolio and block-based blog powered by Turso libSQL, Cloudinary media, and a custom bilingual CMS.',
          })
          .where(eq(projectsTable.id, p.id));
      }
    }

    const [sampleRow] = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, 'نوشته-نمونه-امکانات-وبلاگ'))
      .limit(1);
    if (sampleRow && !sampleRow.titleEn.trim()) {
      await db
        .update(posts)
        .set({
          titleEn: 'Sample Post: Complete Blog & Block Editor Showcase',
          excerptEn:
            'A hands-on showcase of all editor blocks — images, video, audio, callout cards, buttons, link embeds, code blocks, quotes, and rich inline formatting.',
          blocksEn: JSON.stringify(createSamplePostBlocksEn()),
        })
        .where(eq(posts.id, sampleRow.id));
    }

    await db
      .insert(settings)
      .values({ key: '_bilingual_seed_v1', value: '1', updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: '1', updatedAt: now },
      });
  }
}

export function ensureDbInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = runDatabaseInit().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// ==================== SETTINGS ====================
export async function getSettings(): Promise<SiteSettings> {
  await ensureDbInitialized();
  const rows = await getDb().select().from(settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith('_')) continue;
    map[row.key] = row.value;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...map,
  };
}

export async function updateSettings(partial: Partial<SiteSettings>): Promise<SiteSettings> {
  await ensureDbInitialized();
  const client = getLibsqlClient();
  const now = new Date().toISOString();
  const allowedKeys = Object.keys(DEFAULT_SETTINGS) as Array<keyof SiteSettings>;
  const statements: Array<{ sql: string; args: Array<string> }> = [];
  for (const key of allowedKeys) {
    if (typeof partial[key] === 'string') {
      statements.push({
        sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        args: [key, partial[key] as string, now],
      });
    }
  }
  if (statements.length > 0) {
    await client.batch(statements, 'write');
  }
  return getSettings();
}

// ==================== AI PROVIDER CONFIG (ADMIN-ONLY, ENCRYPTED AT REST) ====================
const AI_PROVIDER_KEY = '_ai_provider';
const AI_MODEL_KEY = '_ai_model';
const AI_BASE_URL_KEY = '_ai_base_url';
const AI_API_KEY_ENC = '_ai_api_key_enc';

export interface ResolvedAiConfig {
  provider: AiProviderType;
  model: string;
  baseUrl: string;
  customApiKey: string;
  envGeminiKey: string;
  envOpenAiKey: string;
}

export async function getAiConfigResolved(): Promise<ResolvedAiConfig> {
  await ensureDbInitialized();
  const [rows, secret] = await Promise.all([
    getDb()
      .select()
      .from(settings)
      .where(
        inArray(settings.key, [
          AI_PROVIDER_KEY,
          AI_MODEL_KEY,
          AI_BASE_URL_KEY,
          AI_API_KEY_ENC,
        ]),
      ),
    getOrCreateSessionSecret(),
  ]);

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  const rawProvider = map.get(AI_PROVIDER_KEY) ?? '';
  const provider: AiProviderType =
    rawProvider === 'openai_compatible' ? 'openai_compatible' : 'gemini';
  // Security & public-readiness: never pre-bind a default model or key.
  const model = (map.get(AI_MODEL_KEY) ?? '').trim();
  const baseUrl = (map.get(AI_BASE_URL_KEY) ?? '').trim();
  const encKey = map.get(AI_API_KEY_ENC) ?? '';
  const customApiKey = encKey ? decryptSecret(encKey, secret) : '';

  return {
    provider,
    model,
    baseUrl,
    customApiKey,
    envGeminiKey: '',
    envOpenAiKey: '',
  };
}

export async function getAiConfigPublic(): Promise<AiConfigPublic> {
  const resolved = await getAiConfigResolved();
  const hint =
    resolved.customApiKey.length >= 6
      ? `••••${resolved.customApiKey.slice(-4)}`
      : resolved.customApiKey
        ? '••••'
        : '';

  return {
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    hasCustomApiKey: Boolean(resolved.customApiKey),
    keyHint: hint,
    envGeminiAvailable: false,
    envOpenAiAvailable: false,
  };
}

export async function updateAiConfig(input: {
  provider?: AiProviderType;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  clearCustomApiKey?: boolean;
}): Promise<AiConfigPublic> {
  await ensureDbInitialized();
  const client = getLibsqlClient();
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; args: Array<string> }> = [];
  const pushUpsert = (key: string, value: string) => {
    statements.push({
      sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      args: [key, value, now],
    });
  };

  if (input.provider === 'gemini' || input.provider === 'openai_compatible') {
    pushUpsert(AI_PROVIDER_KEY, input.provider);
  }
  if (typeof input.model === 'string') {
    pushUpsert(AI_MODEL_KEY, input.model.trim());
  }
  if (typeof input.baseUrl === 'string') {
    pushUpsert(AI_BASE_URL_KEY, input.baseUrl.trim());
  }
  if (input.clearCustomApiKey) {
    pushUpsert(AI_API_KEY_ENC, '');
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    const secret = await getOrCreateSessionSecret();
    const encrypted = encryptSecret(input.apiKey.trim(), secret);
    pushUpsert(AI_API_KEY_ENC, encrypted);
  }

  if (statements.length > 0) {
    await client.batch(statements, 'write');
  }
  return getAiConfigPublic();
}

export function parseSocialLinks(jsonStr: string): SocialPlatformLink[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is SocialPlatformLink =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.label === 'string' &&
          typeof item.url === 'string',
      );
    }
  } catch {
    // ignore
  }
  return DEFAULT_SOCIAL_LINKS;
}

const VALID_VCARD_TYPES = new Set<VCardExtraFieldType>(['tel', 'email', 'url', 'address', 'note']);

export function parseVCardExtraFields(jsonStr: string): VCardExtraField[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item): item is VCardExtraField =>
            Boolean(item) &&
            typeof item.id === 'string' &&
            typeof item.type === 'string' &&
            VALID_VCARD_TYPES.has(item.type as VCardExtraFieldType) &&
            typeof item.value === 'string' &&
            item.value.trim().length > 0,
        )
        .map((item) => ({
          id: item.id,
          type: item.type,
          label: typeof item.label === 'string' ? item.label.trim() : '',
          value: item.value.trim(),
        }));
    }
  } catch {
    // ignore
  }
  return [];
}

// ==================== CATEGORIES ====================
export async function listCategories(): Promise<CategoryItem[]> {
  await ensureDbInitialized();
  return getDb()
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}

export async function upsertCategory(input: {
  id?: number;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  sortOrder?: number;
}): Promise<CategoryItem> {
  await ensureDbInitialized();
  const db = getDb();
  const cleanName = input.name.trim();
  const cleanNameEn = (input.nameEn ?? '').trim();
  const cleanDesc = input.description.trim();
  const cleanDescEn = (input.descriptionEn ?? '').trim();
  const slug = slugifyPersian(cleanName);

  if (input.id) {
    const [previous] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, input.id))
      .limit(1);

    const [updated] = await db
      .update(categories)
      .set({
        name: cleanName,
        nameEn: cleanNameEn,
        slug,
        description: cleanDesc,
        descriptionEn: cleanDescEn,
        sortOrder: input.sortOrder ?? previous?.sortOrder ?? 0,
      })
      .where(eq(categories.id, input.id))
      .returning();

    if (previous && previous.name !== cleanName) {
      await db
        .update(posts)
        .set({ category: cleanName })
        .where(eq(posts.category, previous.name));
    }

    return updated;
  }

  const existingCats = await listCategories();
  const nextOrder = input.sortOrder ?? existingCats.length + 1;
  const [inserted] = await db
    .insert(categories)
    .values({
      name: cleanName,
      nameEn: cleanNameEn,
      slug,
      description: cleanDesc,
      descriptionEn: cleanDescEn,
      sortOrder: nextOrder,
    })
    .returning();

  return inserted;
}

export async function reorderCategories(orderedIds: number[]): Promise<CategoryItem[]> {
  await ensureDbInitialized();
  const statements = orderedIds
    .map((id, idx) =>
      Number.isInteger(id) && id > 0
        ? { sql: 'UPDATE categories SET sort_order = ? WHERE id = ?', args: [idx + 1, id] }
        : null,
    )
    .filter((s): s is { sql: string; args: number[] } => Boolean(s));
  if (statements.length > 0) {
    await getLibsqlClient().batch(statements, 'write');
  }
  return listCategories();
}

export async function deleteCategory(id: number): Promise<boolean> {
  await ensureDbInitialized();
  const deleted = await getDb()
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  return deleted.length > 0;
}

// ==================== POSTS ====================
function mapPostRow(row: typeof posts.$inferSelect): BlogPost {
  const blocks = parseBlocksJson(row.blocks);
  const blocksEn = row.blocksEn && row.blocksEn !== '[]' ? parseBlocksJson(row.blocksEn) : [];
  return {
    id: row.id,
    title: row.title,
    titleEn: row.titleEn || '',
    slug: row.slug,
    excerpt: row.excerpt,
    excerptEn: row.excerptEn || '',
    category: row.category,
    coverImage: row.coverImage,
    blocks,
    blocksEn,
    published: Boolean(row.published),
    readingMinutes: row.readingMinutes || estimateReadingMinutes(blocks),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listPosts(includeDrafts = false): Promise<BlogPost[]> {
  await ensureDbInitialized();
  const db = getDb();
  const rows = includeDrafts
    ? await db.select().from(posts).orderBy(desc(posts.createdAt))
    : await db
        .select()
        .from(posts)
        .where(eq(posts.published, 1))
        .orderBy(desc(posts.createdAt));
  return rows.map(mapPostRow);
}

export async function getPostBySlug(slug: string, includeDrafts = false): Promise<BlogPost | null> {
  await ensureDbInitialized();
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  const [row] = await getDb().select().from(posts).where(eq(posts.slug, decoded)).limit(1);
  if (!row) return null;
  if (!includeDrafts && !row.published) return null;
  return mapPostRow(row);
}

export async function getPostById(id: number): Promise<BlogPost | null> {
  await ensureDbInitialized();
  const [row] = await getDb().select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ? mapPostRow(row) : null;
}

export async function upsertPost(input: {
  id?: number;
  title: string;
  titleEn?: string;
  slug?: string;
  excerpt: string;
  excerptEn?: string;
  category: string;
  coverImage: string;
  blocks: ContentBlock[];
  blocksEn?: ContentBlock[];
  published: boolean;
}): Promise<BlogPost> {
  await ensureDbInitialized();
  const db = getDb();
  const now = new Date().toISOString();
  const baseSlug = slugifyPersian(input.slug?.trim() || input.title);
  const readingMinutes = estimateReadingMinutes(input.blocks);
  const titleEn = (input.titleEn ?? '').trim();
  const excerptEn = (input.excerptEn ?? '').trim();
  const blocksEnJson = JSON.stringify(Array.isArray(input.blocksEn) ? input.blocksEn : []);

  if (input.id) {
    let candidateSlug = baseSlug;
    let suffix = 2;
    while (true) {
      const [conflict] = await db
        .select()
        .from(posts)
        .where(eq(posts.slug, candidateSlug))
        .limit(1);
      if (!conflict || conflict.id === input.id) break;
      candidateSlug = `${baseSlug}-${suffix++}`;
    }

    const [updated] = await db
      .update(posts)
      .set({
        title: input.title,
        titleEn,
        slug: candidateSlug,
        excerpt: input.excerpt,
        excerptEn,
        category: input.category || 'یادگیری',
        coverImage: input.coverImage,
        blocks: JSON.stringify(input.blocks),
        blocksEn: blocksEnJson,
        published: input.published ? 1 : 0,
        readingMinutes,
        updatedAt: now,
      })
      .where(eq(posts.id, input.id))
      .returning();

    return mapPostRow(updated);
  }

  let candidateSlug = baseSlug;
  let suffix = 2;
  while (true) {
    const [conflict] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.slug, candidateSlug))
      .limit(1);
    if (!conflict) break;
    candidateSlug = `${baseSlug}-${suffix++}`;
  }

  const [inserted] = await db
    .insert(posts)
    .values({
      title: input.title,
      titleEn,
      slug: candidateSlug,
      excerpt: input.excerpt,
      excerptEn,
      category: input.category || 'یادگیری',
      coverImage: input.coverImage,
      blocks: JSON.stringify(input.blocks),
      blocksEn: blocksEnJson,
      published: input.published ? 1 : 0,
      readingMinutes,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapPostRow(inserted);
}

export async function deletePost(id: number): Promise<boolean> {
  await ensureDbInitialized();
  const deleted = await getDb()
    .delete(posts)
    .where(eq(posts.id, id))
    .returning({ id: posts.id });
  return deleted.length > 0;
}

// ==================== PROJECTS ====================
function mapProjectRow(row: typeof projectsTable.$inferSelect): ProjectItem {
  let stack: string[] = [];
  try {
    const parsed = JSON.parse(row.stack);
    if (Array.isArray(parsed)) {
      stack = parsed.filter((s): s is string => typeof s === 'string');
    }
  } catch {
    stack = [];
  }
  return {
    id: row.id,
    title: row.title,
    titleEn: row.titleEn || '',
    role: row.role,
    roleEn: row.roleEn || '',
    period: row.period,
    periodEn: row.periodEn || '',
    summary: row.summary,
    summaryEn: row.summaryEn || '',
    stack,
    url: row.url,
    featured: Boolean(row.featured),
    sortOrder: row.sortOrder,
  };
}

export async function listProjects(): Promise<ProjectItem[]> {
  await ensureDbInitialized();
  const rows = await getDb()
    .select()
    .from(projectsTable)
    .orderBy(asc(projectsTable.sortOrder), desc(projectsTable.id));
  return rows.map(mapProjectRow);
}

export async function upsertProject(
  input: Omit<ProjectItem, 'id' | 'titleEn' | 'roleEn' | 'periodEn' | 'summaryEn'> & {
    id?: number;
    titleEn?: string;
    roleEn?: string;
    periodEn?: string;
    summaryEn?: string;
  },
): Promise<ProjectItem> {
  await ensureDbInitialized();
  const db = getDb();
  const all = await listProjects();
  const existing = input.id ? all.find((p) => p.id === input.id) : undefined;
  const payload = {
    title: input.title,
    titleEn: (input.titleEn ?? '').trim(),
    role: input.role,
    roleEn: (input.roleEn ?? '').trim(),
    period: input.period,
    periodEn: (input.periodEn ?? '').trim(),
    summary: input.summary,
    summaryEn: (input.summaryEn ?? '').trim(),
    stack: JSON.stringify(input.stack),
    url: input.url,
    featured: input.featured ? 1 : 0,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? all.length + 1,
  };

  if (input.id) {
    const [updated] = await db
      .update(projectsTable)
      .set(payload)
      .where(eq(projectsTable.id, input.id))
      .returning();
    return mapProjectRow(updated);
  }

  const [inserted] = await db.insert(projectsTable).values(payload).returning();
  return mapProjectRow(inserted);
}

export async function reorderProjects(orderedIds: number[]): Promise<ProjectItem[]> {
  await ensureDbInitialized();
  const statements = orderedIds
    .map((id, idx) =>
      Number.isInteger(id) && id > 0
        ? { sql: 'UPDATE projects SET sort_order = ? WHERE id = ?', args: [idx + 1, id] }
        : null,
    )
    .filter((s): s is { sql: string; args: number[] } => Boolean(s));
  if (statements.length > 0) {
    await getLibsqlClient().batch(statements, 'write');
  }
  return listProjects();
}

export async function deleteProject(id: number): Promise<boolean> {
  await ensureDbInitialized();
  const deleted = await getDb()
    .delete(projectsTable)
    .where(eq(projectsTable.id, id))
    .returning({ id: projectsTable.id });
  return deleted.length > 0;
}

// ==================== MEDIA ASSETS (CLOUDINARY METADATA IN TURSO) ====================
export interface StoredMediaAsset extends UploadedMediaItem {
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
}

export async function recordMediaAsset(input: {
  publicId: string;
  filename: string;
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  resourceType: 'image' | 'video' | 'raw';
  sizeBytes: number;
}): Promise<StoredMediaAsset> {
  await ensureDbInitialized();
  const now = new Date().toISOString();
  await getDb()
    .insert(mediaAssets)
    .values({
      publicId: input.publicId,
      filename: input.filename,
      url: input.url,
      kind: input.kind,
      resourceType: input.resourceType,
      sizeBytes: input.sizeBytes,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: mediaAssets.publicId,
      set: {
        filename: input.filename,
        url: input.url,
        kind: input.kind,
        resourceType: input.resourceType,
        sizeBytes: input.sizeBytes,
      },
    });

  return {
    publicId: input.publicId,
    filename: input.filename,
    url: input.url,
    kind: input.kind,
    resourceType: input.resourceType,
    sizeBytes: input.sizeBytes,
  };
}

export async function listMediaAssets(): Promise<UploadedMediaItem[]> {
  await ensureDbInitialized();
  const rows = await getDb()
    .select()
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id));
  return rows.map((row) => ({
    filename: row.publicId,
    url: row.url,
    kind:
      row.kind === 'video' || row.kind === 'audio' || row.kind === 'file' ? row.kind : 'image',
    sizeBytes: row.sizeBytes,
  }));
}

export async function findMediaAsset(
  key: string,
): Promise<{ publicId: string; resourceType: 'image' | 'video' | 'raw' } | null> {
  await ensureDbInitialized();
  const [row] = await getDb()
    .select()
    .from(mediaAssets)
    .where(or(eq(mediaAssets.publicId, key), eq(mediaAssets.filename, key)))
    .limit(1);
  if (!row) return null;
  const resourceType =
    row.resourceType === 'video' || row.resourceType === 'raw' ? row.resourceType : 'image';
  return { publicId: row.publicId, resourceType };
}

export async function deleteMediaAssetRecord(key: string): Promise<boolean> {
  await ensureDbInitialized();
  const deleted = await getDb()
    .delete(mediaAssets)
    .where(or(eq(mediaAssets.publicId, key), eq(mediaAssets.filename, key)))
    .returning({ id: mediaAssets.id });
  return deleted.length > 0;
}

// ==================== MESSAGES ====================
export async function createMessage(input: {
  name: string;
  contact: string;
  subject: string;
  message: string;
}): Promise<ContactMessage> {
  await ensureDbInitialized();
  const now = new Date().toISOString();
  const [row] = await getDb()
    .insert(messages)
    .values({
      name: input.name,
      contact: input.contact,
      subject: input.subject,
      message: input.message,
      read: 0,
      createdAt: now,
    })
    .returning();

  return {
    ...row,
    read: Boolean(row.read),
  };
}

export async function listMessages(): Promise<ContactMessage[]> {
  await ensureDbInitialized();
  const rows = await getDb().select().from(messages).orderBy(desc(messages.createdAt));
  return rows.map((m) => ({ ...m, read: Boolean(m.read) }));
}

export async function markMessageRead(id: number, read: boolean): Promise<boolean> {
  await ensureDbInitialized();
  const updated = await getDb()
    .update(messages)
    .set({ read: read ? 1 : 0 })
    .where(eq(messages.id, id))
    .returning({ id: messages.id });
  return updated.length > 0;
}

export async function deleteMessage(id: number): Promise<boolean> {
  await ensureDbInitialized();
  const deleted = await getDb()
    .delete(messages)
    .where(eq(messages.id, id))
    .returning({ id: messages.id });
  return deleted.length > 0;
}

// ==================== ADMIN AUTH & SECURITY ====================
export async function authenticateAdminUser(
  username: string,
  password: string,
): Promise<{
  id: number;
  username: string;
  role: string;
  tokenVersion: number;
} | null> {
  await ensureDbInitialized();
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.username, username.trim()))
    .limit(1);
  if (!row) return null;
  if (!verifyPasswordScrypt(password, row.passwordHash)) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tokenVersion: row.tokenVersion || 1,
  };
}

export async function getAdminUserByUsername(username: string): Promise<{
  id: number;
  username: string;
  role: string;
  tokenVersion: number;
} | null> {
  await ensureDbInitialized();
  const [row] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tokenVersion: row.tokenVersion || 1,
  };
}

export async function changeAdminCredentials(input: {
  currentUsername: string;
  currentPassword: string;
  newUsername?: string;
  newPassword?: string;
}): Promise<
  | { ok: true; user: { id: number; username: string; role: string; tokenVersion: number } }
  | { ok: false; error: string }
> {
  await ensureDbInitialized();
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.username, input.currentUsername))
    .limit(1);
  if (!row || !verifyPasswordScrypt(input.currentPassword, row.passwordHash)) {
    return { ok: false, error: 'رمز عبور فعلی اشتباه است.' };
  }

  const nextUsername = input.newUsername?.trim() || row.username;
  if (nextUsername.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(nextUsername)) {
    return { ok: false, error: 'نام کاربری باید حداقل ۳ کاراکتر انگلیسی، عدد یا نقطه باشد.' };
  }

  if (nextUsername !== row.username) {
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, nextUsername))
      .limit(1);
    if (conflict) {
      return { ok: false, error: 'این نام کاربری قبلاً استفاده شده است.' };
    }
  }

  const nextHash = input.newPassword ? hashPasswordScrypt(input.newPassword) : row.passwordHash;
  const nextVersion = (row.tokenVersion || 1) + 1;

  await db
    .update(users)
    .set({
      username: nextUsername,
      passwordHash: nextHash,
      tokenVersion: nextVersion,
    })
    .where(eq(users.id, row.id));

  return {
    ok: true,
    user: {
      id: row.id,
      username: nextUsername,
      role: row.role,
      tokenVersion: nextVersion,
    },
  };
}

export async function hasAnyAdminUser(): Promise<boolean> {
  await ensureDbInitialized();
  const [row] = await getDb().select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}

export async function setupFirstAdminUser(input: {
  username: string;
  password: string;
}): Promise<
  | { ok: true; user: { id: number; username: string; role: string; tokenVersion: number } }
  | { ok: false; error: string }
> {
  await ensureDbInitialized();
  const cleanUser = input.username.trim();
  if (cleanUser.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(cleanUser)) {
    return { ok: false, error: 'نام کاربری باید حداقل ۳ کاراکتر انگلیسی، عدد یا نقطه باشد.' };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) {
      return { ok: false as const, error: 'حساب مدیر قبلاً راه‌اندازی شده است.' };
    }
    const now = new Date().toISOString();
    const [inserted] = await tx
      .insert(users)
      .values({
        username: cleanUser,
        passwordHash: hashPasswordScrypt(input.password),
        role: 'admin',
        tokenVersion: 1,
        createdAt: now,
      })
      .returning();
    return {
      ok: true as const,
      user: {
        id: inserted.id,
        username: cleanUser,
        role: 'admin',
        tokenVersion: 1,
      },
    };
  });
}

export async function bumpAdminTokenVersion(username: string): Promise<boolean> {
  await ensureDbInitialized();
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!row) return false;
  await db
    .update(users)
    .set({ tokenVersion: (row.tokenVersion || 1) + 1 })
    .where(eq(users.id, row.id));
  return true;
}

// ==================== SYSTEM & ERROR LOGS ====================
const MAX_SYSTEM_LOGS = 500;

export async function writeSystemLog(input: {
  level?: SystemLogLevel;
  source?: SystemLogSource;
  method?: string;
  path?: string;
  status?: number;
  message: string;
  details?: unknown;
}): Promise<void> {
  try {
    await ensureDbInitialized();
    const now = new Date().toISOString();
    const level = normalizeLogLevel(input.level);
    const source = normalizeLogSource(input.source);
    const method = (input.method || '').toUpperCase().slice(0, 12);
    const reqPath = sanitizeLogText(input.path || '', 300);
    const status =
      typeof input.status === 'number' && Number.isFinite(input.status)
        ? Math.trunc(input.status)
        : 0;
    const message = sanitizeLogText(input.message, 500) || 'Event recorded';
    const details = sanitizeLogText(input.details ?? '', 3000);

    // Insert + prune oldest logs beyond MAX_SYSTEM_LOGS in ONE single batched request
    await getLibsqlClient().batch(
      [
        {
          sql: 'INSERT INTO system_logs (level, source, method, path, status, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [level, source, method, reqPath, status, message, details, now],
        },
        {
          sql: 'DELETE FROM system_logs WHERE id NOT IN (SELECT id FROM system_logs ORDER BY id DESC LIMIT ?)',
          args: [MAX_SYSTEM_LOGS],
        },
      ],
      'write',
    );
  } catch {
    // Logging must never crash a request
  }
}

export async function listSystemLogs(filter?: {
  level?: string;
  source?: string;
  q?: string;
  limit?: number;
}): Promise<SystemLogsResponse> {
  await ensureDbInitialized();
  const rows = await getDb()
    .select()
    .from(systemLogs)
    .orderBy(desc(systemLogs.id))
    .limit(MAX_SYSTEM_LOGS);

  const counts = { total: rows.length, error: 0, warn: 0, info: 0 };
  for (const r of rows) {
    if (r.level === 'error') counts.error += 1;
    else if (r.level === 'warn') counts.warn += 1;
    else counts.info += 1;
  }

  const levelFilter = filter?.level && filter.level !== 'all' ? filter.level : '';
  const sourceFilter = filter?.source && filter.source !== 'all' ? filter.source : '';
  const query = (filter?.q || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(filter?.limit) || 150, 1), MAX_SYSTEM_LOGS);

  const filtered: SystemLogEntry[] = rows
    .filter((r) => {
      if (levelFilter && r.level !== levelFilter) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (query) {
        const hay = `${r.message} ${r.details} ${r.path} ${r.source} ${r.status}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      level: normalizeLogLevel(r.level),
      source: normalizeLogSource(r.source),
      method: r.method,
      path: r.path,
      status: r.status,
      message: r.message,
      details: r.details,
      createdAt: r.createdAt,
    }));

  return { logs: filtered, counts };
}

export async function clearSystemLogs(): Promise<boolean> {
  await ensureDbInitialized();
  await getDb().delete(systemLogs);
  return true;
}

// ==================== FULL BACKUP EXPORT / IMPORT ====================
export async function exportFullBackup(): Promise<SiteBackupPayload> {
  await ensureDbInitialized();
  const [siteSettings, aiCfg, siteCategories, sitePosts, siteProjects, siteMessages, rawMedia] =
    await Promise.all([
      getSettings(),
      getAiConfigPublic(),
      listCategories(),
      listPosts(true),
      listProjects(),
      listMessages(),
      getDb()
        .select()
        .from(mediaAssets)
        .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id)),
    ]);

  return createBackupEnvelope({
    settings: siteSettings,
    aiConfig: {
      provider: aiCfg.provider,
      model: aiCfg.model,
      baseUrl: aiCfg.baseUrl,
    },
    categories: siteCategories,
    posts: sitePosts,
    projects: siteProjects,
    messages: siteMessages,
    mediaAssets: rawMedia.map((m) => ({
      publicId: m.publicId,
      filename: m.filename,
      url: m.url,
      kind: m.kind === 'video' || m.kind === 'audio' || m.kind === 'file' ? m.kind : 'image',
      resourceType:
        m.resourceType === 'video' || m.resourceType === 'raw' ? m.resourceType : 'image',
      sizeBytes: m.sizeBytes,
      createdAt: m.createdAt,
    })),
  });
}

export async function importFullBackup(
  rawPayload: unknown,
  mode: 'replace' | 'merge' = 'replace',
): Promise<{
  restored: {
    settings: number;
    categories: number;
    posts: number;
    projects: number;
    messages: number;
    mediaAssets: number;
  };
}> {
  await ensureDbInitialized();
  const allowedSettingKeys = new Set(Object.keys(DEFAULT_SETTINGS));
  const normalized = validateAndNormalizeBackupPayload(rawPayload, allowedSettingKeys);
  const now = new Date().toISOString();

  const statements: Array<{ sql: string; args?: (string | number | null)[] }> = [];

  if (mode === 'replace') {
    statements.push({ sql: 'DELETE FROM categories' });
    statements.push({ sql: 'DELETE FROM posts' });
    statements.push({ sql: 'DELETE FROM projects' });
    statements.push({ sql: 'DELETE FROM messages' });
    statements.push({ sql: 'DELETE FROM media_assets' });
  }

  // Settings (strict allowlisted keys only; internal secrets untouched)
  const settingEntries = Object.entries(normalized.settings);
  for (const [key, value] of settingEntries) {
    if (typeof value === 'string') {
      statements.push({
        sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        args: [key, value, now],
      });
    }
  }

  // Non-secret AI config metadata (never touches encrypted API key)
  if (normalized.aiConfig) {
    statements.push({
      sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      args: [AI_PROVIDER_KEY, normalized.aiConfig.provider, now],
    });
    statements.push({
      sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      args: [AI_MODEL_KEY, normalized.aiConfig.model, now],
    });
    statements.push({
      sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      args: [AI_BASE_URL_KEY, normalized.aiConfig.baseUrl, now],
    });
  }

  // Categories
  for (const cat of normalized.categories) {
    statements.push({
      sql: 'INSERT INTO categories (name, name_en, slug, description, description_en, sort_order) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name, name_en = excluded.name_en, description = excluded.description, description_en = excluded.description_en, sort_order = excluded.sort_order',
      args: [cat.name, cat.nameEn, cat.slug, cat.description, cat.descriptionEn, cat.sortOrder],
    });
  }

  // Posts
  for (const post of normalized.posts) {
    statements.push({
      sql: 'INSERT INTO posts (title, title_en, slug, excerpt, excerpt_en, category, cover_image, blocks, blocks_en, published, reading_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, title_en = excluded.title_en, excerpt = excluded.excerpt, excerpt_en = excluded.excerpt_en, category = excluded.category, cover_image = excluded.cover_image, blocks = excluded.blocks, blocks_en = excluded.blocks_en, published = excluded.published, reading_minutes = excluded.reading_minutes, updated_at = excluded.updated_at',
      args: [
        post.title,
        post.titleEn,
        post.slug,
        post.excerpt,
        post.excerptEn,
        post.category,
        post.coverImage,
        JSON.stringify(post.blocks),
        JSON.stringify(post.blocksEn),
        post.published ? 1 : 0,
        post.readingMinutes,
        post.createdAt,
        post.updatedAt,
      ],
    });
  }

  // Projects
  for (const proj of normalized.projects) {
    statements.push({
      sql: 'INSERT INTO projects (title, title_en, role, role_en, period, period_en, summary, summary_en, stack, url, featured, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        proj.title,
        proj.titleEn,
        proj.role,
        proj.roleEn,
        proj.period,
        proj.periodEn,
        proj.summary,
        proj.summaryEn,
        JSON.stringify(proj.stack),
        proj.url,
        proj.featured ? 1 : 0,
        proj.sortOrder,
      ],
    });
  }

  // Messages
  for (const msg of normalized.messages) {
    statements.push({
      sql: 'INSERT INTO messages (name, contact, subject, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [msg.name, msg.contact, msg.subject, msg.message, msg.read ? 1 : 0, msg.createdAt],
    });
  }

  // Media Assets
  for (const media of normalized.mediaAssets) {
    statements.push({
      sql: 'INSERT INTO media_assets (public_id, filename, url, kind, resource_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(public_id) DO UPDATE SET filename = excluded.filename, url = excluded.url, kind = excluded.kind, resource_type = excluded.resource_type, size_bytes = excluded.size_bytes',
      args: [
        media.publicId,
        media.filename,
        media.url,
        media.kind,
        media.resourceType,
        media.sizeBytes,
        media.createdAt,
      ],
    });
  }

  // Mark seed flag so initial sample data does not re-seed over intentionally empty restored tables
  statements.push({
    sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    args: [SEED_FLAG_KEY, '1', now],
  });

  if (statements.length > 0) {
    // Execute in ONE atomic batch (1 HTTP subrequest on Cloudflare Workers!)
    await getLibsqlClient().batch(statements, 'write');
  }

  return {
    restored: {
      settings: settingEntries.length,
      categories: normalized.categories.length,
      posts: normalized.posts.length,
      projects: normalized.projects.length,
      messages: normalized.messages.length,
      mediaAssets: normalized.mediaAssets.length,
    },
  };
}

