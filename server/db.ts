import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { asc, desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  categories,
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
  VCardExtraField,
  VCardExtraFieldType,
} from '../src/types/cms.ts';

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/site.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    description_en TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS posts (
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
  );
  CREATE TABLE IF NOT EXISTS projects (
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
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
`);

function ensureColumn(table: string, col: string, definition: string): void {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === col)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition};`);
  }
}

// Safe idempotent migrations for existing SQLite databases
ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('categories', 'name_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('categories', 'description_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('posts', 'title_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('posts', 'excerpt_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('posts', 'blocks_en', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('projects', 'title_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('projects', 'role_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('projects', 'period_en', "TEXT NOT NULL DEFAULT ''");
ensureColumn('projects', 'summary_en', "TEXT NOT NULL DEFAULT ''");

export const db = drizzle(sqlite);

export function isPlaceholderEnv(value?: string): boolean {
  const v = value?.trim() || '';
  if (!v) return true;
  if (
    v.startsWith('CHANGE_ME') ||
    v === 'MY_GEMINI_API_KEY' ||
    v === 'MY_APP_URL' ||
    v === 'MY_OPENAI_API_KEY'
  ) {
    return true;
  }
  return false;
}

export function getOrCreateSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && !isPlaceholderEnv(fromEnv) && fromEnv.length >= 16) {
    return fromEnv;
  }
  const existing = db
    .select()
    .from(settings)
    .where(eq(settings.key, '_internal_session_secret'))
    .get();
  if (existing?.value && existing.value.length >= 32) {
    return existing.value;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key: '_internal_session_secret', value: generated, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: generated, updatedAt: now },
    })
    .run();
  return generated;
}

export const DEFAULT_SOCIAL_LINKS: SocialPlatformLink[] = [
  {
    id: 'telegram',
    label: 'تلگرام',
    handle: '@mbnd1224',
    url: 'https://t.me/mbnd1224',
    iconKey: 'telegram',
    enabled: true,
  },
  {
    id: 'email',
    label: 'ایمیل',
    handle: 'mbnd1224@gmail.com',
    url: 'mailto:mbnd1224@gmail.com',
    iconKey: 'email',
    enabled: true,
  },
  {
    id: 'bale',
    label: 'بله',
    handle: '@mbnd1224',
    url: 'https://ble.ir/mbnd1224',
    iconKey: 'bale',
    enabled: true,
  },
  {
    id: 'github',
    label: 'گیت‌هاب',
    handle: 'mbndCoder',
    url: 'https://github.com/mbndCoder',
    iconKey: 'github',
    enabled: true,
  },
  {
    id: 'youtube',
    label: 'یوتیوب',
    handle: '',
    url: 'https://youtube.com',
    iconKey: 'youtube',
    enabled: false,
  },
  {
    id: 'instagram',
    label: 'اینستاگرام',
    handle: '',
    url: 'https://instagram.com',
    iconKey: 'instagram',
    enabled: false,
  },
  {
    id: 'linkedin',
    label: 'لینکدین',
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
  siteTitle: 'Mohammad Bagher | محمدباقر',
  siteDescription:
    'اینجا از خودم و چیزایی که یاد می‌گیرم می‌نویسم. طراحی اپ و سایت با هوش مصنوعی، استقرار ایجنت‌ها و اتوماسیون، و تعمیر و بهینه‌سازی نرم‌افزاری سیستم‌ها.',
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
      caption: 'نمونه بلوک تصویر با آپلود مستقیم از دستگاه یا لینک خارجی',
    },
    {
      id: 'sample_video',
      type: 'video',
      url: '/hero-loop.mp4',
      caption: 'نمونه بلوک ویدیو (پشتیبانی از آپلود محلی MP4/WebM و همچنین لینک مستقیم یوتیوب و آپارات)',
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
      caption: 'Image block with local device upload or external image URL',
    },
    {
      id: 'sample_video',
      type: 'video',
      url: '/hero-loop.mp4',
      caption: 'Video block supporting local MP4/WebM uploads as well as direct YouTube and Aparat links',
    },
    {
      id: 'sample_audio',
      type: 'audio',
      url: '/sample-audio.mp3',
      title: 'Sample Audio Clip / Short Podcast',
      caption: 'Full support for local audio uploads (MP3, WAV, OGG, M4A) or external audio URLs',
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

function seedInitialData(): void {
  const now = new Date().toISOString();

  // 1. Seed Settings (missing keys only)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }

  // Ensure session secret exists
  getOrCreateSessionSecret();

  // 2. Sync / Seed Admin User strictly from explicit non-placeholder env vars (zero hardcoded credentials)
  const rawEnvUser = process.env.ADMIN_USERNAME?.trim();
  const rawEnvHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const rawEnvPassword = process.env.ADMIN_PASSWORD?.trim();
  const envUser = rawEnvUser && !isPlaceholderEnv(rawEnvUser) ? rawEnvUser : '';
  const envHash = rawEnvHash && !isPlaceholderEnv(rawEnvHash) ? rawEnvHash : '';
  const envPassword = rawEnvPassword && !isPlaceholderEnv(rawEnvPassword) ? rawEnvPassword : '';
  const allUsers = db.select().from(users).all();

  if (allUsers.length === 0 && envUser && (envHash || envPassword)) {
    const initialHash = envHash || hashPasswordScrypt(envPassword);
    db.insert(users)
      .values({
        username: envUser,
        passwordHash: initialHash,
        role: 'admin',
        tokenVersion: 1,
        createdAt: now,
      })
      .run();
  } else if (allUsers.length > 0 && envUser && (envHash || envPassword)) {
    const matching = allUsers.find((u) => u.username === envUser);
    if (matching) {
      if (envHash && matching.passwordHash !== envHash) {
        db.update(users)
          .set({ passwordHash: envHash })
          .where(eq(users.id, matching.id))
          .run();
      } else if (envPassword && !verifyPasswordScrypt(envPassword, matching.passwordHash)) {
        db.update(users)
          .set({ passwordHash: hashPasswordScrypt(envPassword) })
          .where(eq(users.id, matching.id))
          .run();
      }
    }
  }

  // 3. One-time content seed
  const seededFlag = db.select().from(settings).where(eq(settings.key, SEED_FLAG_KEY)).get();
  if (!seededFlag) {
    const existingCategories = db.select().from(categories).all();
    if (existingCategories.length === 0) {
      const defaultCats = [
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
          descriptionEn: 'Hands-on notes and experiments on AI, automation, and software systems',
          sortOrder: 2,
        },
      ];
      for (const cat of defaultCats) {
        db.insert(categories).values(cat).onConflictDoNothing().run();
      }
    }

    const existingProjects = db.select().from(projectsTable).all();
    if (existingProjects.length === 0) {
      const defaultProjects = [
        {
          title: 'masafig.ai.studio',
          titleEn: 'masafig.ai.studio',
          role: 'وب‌اپلیکیشن',
          roleEn: 'Web Application',
          period: 'AI Studio',
          periodEn: 'AI Studio',
          summary: 'نمونه پروژه واقعی طراحی و پیاده‌سازی‌شده با کمک هوش مصنوعی روی AI Studio.',
          summaryEn: 'A real-world web application designed and built with AI assistance.',
          stack: ['AI Studio', 'Web App'],
          url: 'https://masafig.ai.studio',
          featured: 1,
          sortOrder: 1,
        },
        {
          title: 'وب‌سایت شخصی و وبلاگ',
          titleEn: 'Personal Portfolio & Local-First Blog',
          role: 'طراحی و توسعه',
          roleEn: 'Design & Full-Stack Dev',
          period: '۱۴۰۵',
          periodEn: '2026',
          summary:
            'پورتفولیو و وبلاگ شخصی با دیتابیس محلی SQLite، آپلودر اختصاصی رسانه و پنل مدیریت سفارشی.',
          summaryEn:
            'Self-hosted portfolio and block-based blog powered by local SQLite, media optimization, and a custom bilingual CMS.',
          stack: ['TypeScript', 'React', 'SQLite'],
          url: '/',
          featured: 1,
          sortOrder: 2,
        },
      ];

      for (const proj of defaultProjects) {
        db.insert(projectsTable)
          .values({
            title: proj.title,
            titleEn: proj.titleEn,
            role: proj.role,
            roleEn: proj.roleEn,
            period: proj.period,
            periodEn: proj.periodEn,
            summary: proj.summary,
            summaryEn: proj.summaryEn,
            stack: JSON.stringify(proj.stack),
            url: proj.url,
            featured: proj.featured,
            sortOrder: proj.sortOrder,
          })
          .run();
      }
    }

    const existingPosts = db.select().from(posts).all();
    const sampleBlocks = createSamplePostBlocks();
    const sampleBlocksEn = createSamplePostBlocksEn();
    if (existingPosts.length === 0) {
      db.insert(posts)
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
        .onConflictDoNothing()
        .run();
    }

    db.insert(settings)
      .values({ key: SEED_FLAG_KEY, value: '1', updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: '1', updatedAt: now },
      })
      .run();
  }

  // 4. One-time safe English backfill for pre-existing default seeded items (only fills empty *_en fields)
  const enBackfillFlag = db.select().from(settings).where(eq(settings.key, '_bilingual_seed_v1')).get();
  if (!enBackfillFlag) {
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
    for (const c of db.select().from(categories).all()) {
      const def = catDefaults[c.name];
      if (def && !c.nameEn.trim()) {
        db.update(categories)
          .set({
            nameEn: def.nameEn,
            descriptionEn: c.descriptionEn.trim() ? c.descriptionEn : def.descriptionEn,
          })
          .where(eq(categories.id, c.id))
          .run();
      }
    }

    for (const p of db.select().from(projectsTable).all()) {
      if (p.title === 'masafig.ai.studio' && !p.titleEn.trim()) {
        db.update(projectsTable)
          .set({
            titleEn: 'masafig.ai.studio',
            roleEn: 'Web Application',
            periodEn: 'AI Studio',
            summaryEn: 'A real-world web application designed and built with AI assistance.',
          })
          .where(eq(projectsTable.id, p.id))
          .run();
      } else if (p.title === 'وب‌سایت شخصی و وبلاگ' && !p.titleEn.trim()) {
        db.update(projectsTable)
          .set({
            titleEn: 'Personal Portfolio & Local-First Blog',
            roleEn: 'Design & Full-Stack Dev',
            periodEn: '2026',
            summaryEn:
              'Self-hosted portfolio and block-based blog powered by local SQLite, media optimization, and a custom bilingual CMS.',
          })
          .where(eq(projectsTable.id, p.id))
          .run();
      }
    }

    const sampleRow = db
      .select()
      .from(posts)
      .where(eq(posts.slug, 'نوشته-نمونه-امکانات-وبلاگ'))
      .get();
    if (sampleRow && !sampleRow.titleEn.trim()) {
      db.update(posts)
        .set({
          titleEn: 'Sample Post: Complete Blog & Block Editor Showcase',
          excerptEn:
            'A hands-on showcase of all editor blocks — images, video, audio, callout cards, buttons, link embeds, code blocks, quotes, and rich inline formatting.',
          blocksEn: JSON.stringify(createSamplePostBlocksEn()),
        })
        .where(eq(posts.id, sampleRow.id))
        .run();
    }

    db.insert(settings)
      .values({ key: '_bilingual_seed_v1', value: '1', updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: '1', updatedAt: now },
      })
      .run();
  }
}

seedInitialData();

// ==================== SETTINGS ====================
export function getSettings(): SiteSettings {
  const rows = db.select().from(settings).all();
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

export function updateSettings(partial: Partial<SiteSettings>): SiteSettings {
  const now = new Date().toISOString();
  const allowedKeys = Object.keys(DEFAULT_SETTINGS) as Array<keyof SiteSettings>;
  for (const key of allowedKeys) {
    if (typeof partial[key] === 'string') {
      db.insert(settings)
        .values({ key, value: partial[key] as string, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: partial[key] as string, updatedAt: now },
        })
        .run();
    }
  }
  return getSettings();
}

// ==================== AI PROVIDER CONFIG (ADMIN-ONLY, ENCRYPTED AT REST) ====================
const AI_PROVIDER_KEY = '_ai_provider';
const AI_MODEL_KEY = '_ai_model';
const AI_BASE_URL_KEY = '_ai_base_url';
const AI_API_KEY_ENC = '_ai_api_key_enc';

function getInternalSetting(key: string): string {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? '';
}

function setInternalSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();
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

export function getAiConfigResolved(): ResolvedAiConfig {
  const rawProvider = getInternalSetting(AI_PROVIDER_KEY);
  const provider: AiProviderType =
    rawProvider === 'openai_compatible' ? 'openai_compatible' : 'gemini';
  const defaultModel = provider === 'gemini' ? 'gemini-4-hydrogen' : 'gpt-4.1-mini';
  const savedModel = getInternalSetting(AI_MODEL_KEY).trim();
  const model =
    !savedModel || (provider === 'gemini' && LEGACY_GEMINI_MODELS.has(savedModel))
      ? defaultModel
      : savedModel;
  const baseUrl = getInternalSetting(AI_BASE_URL_KEY).trim();
  const encKey = getInternalSetting(AI_API_KEY_ENC);
  const customApiKey = encKey ? decryptSecret(encKey, getOrCreateSessionSecret()) : '';

  // Security: do NOT auto-fallback to host env API keys unless admin explicitly saves a key in Admin Settings
  return {
    provider,
    model,
    baseUrl,
    customApiKey,
    envGeminiKey: '',
    envOpenAiKey: '',
  };
}

export function getAiConfigPublic(): AiConfigPublic {
  const resolved = getAiConfigResolved();
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

export function updateAiConfig(input: {
  provider?: AiProviderType;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  clearCustomApiKey?: boolean;
}): AiConfigPublic {
  if (input.provider === 'gemini' || input.provider === 'openai_compatible') {
    setInternalSetting(AI_PROVIDER_KEY, input.provider);
  }
  if (typeof input.model === 'string') {
    setInternalSetting(AI_MODEL_KEY, input.model.trim());
  }
  if (typeof input.baseUrl === 'string') {
    setInternalSetting(AI_BASE_URL_KEY, input.baseUrl.trim());
  }
  if (input.clearCustomApiKey) {
    setInternalSetting(AI_API_KEY_ENC, '');
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    const encrypted = encryptSecret(input.apiKey.trim(), getOrCreateSessionSecret());
    setInternalSetting(AI_API_KEY_ENC, encrypted);
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
export function listCategories(): CategoryItem[] {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all();
}

export function upsertCategory(input: {
  id?: number;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  sortOrder?: number;
}): CategoryItem {
  const cleanName = input.name.trim();
  const cleanNameEn = (input.nameEn ?? '').trim();
  const cleanDesc = input.description.trim();
  const cleanDescEn = (input.descriptionEn ?? '').trim();
  const slug = slugifyPersian(cleanName);

  if (input.id) {
    const previous = db.select().from(categories).where(eq(categories.id, input.id)).get();
    db.update(categories)
      .set({
        name: cleanName,
        nameEn: cleanNameEn,
        slug,
        description: cleanDesc,
        descriptionEn: cleanDescEn,
        sortOrder: input.sortOrder ?? previous?.sortOrder ?? 0,
      })
      .where(eq(categories.id, input.id))
      .run();

    if (previous && previous.name !== cleanName) {
      db.update(posts)
        .set({ category: cleanName })
        .where(eq(posts.category, previous.name))
        .run();
    }

    return db.select().from(categories).where(eq(categories.id, input.id)).get()!;
  }

  const nextOrder = input.sortOrder ?? listCategories().length + 1;
  const info = db
    .insert(categories)
    .values({
      name: cleanName,
      nameEn: cleanNameEn,
      slug,
      description: cleanDesc,
      descriptionEn: cleanDescEn,
      sortOrder: nextOrder,
    })
    .run();
  return db
    .select()
    .from(categories)
    .where(eq(categories.id, Number(info.lastInsertRowid)))
    .get()!;
}

export function reorderCategories(orderedIds: number[]): CategoryItem[] {
  const tx = sqlite.transaction((ids: number[]) => {
    ids.forEach((id, idx) => {
      if (Number.isInteger(id) && id > 0) {
        db.update(categories)
          .set({ sortOrder: idx + 1 })
          .where(eq(categories.id, id))
          .run();
      }
    });
  });
  tx(orderedIds);
  return listCategories();
}

export function deleteCategory(id: number): boolean {
  const res = db.delete(categories).where(eq(categories.id, id)).run();
  return res.changes > 0;
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

export function listPosts(includeDrafts = false): BlogPost[] {
  const rows = includeDrafts
    ? db.select().from(posts).orderBy(desc(posts.createdAt)).all()
    : db.select().from(posts).where(eq(posts.published, 1)).orderBy(desc(posts.createdAt)).all();
  return rows.map(mapPostRow);
}

export function getPostBySlug(slug: string, includeDrafts = false): BlogPost | null {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  const row = db.select().from(posts).where(eq(posts.slug, decoded)).get();
  if (!row) return null;
  if (!includeDrafts && !row.published) return null;
  return mapPostRow(row);
}

export function getPostById(id: number): BlogPost | null {
  const row = db.select().from(posts).where(eq(posts.id, id)).get();
  return row ? mapPostRow(row) : null;
}

export function upsertPost(input: {
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
}): BlogPost {
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
      const conflict = db.select().from(posts).where(eq(posts.slug, candidateSlug)).get();
      if (!conflict || conflict.id === input.id) break;
      candidateSlug = `${baseSlug}-${suffix++}`;
    }

    db.update(posts)
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
      .run();
    return getPostById(input.id)!;
  }

  let candidateSlug = baseSlug;
  let suffix = 2;
  while (db.select().from(posts).where(eq(posts.slug, candidateSlug)).get()) {
    candidateSlug = `${baseSlug}-${suffix++}`;
  }

  const info = db
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
    .run();

  return getPostById(Number(info.lastInsertRowid))!;
}

export function deletePost(id: number): boolean {
  const res = db.delete(posts).where(eq(posts.id, id)).run();
  return res.changes > 0;
}

// ==================== PROJECTS ====================
export function listProjects(): ProjectItem[] {
  const rows = db
    .select()
    .from(projectsTable)
    .orderBy(asc(projectsTable.sortOrder), desc(projectsTable.id))
    .all();
  return rows.map((row) => {
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
  });
}

export function upsertProject(
  input: Omit<ProjectItem, 'id' | 'titleEn' | 'roleEn' | 'periodEn' | 'summaryEn'> & {
    id?: number;
    titleEn?: string;
    roleEn?: string;
    periodEn?: string;
    summaryEn?: string;
  },
): ProjectItem {
  const existing = input.id ? listProjects().find((p) => p.id === input.id) : undefined;
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
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? listProjects().length + 1,
  };

  if (input.id) {
    db.update(projectsTable).set(payload).where(eq(projectsTable.id, input.id)).run();
    return listProjects().find((p) => p.id === input.id)!;
  }

  const info = db.insert(projectsTable).values(payload).run();
  return listProjects().find((p) => p.id === Number(info.lastInsertRowid))!;
}

export function reorderProjects(orderedIds: number[]): ProjectItem[] {
  const tx = sqlite.transaction((ids: number[]) => {
    ids.forEach((id, idx) => {
      if (Number.isInteger(id) && id > 0) {
        db.update(projectsTable)
          .set({ sortOrder: idx + 1 })
          .where(eq(projectsTable.id, id))
          .run();
      }
    });
  });
  tx(orderedIds);
  return listProjects();
}

export function deleteProject(id: number): boolean {
  const res = db.delete(projectsTable).where(eq(projectsTable.id, id)).run();
  return res.changes > 0;
}

// ==================== MESSAGES ====================
export function createMessage(input: {
  name: string;
  contact: string;
  subject: string;
  message: string;
}): ContactMessage {
  const now = new Date().toISOString();
  const info = db
    .insert(messages)
    .values({
      name: input.name,
      contact: input.contact,
      subject: input.subject,
      message: input.message,
      read: 0,
      createdAt: now,
    })
    .run();
  const row = db
    .select()
    .from(messages)
    .where(eq(messages.id, Number(info.lastInsertRowid)))
    .get()!;
  return {
    ...row,
    read: Boolean(row.read),
  };
}

export function listMessages(): ContactMessage[] {
  return db
    .select()
    .from(messages)
    .orderBy(desc(messages.createdAt))
    .all()
    .map((m) => ({ ...m, read: Boolean(m.read) }));
}

export function markMessageRead(id: number, read: boolean): boolean {
  const res = db
    .update(messages)
    .set({ read: read ? 1 : 0 })
    .where(eq(messages.id, id))
    .run();
  return res.changes > 0;
}

export function deleteMessage(id: number): boolean {
  const res = db.delete(messages).where(eq(messages.id, id)).run();
  return res.changes > 0;
}

// ==================== ADMIN AUTH & SECURITY ====================
export function authenticateAdminUser(username: string, password: string): {
  id: number;
  username: string;
  role: string;
  tokenVersion: number;
} | null {
  const row = db.select().from(users).where(eq(users.username, username.trim())).get();
  if (!row) return null;
  if (!verifyPasswordScrypt(password, row.passwordHash)) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tokenVersion: row.tokenVersion || 1,
  };
}

export function getAdminUserByUsername(username: string): {
  id: number;
  username: string;
  role: string;
  tokenVersion: number;
} | null {
  const row = db.select().from(users).where(eq(users.username, username)).get();
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tokenVersion: row.tokenVersion || 1,
  };
}

export function changeAdminCredentials(input: {
  currentUsername: string;
  currentPassword: string;
  newUsername?: string;
  newPassword?: string;
}):
  | { ok: true; user: { id: number; username: string; role: string; tokenVersion: number } }
  | { ok: false; error: string } {
  const row = db.select().from(users).where(eq(users.username, input.currentUsername)).get();
  if (!row || !verifyPasswordScrypt(input.currentPassword, row.passwordHash)) {
    return { ok: false, error: 'رمز عبور فعلی اشتباه است.' };
  }

  const nextUsername = input.newUsername?.trim() || row.username;
  if (nextUsername.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(nextUsername)) {
    return { ok: false, error: 'نام کاربری باید حداقل ۳ کاراکتر انگلیسی، عدد یا نقطه باشد.' };
  }

  if (nextUsername !== row.username) {
    const conflict = db.select().from(users).where(eq(users.username, nextUsername)).get();
    if (conflict) {
      return { ok: false, error: 'این نام کاربری قبلاً استفاده شده است.' };
    }
  }

  const nextHash = input.newPassword ? hashPasswordScrypt(input.newPassword) : row.passwordHash;
  const nextVersion = (row.tokenVersion || 1) + 1;

  db.update(users)
    .set({
      username: nextUsername,
      passwordHash: nextHash,
      tokenVersion: nextVersion,
    })
    .where(eq(users.id, row.id))
    .run();

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

export function hasAnyAdminUser(): boolean {
  const row = db.select({ id: users.id }).from(users).limit(1).get();
  return Boolean(row);
}

export function setupFirstAdminUser(input: {
  username: string;
  password: string;
}):
  | { ok: true; user: { id: number; username: string; role: string; tokenVersion: number } }
  | { ok: false; error: string } {
  const cleanUser = input.username.trim();
  if (cleanUser.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(cleanUser)) {
    return { ok: false, error: 'نام کاربری باید حداقل ۳ کاراکتر انگلیسی، عدد یا نقطه باشد.' };
  }

  const runTx = sqlite.transaction(() => {
    const existing = db.select({ id: users.id }).from(users).limit(1).get();
    if (existing) {
      return { ok: false as const, error: 'حساب مدیر قبلاً راه‌اندازی شده است.' };
    }
    const now = new Date().toISOString();
    const info = db
      .insert(users)
      .values({
        username: cleanUser,
        passwordHash: hashPasswordScrypt(input.password),
        role: 'admin',
        tokenVersion: 1,
        createdAt: now,
      })
      .run();
    return {
      ok: true as const,
      user: {
        id: Number(info.lastInsertRowid),
        username: cleanUser,
        role: 'admin',
        tokenVersion: 1,
      },
    };
  });

  return runTx();
}

export function bumpAdminTokenVersion(username: string): boolean {
  const row = db.select().from(users).where(eq(users.username, username)).get();
  if (!row) return false;
  db.update(users)
    .set({ tokenVersion: (row.tokenVersion || 1) + 1 })
    .where(eq(users.id, row.id))
    .run();
  return true;
}
