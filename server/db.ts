import { createClient, type Client } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql/web';
import { asc, desc, eq, or } from 'drizzle-orm';

type LibSQLDatabase = ReturnType<typeof drizzle>;
import {
  categories,
  mediaAssets,
  messages,
  posts,
  projectsTable,
  settings,
  users,
} from './schema.ts';
import {
  decryptSecret,
  encryptSecret,
  hashPasswordScrypt,
  verifyPasswordScrypt,
} from './auth.ts';
import { getEnvVar, setActiveRuntimeEnv, type RuntimeEnv } from './env.ts';
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
  SiteSettings,
  SocialPlatformLink,
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
];

const ALLOWED_MIGRATION_TABLES = new Set([
  'users',
  'categories',
  'posts',
  'projects',
  'media_assets',
]);

async function ensureColumn(
  client: Client,
  table: string,
  col: string,
  definition: string,
): Promise<void> {
  if (!ALLOWED_MIGRATION_TABLES.has(table)) return;
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((r) => String(r.name) === col);
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
  }
}

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
    id: 'telegram',
    label: 'تلگرام',
    labelEn: 'Telegram',
    handle: '@mbnd1224',
    url: 'https://t.me/mbnd1224',
    iconKey: 'telegram',
    enabled: true,
  },
  {
    id: 'email',
    label: 'ایمیل',
    labelEn: 'Email',
    handle: 'mbnd1224@gmail.com',
    url: 'mailto:mbnd1224@gmail.com',
    iconKey: 'email',
    enabled: true,
  },
  {
    id: 'bale',
    label: 'بله',
    labelEn: 'Bale',
    handle: '@mbnd1224',
    url: 'https://ble.ir/mbnd1224',
    iconKey: 'bale',
    enabled: true,
  },
  {
    id: 'github',
    label: 'گیت‌هاب',
    labelEn: 'GitHub',
    handle: 'mbndCoder',
    url: 'https://github.com/mbndCoder',
    iconKey: 'github',
    enabled: true,
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
  {
    id: 'linkedin',
    label: 'لینکدین',
    labelEn: 'LinkedIn',
    handle: 'mbnd',
    url: 'https://linkedin.com/in/mbnd',
    iconKey: 'linkedin',
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
  siteTitle: 'محمدباقر نوری (Mohammad Bagher Nouri) | طراحی سایت، ساخت اپ و اتوماسیون هوش مصنوعی — mbnd.ir',
  siteDescription:
    'وب‌سایت رسمی محمدباقر نوری (Mohammad Bagher Nouri / Noori — mbnd.ir): طراحی سایت و ساخت اپلیکیشن با هوش مصنوعی، استقرار ایجنت‌های هوش مصنوعی و اتوماسیون، تعمیر و بهینه‌سازی نرم‌افزاری سیستم‌ها.',
  brandName: 'Mohammad Bagher',
  logoImage: '/logo.webp',
  faviconImage: '/favicon.png',

  heroVideoEnabled: 'true',
  heroVideoDesktop: '/hero-loop.mp4',
  heroVideoMobile: '/hero-loop-mobile.mp4',
  heroPosterDesktop: '/poster.webp',
  heroPosterMobile: '/poster-mobile.webp',

  heroTitle: 'سلام! من محمدباقر هستم.',
  heroSubtitle:
    'اینجا از خودم و چیزایی که یاد می‌گیرم می‌نویسم. طراحی اپ و سایت با هوش مصنوعی، استقرار ایجنت‌ها و اتوماسیون، و تعمیر و بهینه‌سازی نرم‌افزاری سیستم‌ها.',
  blogSectionTitle: 'نوشته‌ها و تجربه‌ها',
  blogPageTitle: 'وبلاگ',
  blogPageSubtitle:
    'یادداشت‌ها و تجربه‌های من درباره هوش مصنوعی، اتوماسیون، اقتصاد و بهینه‌سازی سیستم‌ها.',
  projectsSectionTitle: 'پروژه‌ها',
  projectsPageSubtitle: 'مجموعه‌ای از ابزارها، وب‌اپلیکیشن‌ها و تجربه‌های عملی ساخته‌شده.',
  aboutTitle: 'درباره من و ارتباط',
  aboutBio:
    'خوش اومدی! من محمدباقر هستم و علاقه‌مندم چیزهای جدید رو با آزمون و خطا یاد بگیرم؛ از طراحی اپ و سایت با هوش مصنوعی و ساخت ایجنت‌ها و اتوماسیون گرفته تا تعمیر و بهینه‌سازی نرم‌افزاری سیستم‌ها. این فضا یه دفترچه یادداشت شخصی برای به اشتراک گذاشتن همین تجربه‌هاست. اگه حرفی، ایده‌ای یا سوالی داشتی، خوشحال میشم بهم پیام بدی.',
  aboutFocusHeading: 'حوزه‌های فعالیت',
  aboutFocusText: 'طراحی اپ و سایت با هوش مصنوعی · اتوماسیون و تعمیر نرم‌افزاری سیستم‌ها',
  aboutConnectHeading: 'راه‌های ارتباطی مستقیم',
  contactFormHeading: 'ارسال پیام مستقیم',
  contactSuccessMessage: 'پیامت با موفقیت ثبت شد؛ ممنون از ارتباطت!',
  vcardButtonLabel: 'افزودن به مخاطبین',
  footerText: '© ۱۴۰۵ Mohammad Bagher',

  heroTitleEn: "Hi, I'm Mohammad Bagher.",
  heroSubtitleEn:
    'I share what I build and learn along the way — from AI-assisted apps and websites to agent automation and software troubleshooting.',
  blogSectionTitleEn: 'Notes & Writing',
  blogPageTitleEn: 'Blog',
  blogPageSubtitleEn:
    'Field notes and hands-on experiments covering AI tools, automation workflows, economics, and system optimization.',
  projectsSectionTitleEn: 'Projects',
  projectsPageSubtitleEn: 'Selected apps, tools, and practical experiments I have built.',
  aboutTitleEn: 'About & Contact',
  aboutBioEn:
    "Welcome! I'm Mohammad Bagher. I enjoy learning by building — designing apps and websites with AI, deploying practical automation agents, and troubleshooting and optimizing software systems. This site is my personal notebook for sharing what works. Feel free to drop me a message anytime.",
  aboutFocusHeadingEn: 'What I Focus On',
  aboutFocusTextEn: 'AI-Assisted Web & App Design · Agent Automation · Software Troubleshooting',
  aboutConnectHeadingEn: 'Direct Channels',
  contactFormHeadingEn: 'Send a Direct Message',
  contactSuccessMessageEn: 'Message received — thanks for reaching out!',
  vcardButtonLabelEn: 'Save Contact',
  footerTextEn: '© 2026 Mohammad Bagher',

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
  shareSubtitle: 'اگر این مطلب برات مفید بود، می‌توانی با دوستانت به اشتراک بگذاری.',
  shareSubtitleEn: 'Found this helpful? Pass it along to someone who might enjoy it.',
  shareCopyEnabled: 'true',
  shareTelegramEnabled: 'true',
  shareWhatsappEnabled: 'true',
  shareXEnabled: 'true',
  shareNativeEnabled: 'true',

  themeMode: 'dark',
  allowThemeToggle: 'false',
  accentColor: '#FF502B',
  darkBgColor: '#0E0E0E',
  darkSurfaceColor: '#121212',
  darkInkColor: '#FBEFDD',
  lightBgColor: '#FAF7F2',
  lightSurfaceColor: '#FFFFFF',
  lightInkColor: '#181615',
  defaultLanguage: 'fa',
  allowLanguageToggle: 'false',

  email: 'mbnd1224@gmail.com',
  telegramHandle: '@mbnd1224',
  telegramUrl: 'https://t.me/mbnd1224',
  vcardEnabled: 'true',
  vcardFullName: 'محمدباقر نوری',
  vcardOrg: 'Mohammad Bagher',
  vcardTitle: 'طراحی اپ و سایت با هوش مصنوعی · اتوماسیون و تعمیر نرم‌افزاری سیستم‌ها',
  vcardNote: 'تلگرام و بله: @mbnd1224 | گیت‌هاب: github.com/mbndCoder',
  vcardPhone: '',
  vcardWebsite: 'https://mbnd.ir',
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
      text: 'این نوشته یک **نمونه جامع** از تمام قابلیت‌های ویرایشگر وبلاگ است. هر زمان خواستی می‌توانی از داخل پنل مدیریت این نوشته را *ویرایش* یا ==به‌صورت دائمی حذف== کنی. همچنین می‌توانی `کد درون‌خطی` و [لینک مستقیم به گیت‌هاب](https://github.com/mbndCoder) داخل متن بگذاری.',
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
      body: 'با بلوک کارت می‌توانی نکات مهم، چک‌لیست‌ها یا خلاصه مطلب را با **تأکید رنگی** وسط نوشته نمایش بدهی. برای ویدیوهای آنلاین کافی است لینک [آپارات](https://www.aparat.com) یا [یوتیوب](https://www.youtube.com) را داخل بلوک ویدیو قرار دهی.',
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
        'جابه‌جایی ترتیب بلوک‌ها با کشیدن و رها کردن (Drag & Drop)',
        'دستیار هوش مصنوعی داخلی پنل مدیریت برای نگارش، زیباسازی و پر کردن فیلدها',
      ],
    },
    {
      id: 'sample_embed',
      type: 'embed',
      title: 'مخزن پروژه‌ها در GitHub',
      url: 'https://github.com/mbndCoder',
      description: 'کدها، ابزارها و آزمایش‌های منتشرشده توسط محمدباقر نوری.',
    },
    {
      id: 'sample_button',
      type: 'button',
      label: 'ارتباط در پیام‌رسان بله',
      url: 'https://ble.ir/mbnd1224',
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
      code: '# ساخت و اجرای نسخه نهایی روی سرور\nnpm run build && npm run start',
    },
    {
      id: 'sample_quote',
      type: 'quote',
      text: 'بهترین راه یادگیری هر ابزار جدید، ساختن یک پروژه واقعی و حل کردن خطاهای واقعی آن است.',
      author: 'محمدباقر',
    },
  ];
}

function createSamplePostBlocksEn(): ContentBlock[] {
  return [
    {
      id: 'sample_intro',
      type: 'paragraph',
      text: 'This article is a **complete showcase** of every capability built into the block editor. Whenever you want, you can *edit* or ==permanently delete== this sample from the Admin Portal. You can also mix `inline code` and [direct links to GitHub](https://github.com/mbndCoder) seamlessly.',
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
      body: 'Use callout cards to spotlight key takeaways, checklists, or summaries with **accent styling**. For hosted videos, simply paste an [Aparat](https://www.aparat.com) or [YouTube](https://www.youtube.com) link into a video block.',
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
        'Drag-and-drop block reordering directly inside the editor',
        'Optional built-in AI assistant for drafting, polishing, and natural Persian-to-English translation',
      ],
    },
    {
      id: 'sample_embed',
      type: 'embed',
      title: 'Projects Repository on GitHub',
      url: 'https://github.com/mbndCoder',
      description: 'Open-source tools, web apps, and practical experiments by Mohammad Bagher.',
    },
    {
      id: 'sample_button',
      type: 'button',
      label: 'Connect on Bale Messenger',
      url: 'https://ble.ir/mbnd1224',
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
      author: 'Mohammad Bagher',
    },
  ];
}

async function runDatabaseInit(): Promise<void> {
  const client = getLibsqlClient();
  const db = getDb();

  // 1. Create tables if missing
  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }

  // 2. Safe idempotent column migrations for existing databases
  await ensureColumn(client, 'users', 'token_version', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(client, 'categories', 'name_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'categories', 'description_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'posts', 'title_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'posts', 'excerpt_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'posts', 'blocks_en', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(client, 'projects', 'title_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'projects', 'role_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'projects', 'period_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(client, 'projects', 'summary_en', "TEXT NOT NULL DEFAULT ''");

  const now = new Date().toISOString();

  // 3. Seed missing settings keys in a single batch where possible
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
          title: 'masafig.ai.studio',
          titleEn: 'masafig.ai.studio',
          role: 'وب‌اپلیکیشن',
          roleEn: 'Web Application',
          period: 'AI Studio',
          periodEn: 'AI Studio',
          summary: 'نمونه پروژه واقعی طراحی و پیاده‌سازی‌شده با کمک هوش مصنوعی روی AI Studio.',
          summaryEn: 'A real-world web application designed and built with AI assistance.',
          stack: JSON.stringify(['AI Studio', 'Web App']),
          url: 'https://masafig.ai.studio',
          featured: 1,
          sortOrder: 1,
        },
        {
          title: 'وب‌سایت شخصی و وبلاگ',
          titleEn: 'Personal Portfolio & Serverless Blog',
          role: 'طراحی و توسعه',
          roleEn: 'Design & Full-Stack Dev',
          period: '۱۴۰۵',
          periodEn: '2026',
          summary:
            'پورتفولیو و وبلاگ شخصی با دیتابیس libSQL/Turso، ذخیره رسانه کلودیناری و پنل مدیریت سفارشی.',
          summaryEn:
            'Serverless portfolio and block-based blog powered by Turso libSQL, Cloudinary media, and a custom bilingual CMS.',
          stack: JSON.stringify(['TypeScript', 'React', 'Turso']),
          url: '/',
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
  const db = getDb();
  const now = new Date().toISOString();
  const allowedKeys = Object.keys(DEFAULT_SETTINGS) as Array<keyof SiteSettings>;
  for (const key of allowedKeys) {
    if (typeof partial[key] === 'string') {
      await db
        .insert(settings)
        .values({ key, value: partial[key] as string, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: partial[key] as string, updatedAt: now },
        });
    }
  }
  return getSettings();
}

// ==================== AI PROVIDER CONFIG (ADMIN-ONLY, ENCRYPTED AT REST) ====================
const AI_PROVIDER_KEY = '_ai_provider';
const AI_MODEL_KEY = '_ai_model';
const AI_BASE_URL_KEY = '_ai_base_url';
const AI_API_KEY_ENC = '_ai_api_key_enc';

async function getInternalSetting(key: string): Promise<string> {
  await ensureDbInitialized();
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? '';
}

async function setInternalSetting(key: string, value: string): Promise<void> {
  await ensureDbInitialized();
  const now = new Date().toISOString();
  await getDb()
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    });
}

export interface ResolvedAiConfig {
  provider: AiProviderType;
  model: string;
  baseUrl: string;
  customApiKey: string;
  envGeminiKey: string;
  envOpenAiKey: string;
}

const LEGACY_GEMINI_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
]);

export async function getAiConfigResolved(): Promise<ResolvedAiConfig> {
  const [rawProvider, savedModelRaw, baseUrlRaw, encKey, secret] = await Promise.all([
    getInternalSetting(AI_PROVIDER_KEY),
    getInternalSetting(AI_MODEL_KEY),
    getInternalSetting(AI_BASE_URL_KEY),
    getInternalSetting(AI_API_KEY_ENC),
    getOrCreateSessionSecret(),
  ]);

  const provider: AiProviderType =
    rawProvider === 'openai_compatible' ? 'openai_compatible' : 'gemini';
  const defaultModel = provider === 'gemini' ? 'gemini-4-hydrogen' : 'gpt-4.1-mini';
  const savedModel = savedModelRaw.trim();
  const model =
    !savedModel || (provider === 'gemini' && LEGACY_GEMINI_MODELS.has(savedModel))
      ? defaultModel
      : savedModel;
  const baseUrl = baseUrlRaw.trim();
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
  if (input.provider === 'gemini' || input.provider === 'openai_compatible') {
    await setInternalSetting(AI_PROVIDER_KEY, input.provider);
  }
  if (typeof input.model === 'string') {
    await setInternalSetting(AI_MODEL_KEY, input.model.trim());
  }
  if (typeof input.baseUrl === 'string') {
    await setInternalSetting(AI_BASE_URL_KEY, input.baseUrl.trim());
  }
  if (input.clearCustomApiKey) {
    await setInternalSetting(AI_API_KEY_ENC, '');
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    const secret = await getOrCreateSessionSecret();
    const encrypted = encryptSecret(input.apiKey.trim(), secret);
    await setInternalSetting(AI_API_KEY_ENC, encrypted);
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
  const db = getDb();
  await db.transaction(async (tx) => {
    for (let idx = 0; idx < orderedIds.length; idx++) {
      const id = orderedIds[idx];
      if (Number.isInteger(id) && id > 0) {
        await tx
          .update(categories)
          .set({ sortOrder: idx + 1 })
          .where(eq(categories.id, id));
      }
    }
  });
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
  const db = getDb();
  await db.transaction(async (tx) => {
    for (let idx = 0; idx < orderedIds.length; idx++) {
      const id = orderedIds[idx];
      if (Number.isInteger(id) && id > 0) {
        await tx
          .update(projectsTable)
          .set({ sortOrder: idx + 1 })
          .where(eq(projectsTable.id, id));
      }
    }
  });
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
