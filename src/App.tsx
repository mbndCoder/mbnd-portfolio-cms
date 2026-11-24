import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Footer } from './components/Footer.tsx';
import { Navbar } from './components/Navbar.tsx';
import {
  DEFAULT_NAV_ITEMS,
  getLocalizedSettingsText,
  getUiDict,
  localizePost,
} from './lib/i18n.ts';
import { applyThemeToDocument, resolveEffectiveTheme } from './lib/theme.ts';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import type { PublicSiteData, SiteLanguage, ThemeMode } from './types/cms.ts';

const BlogListPage = lazy(() =>
  import('./pages/BlogListPage.tsx').then((m) => ({ default: m.BlogListPage })),
);
const BlogPostPage = lazy(() =>
  import('./pages/BlogPostPage.tsx').then((m) => ({ default: m.BlogPostPage })),
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage.tsx').then((m) => ({ default: m.ProjectsPage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage.tsx').then((m) => ({ default: m.AboutPage })),
);
const AdminPortal = lazy(() =>
  import('./pages/AdminPortal.tsx').then((m) => ({ default: m.AdminPortal })),
);

declare global {
  interface Window {
    __ADMIN_PORTAL_ACTIVE__?: boolean;
  }
}

const THEME_STORAGE_KEY = 'mbnd_theme_pref';
const LANG_STORAGE_KEY = 'mbnd_lang_pref';

const FALLBACK_SITE_DATA: PublicSiteData = {
  settings: {
    siteTitle:
      'محمدباقر نوری (Mohammad Bagher Nouri) | طراحی سایت، ساخت اپ و اتوماسیون هوش مصنوعی — mbnd.ir',
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
      'خوش اومدی! من محمدباقر هستم و علاقه‌مندم چیزهای جدید رو با آزمون و خطا یاد بگیرم؛ از طراحی اپ و سایت با هوش مصنوعی و ساخت ایجنت‌ها و اتوماسیون گرفته تا تعمیر و بهینه‌سازی نرم‌افزاری سیستم‌ها.',
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
      "Welcome! I'm Mohammad Bagher. I enjoy learning by building — designing apps and websites with AI, deploying practical automation agents, and troubleshooting and optimizing software systems. Feel free to drop me a message anytime.",
    aboutFocusHeadingEn: 'What I Focus On',
    aboutFocusTextEn: 'AI-Assisted Web & App Design · Agent Automation · Software Troubleshooting',
    aboutConnectHeadingEn: 'Direct Channels',
    contactFormHeadingEn: 'Send a Direct Message',
    contactSuccessMessageEn: 'Message received — thanks for reaching out!',
    vcardButtonLabelEn: 'Save Contact',
    footerTextEn: '© 2026 Mohammad Bagher',

    navItemsJson: JSON.stringify(DEFAULT_NAV_ITEMS),
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
    vcardTitle: 'طراحی اپ و سایت با هوش مصنوعی · اتوماسیون و بهینه‌سازی سیستم‌ها',
    vcardNote: '',
    vcardPhone: '',
    vcardWebsite: 'https://mbnd.ir',
    vcardAvatar: '/vcard-avatar.jpg',
    vcardExtraFieldsJson: '[]',
    socialLinksJson: '[]',
  },
  categories: [
    {
      id: 1,
      name: 'اقتصاد',
      nameEn: 'Economy',
      slug: 'اقتصاد',
      description: 'در حال تلاش برای بهتر کردن اقتصاد همه‌مون',
      descriptionEn: 'Working on practical ideas to improve our shared economy',
      sortOrder: 1,
    },
    {
      id: 2,
      name: 'یادگیری',
      nameEn: 'Learning',
      slug: 'یادگیری',
      description: 'تجربه‌های روزانه در هوش مصنوعی، اتوماسیون و سیستم‌ها',
      descriptionEn: 'Daily notes on AI, automation, and building resilient systems',
      sortOrder: 2,
    },
  ],
  posts: [],
  projects: [],
};

function readInitialSiteData(): { data: PublicSiteData; hydrated: boolean } {
  if (typeof document === 'undefined') {
    return { data: FALLBACK_SITE_DATA, hydrated: false };
  }
  const el = document.getElementById('__INITIAL_SITE_DATA__');
  if (!el?.textContent) {
    return { data: FALLBACK_SITE_DATA, hydrated: false };
  }
  try {
    const parsed = JSON.parse(el.textContent) as PublicSiteData;
    if (parsed?.settings) {
      return {
        data: {
          ...FALLBACK_SITE_DATA,
          ...parsed,
          settings: {
            ...FALLBACK_SITE_DATA.settings,
            ...parsed.settings,
          },
          categories: Array.isArray(parsed.categories)
            ? parsed.categories
            : FALLBACK_SITE_DATA.categories,
        },
        hydrated: true,
      };
    }
  } catch {
    // fallback to client fetch
  }
  return { data: FALLBACK_SITE_DATA, hydrated: false };
}

function readStoredTheme(defaultMode: ThemeMode, allowToggle: boolean): ThemeMode {
  if (!allowToggle || typeof window === 'undefined') return defaultMode;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'auto') return saved;
  } catch {
    // ignore storage errors
  }
  return defaultMode;
}

function readStoredLang(defaultLang: SiteLanguage, allowToggle: boolean): SiteLanguage {
  const safeDefault: SiteLanguage = defaultLang === 'en' ? 'en' : 'fa';
  if (!allowToggle || typeof window === 'undefined') return safeDefault;
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'fa' || saved === 'en') return saved;
  } catch {
    // ignore storage errors
  }
  return safeDefault;
}

function updateMetaTag(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el && content) {
    el.setAttribute('content', content);
  }
}

function RouteSeoSync({ data, lang }: { data: PublicSiteData; lang: SiteLanguage }) {
  const { pathname } = useLocation();

  useEffect(() => {
    const s = data.settings;
    const loc = getLocalizedSettingsText(s, lang);
    const brand =
      lang === 'en'
        ? `${s.brandName || 'Mohammad Bagher'} Nouri | mbnd.ir`
        : `${s.brandName || 'Mohammad Bagher'} | محمدباقر نوری`;

    let title =
      lang === 'en'
        ? 'Mohammad Bagher Nouri (mbnd.ir) | AI Web & App Design, Agents & Automation'
        : s.siteTitle || brand;
    let desc =
      lang === 'en'
        ? loc.heroSubtitle || s.siteDescription
        : s.siteDescription || loc.heroSubtitle;

    if (pathname === '/blog') {
      title = `${loc.blogPageTitle} | ${brand}`;
      desc = loc.blogPageSubtitle || desc;
    } else if (pathname.startsWith('/blog/') && pathname.length > 6) {
      const slug = decodeURIComponent(pathname.slice('/blog/'.length));
      const matched = data.posts.find((p) => p.slug === slug);
      if (matched) {
        const lp = localizePost(matched, lang);
        title = `${lp.title} | ${brand}`;
        desc = lp.excerpt || desc;
      }
    } else if (pathname === '/projects') {
      title = `${loc.projectsSectionTitle} | ${brand}`;
      desc = loc.projectsPageSubtitle || desc;
    } else if (pathname === '/about') {
      title = `${loc.aboutTitle} | ${brand}`;
      desc = loc.aboutBio || desc;
    }

    document.title = title;
    updateMetaTag('meta[name="description"]', desc);
    updateMetaTag('meta[property="og:title"]', title);
    updateMetaTag('meta[property="og:description"]', desc);
    updateMetaTag('meta[name="twitter:title"]', title);
    updateMetaTag('meta[name="twitter:description"]', desc);

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical && typeof window !== 'undefined') {
      const origin = window.location.origin.replace(/^https?:\/\/www\.mbnd\.ir$/i, 'https://mbnd.ir');
      canonical.setAttribute('href', `${origin}${pathname === '/' ? '/' : pathname}`);
    }
  }, [pathname, data, lang]);

  return null;
}

export default function App() {
  const isSecretAdminPortal = Boolean(
    typeof window !== 'undefined' && window.__ADMIN_PORTAL_ACTIVE__,
  );
  const initial = readInitialSiteData();
  const [siteData, setSiteData] = useState<PublicSiteData>(initial.data);
  const [loaded, setLoaded] = useState(initial.hydrated);
  const [themePref, setThemePref] = useState<ThemeMode>(() =>
    readStoredTheme(
      initial.data.settings.themeMode || 'dark',
      initial.data.settings.allowThemeToggle === 'true',
    ),
  );
  const [lang, setLang] = useState<SiteLanguage>(() =>
    readStoredLang(
      initial.data.settings.defaultLanguage || 'fa',
      initial.data.settings.allowLanguageToggle === 'true',
    ),
  );

  // Fetch fresh site payload on mount
  useEffect(() => {
    if (isSecretAdminPortal) return;

    let cancelled = false;
    fetch('/api/public/site', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<PublicSiteData>) : null))
      .then((data) => {
        if (!cancelled && data?.settings) {
          const mergedSettings = {
            ...FALLBACK_SITE_DATA.settings,
            ...data.settings,
          };
          setSiteData({
            ...FALLBACK_SITE_DATA,
            ...data,
            settings: mergedSettings,
          });
          setThemePref(
            readStoredTheme(
              mergedSettings.themeMode || 'dark',
              mergedSettings.allowThemeToggle === 'true',
            ),
          );
          setLang(
            readStoredLang(
              mergedSettings.defaultLanguage || 'fa',
              mergedSettings.allowLanguageToggle === 'true',
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isSecretAdminPortal]);

  // Apply Dark / Light / Auto theme & custom palette colors dynamically
  useEffect(() => {
    if (isSecretAdminPortal) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const effective = resolveEffectiveTheme(themePref, mq.matches);
      applyThemeToDocument(siteData.settings, effective);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [isSecretAdminPortal, themePref, siteData.settings]);

  // Sync document language and writing direction on public routes
  useEffect(() => {
    if (isSecretAdminPortal) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  }, [isSecretAdminPortal, lang]);

  // Apply custom favicon dynamically
  useEffect(() => {
    const href = siteData.settings.faviconImage?.trim() || '/favicon.png';
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link && link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
  }, [siteData.settings.faviconImage]);

  const handleCycleTheme = () => {
    const next: ThemeMode =
      themePref === 'dark' ? 'light' : themePref === 'light' ? 'auto' : 'dark';
    setThemePref(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const handleToggleLang = () => {
    const next: SiteLanguage = lang === 'fa' ? 'en' : 'fa';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  if (isSecretAdminPortal) {
    let adminLoadingText = 'در حال بارگذاری پنل مدیریت...';
    try {
      if (localStorage.getItem('mbnd_admin_lang') === 'en') {
        adminLoadingText = 'Loading Admin Portal...';
      }
    } catch {
      // ignore storage errors
    }
    return (
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-[var(--ground-deep)] text-sm text-[var(--ink-muted)]">
              {adminLoadingText}
            </div>
          }
        >
          <AdminPortal />
        </Suspense>
      </ErrorBoundary>
    );
  }

  const t = getUiDict(lang);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RouteSeoSync data={siteData} lang={lang} />
        <div
          className="flex min-h-screen flex-col bg-[var(--ground-deep)] text-[var(--ink)]"
          data-loaded={loaded}
        >
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:end-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--ink)] focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-[var(--ground-deep)]"
          >
            {t.skipToContent}
          </a>
          <Navbar
            settings={siteData.settings}
            lang={lang}
            themePref={themePref}
            onCycleTheme={handleCycleTheme}
            onToggleLang={handleToggleLang}
          />
          <div className="flex-1">
            <Suspense
              fallback={
                <div className="flex min-h-[55svh] items-center justify-center text-sm text-[var(--ink-faint)]">
                  {t.loading}
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<HomePage data={siteData} lang={lang} />} />
                <Route
                  path="/blog"
                  element={
                    <BlogListPage
                      posts={siteData.posts}
                      categories={siteData.categories}
                      settings={siteData.settings}
                      lang={lang}
                    />
                  }
                />
                <Route
                  path="/blog/:slug"
                  element={
                    <BlogPostPage
                      posts={siteData.posts}
                      categories={siteData.categories}
                      settings={siteData.settings}
                      lang={lang}
                    />
                  }
                />
                <Route
                  path="/projects"
                  element={
                    <ProjectsPage
                      projects={siteData.projects}
                      settings={siteData.settings}
                      lang={lang}
                    />
                  }
                />
                <Route
                  path="/about"
                  element={<AboutPage settings={siteData.settings} lang={lang} />}
                />
                <Route path="*" element={<NotFoundPage lang={lang} />} />
              </Routes>
            </Suspense>
          </div>
          <Footer settings={siteData.settings} lang={lang} />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
