import type {
  BlogPost,
  CategoryItem,
  ContentBlock,
  NavItem,
  ProjectItem,
  SiteLanguage,
  SiteSettings,
} from '../types/cms.ts';
import { formatPersianDate, formatPersianNumber } from './slug.ts';

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'home', labelFa: 'خانه', labelEn: 'Home', to: '/', enabled: true },
  { id: 'blog', labelFa: 'وبلاگ', labelEn: 'Blog', to: '/blog', enabled: true },
  { id: 'projects', labelFa: 'پروژه‌ها', labelEn: 'Projects', to: '/projects', enabled: true },
  { id: 'about', labelFa: 'درباره من', labelEn: 'About', to: '/about', enabled: true },
];

export function parseNavItems(jsonStr?: string): NavItem[] {
  if (!jsonStr) return DEFAULT_NAV_ITEMS;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return DEFAULT_NAV_ITEMS;
    const valid = parsed
      .filter(
        (item): item is NavItem =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.to === 'string' &&
          item.to.trim().length > 0 &&
          (typeof item.labelFa === 'string' || typeof item.labelEn === 'string'),
      )
      .map((item) => ({
        id: item.id.trim(),
        labelFa: (item.labelFa || item.labelEn || '').trim(),
        labelEn: (item.labelEn || item.labelFa || '').trim(),
        to: item.to.trim(),
        enabled: item.enabled !== false,
        external:
          item.external === true ||
          item.to.trim().startsWith('http://') ||
          item.to.trim().startsWith('https://'),
      }));
    return valid;
  } catch {
    return DEFAULT_NAV_ITEMS;
  }
}

export function pickLocalizedText(
  lang: SiteLanguage,
  faValue: string | undefined,
  enValue: string | undefined,
  fallbackFa = '',
  fallbackEn = '',
): string {
  const fa = (faValue || '').trim() || fallbackFa;
  const en = (enValue || '').trim() || fallbackEn || fa;
  return lang === 'en' ? en : fa;
}

export function formatDateByLang(iso: string, lang: SiteLanguage): string {
  if (lang === 'fa') return formatPersianDate(iso);
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatNumberByLang(value: number | string, lang: SiteLanguage): string {
  return lang === 'fa' ? formatPersianNumber(value) : String(value);
}

export function formatReadingTime(minutes: number, lang: SiteLanguage): string {
  const safeMin = Math.max(1, Math.round(minutes || 1));
  if (lang === 'en') {
    return `${safeMin} min read`;
  }
  return `${formatPersianNumber(safeMin)} دقیقه مطالعه`;
}

const ENGLISH_SOCIAL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  bale: 'Bale',
  eitaa: 'Eitaa',
  rubika: 'Rubika',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  youtube: 'YouTube',
  aparat: 'Aparat',
  x: 'X (Twitter)',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  discord: 'Discord',
  virgool: 'Virgool',
  spotify: 'Spotify',
  email: 'Email',
  phone: 'Phone',
  globe: 'Website',
  website: 'Website',
};

export function localizeSocialLabel(
  label: string,
  iconKey: string,
  lang: SiteLanguage,
  labelEn?: string,
): string {
  if (lang !== 'en') return label;
  if (labelEn && labelEn.trim()) return labelEn.trim();
  const trimmed = label.trim();
  const hasLatin = /[A-Za-z]/.test(trimmed);
  if (hasLatin) return trimmed;
  return ENGLISH_SOCIAL_LABELS[iconKey.toLowerCase()] || trimmed;
}

export function localizeCategory(
  cat: CategoryItem,
  lang: SiteLanguage,
): { name: string; description: string } {
  if (lang !== 'en') {
    return { name: cat.name, description: cat.description };
  }
  return {
    name: cat.nameEn?.trim() || cat.name,
    description: cat.descriptionEn?.trim() || cat.description,
  };
}

export function localizeCategoryName(
  categoryNameFa: string,
  categories: CategoryItem[],
  lang: SiteLanguage,
): string {
  if (lang !== 'en') return categoryNameFa;
  const match = categories.find((c) => c.name === categoryNameFa);
  return match?.nameEn?.trim() || categoryNameFa;
}

export function localizePost(
  post: BlogPost,
  lang: SiteLanguage,
): {
  title: string;
  excerpt: string;
  blocks: ContentBlock[];
  hasEnglishTranslation: boolean;
} {
  if (lang !== 'en') {
    return {
      title: post.title,
      excerpt: post.excerpt,
      blocks: post.blocks,
      hasEnglishTranslation: Boolean(post.titleEn?.trim()),
    };
  }
  const hasEnBlocks = Array.isArray(post.blocksEn) && post.blocksEn.length > 0;
  const hasEnTitle = Boolean(post.titleEn?.trim());
  return {
    title: hasEnTitle ? post.titleEn.trim() : post.title,
    excerpt: post.excerptEn?.trim() || post.excerpt,
    blocks: hasEnBlocks ? post.blocksEn : post.blocks,
    hasEnglishTranslation: hasEnTitle || hasEnBlocks,
  };
}

export function localizeProject(
  proj: ProjectItem,
  lang: SiteLanguage,
): { title: string; role: string; period: string; summary: string } {
  if (lang !== 'en') {
    return {
      title: proj.title,
      role: proj.role,
      period: proj.period,
      summary: proj.summary,
    };
  }
  return {
    title: proj.titleEn?.trim() || proj.title,
    role: proj.roleEn?.trim() || proj.role,
    period: proj.periodEn?.trim() || proj.period,
    summary: proj.summaryEn?.trim() || proj.summary,
  };
}

export interface UiDictionary {
  skipToContent: string;
  mainNavLabel: string;
  mobileNavLabel: string;
  footerNavLabel: string;
  openMenu: string;
  closeMenu: string;
  all: string;
  more: string;
  view: string;
  viewBlogPage: string;
  viewProjectsPage: string;
  allPosts: string;
  otherPosts: string;
  readArticle: string;
  author: string;
  loading: string;
  noPostsYet: string;
  noPostsInCategory: (cat: string) => string;
  noProjectsYet: string;
  searchPostsPlaceholder: string;
  searchPostsAria: string;
  filterCategoriesAria: string;
  projectCount: (count: number) => string;
  notFoundPostTitle: string;
  notFoundPostDesc: string;
  backToBlog: string;
  notFoundPageTitle: string;
  notFoundPageDesc: string;
  backToHome: string;
  copyLink: string;
  linkCopied: string;
  shareTelegram: string;
  shareWhatsapp: string;
  shareX: string;
  shareNative: string;
  shareSectionAria: string;
  contactNameLabel: string;
  contactNamePlaceholder: string;
  contactEmailLabel: string;
  contactSubjectLabel: string;
  contactSubjectPlaceholder: string;
  contactMessageLabel: string;
  contactMessagePlaceholder: string;
  contactSend: string;
  contactSending: string;
  contactErrName: string;
  contactErrEmail: string;
  contactErrMessage: string;
  contactErrFailed: string;
  contactErrNetwork: string;
  themeDark: string;
  themeLight: string;
  themeAuto: string;
  themeToggleAria: string;
  langToggleAria: string;
  copyCode: string;
  copiedCode: string;
  untranslatedPostNote: string;
}

const FA_DICT: UiDictionary = {
  skipToContent: 'پرش به محتوای اصلی',
  mainNavLabel: 'منوی اصلی',
  mobileNavLabel: 'منوی موبایل',
  footerNavLabel: 'لینک‌های پاورقی',
  openMenu: 'باز کردن منو',
  closeMenu: 'بستن منو',
  all: 'همه',
  more: 'بیشتر',
  view: 'مشاهده',
  viewBlogPage: 'مشاهده صفحه وبلاگ',
  viewProjectsPage: 'مشاهده صفحه پروژه‌ها',
  allPosts: 'همه نوشته‌ها',
  otherPosts: 'سایر نوشته‌ها',
  readArticle: 'خواندن نوشته',
  author: 'نویسنده:',
  loading: 'در حال بارگذاری...',
  noPostsYet: 'هنوز نوشته‌ای منتشر نشده است.',
  noPostsInCategory: (cat) => `هنوز در دسته «${cat}» نوشته‌ای ثبت نشده است.`,
  noProjectsYet: 'هنوز پروژه‌ای ثبت نشده است.',
  searchPostsPlaceholder: 'جستجو در عنوان یا متن خلاصه...',
  searchPostsAria: 'جستجو در نوشته‌ها',
  filterCategoriesAria: 'فیلتر دسته‌بندی نوشته‌ها',
  projectCount: (count) => `${formatPersianNumber(count)} پروژه`,
  notFoundPostTitle: 'نوشته مورد نظر یافت نشد',
  notFoundPostDesc: 'ممکن است این یادداشت حذف شده یا آدرس آن تغییر کرده باشد.',
  backToBlog: 'بازگشت به وبلاگ',
  notFoundPageTitle: 'صفحه مورد نظر پیدا نشد',
  notFoundPageDesc: 'احتمالاً آدرس را اشتباه وارد کرده‌ای یا این صفحه جابه‌جا شده است.',
  backToHome: 'بازگشت به خانه',
  copyLink: 'کپی لینک',
  linkCopied: 'لینک کپی شد',
  shareTelegram: 'تلگرام',
  shareWhatsapp: 'واتساپ',
  shareX: 'ایکس',
  shareNative: 'ارسال مستقیم',
  shareSectionAria: 'اشتراک‌گذاری نوشته',
  contactNameLabel: 'نام',
  contactNamePlaceholder: 'نام شما',
  contactEmailLabel: 'ایمیل',
  contactSubjectLabel: 'موضوع (اختیاری)',
  contactSubjectPlaceholder: 'موضوع پیام',
  contactMessageLabel: 'پیام',
  contactMessagePlaceholder: 'متن پیام...',
  contactSend: 'ارسال پیام',
  contactSending: 'در حال ارسال...',
  contactErrName: 'لطفاً نام خودت را وارد کن (حداقل ۲ حرف).',
  contactErrEmail: 'لطفاً یک ایمیل معتبر وارد کن.',
  contactErrMessage: 'متن پیام خیلی کوتاه است (حداقل ۵ حرف بنویس).',
  contactErrFailed: 'ارسال پیام ناموفق بود.',
  contactErrNetwork: 'خطا در برقراری ارتباط با سرور.',
  themeDark: 'تیره',
  themeLight: 'روشن',
  themeAuto: 'خودکار',
  themeToggleAria: 'تغییر حالت روشنایی سایت',
  langToggleAria: 'تغییر زبان سایت',
  copyCode: 'کپی',
  copiedCode: 'کپی شد',
  untranslatedPostNote: '',
};

const EN_DICT: UiDictionary = {
  skipToContent: 'Skip to main content',
  mainNavLabel: 'Primary navigation',
  mobileNavLabel: 'Mobile navigation',
  footerNavLabel: 'Footer links',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  all: 'All',
  more: 'More',
  view: 'Open',
  viewBlogPage: 'Explore the blog',
  viewProjectsPage: 'Explore all projects',
  allPosts: 'All articles',
  otherPosts: 'More articles',
  readArticle: 'Read article',
  author: 'Written by',
  loading: 'Loading...',
  noPostsYet: 'No articles published yet.',
  noPostsInCategory: (cat) => `No articles in "${cat}" yet.`,
  noProjectsYet: 'No projects added yet.',
  searchPostsPlaceholder: 'Search titles or summaries...',
  searchPostsAria: 'Search articles',
  filterCategoriesAria: 'Filter articles by category',
  projectCount: (count) => (count === 1 ? '1 project' : `${count} projects`),
  notFoundPostTitle: 'Article not found',
  notFoundPostDesc: 'This article may have been removed or its URL might have changed.',
  backToBlog: 'Back to blog',
  notFoundPageTitle: 'Page not found',
  notFoundPageDesc: 'The page you are looking for may have moved or does not exist.',
  backToHome: 'Back to home',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  shareTelegram: 'Telegram',
  shareWhatsapp: 'WhatsApp',
  shareX: 'X',
  shareNative: 'Share',
  shareSectionAria: 'Share this article',
  contactNameLabel: 'Name',
  contactNamePlaceholder: 'Your name',
  contactEmailLabel: 'Email',
  contactSubjectLabel: 'Subject (optional)',
  contactSubjectPlaceholder: 'What is this about?',
  contactMessageLabel: 'Message',
  contactMessagePlaceholder: 'Write your message...',
  contactSend: 'Send message',
  contactSending: 'Sending...',
  contactErrName: 'Please enter your name (at least 2 characters).',
  contactErrEmail: 'Please enter a valid email address.',
  contactErrMessage: 'Your message is a bit too short (at least 5 characters).',
  contactErrFailed: 'Could not send your message. Please try again.',
  contactErrNetwork: 'Unable to reach the server right now.',
  themeDark: 'Dark',
  themeLight: 'Light',
  themeAuto: 'Auto',
  themeToggleAria: 'Switch color theme',
  langToggleAria: 'Switch language',
  copyCode: 'Copy',
  copiedCode: 'Copied',
  untranslatedPostNote: 'This post is currently available in Persian.',
};

export function getUiDict(lang: SiteLanguage): UiDictionary {
  return lang === 'en' ? EN_DICT : FA_DICT;
}

export function getLocalizedSettingsText(
  settings: SiteSettings,
  lang: SiteLanguage,
) {
  return {
    heroTitle: pickLocalizedText(lang, settings.heroTitle, settings.heroTitleEn),
    heroSubtitle: pickLocalizedText(lang, settings.heroSubtitle, settings.heroSubtitleEn),
    blogSectionTitle: pickLocalizedText(
      lang,
      settings.blogSectionTitle,
      settings.blogSectionTitleEn,
      'نوشته‌ها و تجربه‌ها',
      'Notes & Writing',
    ),
    blogPageTitle: pickLocalizedText(
      lang,
      settings.blogPageTitle,
      settings.blogPageTitleEn,
      'وبلاگ',
      'Blog',
    ),
    blogPageSubtitle: pickLocalizedText(
      lang,
      settings.blogPageSubtitle,
      settings.blogPageSubtitleEn,
    ),
    projectsSectionTitle: pickLocalizedText(
      lang,
      settings.projectsSectionTitle,
      settings.projectsSectionTitleEn,
      'پروژه‌ها',
      'Projects',
    ),
    projectsPageSubtitle: pickLocalizedText(
      lang,
      settings.projectsPageSubtitle,
      settings.projectsPageSubtitleEn,
    ),
    aboutTitle: pickLocalizedText(
      lang,
      settings.aboutTitle,
      settings.aboutTitleEn,
      'درباره من و ارتباط',
      'About & Contact',
    ),
    aboutBio: pickLocalizedText(lang, settings.aboutBio, settings.aboutBioEn),
    aboutFocusHeading: pickLocalizedText(
      lang,
      settings.aboutFocusHeading,
      settings.aboutFocusHeadingEn,
      'حوزه‌های فعالیت',
      'What I Focus On',
    ),
    aboutFocusText: pickLocalizedText(lang, settings.aboutFocusText, settings.aboutFocusTextEn),
    aboutConnectHeading: pickLocalizedText(
      lang,
      settings.aboutConnectHeading,
      settings.aboutConnectHeadingEn,
      'راه‌های ارتباطی مستقیم',
      'Direct Channels',
    ),
    contactFormHeading: pickLocalizedText(
      lang,
      settings.contactFormHeading,
      settings.contactFormHeadingEn,
      'ارسال پیام مستقیم',
      'Send a Direct Message',
    ),
    contactSuccessMessage: pickLocalizedText(
      lang,
      settings.contactSuccessMessage,
      settings.contactSuccessMessageEn,
      'پیامت با موفقیت ثبت شد؛ ممنون از ارتباطت!',
      'Message received — thanks for reaching out!',
    ),
    vcardButtonLabel: pickLocalizedText(
      lang,
      settings.vcardButtonLabel,
      settings.vcardButtonLabelEn,
      'افزودن به مخاطبین',
      'Save Contact',
    ),
    footerText: pickLocalizedText(
      lang,
      settings.footerText,
      settings.footerTextEn,
      `© ۱۴۰۵ ${settings.brandName || 'My Portfolio'}`,
      `© 2026 ${settings.brandName || 'My Portfolio'}`,
    ),
    shareHeading: pickLocalizedText(
      lang,
      settings.shareHeading,
      settings.shareHeadingEn,
      'اشتراک‌گذاری این نوشته',
      'Share this article',
    ),
    shareSubtitle: pickLocalizedText(
      lang,
      settings.shareSubtitle,
      settings.shareSubtitleEn,
      'اگر این مطلب برات مفید بود، می‌توانی با دوستانت به اشتراک بگذاری.',
      'Found this helpful? Pass it along to someone who might enjoy it.',
    ),
  };
}
