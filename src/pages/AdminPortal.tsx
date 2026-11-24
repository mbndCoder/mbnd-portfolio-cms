import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  GripVertical,
  Headphones,
  Inbox,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminAiAssistant } from '../components/admin/AdminAiAssistant.tsx';
import { AdminAppearancePanel } from '../components/admin/AdminAppearancePanel.tsx';
import { PostBlockBuilder } from '../components/admin/PostBlockBuilder.tsx';
import { BrandLogo, SocialIcon } from '../components/BrandMark.tsx';
import { getAdminDict } from '../lib/adminI18n.ts';
import { createEmptyBlock, normalizeBlocks, reorderArray } from '../lib/blocks.ts';
import { formatDateByLang } from '../lib/i18n.ts';
import { applyThemeToDocument, resolveEffectiveTheme } from '../lib/theme.ts';
import type {
  AiConfigPublic,
  AiPostPatch,
  AiProviderType,
  BlogPost,
  CategoryItem,
  ContactMessage,
  ContentBlock,
  ProjectItem,
  SiteLanguage,
  SiteSettings,
  SocialIconKey,
  SocialPlatformLink,
  UploadedMediaItem,
  VCardExtraField,
  VCardExtraFieldType,
} from '../types/cms.ts';

type AdminTab =
  | 'posts'
  | 'categories'
  | 'projects'
  | 'socials'
  | 'appearance'
  | 'settings'
  | 'inbox'
  | 'media';

interface BootstrapResponse {
  username?: string;
  settings: SiteSettings;
  categories: CategoryItem[];
  posts: BlogPost[];
  projects: ProjectItem[];
  messages: ContactMessage[];
  media: UploadedMediaItem[];
  aiConfig: AiConfigPublic;
}

interface PostDraftSnapshot {
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  excerptEn: string;
  category: string;
  coverImage: string;
  published: boolean;
  blocks: ContentBlock[];
  blocksEn: ContentBlock[];
}

const DRAFT_STORAGE_KEY = 'mbnd_post_draft_v1';
const ADMIN_LANG_STORAGE_KEY = 'mbnd_admin_lang';

function readStoredAdminLang(): SiteLanguage {
  try {
    const saved = localStorage.getItem(ADMIN_LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'fa') return saved;
  } catch {
    // ignore storage errors
  }
  return 'fa';
}

const VCARD_FIELD_TYPE_OPTIONS: Array<{
  value: VCardExtraFieldType;
  label: string;
  labelEn: string;
}> = [
  { value: 'tel', label: 'شماره تماس اضافه', labelEn: 'Extra Phone' },
  { value: 'email', label: 'ایمیل اضافه', labelEn: 'Extra Email' },
  { value: 'url', label: 'لینک / وب‌سایت اضافه', labelEn: 'Extra Link / Website' },
  { value: 'address', label: 'آدرس', labelEn: 'Address' },
  { value: 'note', label: 'یادداشت / برچسب', labelEn: 'Note / Label' },
];

const ICON_OPTIONS: Array<{ value: SocialIconKey; label: string; labelEn: string }> = [
  { value: 'telegram', label: 'تلگرام', labelEn: 'Telegram' },
  { value: 'bale', label: 'بله', labelEn: 'Bale' },
  { value: 'eitaa', label: 'ایتا', labelEn: 'Eitaa' },
  { value: 'rubika', label: 'روبیکا', labelEn: 'Rubika' },
  { value: 'whatsapp', label: 'واتساپ', labelEn: 'WhatsApp' },
  { value: 'instagram', label: 'اینستاگرام', labelEn: 'Instagram' },
  { value: 'youtube', label: 'یوتیوب', labelEn: 'YouTube' },
  { value: 'aparat', label: 'آپارات', labelEn: 'Aparat' },
  { value: 'x', label: 'ایکس (توییتر)', labelEn: 'X (Twitter)' },
  { value: 'github', label: 'گیت‌هاب', labelEn: 'GitHub' },
  { value: 'linkedin', label: 'لینکدین', labelEn: 'LinkedIn' },
  { value: 'discord', label: 'دیسکورد', labelEn: 'Discord' },
  { value: 'virgool', label: 'ویرگول', labelEn: 'Virgool' },
  { value: 'spotify', label: 'اسپاتیفای', labelEn: 'Spotify' },
  { value: 'email', label: 'ایمیل', labelEn: 'Email' },
  { value: 'phone', label: 'تلفن', labelEn: 'Phone' },
  { value: 'globe', label: 'وب‌سایت', labelEn: 'Website' },
];

const MODEL_PRESETS: Record<AiProviderType, string[]> = {
  gemini: ['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-3.1-flash-lite'],
  openai_compatible: ['gpt-4.1-mini', 'gpt-4.1', 'deepseek-chat', 'claude-sonnet-4-5'],
};

let memoryAdminToken = '';

function getStoredToken(): string {
  return memoryAdminToken;
}

function setStoredToken(token: string): void {
  memoryAdminToken = token || '';
}

async function safeJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return {
      error: res.ok
        ? 'پاسخ نامعتبر از سرور دریافت شد.'
        : 'خطای سرور رخ داد. لطفاً دوباره تلاش کن.',
    } as T & { error?: string };
  }
}

function parseSocialArray(raw: string): SocialPlatformLink[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is SocialPlatformLink =>
          Boolean(item) && typeof item.id === 'string' && typeof item.label === 'string',
      );
    }
  } catch {
    // ignore
  }
  return [];
}

function parseVCardExtraArray(raw: string): VCardExtraField[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is VCardExtraField =>
          Boolean(item) && typeof item.id === 'string' && typeof item.type === 'string',
      );
    }
  } catch {
    // ignore
  }
  return [];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readSavedDraft(): PostDraftSnapshot | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PostDraftSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    const blocks = normalizeBlocks(parsed.blocks);
    if (!parsed.title && !parsed.excerpt && blocks.length === 0) return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      titleEn: typeof parsed.titleEn === 'string' ? parsed.titleEn : '',
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : '',
      excerptEn: typeof parsed.excerptEn === 'string' ? parsed.excerptEn : '',
      category: typeof parsed.category === 'string' ? parsed.category : 'یادگیری',
      coverImage: typeof parsed.coverImage === 'string' ? parsed.coverImage : '',
      published: parsed.published !== false,
      blocks: blocks.length > 0 ? blocks : [createEmptyBlock('paragraph')],
      blocksEn: normalizeBlocks(parsed.blocksEn),
    };
  } catch {
    return null;
  }
}

function clearSavedDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function AdminPortal() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [currentAdminUsername, setCurrentAdminUsername] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [adminLang, setAdminLang] = useState<SiteLanguage>(() => readStoredAdminLang());
  const isEn = adminLang === 'en';
  const adminDict = getAdminDict(adminLang);

  const [publicThemeSettings, setPublicThemeSettings] = useState<Partial<SiteSettings>>({});
  const [tab, setTab] = useState<AdminTab>('posts');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [media, setMedia] = useState<UploadedMediaItem[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfigPublic | null>(null);

  // Post Editor State (restores unsaved draft automatically)
  const initialDraft = readSavedDraft();
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [postLangTab, setPostLangTab] = useState<SiteLanguage>('fa');
  const [postTitle, setPostTitle] = useState(initialDraft?.title || '');
  const [postTitleEn, setPostTitleEn] = useState(initialDraft?.titleEn || '');
  const [postSlug, setPostSlug] = useState(initialDraft?.slug || '');
  const [postExcerpt, setPostExcerpt] = useState(initialDraft?.excerpt || '');
  const [postExcerptEn, setPostExcerptEn] = useState(initialDraft?.excerptEn || '');
  const [postCategory, setPostCategory] = useState(initialDraft?.category || 'یادگیری');
  const [postCover, setPostCover] = useState(initialDraft?.coverImage || '');
  const [postPublished, setPostPublished] = useState(initialDraft?.published ?? true);
  const [postBlocks, setPostBlocks] = useState<ContentBlock[]>(
    initialDraft?.blocks || [createEmptyBlock('paragraph')],
  );
  const [postBlocksEn, setPostBlocksEn] = useState<ContentBlock[]>(initialDraft?.blocksEn || []);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<PostDraftSnapshot | null>(null);

  // Category Form & Drag State
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [catName, setCatName] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catDescEn, setCatDescEn] = useState('');
  const [dragCatIndex, setDragCatIndex] = useState<number | null>(null);
  const [dragCatOverIndex, setDragCatOverIndex] = useState<number | null>(null);

  // Project Form & Drag State
  const [editingProjId, setEditingProjId] = useState<number | null>(null);
  const [projTitle, setProjTitle] = useState('');
  const [projTitleEn, setProjTitleEn] = useState('');
  const [projRole, setProjRole] = useState('');
  const [projRoleEn, setProjRoleEn] = useState('');
  const [projPeriod, setProjPeriod] = useState('');
  const [projPeriodEn, setProjPeriodEn] = useState('');
  const [projSummary, setProjSummary] = useState('');
  const [projSummaryEn, setProjSummaryEn] = useState('');
  const [projStack, setProjStack] = useState('');
  const [projUrl, setProjUrl] = useState('');
  const [dragProjIndex, setDragProjIndex] = useState<number | null>(null);
  const [dragProjOverIndex, setDragProjOverIndex] = useState<number | null>(null);

  // Settings copy language sub-tab & AI translation loading states
  const [settingsLangTab, setSettingsLangTab] = useState<SiteLanguage>('fa');
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);

  // Social Links & Drag State
  const [socials, setSocials] = useState<SocialPlatformLink[]>([]);
  const [dragSocialReadyIndex, setDragSocialReadyIndex] = useState<number | null>(null);
  const [dragSocialIndex, setDragSocialIndex] = useState<number | null>(null);
  const [dragSocialOverIndex, setDragSocialOverIndex] = useState<number | null>(null);

  // vCard Extra Fields State
  const [vcardExtraFields, setVcardExtraFields] = useState<VCardExtraField[]>([]);

  // AI Settings Form State
  const [aiProvider, setAiProvider] = useState<AiProviderType>('gemini');
  const [aiModel, setAiModel] = useState('gemini-4-hydrogen');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKeyInput, setAiApiKeyInput] = useState('');
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Security Credentials Form State
  const [secCurrentPassword, setSecCurrentPassword] = useState('');
  const [secNewUsername, setSecNewUsername] = useState('');
  const [secNewPassword, setSecNewPassword] = useState('');
  const [secConfirmPassword, setSecConfirmPassword] = useState('');

  const [copiedUrl, setCopiedUrl] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const localizeAdminStatus = (msg: string): string => {
    if (adminLang !== 'en') return msg;
    const map: Record<string, string> = {
      'تنظیمات سایت ذخیره شد.': 'Site settings saved.',
      'فایل با موفقیت روی سرور ذخیره شد.': 'File uploaded and saved on server.',
      'نوشته برای همیشه حذف شد.': 'Post permanently deleted.',
      'پروژه حذف شد.': 'Project deleted.',
      'دکمه‌های پیام‌رسان و لینک‌ها ذخیره شد.': 'Social links saved.',
      'تنظیمات هوش مصنوعی به‌صورت رمزنگاری‌شده ذخیره شد.': 'AI settings saved (encrypted).',
      'کلید سفارشی هوش مصنوعی حذف شد.': 'Custom AI API key removed.',
      'نام کاربری/رمز عبور به‌روزرسانی شد و همه نشست‌های قبلی باطل شدند.':
        'Credentials updated and all previous sessions revoked.',
      'پیام حذف شد.': 'Message deleted.',
      'فایل حذف شد.': 'File deleted.',
      'نشست مدیریت منقضی شده؛ لطفاً دوباره وارد شو.':
        'Admin session expired. Please sign in again.',
      'خطا در دریافت اطلاعات پنل.': 'Failed to load admin portal data.',
      'آپلود فایل ناموفق بود.': 'File upload failed.',
      'خطا در اتصال به سرور هنگام آپلود فایل.': 'Network error while uploading file.',
      'حذف نوشته ناموفق بود.': 'Failed to delete post.',
      'خطا در اتصال به سرور.': 'Network connection error.',
      'ذخیره ترتیب دسته‌بندی‌ها ناموفق بود.': 'Failed to save category order.',
      'ذخیره دسته‌بندی ناموفق بود.': 'Failed to save category.',
      'ذخیره ترتیب پروژه‌ها ناموفق بود.': 'Failed to save project order.',
      'ذخیره پروژه ناموفق بود.': 'Failed to save project.',
      'حذف پروژه ناموفق بود.': 'Failed to delete project.',
      'ذخیره دکمه‌های پیام‌رسان ناموفق بود.': 'Failed to save social links.',
      'ذخیره تنظیمات ناموفق بود.': 'Failed to save site settings.',
      'ذخیره تنظیمات هوش مصنوعی ناموفق بود.': 'Failed to save AI settings.',
      'حذف کلید سفارشی ناموفق بود.': 'Failed to remove custom API key.',
      'رمز عبور فعلی را وارد کن.': 'Enter your current password.',
      'رمز عبور جدید و تکرار آن یکسان نیست.': 'New password and confirmation do not match.',
      'تغییر اطلاعات ورود ناموفق بود.': 'Failed to update credentials.',
      'حذف فایل ناموفق بود.': 'Failed to delete file.',
    };
    return map[msg] || msg;
  };

  const flashNotice = (msg: string) => {
    const localized = localizeAdminStatus(msg);
    setErrorMsg('');
    setNotice(localized);
    setTimeout(() => {
      setNotice((prev) => (prev === localized ? '' : prev));
    }, 4000);
  };

  const flashError = (msg: string) => {
    setNotice('');
    setErrorMsg(localizeAdminStatus(msg));
  };

  const handleToggleAdminLang = () => {
    const next: SiteLanguage = adminLang === 'fa' ? 'en' : 'fa';
    setAdminLang(next);
    try {
      localStorage.setItem(ADMIN_LANG_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  // Sync Admin Portal language & writing direction
  useEffect(() => {
    document.documentElement.lang = adminLang;
    document.documentElement.dir = adminLang === 'en' ? 'ltr' : 'rtl';
    document.title =
      adminLang === 'en' ? 'Admin Portal | Mohammad Bagher' : 'پنل مدیریت | Mohammad Bagher';
  }, [adminLang]);

  // Fetch public theme settings on mount so even the login screen mirrors site theme & colors
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/site', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.settings) {
          setPublicThemeSettings(data.settings as Partial<SiteSettings>);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Live theme & palette sync for the entire Admin Portal
  useEffect(() => {
    const activeThemeSettings = settings || publicThemeSettings;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const effective = resolveEffectiveTheme(activeThemeSettings.themeMode || 'dark', mq.matches);
      applyThemeToDocument(activeThemeSettings, effective);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings, publicThemeSettings]);

  // Auto-save unsaved new post draft so user content is never lost
  useEffect(() => {
    if (!authenticated || editingPostId !== null) return;
    const hasContent =
      postTitle.trim().length > 0 ||
      postTitleEn.trim().length > 0 ||
      postExcerpt.trim().length > 0 ||
      postBlocks.some((b) => ('text' in b && b.text.trim()) || ('url' in b && b.url.trim()));
    if (!hasContent) return;
    try {
      const snapshot: PostDraftSnapshot = {
        title: postTitle,
        titleEn: postTitleEn,
        slug: postSlug,
        excerpt: postExcerpt,
        excerptEn: postExcerptEn,
        category: postCategory,
        coverImage: postCover,
        published: postPublished,
        blocks: postBlocks,
        blocksEn: postBlocksEn,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore storage quota
    }
  }, [
    authenticated,
    editingPostId,
    postTitle,
    postTitleEn,
    postSlug,
    postExcerpt,
    postExcerptEn,
    postCategory,
    postCover,
    postPublished,
    postBlocks,
    postBlocksEn,
  ]);

  const adminFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const token = getStoredToken();
    const headers = new Headers(init.headers);
    headers.set('X-Requested-With', 'XMLHttpRequest');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(input, {
      ...init,
      headers,
      credentials: 'include',
    });
    if (res.status === 401) {
      setStoredToken('');
      setAuthenticated(false);
    }
    return res;
  }, []);

  const syncAiForm = (cfg: AiConfigPublic) => {
    setAiConfig(cfg);
    setAiProvider(cfg.provider);
    setAiModel(cfg.model);
    setAiBaseUrl(cfg.baseUrl);
    setAiApiKeyInput('');
  };

  const loadBootstrap = useCallback(async () => {
    const res = await adminFetch('/api/admin/bootstrap');
    if (!res.ok) {
      if (res.status === 401) {
        flashError(
          isEn
            ? 'Admin session expired; please sign in again.'
            : 'نشست مدیریت منقضی شده؛ لطفاً دوباره وارد شو.',
        );
      }
      return;
    }
    const data = await safeJson<BootstrapResponse>(res);
    if (!data.settings) {
      flashError(data.error || (isEn ? 'Failed to load panel data.' : 'خطا در دریافت اطلاعات پنل.'));
      return;
    }
    if (data.username) {
      setCurrentAdminUsername(data.username);
      setSecNewUsername(data.username);
    }
    setSettings(data.settings);
    setCategories(data.categories || []);
    setPosts(data.posts || []);
    setProjects(data.projects || []);
    setMessages(data.messages || []);
    setMedia(data.media || []);
    setSocials(parseSocialArray(data.settings.socialLinksJson));
    setVcardExtraFields(parseVCardExtraArray(data.settings.vcardExtraFieldsJson || '[]'));
    if (data.aiConfig) {
      syncAiForm(data.aiConfig);
    }
    if (data.categories && data.categories.length > 0) {
      setPostCategory((prev) =>
        data.categories.some((c) => c.name === prev) ? prev : data.categories[0].name,
      );
    }
  }, [adminFetch]);

  useEffect(() => {
    adminFetch('/api/admin/session')
      .then((res) =>
        safeJson<{ authenticated?: boolean; username?: string; needsSetup?: boolean }>(res),
      )
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        setNeedsSetup(Boolean(data.needsSetup));
        if (data.username) {
          setCurrentAdminUsername(data.username);
          setSecNewUsername(data.username);
        }
        if (data.authenticated) {
          void loadBootstrap();
        }
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthChecked(true));
  }, [adminFetch, loadBootstrap]);

  const handleFirstRunSetup = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError('');
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setLoginError(
        isEn
          ? 'Please enter your desired username and password.'
          : 'نام کاربری و رمز عبور دلخواه را وارد کن.',
      );
      return;
    }
    if (password !== setupConfirmPassword) {
      setLoginError(
        isEn
          ? 'Password and confirmation do not match.'
          : 'رمز عبور و تکرار آن یکسان نیستند.',
      );
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ username: trimmedUser, password }),
      });
      const data = await safeJson<{ ok?: boolean; token?: string; username?: string }>(res);
      if (!res.ok || !data.ok) {
        setLoginError(
          data.error ||
            (isEn ? 'Failed to initialize admin account.' : 'خطا در راه‌اندازی اولیه حساب مدیر.'),
        );
        return;
      }
      if (data.token) {
        setStoredToken(data.token);
      }
      if (data.username) {
        setCurrentAdminUsername(data.username);
        setSecNewUsername(data.username);
      }
      setNeedsSetup(false);
      setAuthenticated(true);
      setPassword('');
      setSetupConfirmPassword('');
      await loadBootstrap();
    } catch {
      setLoginError(
        isEn ? 'Unable to connect to the server.' : 'خطا در برقراری ارتباط با سرور.',
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError('');
    if (!username.trim() || !password) {
      setLoginError(
        isEn ? 'Please enter username and password.' : 'نام کاربری و رمز عبور را وارد کن.',
      );
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await safeJson<{ ok?: boolean; token?: string; username?: string }>(res);
      if (!res.ok || !data.ok) {
        setLoginError(
          data.error ||
            (isEn ? 'Invalid username or password.' : 'نام کاربری یا رمز عبور اشتباه است.'),
        );
        return;
      }
      if (data.token) {
        setStoredToken(data.token);
      }
      if (data.username) {
        setCurrentAdminUsername(data.username);
        setSecNewUsername(data.username);
      }
      setAuthenticated(true);
      setPassword('');
      await loadBootstrap();
    } catch {
      setLoginError(
        isEn ? 'Unable to connect to the server.' : 'خطا در برقراری ارتباط با سرور.',
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await adminFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setStoredToken('');
    setAuthenticated(false);
  };

  const uploadLocalFile = async (file: File): Promise<string | null> => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await adminFetch('/api/admin/upload', {
        method: 'POST',
        body: form,
      });
      const data = await safeJson<{ file?: UploadedMediaItem }>(res);
      if (!res.ok || !data.file) {
        flashError(data.error || (isEn ? 'File upload failed.' : 'آپلود فایل ناموفق بود.'));
        return null;
      }
      setMedia((prev) => [data.file!, ...prev.filter((m) => m.filename !== data.file!.filename)]);
      flashNotice(
        isEn
          ? 'File uploaded successfully to Cloudinary.'
          : 'فایل با موفقیت روی Cloudinary آپلود شد.',
      );
      return data.file.url;
    } catch {
      flashError(
        isEn
          ? 'Server connection error while uploading file.'
          : 'خطا در اتصال به سرور هنگام آپلود فایل.',
      );
      return null;
    }
  };

  // ==================== AI BILINGUAL TRANSLATION ====================
  const callAiTranslate = async (
    key: string,
    kind: 'post' | 'category' | 'project' | 'settings',
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    setTranslatingKey(key);
    try {
      const res = await adminFetch('/api/admin/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, payload }),
      });
      const data = await safeJson<{ translated?: Record<string, unknown> }>(res);
      if (!res.ok || !data.translated) {
        flashError(
          data.error ||
            (isEn
              ? 'AI translation failed. Check your API key in Settings.'
              : 'ترجمه هوشمند ناموفق بود. تنظیمات API را در تب تنظیمات بررسی کن.'),
        );
        return null;
      }
      flashNotice(adminDict.aiTranslatedOk);
      return data.translated;
    } catch {
      flashError(isEn ? 'Network error during AI translation.' : 'خطا در اتصال به سرور هنگام ترجمه هوشمند.');
      return null;
    } finally {
      setTranslatingKey(null);
    }
  };

  const handleTranslatePostToEn = async () => {
    if (!postTitle.trim()) {
      flashError(
        isEn ? 'Enter the Persian title first before translating.' : 'ابتدا عنوان فارسی مقاله را وارد کن.',
      );
      return;
    }
    const translated = await callAiTranslate('post', 'post', {
      title: postTitle,
      excerpt: postExcerpt,
      blocks: postBlocks,
    });
    if (!translated) return;
    if (typeof translated.titleEn === 'string') setPostTitleEn(translated.titleEn);
    if (typeof translated.excerptEn === 'string') setPostExcerptEn(translated.excerptEn);
    if (Array.isArray(translated.blocksEn)) {
      setPostBlocksEn(normalizeBlocks(translated.blocksEn));
    }
    setPostLangTab('en');
  };

  const handleTranslateCategoryToEn = async () => {
    if (!catName.trim()) {
      flashError(isEn ? 'Enter the Persian category name first.' : 'ابتدا نام فارسی دسته‌بندی را وارد کن.');
      return;
    }
    const translated = await callAiTranslate('category', 'category', {
      name: catName,
      description: catDesc,
    });
    if (!translated) return;
    if (typeof translated.nameEn === 'string') setCatNameEn(translated.nameEn);
    if (typeof translated.descriptionEn === 'string') setCatDescEn(translated.descriptionEn);
  };

  const handleTranslateProjectToEn = async () => {
    if (!projTitle.trim()) {
      flashError(isEn ? 'Enter the Persian project title first.' : 'ابتدا عنوان فارسی پروژه را وارد کن.');
      return;
    }
    const translated = await callAiTranslate('project', 'project', {
      title: projTitle,
      role: projRole,
      period: projPeriod,
      summary: projSummary,
    });
    if (!translated) return;
    if (typeof translated.titleEn === 'string') setProjTitleEn(translated.titleEn);
    if (typeof translated.roleEn === 'string') setProjRoleEn(translated.roleEn);
    if (typeof translated.periodEn === 'string') setProjPeriodEn(translated.periodEn);
    if (typeof translated.summaryEn === 'string') setProjSummaryEn(translated.summaryEn);
  };

  const handleTranslateSiteCopy = async () => {
    if (!settings) return;
    const translated = await callAiTranslate('settings', 'settings', {
      heroTitle: settings.heroTitle,
      heroSubtitle: settings.heroSubtitle,
      blogSectionTitle: settings.blogSectionTitle,
      blogPageTitle: settings.blogPageTitle,
      blogPageSubtitle: settings.blogPageSubtitle,
      projectsSectionTitle: settings.projectsSectionTitle,
      projectsPageSubtitle: settings.projectsPageSubtitle,
      aboutTitle: settings.aboutTitle,
      aboutBio: settings.aboutBio,
      aboutFocusHeading: settings.aboutFocusHeading,
      aboutFocusText: settings.aboutFocusText,
      aboutConnectHeading: settings.aboutConnectHeading,
      contactFormHeading: settings.contactFormHeading,
      contactSuccessMessage: settings.contactSuccessMessage,
      vcardButtonLabel: settings.vcardButtonLabel,
      footerText: settings.footerText,
      shareHeading: settings.shareHeading,
      shareSubtitle: settings.shareSubtitle,
    });
    if (!translated) return;
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const keys = [
        'heroTitleEn',
        'heroSubtitleEn',
        'blogSectionTitleEn',
        'blogPageTitleEn',
        'blogPageSubtitleEn',
        'projectsSectionTitleEn',
        'projectsPageSubtitleEn',
        'aboutTitleEn',
        'aboutBioEn',
        'aboutFocusHeadingEn',
        'aboutFocusTextEn',
        'aboutConnectHeadingEn',
        'contactFormHeadingEn',
        'contactSuccessMessageEn',
        'vcardButtonLabelEn',
        'footerTextEn',
        'shareHeadingEn',
        'shareSubtitleEn',
      ] as const;
      for (const k of keys) {
        if (typeof translated[k] === 'string' && translated[k].trim()) {
          next[k] = translated[k].trim();
        }
      }
      return next;
    });
    setSettingsLangTab('en');
  };

  // ==================== POSTS ====================
  const resetPostForm = () => {
    setEditingPostId(null);
    setPostLangTab('fa');
    setPostTitle('');
    setPostTitleEn('');
    setPostSlug('');
    setPostExcerpt('');
    setPostExcerptEn('');
    setPostCategory(categories[0]?.name || 'یادگیری');
    setPostCover('');
    setPostPublished(true);
    setPostBlocks([createEmptyBlock('paragraph')]);
    setPostBlocksEn([]);
    setUndoSnapshot(null);
    clearSavedDraft();
  };

  const startEditPost = (post: BlogPost) => {
    setEditingPostId(post.id);
    setPostLangTab('fa');
    setPostTitle(post.title);
    setPostTitleEn(post.titleEn || '');
    setPostSlug(post.slug);
    setPostExcerpt(post.excerpt);
    setPostExcerptEn(post.excerptEn || '');
    setPostCategory(post.category || categories[0]?.name || 'یادگیری');
    setPostCover(post.coverImage);
    setPostPublished(post.published);
    setPostBlocks(post.blocks.length > 0 ? post.blocks : [createEmptyBlock('paragraph')]);
    setPostBlocksEn(Array.isArray(post.blocksEn) ? post.blocksEn : []);
    setUndoSnapshot(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleApplyAiPatch = (patch: AiPostPatch) => {
    setUndoSnapshot({
      title: postTitle,
      titleEn: postTitleEn,
      slug: postSlug,
      excerpt: postExcerpt,
      excerptEn: postExcerptEn,
      category: postCategory,
      coverImage: postCover,
      published: postPublished,
      blocks: postBlocks,
      blocksEn: postBlocksEn,
    });

    const targetLang: SiteLanguage = patch.targetLang || postLangTab;
    const isTargetEn = targetLang === 'en';

    if (patch.title) {
      if (isTargetEn) setPostTitleEn(patch.title);
      else setPostTitle(patch.title);
    }
    if (patch.slug) setPostSlug(patch.slug);
    if (patch.excerpt) {
      if (isTargetEn) setPostExcerptEn(patch.excerpt);
      else setPostExcerpt(patch.excerpt);
    }
    if (patch.category && categories.some((c) => c.name === patch.category)) {
      setPostCategory(patch.category);
    }

    const applyBlockChanges = (prev: ContentBlock[]): ContentBlock[] => {
      let next = [...prev];
      if (patch.mode === 'patch_blocks' || patch.blockUpdates || patch.removeBlockIndices) {
        if (patch.blockUpdates && patch.blockUpdates.length > 0) {
          for (const upd of patch.blockUpdates) {
            if (upd.index >= 0 && upd.index < next.length) {
              next[upd.index] = { ...upd.block, id: next[upd.index].id };
            } else if (upd.index >= next.length) {
              next.push(upd.block);
            }
          }
        }
        if (patch.removeBlockIndices && patch.removeBlockIndices.length > 0) {
          const removeSet = new Set(patch.removeBlockIndices);
          next = next.filter((_, idx) => !removeSet.has(idx));
        }
        if (patch.blocks && patch.blocks.length > 0) {
          next = [...next, ...patch.blocks];
        }
        return next.length > 0 ? next : [createEmptyBlock('paragraph')];
      }

      if (patch.blocks && patch.blocks.length > 0) {
        if (patch.mode === 'append') {
          return [...next, ...patch.blocks];
        }
        if (patch.mode === 'replace') {
          return patch.blocks;
        }
      }
      return next;
    };

    if (
      patch.mode === 'patch_blocks' ||
      (patch.blockUpdates && patch.blockUpdates.length > 0) ||
      (patch.removeBlockIndices && patch.removeBlockIndices.length > 0) ||
      (patch.blocks && patch.blocks.length > 0)
    ) {
      if (isTargetEn) {
        setPostBlocksEn(applyBlockChanges);
      } else {
        setPostBlocks(applyBlockChanges);
      }
    }

    flashNotice(
      isEn
        ? 'AI suggestion applied to the editor (you can undo anytime).'
        : 'پیشنهاد هوش مصنوعی روی ویرایشگر اعمال شد (در صورت نیاز می‌توانی بازگردانی کنی).',
    );
  };

  const handleUndoAiPatch = () => {
    if (!undoSnapshot) return;
    setPostTitle(undoSnapshot.title);
    setPostTitleEn(undoSnapshot.titleEn);
    setPostSlug(undoSnapshot.slug);
    setPostExcerpt(undoSnapshot.excerpt);
    setPostExcerptEn(undoSnapshot.excerptEn);
    setPostCategory(undoSnapshot.category);
    setPostCover(undoSnapshot.coverImage);
    setPostPublished(undoSnapshot.published);
    setPostBlocks(undoSnapshot.blocks);
    setPostBlocksEn(undoSnapshot.blocksEn);
    setUndoSnapshot(null);
    flashNotice(isEn ? 'Post restored to previous version.' : 'مقاله به نسخه قبلی بازگردانده شد.');
  };

  const handleSavePost = async (event: FormEvent) => {
    event.preventDefault();
    if (!postTitle.trim()) {
      flashError(isEn ? 'Please enter a post title.' : 'عنوان نوشته را وارد کن.');
      return;
    }
    setBusyAction(true);
    try {
      const payload = {
        title: postTitle.trim(),
        titleEn: postTitleEn.trim(),
        slug: postSlug.trim() || undefined,
        excerpt: postExcerpt.trim() || postTitle.trim(),
        excerptEn: postExcerptEn.trim(),
        category: postCategory.trim() || categories[0]?.name || 'یادگیری',
        coverImage: postCover.trim(),
        blocks: normalizeBlocks(postBlocks),
        blocksEn: normalizeBlocks(postBlocksEn),
        published: postPublished,
      };
      const url = editingPostId ? `/api/admin/posts/${editingPostId}` : '/api/admin/posts';
      const method = editingPostId ? 'PUT' : 'POST';
      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await safeJson<{ post?: BlogPost }>(res);
      if (!res.ok || !data.post) {
        flashError(
          data.error ||
            (isEn
              ? 'Failed to save post. Your draft is preserved.'
              : 'ذخیره نوشته ناموفق بود. محتوای شما حفظ شده است.'),
        );
        return;
      }
      setPosts((prev) =>
        editingPostId
          ? prev.map((p) => (p.id === data.post!.id ? data.post! : p))
          : [data.post!, ...prev],
      );
      flashNotice(
        editingPostId
          ? isEn
            ? 'Post updated successfully.'
            : 'نوشته با موفقیت به‌روزرسانی شد.'
          : isEn
            ? 'Post published successfully.'
            : 'نوشته جدید با موفقیت منتشر شد.',
      );
      resetPostForm();
    } catch {
      flashError(
        isEn
          ? 'Connection error. Your draft is safely preserved.'
          : 'خطا در اتصال به سرور. متن نوشته حفظ شده و پاک نشده است.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeletePost = async (id: number) => {
    try {
      const res = await adminFetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        flashError(isEn ? 'Failed to delete post.' : 'حذف نوشته ناموفق بود.');
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== id));
      if (editingPostId === id) resetPostForm();
      flashNotice(isEn ? 'Post permanently deleted.' : 'نوشته برای همیشه حذف شد.');
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    }
  };

  // ==================== CATEGORIES (DRAG & DROP) ====================
  const resetCategoryForm = () => {
    setEditingCatId(null);
    setCatName('');
    setCatNameEn('');
    setCatDesc('');
    setCatDescEn('');
  };

  const startEditCategory = (cat: CategoryItem) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatNameEn(cat.nameEn || '');
    setCatDesc(cat.description);
    setCatDescEn(cat.descriptionEn || '');
  };

  const persistCategoryOrder = async (nextCategories: CategoryItem[]) => {
    setCategories(nextCategories);
    try {
      const res = await adminFetch('/api/admin/categories/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: nextCategories.map((c) => c.id) }),
      });
      const data = await safeJson<{ categories?: CategoryItem[] }>(res);
      if (!res.ok) {
        flashError(data.error || 'ذخیره ترتیب دسته‌بندی‌ها ناموفق بود.');
        return;
      }
      if (data.categories) setCategories(data.categories);
      flashNotice(isEn ? 'Category order saved.' : 'ترتیب نمایش دسته‌بندی‌ها ذخیره شد.');
    } catch {
      flashError(isEn ? 'Failed to save category order.' : 'خطا در ذخیره ترتیب دسته‌بندی‌ها.');
    }
  };

  const handleSaveCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!catName.trim()) {
      flashError(isEn ? 'Enter the category name.' : 'نام دسته‌بندی را وارد کن.');
      return;
    }
    setBusyAction(true);
    try {
      const url = editingCatId
        ? `/api/admin/categories/${editingCatId}`
        : '/api/admin/categories';
      const method = editingCatId ? 'PUT' : 'POST';
      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: catName.trim(),
          nameEn: catNameEn.trim(),
          description: catDesc.trim(),
          descriptionEn: catDescEn.trim(),
        }),
      });
      const data = await safeJson<{ category?: CategoryItem }>(res);
      if (!res.ok || !data.category) {
        flashError(data.error || 'ذخیره دسته‌بندی ناموفق بود.');
        return;
      }
      await loadBootstrap();
      flashNotice(
        editingCatId
          ? isEn
            ? 'Category updated.'
            : 'دسته‌بندی ویرایش شد.'
          : isEn
            ? 'Category created.'
            : 'دسته‌بندی جدید اضافه شد.',
      );
      resetCategoryForm();
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    const res = await adminFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      flashError(isEn ? 'Failed to delete category.' : 'حذف دسته‌بندی ناموفق بود.');
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (editingCatId === id) resetCategoryForm();
    flashNotice(isEn ? 'Category deleted.' : 'دسته‌بندی حذف شد.');
  };

  // ==================== PROJECTS (DRAG & DROP) ====================
  const resetProjectForm = () => {
    setEditingProjId(null);
    setProjTitle('');
    setProjTitleEn('');
    setProjRole('');
    setProjRoleEn('');
    setProjPeriod('');
    setProjPeriodEn('');
    setProjSummary('');
    setProjSummaryEn('');
    setProjStack('');
    setProjUrl('');
  };

  const startEditProject = (proj: ProjectItem) => {
    setEditingProjId(proj.id);
    setProjTitle(proj.title);
    setProjTitleEn(proj.titleEn || '');
    setProjRole(proj.role);
    setProjRoleEn(proj.roleEn || '');
    setProjPeriod(proj.period);
    setProjPeriodEn(proj.periodEn || '');
    setProjSummary(proj.summary);
    setProjSummaryEn(proj.summaryEn || '');
    setProjStack(proj.stack.join(', '));
    setProjUrl(proj.url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const persistProjectOrder = async (nextProjects: ProjectItem[]) => {
    setProjects(nextProjects);
    try {
      const res = await adminFetch('/api/admin/projects/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: nextProjects.map((p) => p.id) }),
      });
      const data = await safeJson<{ projects?: ProjectItem[] }>(res);
      if (!res.ok) {
        flashError(data.error || 'ذخیره ترتیب پروژه‌ها ناموفق بود.');
        return;
      }
      if (data.projects) setProjects(data.projects);
      flashNotice(isEn ? 'Project order saved.' : 'ترتیب نمایش پروژه‌ها ذخیره شد.');
    } catch {
      flashError(isEn ? 'Failed to save project order.' : 'خطا در ذخیره ترتیب پروژه‌ها.');
    }
  };

  const handleSaveProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!projTitle.trim()) {
      flashError(isEn ? 'Enter the project title.' : 'عنوان پروژه را وارد کن.');
      return;
    }
    setBusyAction(true);
    try {
      const payload = {
        title: projTitle.trim(),
        titleEn: projTitleEn.trim(),
        role: projRole.trim(),
        roleEn: projRoleEn.trim(),
        period: projPeriod.trim(),
        periodEn: projPeriodEn.trim(),
        summary: projSummary.trim(),
        summaryEn: projSummaryEn.trim(),
        stack: projStack
          .split(/[،,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        url: projUrl.trim(),
        featured: true,
        sortOrder: editingProjId
          ? projects.find((p) => p.id === editingProjId)?.sortOrder ?? 0
          : projects.length + 1,
      };
      const url = editingProjId
        ? `/api/admin/projects/${editingProjId}`
        : '/api/admin/projects';
      const method = editingProjId ? 'PUT' : 'POST';
      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await safeJson<{ project?: ProjectItem }>(res);
      if (!res.ok || !data.project) {
        flashError(data.error || 'ذخیره پروژه ناموفق بود.');
        return;
      }
      setProjects((prev) =>
        editingProjId
          ? prev.map((p) => (p.id === data.project!.id ? data.project! : p))
          : [...prev, data.project!],
      );
      flashNotice(
        editingProjId
          ? isEn
            ? 'Project updated.'
            : 'پروژه به‌روزرسانی شد.'
          : isEn
            ? 'Project added.'
            : 'پروژه جدید ثبت شد.',
      );
      resetProjectForm();
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteProject = async (id: number) => {
    const res = await adminFetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      flashError(isEn ? 'Failed to delete project.' : 'حذف پروژه ناموفق بود.');
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (editingProjId === id) resetProjectForm();
    flashNotice(isEn ? 'Project deleted.' : 'پروژه حذف شد.');
  };

  // ==================== SOCIALS (DRAG & DROP) ====================
  const addSocialPlatform = () => {
    setSocials((prev) => [
      ...prev,
      {
        id: `soc_${Date.now().toString(36)}`,
        label: 'لینک جدید',
        labelEn: 'New Link',
        handle: '',
        url: 'https://',
        iconKey: 'globe',
        enabled: true,
      },
    ]);
  };

  const updateSocialItem = (index: number, patch: Partial<SocialPlatformLink>) => {
    setSocials((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const moveSocialItem = (index: number, dir: -1 | 1) => {
    setSocials((prev) => reorderArray(prev, index, index + dir));
  };

  const removeSocialItem = (index: number) => {
    setSocials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveSocials = async () => {
    setBusyAction(true);
    try {
      const cleaned = socials
        .filter((s) => s.label.trim() && s.url.trim())
        .map((s) => ({
          ...s,
          label: s.label.trim(),
          labelEn: (s.labelEn || '').trim(),
          handle: s.handle.trim(),
          url: s.url.trim(),
        }));
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socialLinksJson: JSON.stringify(cleaned) }),
      });
      const data = await safeJson<{ settings?: SiteSettings }>(res);
      if (!res.ok || !data.settings) {
        flashError(
          data.error ||
            (isEn ? 'Failed to save social links.' : 'ذخیره دکمه‌های پیام‌رسان ناموفق بود.'),
        );
        return;
      }
      setSettings(data.settings);
      setSocials(parseSocialArray(data.settings.socialLinksJson));
      flashNotice(
        isEn ? 'Social links saved.' : 'دکمه‌های پیام‌رسان و لینک‌ها ذخیره شد.',
      );
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    } finally {
      setBusyAction(false);
    }
  };

  // ==================== SETTINGS & VCARD ====================
  const addVCardExtraField = () => {
    setVcardExtraFields((prev) => [
      ...prev,
      {
        id: `vcf_${Date.now().toString(36)}`,
        type: 'tel',
        label: '',
        value: '',
      },
    ]);
  };

  const updateVCardExtraField = (index: number, patch: Partial<VCardExtraField>) => {
    setVcardExtraFields((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const removeVCardExtraField = (index: number) => {
    setVcardExtraFields((prev) => prev.filter((_, i) => i !== index));
  };

  const persistCurrentSettings = async () => {
    if (!settings) return;
    setBusyAction(true);
    try {
      const cleanedExtraFields = vcardExtraFields
        .filter((f) => f.value.trim().length > 0)
        .map((f) => ({
          ...f,
          label: f.label.trim(),
          value: f.value.trim(),
        }));
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          socialLinksJson: JSON.stringify(socials),
          vcardExtraFieldsJson: JSON.stringify(cleanedExtraFields),
        }),
      });
      const data = await safeJson<{ settings?: SiteSettings }>(res);
      if (!res.ok || !data.settings) {
        flashError(
          data.error || (isEn ? 'Failed to save site settings.' : 'ذخیره تنظیمات ناموفق بود.'),
        );
        return;
      }
      setSettings(data.settings);
      setVcardExtraFields(parseVCardExtraArray(data.settings.vcardExtraFieldsJson || '[]'));
      flashNotice(isEn ? 'Site settings saved.' : 'تنظیمات سایت ذخیره شد.');
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSettings = async (event: FormEvent) => {
    event.preventDefault();
    await persistCurrentSettings();
  };

  // ==================== AI PROVIDER CONFIG ====================
  const handleSaveAiConfig = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction(true);
    try {
      const res = await adminFetch('/api/admin/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim(),
          baseUrl: aiBaseUrl.trim(),
          apiKey: aiApiKeyInput.trim() || undefined,
        }),
      });
      const data = await safeJson<{ aiConfig?: AiConfigPublic }>(res);
      if (!res.ok || !data.aiConfig) {
        flashError(
          data.error ||
            (isEn ? 'Failed to save AI settings.' : 'ذخیره تنظیمات هوش مصنوعی ناموفق بود.'),
        );
        return;
      }
      syncAiForm(data.aiConfig);
      flashNotice(
        isEn
          ? 'AI settings encrypted and saved.'
          : 'تنظیمات هوش مصنوعی به‌صورت رمزنگاری‌شده ذخیره شد.',
      );
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearCustomAiKey = async () => {
    setBusyAction(true);
    try {
      const res = await adminFetch('/api/admin/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearCustomApiKey: true }),
      });
      const data = await safeJson<{ aiConfig?: AiConfigPublic }>(res);
      if (!res.ok || !data.aiConfig) {
        flashError(
          data.error ||
            (isEn ? 'Failed to remove custom API key.' : 'حذف کلید سفارشی ناموفق بود.'),
        );
        return;
      }
      syncAiForm(data.aiConfig);
      flashNotice(
        isEn ? 'Custom AI API key removed.' : 'کلید سفارشی هوش مصنوعی حذف شد.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleTestAiConnection = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await adminFetch('/api/admin/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim(),
          baseUrl: aiBaseUrl.trim(),
          apiKey: aiApiKeyInput.trim() || undefined,
        }),
      });
      const data = await safeJson<{ ok?: boolean; model?: string; reply?: string }>(res);
      if (!res.ok || !data.ok) {
        const msg = data.error || (isEn ? 'Connection test failed.' : 'تست اتصال ناموفق بود.');
        setAiTestResult({ ok: false, text: msg });
        flashError(msg);
        return;
      }
      const okMsg = isEn
        ? `Connected successfully (${data.model || aiModel}): ${data.reply || 'Ready'}`
        : `اتصال با موفقیت برقرار شد (${data.model || aiModel}): ${data.reply || 'آماده'}`;
      setAiTestResult({ ok: true, text: okMsg });
      flashNotice(okMsg);
    } catch {
      const msg = isEn ? 'Error testing AI connection.' : 'خطا در تست اتصال هوش مصنوعی.';
      setAiTestResult({ ok: false, text: msg });
      flashError(msg);
    } finally {
      setTestingAi(false);
    }
  };

  // ==================== SECURITY CREDENTIALS & SESSIONS ====================
  const handleChangeCredentials = async (event: FormEvent) => {
    event.preventDefault();
    if (!secCurrentPassword) {
      flashError(isEn ? 'Enter your current password.' : 'رمز عبور فعلی را وارد کن.');
      return;
    }
    if (secNewPassword && secNewPassword !== secConfirmPassword) {
      flashError(
        isEn
          ? 'New password and confirmation do not match.'
          : 'رمز عبور جدید و تکرار آن یکسان نیست.',
      );
      return;
    }
    setBusyAction(true);
    try {
      const res = await adminFetch('/api/admin/security/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: secCurrentPassword,
          newUsername: secNewUsername.trim() !== currentAdminUsername ? secNewUsername.trim() : undefined,
          newPassword: secNewPassword || undefined,
        }),
      });
      const data = await safeJson<{ ok?: boolean; username?: string; token?: string }>(res);
      if (!res.ok || !data.ok) {
        flashError(
          data.error ||
            (isEn ? 'Failed to update credentials.' : 'تغییر اطلاعات ورود ناموفق بود.'),
        );
        return;
      }
      if (data.token) setStoredToken(data.token);
      if (data.username) {
        setCurrentAdminUsername(data.username);
        setSecNewUsername(data.username);
      }
      setSecCurrentPassword('');
      setSecNewPassword('');
      setSecConfirmPassword('');
      flashNotice(
        isEn
          ? 'Credentials updated and all previous sessions revoked.'
          : 'نام کاربری/رمز عبور به‌روزرسانی شد و همه نشست‌های قبلی باطل شدند.',
      );
    } catch {
      flashError(isEn ? 'Connection error.' : 'خطا در اتصال به سرور.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setBusyAction(true);
    try {
      await adminFetch('/api/admin/security/revoke-all', { method: 'POST' });
      setStoredToken('');
      setAuthenticated(false);
    } finally {
      setBusyAction(false);
    }
  };

  // ==================== MESSAGES & MEDIA ====================
  const handleToggleRead = async (msg: ContactMessage) => {
    const res = await adminFetch(`/api/admin/messages/${msg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: !msg.read }),
    });
    if (!res.ok) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: !m.read } : m)),
    );
  };

  const handleDeleteMessage = async (id: number) => {
    const res = await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    flashNotice(isEn ? 'Message deleted.' : 'پیام حذف شد.');
  };

  const handleDeleteMedia = async (filename: string) => {
    const res = await adminFetch(`/api/admin/media/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      flashError(isEn ? 'Failed to delete file.' : 'حذف فایل ناموفق بود.');
      return;
    }
    setMedia((prev) => prev.filter((m) => m.filename !== filename));
    flashNotice(isEn ? 'File deleted.' : 'فایل حذف شد.');
  };

  const copyMediaUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(''), 1500);
    } catch {
      // ignore
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ground-deep)] text-sm text-[var(--ink-muted)]">
        {adminDict.loadingPanel}
      </div>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--ground-deep)] px-4 py-12 text-[var(--ink)]">
        <div className="w-full max-w-sm rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-7 shadow-2xl">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={handleToggleAdminLang}
              aria-label={isEn ? 'Switch admin language to Persian' : 'تغییر زبان پنل به انگلیسی'}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-soft)] hover:border-[var(--flame)] hover:text-[var(--ink)]"
            >
              <Globe className="h-3.5 w-3.5 text-[var(--flame)]" />
              <span>{adminDict.switchLangLabel}</span>
            </button>
          </div>
          <div className="flex flex-col items-center text-center">
            <BrandLogo
              src={publicThemeSettings.logoImage}
              className="h-14 w-14"
              alt="Mohammad Bagher"
            />
            <h1 className="mt-4 text-xl font-extrabold text-[var(--ink)]">
              {needsSetup ? adminDict.firstRunTitle : adminDict.portalTitle}
            </h1>
            <p className="mt-1 text-xs leading-6 text-[var(--ink-faint)]">
              {needsSetup ? adminDict.firstRunSubtitle : adminDict.loginSubtitle}
            </p>
          </div>

          <form
            onSubmit={needsSetup ? handleFirstRunSetup : handleLogin}
            noValidate
            className="mt-6 space-y-4"
          >
            <div>
              <label htmlFor="admin-username" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                {adminDict.usernameLabel}
              </label>
              <input
                id="admin-username"
                type="text"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isEn ? 'Username (letters & numbers)' : 'نام کاربری (حروف انگلیسی و عدد)'}
                className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                {adminDict.passwordLabel}
              </label>
              <input
                id="admin-password"
                type="password"
                dir="ltr"
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? adminDict.passwordHint : '••••••••'}
                className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>

            {needsSetup && (
              <div>
                <label
                  htmlFor="admin-password-confirm"
                  className="mb-1.5 block text-xs text-[var(--ink-muted)]"
                >
                  {isEn ? 'Confirm Password' : 'تکرار رمز عبور'}
                </label>
                <input
                  id="admin-password-confirm"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                />
              </div>
            )}

            {loginError && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-[var(--status-error-ink)]"
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="ember-btn-flame inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl py-2.5 text-sm disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              <span>
                {loggingIn
                  ? needsSetup
                    ? adminDict.creatingBtn
                    : adminDict.signingInBtn
                  : needsSetup
                    ? adminDict.createAdminBtn
                    : adminDict.signInBtn}
              </span>
            </button>
          </form>

          <div className="mt-5 text-center">
            <a
              href="/"
              className="text-xs text-[var(--ink-faint)] transition-colors hover:text-[var(--flame)]"
            >
              {adminDict.backToSite}
            </a>
          </div>
        </div>
      </main>
    );
  }

  const unreadCount = messages.filter((m) => !m.read).length;

  const TABS: Array<{ id: AdminTab; label: string; icon: typeof BookOpen; badge?: number }> = [
    { id: 'posts', label: adminDict.tabPosts, icon: BookOpen, badge: posts.length },
    { id: 'categories', label: adminDict.tabCategories, icon: Tags, badge: categories.length },
    { id: 'projects', label: adminDict.tabProjects, icon: Layers, badge: projects.length },
    { id: 'socials', label: isEn ? 'Social Links' : 'پیام‌رسان‌ها', icon: Share2 },
    { id: 'appearance', label: adminDict.tabAppearance, icon: Palette },
    { id: 'settings', label: isEn ? 'Copy, AI & Security' : 'تنظیمات، امنیت و AI', icon: Settings },
    { id: 'inbox', label: adminDict.tabMessages, icon: Inbox, badge: unreadCount || undefined },
    { id: 'media', label: adminDict.tabMedia, icon: FolderOpen, badge: media.length || undefined },
  ];

  return (
    <div className="min-h-screen bg-[var(--ground-deep)] text-[var(--ink)]">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--hair)] bg-[var(--ground-soft)] backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo src={settings?.logoImage} className="h-7 w-7" alt="Logo" />
            <div>
              <h1 className="text-sm font-bold text-[var(--ink)]">{adminDict.portalTitle}</h1>
              <p className="text-[11px] text-[var(--ink-faint)]" dir="ltr">
                {settings?.brandName || 'Mohammad Bagher'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAdminLang}
              aria-label={isEn ? 'Switch admin language to Persian' : 'تغییر زبان پنل مدیریت به انگلیسی'}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-1.5 text-xs font-bold text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)]"
            >
              <Globe className="h-3.5 w-3.5 text-[var(--flame)]" />
              <span>{adminDict.switchLangLabel}</span>
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)]"
            >
              <span>{adminDict.viewSite}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-[var(--status-error-ink)] hover:bg-red-500/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{adminDict.signOut}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 sm:px-6">
          <nav aria-label={isEn ? 'Admin sections' : 'بخش‌های پنل مدیریت'} className="flex items-center gap-1.5">
            {TABS.map(({ id, label, icon: Icon, badge }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                      : 'border border-[var(--hair)] bg-[var(--ground-deep)] text-[var(--ink-soft)] hover:border-[var(--flame-border)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  {badge !== undefined && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                        active
                          ? 'bg-black/15 text-[var(--flame-ink)]'
                          : 'bg-[var(--surface)] text-[var(--ink-muted)]'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {notice && (
          <div
            role="status"
            className="mb-6 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-[var(--status-success-ink)]"
          >
            {notice}
          </div>
        )}
        {errorMsg && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs font-medium text-[var(--status-error-ink)]"
          >
            {errorMsg}
          </div>
        )}

        {/* ==================== TAB 1: POSTS ==================== */}
        {tab === 'posts' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)]">
                      {editingPostId
                        ? isEn
                          ? 'Edit Post'
                          : 'ویرایش نوشته'
                        : isEn
                          ? 'New Post'
                          : 'نوشته جدید'}
                    </h2>
                    {!editingPostId && (
                      <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                        {isEn
                          ? 'Your draft is automatically saved in the browser.'
                          : 'پیش‌نویس شما به‌صورت خودکار در مرورگر ذخیره می‌شود.'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAiDrawerOpen((prev) => !prev)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                        aiDrawerOpen
                          ? 'border-[var(--flame)] bg-[var(--flame-tint)] text-[var(--flame)]'
                          : 'border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink-soft)] hover:border-[var(--flame)]'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{isEn ? 'AI Assistant' : 'دستیار هوش مصنوعی'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={resetPostForm}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] px-3 py-1.5 text-xs text-[var(--ink-muted)] hover:border-[var(--flame)] hover:text-[var(--ink)]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>
                        {editingPostId
                          ? isEn
                            ? 'Cancel Edit'
                            : 'انصراف از ویرایش'
                          : isEn
                            ? 'Reset Form'
                            : 'پاک کردن فرم'}
                      </span>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSavePost} noValidate className="space-y-4">
                  {/* Shared Post Metadata (Category, Slug, Cover) */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="post-category" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                        {isEn ? 'Category' : 'دسته‌بندی'}
                      </label>
                      <select
                        id="post-category"
                        value={postCategory}
                        onChange={(e) => setPostCategory(e.target.value)}
                        className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {isEn && c.nameEn ? `${c.nameEn} (${c.name})` : c.name}
                          </option>
                        ))}
                        {categories.length === 0 && (
                          <option value="یادگیری">{isEn ? 'Learning' : 'یادگیری'}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="post-slug" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                        {isEn ? 'URL Slug (optional)' : 'نشانی (اسلاگ اختیاری)'}
                      </label>
                      <input
                        id="post-slug"
                        type="text"
                        value={postSlug}
                        onChange={(e) => setPostSlug(e.target.value)}
                        placeholder={isEn ? 'Auto-generated from title' : 'تولید خودکار از عنوان'}
                        className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="post-cover" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                        {isEn ? 'Cover Image (optional)' : 'تصویر کاور (اختیاری)'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="post-cover"
                          type="text"
                          dir="ltr"
                          value={postCover}
                          onChange={(e) => setPostCover(e.target.value)}
                          placeholder="https://res.cloudinary.com/..."
                          className="min-w-0 flex-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                        />
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-2 text-xs text-[var(--ink)] hover:opacity-90">
                          <Upload className="h-3.5 w-3.5 text-[var(--flame)]" />
                          <span>{isEn ? 'Upload' : 'آپلود'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.currentTarget.value = '';
                              if (!f) return;
                              const url = await uploadLocalFile(f);
                              if (url) setPostCover(url);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Bilingual Content Sub-tabs + One-Click AI Translate */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-2.5">
                    <div className="inline-flex rounded-xl border border-[var(--hair)] bg-[var(--ground)] p-1">
                      <button
                        type="button"
                        onClick={() => setPostLangTab('fa')}
                        className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          postLangTab === 'fa'
                            ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {adminDict.persianContentTab}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPostLangTab('en')}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          postLangTab === 'en'
                            ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <span>{adminDict.englishContentTab}</span>
                        {postTitleEn.trim() && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={translatingKey === 'post'}
                      onClick={() => void handleTranslatePostToEn()}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:opacity-90 disabled:opacity-60"
                    >
                      {translatingKey === 'post' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--flame)]" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-[var(--flame)]" />
                      )}
                      <span>
                        {translatingKey === 'post'
                          ? adminDict.aiTranslating
                          : adminDict.aiTranslateBtn}
                      </span>
                    </button>
                  </div>

                  {postLangTab === 'fa' ? (
                    <>
                      <div>
                        <label htmlFor="post-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                          {isEn ? 'Persian Title (Primary)' : 'عنوان فارسی (اصلی)'}
                        </label>
                        <input
                          id="post-title"
                          type="text"
                          dir="rtl"
                          value={postTitle}
                          onChange={(e) => setPostTitle(e.target.value)}
                          placeholder={isEn ? 'Persian article title' : 'عنوان نوشته'}
                          className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="post-excerpt" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                          {isEn ? 'Persian Excerpt' : 'خلاصه فارسی'}
                        </label>
                        <textarea
                          id="post-excerpt"
                          rows={2}
                          dir="rtl"
                          value={postExcerpt}
                          onChange={(e) => setPostExcerpt(e.target.value)}
                          placeholder={
                            isEn
                              ? 'Short Persian summary for blog cards and SEO'
                              : 'خلاصه کوتاه برای کارت نوشته و سئو...'
                          }
                          className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                        />
                      </div>

                      <PostBlockBuilder
                        blocks={postBlocks}
                        onChange={setPostBlocks}
                        onUploadFile={uploadLocalFile}
                        adminLang={adminLang}
                        contentLang="fa"
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--ink-faint)]">{adminDict.englishOptionalHint}</p>
                      <div>
                        <label htmlFor="post-title-en" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                          {isEn ? 'English Title' : 'عنوان انگلیسی (EN)'}
                        </label>
                        <input
                          id="post-title-en"
                          type="text"
                          dir="ltr"
                          value={postTitleEn}
                          onChange={(e) => setPostTitleEn(e.target.value)}
                          placeholder="Article title in natural English..."
                          className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="post-excerpt-en" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                          {isEn ? 'English Excerpt' : 'خلاصه انگلیسی (EN)'}
                        </label>
                        <textarea
                          id="post-excerpt-en"
                          rows={2}
                          dir="ltr"
                          value={postExcerptEn}
                          onChange={(e) => setPostExcerptEn(e.target.value)}
                          placeholder="Short English summary for blog cards and SEO..."
                          className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                        />
                      </div>

                      <PostBlockBuilder
                        blocks={postBlocksEn}
                        onChange={setPostBlocksEn}
                        onUploadFile={uploadLocalFile}
                        adminLang={adminLang}
                        contentLang="en"
                      />
                    </>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--hair)] pt-4">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-soft)]">
                      <input
                        type="checkbox"
                        checked={postPublished}
                        onChange={(e) => setPostPublished(e.target.checked)}
                        className="accent-[var(--flame)]"
                      />
                      <span>
                        {isEn ? 'Published (visible on public blog)' : 'منتشر شود (نمایش عمومی در وبلاگ)'}
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={busyAction}
                      className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-6 py-2.5 text-sm disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      <span>
                        {editingPostId
                          ? isEn
                            ? 'Update Post'
                            : 'به‌روزرسانی نوشته'
                          : isEn
                            ? 'Save Post'
                            : 'ذخیره نوشته'}
                      </span>
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <aside className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6 lg:col-span-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {isEn ? 'All Posts' : 'فهرست نوشته‌ها'}
                </h2>
                <button
                  type="button"
                  onClick={resetPostForm}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--flame)]" />
                  <span>{isEn ? 'New' : 'جدید'}</span>
                </button>
              </div>

              {posts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-5 text-xs text-[var(--ink-faint)]">
                  {isEn ? 'No posts yet.' : 'هنوز نوشته‌ای ثبت نشده است.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-4"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--ink-faint)]">
                        <span className="font-medium text-[var(--flame)]">
                          {isEn
                            ? categories.find((c) => c.name === post.category)?.nameEn ||
                              post.category
                            : post.category}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {post.titleEn && (
                            <span className="rounded bg-[var(--flame-tint)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--flame)]">
                              EN
                            </span>
                          )}
                          <span>
                            {post.published
                              ? isEn
                                ? 'Published'
                                : 'منتشرشده'
                              : isEn
                                ? 'Draft'
                                : 'پیش‌نویس'}
                          </span>
                        </div>
                      </div>
                      <h3 className="mt-1.5 text-sm font-bold text-[var(--ink)]">
                        {isEn && post.titleEn ? post.titleEn : post.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-[var(--ink-faint)] tabular-nums">
                        {formatDateByLang(post.createdAt, adminLang)}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditPost(post)}
                          aria-label={`${adminDict.editLabel} ${post.title}`}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--hair-strong)] px-2.5 py-1 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>{adminDict.editLabel}</span>
                        </button>
                        <a
                          href={`/blog/${encodeURIComponent(post.slug)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--hair-strong)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:border-[var(--flame)]"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>{isEn ? 'View' : 'نمایش'}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          aria-label={`${adminDict.deleteLabel} ${post.title}`}
                          className="ms-auto inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-[var(--status-error-ink)] hover:bg-red-500/15"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{adminDict.deleteLabel}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>

            {/* Floating Corner AI Writing Assistant */}
            <AdminAiAssistant
              open={aiDrawerOpen}
              onToggleOpen={() => setAiDrawerOpen((prev) => !prev)}
              aiConfig={aiConfig}
              adminLang={adminLang}
              contentLang={postLangTab}
              categories={categories.map((c) => c.name)}
              currentPost={
                postLangTab === 'en'
                  ? {
                      title: postTitleEn,
                      slug: postSlug,
                      excerpt: postExcerptEn,
                      category: postCategory,
                      coverImage: postCover,
                      blocks: postBlocksEn,
                    }
                  : {
                      title: postTitle,
                      slug: postSlug,
                      excerpt: postExcerpt,
                      category: postCategory,
                      coverImage: postCover,
                      blocks: postBlocks,
                    }
              }
              canUndo={Boolean(undoSnapshot)}
              onUndo={handleUndoAiPatch}
              onApplyPatch={handleApplyAiPatch}
              onOpenAiSettings={() => {
                setTab('settings');
                setTimeout(() => {
                  document.getElementById('ai-settings-section')?.scrollIntoView({
                    behavior: 'smooth',
                  });
                }, 100);
              }}
              adminFetch={adminFetch}
            />
          </div>
        )}

        {/* ==================== TAB 2: CATEGORIES ==================== */}
        {tab === 'categories' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6 lg:col-span-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {editingCatId
                    ? isEn
                      ? 'Edit Category'
                      : 'ویرایش دسته‌بندی'
                    : isEn
                      ? 'Add Category'
                      : 'افزودن دسته‌بندی'}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={translatingKey === 'category'}
                    onClick={() => void handleTranslateCategoryToEn()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] hover:opacity-90 disabled:opacity-60"
                  >
                    {translatingKey === 'category' ? (
                      <Loader2 className="h-3 w-3 animate-spin text-[var(--flame)]" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-[var(--flame)]" />
                    )}
                    <span>{isEn ? 'AI → EN' : 'ترجمه هوشمند'}</span>
                  </button>
                  {editingCatId && (
                    <button
                      type="button"
                      onClick={resetCategoryForm}
                      className="cursor-pointer rounded-xl border border-[var(--hair-strong)] px-3 py-1 text-xs text-[var(--ink-muted)]"
                    >
                      {adminDict.cancel}
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveCategory} noValidate className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cat-name" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Persian Name (Primary)' : 'نام دسته‌بندی (فارسی)'}
                    </label>
                    <input
                      id="cat-name"
                      type="text"
                      dir="rtl"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder={isEn ? 'Persian category name' : 'نام دسته'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="cat-name-en" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'English Name (EN)' : 'نام انگلیسی (EN)'}
                    </label>
                    <input
                      id="cat-name-en"
                      type="text"
                      dir="ltr"
                      value={catNameEn}
                      onChange={(e) => setCatNameEn(e.target.value)}
                      placeholder="e.g. Learning"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="cat-desc" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Persian Description' : 'توضیح کوتاه (فارسی)'}
                  </label>
                  <textarea
                    id="cat-desc"
                    rows={2}
                    dir="rtl"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Short Persian description for this category'
                        : 'توضیح نمایش داده‌شده هنگام انتخاب دسته...'
                    }
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cat-desc-en" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'English Description (EN)' : 'توضیح کوتاه انگلیسی (EN)'}
                  </label>
                  <textarea
                    id="cat-desc-en"
                    rows={2}
                    dir="ltr"
                    value={catDescEn}
                    onChange={(e) => setCatDescEn(e.target.value)}
                    placeholder="Short English description for this category..."
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="ember-btn-flame inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl py-2.5 text-sm disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {editingCatId
                      ? isEn
                        ? 'Save Category'
                        : 'ذخیره تغییرات دسته'
                      : isEn
                        ? 'Add Category'
                        : 'افزودن دسته‌بندی'}
                  </span>
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6 lg:col-span-7">
              <div className="mb-4">
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {isEn
                    ? `Categories (${categories.length})`
                    : `دسته‌بندی‌های فعلی (${categories.length})`}
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">{adminDict.dragHint}</p>
              </div>
              {categories.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-6 text-xs text-[var(--ink-faint)]">
                  {isEn ? 'No categories yet.' : 'دسته‌بندی ثبت نشده است.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {categories.map((cat, idx) => {
                    const isDropTarget =
                      dragCatOverIndex === idx && dragCatIndex !== null && dragCatIndex !== idx;
                    return (
                      <div
                        key={cat.id}
                        draggable
                        onDragStart={(e) => {
                          setDragCatIndex(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          if (dragCatIndex === null) return;
                          e.preventDefault();
                          if (dragCatOverIndex !== idx) setDragCatOverIndex(idx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragCatIndex !== null && dragCatIndex !== idx) {
                            void persistCategoryOrder(reorderArray(categories, dragCatIndex, idx));
                          }
                          setDragCatIndex(null);
                          setDragCatOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragCatIndex(null);
                          setDragCatOverIndex(null);
                        }}
                        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-[var(--ground-deep)] p-4 transition-all ${
                          isDropTarget
                            ? 'border-[var(--flame)] ring-2 ring-[var(--flame-border)]'
                            : dragCatIndex === idx
                              ? 'border-[var(--flame-border)] opacity-60'
                              : 'border-[var(--hair)]'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <span
                            title={adminDict.dragHint}
                            className="mt-0.5 inline-flex cursor-grab rounded-lg p-1 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)] active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-[var(--ink)]">{cat.name}</h3>
                              {cat.nameEn && (
                                <span
                                  dir="ltr"
                                  className="rounded-md bg-[var(--flame-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--flame)]"
                                >
                                  {cat.nameEn}
                                </span>
                              )}
                            </div>
                            {cat.description && (
                              <p className="mt-1 text-xs leading-6 text-[var(--ink-muted)]">
                                {cat.description}
                              </p>
                            )}
                            {cat.descriptionEn && (
                              <p dir="ltr" className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                                {cat.descriptionEn}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              void persistCategoryOrder(reorderArray(categories, idx, idx - 1))
                            }
                            disabled={idx === 0}
                            aria-label={`Move up ${cat.name}`}
                            className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void persistCategoryOrder(reorderArray(categories, idx, idx + 1))
                            }
                            disabled={idx === categories.length - 1}
                            aria-label={`Move down ${cat.name}`}
                            className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditCategory(cat)}
                            aria-label={`${adminDict.editLabel} ${cat.name}`}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>{adminDict.editLabel}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            aria-label={`${adminDict.deleteLabel} ${cat.name}`}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-red-500/30 px-3 py-1.5 text-xs text-[var(--status-error-ink)] hover:bg-red-500/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{adminDict.deleteLabel}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== TAB 3: PROJECTS ==================== */}
        {tab === 'projects' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6 lg:col-span-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {editingProjId
                    ? isEn
                      ? 'Edit Project'
                      : 'ویرایش پروژه'
                    : isEn
                      ? 'Add Project'
                      : 'افزودن پروژه'}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={translatingKey === 'project'}
                    onClick={() => void handleTranslateProjectToEn()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] hover:opacity-90 disabled:opacity-60"
                  >
                    {translatingKey === 'project' ? (
                      <Loader2 className="h-3 w-3 animate-spin text-[var(--flame)]" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-[var(--flame)]" />
                    )}
                    <span>{isEn ? 'AI → EN' : 'ترجمه هوشمند'}</span>
                  </button>
                  {editingProjId && (
                    <button
                      type="button"
                      onClick={resetProjectForm}
                      className="cursor-pointer rounded-xl border border-[var(--hair-strong)] px-3 py-1 text-xs text-[var(--ink-muted)]"
                    >
                      {adminDict.cancel}
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveProject} noValidate className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="proj-title" className="mb-1 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Project Title (FA)' : 'عنوان پروژه (فارسی)'}
                    </label>
                    <input
                      id="proj-title"
                      type="text"
                      dir="rtl"
                      value={projTitle}
                      onChange={(e) => setProjTitle(e.target.value)}
                      placeholder={isEn ? 'Persian project title' : 'عنوان'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="proj-title-en" className="mb-1 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Project Title (EN)' : 'عنوان انگلیسی (EN)'}
                    </label>
                    <input
                      id="proj-title-en"
                      type="text"
                      dir="ltr"
                      value={projTitleEn}
                      onChange={(e) => setProjTitleEn(e.target.value)}
                      placeholder="English Title"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="proj-role" className="mb-1 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Role / Type (FA)' : 'نقش / نوع (فارسی)'}
                    </label>
                    <input
                      id="proj-role"
                      type="text"
                      dir="rtl"
                      value={projRole}
                      onChange={(e) => setProjRole(e.target.value)}
                      placeholder={isEn ? 'Persian role / type' : 'وب‌اپ / ابزار'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="proj-role-en" className="mb-1 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Role / Type (EN)' : 'نقش / نوع (EN)'}
                    </label>
                    <input
                      id="proj-role-en"
                      type="text"
                      dir="ltr"
                      value={projRoleEn}
                      onChange={(e) => setProjRoleEn(e.target.value)}
                      placeholder="Web App / Tool"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="proj-period" className="mb-1 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Period / Year (FA)' : 'بازه / سال (فارسی)'}
                    </label>
                    <input
                      id="proj-period"
                      type="text"
                      dir="rtl"
                      value={projPeriod}
                      onChange={(e) => setProjPeriod(e.target.value)}
                      placeholder={isEn ? 'Persian year / period' : '۱۴۰۵'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="proj-period-en" className="mb-1 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Period / Year (EN)' : 'بازه / سال (EN)'}
                    </label>
                    <input
                      id="proj-period-en"
                      type="text"
                      dir="ltr"
                      value={projPeriodEn}
                      onChange={(e) => setProjPeriodEn(e.target.value)}
                      placeholder="2026"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="proj-url" className="mb-1 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Project URL' : 'لینک پروژه'}
                  </label>
                  <input
                    id="proj-url"
                    type="text"
                    dir="ltr"
                    value={projUrl}
                    onChange={(e) => setProjUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="proj-stack" className="mb-1 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Tech Stack (comma separated)' : 'فناوری‌ها (با ویرگول جدا کن)'}
                  </label>
                  <input
                    id="proj-stack"
                    type="text"
                    dir="ltr"
                    value={projStack}
                    onChange={(e) => setProjStack(e.target.value)}
                    placeholder="React, TypeScript, SQLite"
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="proj-summary" className="mb-1 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Project Summary (FA)' : 'توضیح پروژه (فارسی)'}
                  </label>
                  <textarea
                    id="proj-summary"
                    rows={2}
                    dir="rtl"
                    value={projSummary}
                    onChange={(e) => setProjSummary(e.target.value)}
                    placeholder={isEn ? 'Short Persian summary' : 'شرح کوتاه پروژه...'}
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="proj-summary-en" className="mb-1 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Project Summary (EN)' : 'توضیح پروژه (انگلیسی)'}
                  </label>
                  <textarea
                    id="proj-summary-en"
                    rows={2}
                    dir="ltr"
                    value={projSummaryEn}
                    onChange={(e) => setProjSummaryEn(e.target.value)}
                    placeholder="Short English summary..."
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="ember-btn-flame inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl py-2.5 text-sm disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {editingProjId
                      ? isEn
                        ? 'Save Project'
                        : 'ذخیره تغییرات پروژه'
                      : isEn
                        ? 'Add Project'
                        : 'ثبت پروژه'}
                  </span>
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6 lg:col-span-7">
              <div className="mb-4">
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {isEn ? `Projects (${projects.length})` : `پروژه‌های ثبت‌شده (${projects.length})`}
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">{adminDict.dragHint}</p>
              </div>
              {projects.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-6 text-xs text-[var(--ink-faint)]">
                  {isEn ? 'No projects yet.' : 'پروژه‌ای ثبت نشده است.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {projects.map((proj, idx) => {
                    const isDropTarget =
                      dragProjOverIndex === idx && dragProjIndex !== null && dragProjIndex !== idx;
                    return (
                      <div
                        key={proj.id}
                        draggable
                        onDragStart={(e) => {
                          setDragProjIndex(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          if (dragProjIndex === null) return;
                          e.preventDefault();
                          if (dragProjOverIndex !== idx) setDragProjOverIndex(idx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragProjIndex !== null && dragProjIndex !== idx) {
                            void persistProjectOrder(reorderArray(projects, dragProjIndex, idx));
                          }
                          setDragProjIndex(null);
                          setDragProjOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragProjIndex(null);
                          setDragProjOverIndex(null);
                        }}
                        className={`rounded-2xl border bg-[var(--ground-deep)] p-4 transition-all ${
                          isDropTarget
                            ? 'border-[var(--flame)] ring-2 ring-[var(--flame-border)]'
                            : dragProjIndex === idx
                              ? 'border-[var(--flame-border)] opacity-60'
                              : 'border-[var(--hair)]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-2.5">
                            <span
                              title={adminDict.dragHint}
                              className="mt-0.5 inline-flex cursor-grab rounded-lg p-1 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)] active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-[var(--ink)]">
                                  {isEn && proj.titleEn ? proj.titleEn : proj.title}
                                </h3>
                                {proj.titleEn && (
                                  <span className="rounded bg-[var(--flame-tint)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--flame)]">
                                    EN
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-[var(--flame)]">
                                {[
                                  isEn && proj.roleEn ? proj.roleEn : proj.role,
                                  isEn && proj.periodEn ? proj.periodEn : proj.period,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                              {proj.summary && (
                                <p className="mt-2 text-xs leading-6 text-[var(--ink-muted)]">
                                  {isEn && proj.summaryEn ? proj.summaryEn : proj.summary}
                                </p>
                              )}
                              {proj.url && (
                                <p className="mt-1.5 truncate text-[11px] text-[var(--ink-faint)]" dir="ltr">
                                  {proj.url}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                void persistProjectOrder(reorderArray(projects, idx, idx - 1))
                              }
                              disabled={idx === 0}
                              aria-label={`Move up ${proj.title}`}
                              className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void persistProjectOrder(reorderArray(projects, idx, idx + 1))
                              }
                              disabled={idx === projects.length - 1}
                              aria-label={`Move down ${proj.title}`}
                              className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditProject(proj)}
                              aria-label={`${adminDict.editLabel} ${proj.title}`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>{adminDict.editLabel}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(proj.id)}
                              aria-label={`${adminDict.deleteLabel} ${proj.title}`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-red-500/30 px-3 py-1.5 text-xs text-[var(--status-error-ink)] hover:bg-red-500/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{adminDict.deleteLabel}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== TAB 4: SOCIALS & MESSAGING BUTTONS ==================== */}
        {tab === 'socials' && (
          <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {isEn
                    ? 'Social Platforms & Messaging Buttons'
                    : 'مدیریت دکمه‌های پیام‌رسان و شبکه‌های اجتماعی'}
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  {isEn
                    ? 'Drag handles to reorder. Add optional English labels for seamless bilingual display.'
                    : 'شامل یوتیوب، آپارات، اینستاگرام، تلگرام، بله، ایتا، روبیکا و... — با کشیدن دستگیره ترتیب را عوض کن.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addSocialPlatform}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:opacity-90"
                >
                  <Plus className="h-4 w-4 text-[var(--flame)]" />
                  <span>{isEn ? 'Add Button' : 'افزودن دکمه'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveSocials}
                  disabled={busyAction}
                  className="ember-btn-flame inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>{adminDict.saveChanges}</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {socials.map((item, idx) => {
                const isDropTarget =
                  dragSocialOverIndex === idx &&
                  dragSocialIndex !== null &&
                  dragSocialIndex !== idx;
                return (
                  <div
                    key={item.id}
                    draggable={dragSocialReadyIndex === idx}
                    onDragStart={(e) => {
                      if (dragSocialReadyIndex !== idx) {
                        e.preventDefault();
                        return;
                      }
                      setDragSocialIndex(idx);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (dragSocialIndex === null) return;
                      e.preventDefault();
                      if (dragSocialOverIndex !== idx) setDragSocialOverIndex(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragSocialIndex !== null && dragSocialIndex !== idx) {
                        setSocials((prev) => reorderArray(prev, dragSocialIndex, idx));
                      }
                      setDragSocialIndex(null);
                      setDragSocialOverIndex(null);
                      setDragSocialReadyIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragSocialIndex(null);
                      setDragSocialOverIndex(null);
                      setDragSocialReadyIndex(null);
                    }}
                    className={`grid grid-cols-1 items-center gap-2.5 rounded-2xl border bg-[var(--ground-deep)] p-4 transition-all md:grid-cols-12 ${
                      isDropTarget
                        ? 'border-[var(--flame)] ring-2 ring-[var(--flame-border)]'
                        : dragSocialIndex === idx
                          ? 'border-[var(--flame-border)] opacity-60'
                          : 'border-[var(--hair)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 md:col-span-2">
                      <button
                        type="button"
                        onPointerDown={() => setDragSocialReadyIndex(idx)}
                        onMouseDown={() => setDragSocialReadyIndex(idx)}
                        onPointerUp={() => setDragSocialReadyIndex(null)}
                        onMouseUp={() => setDragSocialReadyIndex(null)}
                        title={adminDict.dragHint}
                        aria-label={isEn ? 'Drag to reorder link' : 'جابه‌جایی لینک'}
                        className="inline-flex cursor-grab rounded-lg p-1 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)] active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                        <SocialIcon iconKey={item.iconKey} className="h-4 w-4" />
                      </span>
                      <select
                        value={item.iconKey}
                        onChange={(e) =>
                          updateSocialItem(idx, { iconKey: e.target.value as SocialIconKey })
                        }
                        aria-label={`Icon ${item.label}`}
                        className="min-w-0 flex-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-2 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                      >
                        {ICON_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {isEn ? opt.labelEn : opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => updateSocialItem(idx, { label: e.target.value })}
                      placeholder={isEn ? 'Label (FA)' : 'عنوان فارسی'}
                      aria-label={isEn ? 'Persian Label' : 'عنوان دکمه'}
                      className="rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none md:col-span-2"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={item.labelEn || ''}
                      onChange={(e) => updateSocialItem(idx, { labelEn: e.target.value })}
                      placeholder={
                        ICON_OPTIONS.find((opt) => opt.value === item.iconKey)?.labelEn ||
                        'Label (EN)'
                      }
                      aria-label="English Label"
                      className="rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none md:col-span-2"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={item.handle}
                      onChange={(e) => updateSocialItem(idx, { handle: e.target.value })}
                      placeholder="@id"
                      aria-label="Handle"
                      className="rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none md:col-span-2"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={item.url}
                      onChange={(e) => updateSocialItem(idx, { url: e.target.value })}
                      placeholder="https://..."
                      aria-label="URL"
                      className="rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none md:col-span-2"
                    />

                    <div className="flex items-center justify-between gap-1 md:col-span-2 md:justify-end">
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--ink-soft)]">
                        <input
                          type="checkbox"
                          checked={item.enabled !== false}
                          onChange={(e) => updateSocialItem(idx, { enabled: e.target.checked })}
                          className="accent-[var(--flame)]"
                        />
                        <span>{isEn ? 'On' : 'فعال'}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => moveSocialItem(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Move up ${item.label}`}
                        className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSocialItem(idx, 1)}
                        disabled={idx === socials.length - 1}
                        aria-label={`Move down ${item.label}`}
                        className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSocialItem(idx)}
                        aria-label={`Delete ${item.label}`}
                        className="rounded-lg p-1 text-[var(--status-error-ink)] hover:bg-red-500/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== TAB 5: SETTINGS, AI & SECURITY ==================== */}
        {tab === 'settings' && settings && (
          <div className="space-y-8">
            <form onSubmit={handleSaveSettings} noValidate className="space-y-6">
              {/* Language Switcher Bar for Site Texts */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-4">
                <div className="inline-flex rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-1">
                  <button
                    type="button"
                    onClick={() => setSettingsLangTab('fa')}
                    className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      settingsLangTab === 'fa'
                        ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {isEn ? 'Persian Site Copy (FA)' : 'متن‌های فارسی سایت (اصلی)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsLangTab('en')}
                    className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      settingsLangTab === 'en'
                        ? 'bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {isEn ? 'English Site Copy (EN)' : 'متن‌های انگلیسی سایت (EN)'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={translatingKey === 'settings'}
                  onClick={() => void handleTranslateSiteCopy()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] hover:opacity-90 disabled:opacity-60"
                >
                  {translatingKey === 'settings' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--flame)]" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[var(--flame)]" />
                  )}
                  <span>
                    {translatingKey === 'settings'
                      ? adminDict.aiTranslating
                      : isEn
                        ? 'AI-Translate All Site Copy to EN'
                        : 'ترجمه هوشمند تمام متون سایت به انگلیسی'}
                  </span>
                </button>
              </div>

              <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
                <h2 className="mb-1 text-base font-bold text-[var(--ink)]">
                  {isEn
                    ? 'Core Brand, Hero, SEO & Footer'
                    : 'اطلاعات اصلی، هدر، صفحه اصلی و فوتر'}
                </h2>
                <p className="mb-5 text-xs text-[var(--ink-faint)]">
                  {settingsLangTab === 'en'
                    ? isEn
                      ? 'Editing English (EN) site copy shown when visitors switch to English.'
                      : 'در حال ویرایش نسخه انگلیسی (EN) متون سایت — هنگام تغییر زبان به انگلیسی نمایش داده می‌شود.'
                    : isEn
                      ? 'Every visible heading and copy string on your site is editable right here.'
                      : 'تمام متن‌ها و عنوان‌های قابل مشاهده در سایت از اینجا قابل ویرایش هستند.'}
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-brand" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Header Brand Name' : 'نام برند در هدر'}
                    </label>
                    <input
                      id="set-brand"
                      type="text"
                      dir="ltr"
                      value={settings.brandName}
                      onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-logo" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Logo Image' : 'تصویر لوگو'}
                    </label>
                    <div className="flex items-center gap-2">
                      <BrandLogo src={settings.logoImage} className="h-9 w-9" alt="Logo preview" />
                      <input
                        id="set-logo"
                        type="text"
                        dir="ltr"
                        value={settings.logoImage}
                        onChange={(e) => setSettings({ ...settings, logoImage: e.target.value })}
                        className="min-w-0 flex-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                      />
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-2 text-xs text-[var(--ink)]">
                        <Upload className="h-3.5 w-3.5 text-[var(--flame)]" />
                        <span>{isEn ? 'Upload' : 'آپلود'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.currentTarget.value = '';
                            if (!f) return;
                            const url = await uploadLocalFile(f);
                            if (url) setSettings({ ...settings, logoImage: url });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="set-hero-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {settingsLangTab === 'en'
                        ? isEn
                          ? 'Hero Heading (EN)'
                          : 'تیتر بالای صفحه اصلی (انگلیسی)'
                        : isEn
                          ? 'Hero Heading (FA)'
                          : 'تیتر بالای صفحه اصلی (Hero)'}
                    </label>
                    <input
                      id="set-hero-title"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={settingsLangTab === 'en' ? settings.heroTitleEn || '' : settings.heroTitle}
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, heroTitleEn: e.target.value }
                            : { ...settings, heroTitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-site-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Browser SEO Title' : 'عنوان سئو مرورگر (Title)'}
                    </label>
                    <input
                      id="set-site-title"
                      type="text"
                      value={settings.siteTitle}
                      onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="set-hero-sub" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {settingsLangTab === 'en'
                        ? isEn
                          ? 'Hero Introduction (EN)'
                          : 'جمله معرفی بالای صفحه اصلی (انگلیسی)'
                        : isEn
                          ? 'Hero Introduction (FA)'
                          : 'جمله معرفی بالای صفحه اصلی'}
                    </label>
                    <textarea
                      id="set-hero-sub"
                      rows={2}
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en' ? settings.heroSubtitleEn || '' : settings.heroSubtitle
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, heroSubtitleEn: e.target.value }
                            : { ...settings, heroSubtitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="set-footer-text" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                        {settingsLangTab === 'en'
                          ? isEn
                            ? 'Footer Copyright (EN)'
                            : 'متن پاورقی (انگلیسی)'
                          : isEn
                            ? 'Footer Copyright (FA)'
                            : 'متن کپی‌رایت پاورقی (Footer)'}
                      </label>
                      <input
                        id="set-footer-text"
                        type="text"
                        dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                        value={
                          settingsLangTab === 'en'
                            ? settings.footerTextEn || ''
                            : settings.footerText || ''
                        }
                        onChange={(e) =>
                          setSettings(
                            settingsLangTab === 'en'
                              ? { ...settings, footerTextEn: e.target.value }
                              : { ...settings, footerText: e.target.value },
                          )
                        }
                        placeholder={
                          settingsLangTab === 'en'
                            ? '© 2026 Mohammad Bagher'
                            : isEn
                              ? 'Persian footer copyright text...'
                              : '© ۱۴۰۵ Mohammad Bagher'
                        }
                        className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="set-seo-desc" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                        {isEn ? 'SEO Meta Description' : 'توضیحات متا سئو (Meta Description)'}
                      </label>
                      <input
                        id="set-seo-desc"
                        type="text"
                        value={settings.siteDescription}
                        onChange={(e) =>
                          setSettings({ ...settings, siteDescription: e.target.value })
                        }
                        className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
                <h2 className="mb-1 text-base font-bold text-[var(--ink)]">
                  {settingsLangTab === 'en'
                    ? isEn
                      ? 'Blog, Projects & About Page Copy (EN)'
                      : 'متن‌های وبلاگ، پروژه‌ها و درباره من (انگلیسی)'
                    : isEn
                      ? 'Blog, Projects & About Page Copy (FA)'
                      : 'متن‌های بخش وبلاگ، پروژه‌ها و صفحه درباره من'}
                </h2>
                <p className="mb-5 text-xs text-[var(--ink-faint)]">
                  {isEn
                    ? 'Customize every section title, subtitle, bio paragraph, focus area, and contact form heading.'
                    : 'تیترها، زیرعنوان‌ها، متن معرفی درباره من، حوزه‌های فعالیت و عنوان فرم تماس را اینجا تغییر بده.'}
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-blog-section" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Blog Section Eyebrow' : 'عنوان بخش نوشته‌ها (صفحه اصلی و بالای وبلاگ)'}
                    </label>
                    <input
                      id="set-blog-section"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.blogSectionTitleEn || ''
                          : settings.blogSectionTitle || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, blogSectionTitleEn: e.target.value }
                            : { ...settings, blogSectionTitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-blog-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Blog Page Main Heading' : 'تیتر اصلی صفحه وبلاگ'}
                    </label>
                    <input
                      id="set-blog-title"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.blogPageTitleEn || ''
                          : settings.blogPageTitle || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, blogPageTitleEn: e.target.value }
                            : { ...settings, blogPageTitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="set-blog-sub" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Blog Page Subtitle' : 'جمله توضیح زیر تیتر صفحه وبلاگ'}
                  </label>
                  <input
                    id="set-blog-sub"
                    type="text"
                    dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                    value={
                      settingsLangTab === 'en'
                        ? settings.blogPageSubtitleEn || ''
                        : settings.blogPageSubtitle || ''
                    }
                    onChange={(e) =>
                      setSettings(
                        settingsLangTab === 'en'
                          ? { ...settings, blogPageSubtitleEn: e.target.value }
                          : { ...settings, blogPageSubtitle: e.target.value },
                      )
                    }
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-proj-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Projects Title' : 'عنوان بخش و صفحه پروژه‌ها'}
                    </label>
                    <input
                      id="set-proj-title"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.projectsSectionTitleEn || ''
                          : settings.projectsSectionTitle || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, projectsSectionTitleEn: e.target.value }
                            : { ...settings, projectsSectionTitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-proj-sub" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Projects Page Subtitle' : 'توضیح زیر تیتر صفحه پروژه‌ها'}
                    </label>
                    <input
                      id="set-proj-sub"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.projectsPageSubtitleEn || ''
                          : settings.projectsPageSubtitle || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, projectsPageSubtitleEn: e.target.value }
                            : { ...settings, projectsPageSubtitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-about-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'About & Contact Heading' : 'تیتر بخش و صفحه درباره من'}
                    </label>
                    <input
                      id="set-about-title"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en' ? settings.aboutTitleEn || '' : settings.aboutTitle
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, aboutTitleEn: e.target.value }
                            : { ...settings, aboutTitle: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-contact-heading" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Contact Form Heading' : 'عنوان فرم تماس (در صفحه درباره من)'}
                    </label>
                    <input
                      id="set-contact-heading"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.contactFormHeadingEn || ''
                          : settings.contactFormHeading || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, contactFormHeadingEn: e.target.value }
                            : { ...settings, contactFormHeading: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="set-bio" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'About Bio Paragraph' : 'متن کامل درباره من'}
                  </label>
                  <textarea
                    id="set-bio"
                    rows={4}
                    dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                    value={settingsLangTab === 'en' ? settings.aboutBioEn || '' : settings.aboutBio}
                    onChange={(e) =>
                      setSettings(
                        settingsLangTab === 'en'
                          ? { ...settings, aboutBioEn: e.target.value }
                          : { ...settings, aboutBio: e.target.value },
                      )
                    }
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm leading-7 text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-focus-heading" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Focus Box Heading' : 'عنوان کادر تخصص (صفحه درباره من)'}
                    </label>
                    <input
                      id="set-focus-heading"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.aboutFocusHeadingEn || ''
                          : settings.aboutFocusHeading || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, aboutFocusHeadingEn: e.target.value }
                            : { ...settings, aboutFocusHeading: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-connect-heading" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Direct Channels Heading' : 'عنوان بخش راه‌های ارتباطی (صفحه درباره من)'}
                    </label>
                    <input
                      id="set-connect-heading"
                      type="text"
                      dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                      value={
                        settingsLangTab === 'en'
                          ? settings.aboutConnectHeadingEn || ''
                          : settings.aboutConnectHeading || ''
                      }
                      onChange={(e) =>
                        setSettings(
                          settingsLangTab === 'en'
                            ? { ...settings, aboutConnectHeadingEn: e.target.value }
                            : { ...settings, aboutConnectHeading: e.target.value },
                        )
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="set-focus-text" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Focus Areas Text' : 'متن حوزه‌های فعالیت (صفحه درباره من)'}
                  </label>
                  <textarea
                    id="set-focus-text"
                    rows={2}
                    dir={settingsLangTab === 'en' ? 'ltr' : 'rtl'}
                    value={
                      settingsLangTab === 'en'
                        ? settings.aboutFocusTextEn || ''
                        : settings.aboutFocusText || ''
                    }
                    onChange={(e) =>
                      setSettings(
                        settingsLangTab === 'en'
                          ? { ...settings, aboutFocusTextEn: e.target.value }
                          : { ...settings, aboutFocusText: e.target.value },
                      )
                    }
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)]">
                      {isEn
                        ? 'Contact Card Manager (Save Contact - vCard)'
                        : 'مدیریت کامل کارت مخاطب (افزودن به مخاطبین - vCard)'}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--ink-faint)]">
                      {isEn
                        ? 'Edit every field, avatar photo, and custom extra entries for the downloadable .vcf contact card.'
                        : 'تمام اطلاعات، تصویر پروفایل و فیلدهای اضافه کارت مخاطب (.vcf) را می‌توانی اینجا ویرایش، اضافه یا حذف کنی.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-2 text-xs text-[var(--ink-soft)]">
                      <input
                        type="checkbox"
                        checked={settings.vcardEnabled !== 'false'}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            vcardEnabled: e.target.checked ? 'true' : 'false',
                          })
                        }
                        className="accent-[var(--flame)]"
                      />
                      <span>{isEn ? 'Enabled on Site' : 'فعال در سایت'}</span>
                    </label>
                    <a
                      href="/api/save-contact?download=1"
                      download="mohammad-bagher.vcf"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:opacity-90"
                    >
                      <Download className="h-3.5 w-3.5 text-[var(--flame)]" />
                      <span>{isEn ? 'Test Download vCard' : 'تست دانلود vCard'}</span>
                    </a>
                  </div>
                </div>

                {/* vCard Avatar Picker */}
                <div className="mb-5 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-4">
                  <label htmlFor="vc-avatar" className="mb-2 block text-xs font-medium text-[var(--ink-soft)]">
                    {isEn
                      ? 'Contact Avatar Photo (embedded inside the .vcf file)'
                      : 'تصویر پروفایل مخاطب (در گوشی همراه مخاطب ذخیره می‌شود)'}
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <img
                      src={settings.vcardAvatar || '/vcard-avatar.jpg'}
                      alt="vCard Avatar"
                      className="h-12 w-12 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] object-cover"
                    />
                    <input
                      id="vc-avatar"
                      type="text"
                      dir="ltr"
                      value={settings.vcardAvatar || ''}
                      onChange={(e) => setSettings({ ...settings, vcardAvatar: e.target.value })}
                      placeholder="/vcard-avatar.jpg"
                      className="min-w-0 flex-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 font-mono text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-2 text-xs text-[var(--ink)] hover:opacity-90">
                      <Upload className="h-3.5 w-3.5 text-[var(--flame)]" />
                      <span>{isEn ? 'Upload Photo' : 'آپلود عکس'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.currentTarget.value = '';
                          if (!f) return;
                          const url = await uploadLocalFile(f);
                          if (url) setSettings({ ...settings, vcardAvatar: url });
                        }}
                      />
                    </label>
                    {settings.vcardAvatar && settings.vcardAvatar !== '/vcard-avatar.jpg' && (
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, vcardAvatar: '/vcard-avatar.jpg' })}
                        className="cursor-pointer rounded-xl border border-[var(--hair-strong)] px-3 py-2 text-xs text-[var(--ink-muted)] hover:border-[var(--flame)]"
                      >
                        {isEn ? 'Reset to Logo' : 'بازگشت به لوگو'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="vc-name" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Full Name' : 'نام کامل مخاطب'}
                    </label>
                    <input
                      id="vc-name"
                      type="text"
                      value={settings.vcardFullName}
                      onChange={(e) => setSettings({ ...settings, vcardFullName: e.target.value })}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-org" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Organization / Brand (ORG)' : 'نام برند / شرکت (ORG)'}
                    </label>
                    <input
                      id="vc-org"
                      type="text"
                      value={settings.vcardOrg || ''}
                      onChange={(e) => setSettings({ ...settings, vcardOrg: e.target.value })}
                      placeholder="Mohammad Bagher"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-title" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Title / Role' : 'عنوان شغلی / تخصص'}
                    </label>
                    <input
                      id="vc-title"
                      type="text"
                      value={settings.vcardTitle}
                      onChange={(e) => setSettings({ ...settings, vcardTitle: e.target.value })}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-email" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Primary Email' : 'ایمیل اصلی'}
                    </label>
                    <input
                      id="vc-email"
                      type="text"
                      dir="ltr"
                      value={settings.email}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 font-mono text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-phone" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Primary Phone (optional)' : 'شماره تماس اصلی (اختیاری)'}
                    </label>
                    <input
                      id="vc-phone"
                      type="text"
                      dir="ltr"
                      value={settings.vcardPhone}
                      onChange={(e) => setSettings({ ...settings, vcardPhone: e.target.value })}
                      placeholder="+98..."
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-web" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Primary Website' : 'آدرس وب‌سایت اصلی'}
                    </label>
                    <input
                      id="vc-web"
                      type="text"
                      dir="ltr"
                      value={settings.vcardWebsite}
                      onChange={(e) => setSettings({ ...settings, vcardWebsite: e.target.value })}
                      placeholder="https://mbnd.ir"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="vc-note" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                    {isEn ? 'Contact Note' : 'توضیحات مخاطب (Note)'}
                  </label>
                  <input
                    id="vc-note"
                    type="text"
                    value={settings.vcardNote}
                    onChange={(e) => setSettings({ ...settings, vcardNote: e.target.value })}
                    className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                  />
                </div>

                {/* Dynamic Extra vCard Fields */}
                <div className="mt-5 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-[var(--ink)]">
                        {isEn
                          ? `Extra vCard Fields (${vcardExtraFields.length})`
                          : `فیلدهای اضافه کارت مخاطب (${vcardExtraFields.length})`}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                        {isEn
                          ? 'Add extra phone numbers, secondary emails, URLs, addresses, or notes.'
                          : 'می‌توانی شماره دوم، ایمیل دوم، لینک اضافه، آدرس یا یادداشت اختصاصی اضافه یا حذف کنی.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addVCardExtraField}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5 text-[var(--flame)]" />
                      <span>{isEn ? 'Add vCard Field' : 'افزودن فیلد به vCard'}</span>
                    </button>
                  </div>

                  {vcardExtraFields.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--hair)] px-3 py-3 text-center text-[11px] text-[var(--ink-faint)]">
                      {isEn ? 'No extra fields added yet.' : 'هنوز فیلد اضافه‌ای ثبت نشده است.'}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {vcardExtraFields.map((field, idx) => (
                        <div
                          key={field.id}
                          className="grid grid-cols-1 items-center gap-2 rounded-xl border border-[var(--hair)] bg-[var(--ground)] p-3 sm:grid-cols-12"
                        >
                          <select
                            value={field.type}
                            aria-label="vCard field type"
                            onChange={(e) =>
                              updateVCardExtraField(idx, {
                                type: e.target.value as VCardExtraFieldType,
                              })
                            }
                            className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-2.5 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none sm:col-span-3"
                          >
                            {VCARD_FIELD_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {isEn ? opt.labelEn : opt.label}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateVCardExtraField(idx, { label: e.target.value })}
                            placeholder={isEn ? 'Label (optional)' : 'برچسب (اختیاری مثلاً دفتر)'}
                            aria-label="Field label"
                            className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none sm:col-span-3"
                          />

                          <input
                            type="text"
                            dir={
                              field.type === 'tel' || field.type === 'email' || field.type === 'url'
                                ? 'ltr'
                                : isEn
                                  ? 'ltr'
                                  : 'rtl'
                            }
                            value={field.value}
                            onChange={(e) => updateVCardExtraField(idx, { value: e.target.value })}
                            placeholder={
                              field.type === 'tel'
                                ? '+98912...'
                                : field.type === 'url'
                                  ? 'https://...'
                                  : field.type === 'email'
                                    ? 'work@mbnd.ir'
                                    : isEn
                                      ? 'Field value...'
                                      : 'مقدار فیلد...'
                            }
                            aria-label="Field value"
                            className="rounded-lg border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none sm:col-span-5"
                          />

                          <div className="flex justify-end sm:col-span-1">
                            <button
                              type="button"
                              onClick={() => removeVCardExtraField(idx)}
                              aria-label={`Delete field ${field.label || idx + 1}`}
                              className="cursor-pointer rounded-lg p-1.5 text-[var(--status-error-ink)] hover:bg-red-500/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-end gap-4 border-t border-[var(--hair)] pt-4">
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-6 py-2.5 text-sm disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isEn ? 'Save Site Settings' : 'ذخیره تنظیمات سایت'}</span>
                  </button>
                </div>
              </section>
            </form>

            {/* ==================== AI PROVIDER SETTINGS ==================== */}
            <section
              id="ai-settings-section"
              className="rounded-3xl border border-[var(--flame-border)] bg-[var(--ground)] p-6"
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)]">
                      {isEn
                        ? 'AI Assistant & Translation Settings (Admin Only)'
                        : 'تنظیمات دستیار هوش مصنوعی (فقط برای مدیر)'}
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                      {isEn
                        ? 'Your API key is encrypted with AES-256-GCM on the server and never exposed to the browser.'
                        : 'کلید API شما با AES-256-GCM رمزنگاری و فقط در سرور ذخیره می‌شود و هیچ‌گاه در مرورگر نمایش داده نمی‌شود.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={testingAi}
                  onClick={handleTestAiConnection}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ink)] hover:opacity-90 disabled:opacity-50"
                >
                  {testingAi ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--flame)]" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-[var(--flame)]" />
                  )}
                  <span>
                    {testingAi
                      ? isEn
                        ? 'Testing...'
                        : 'در حال تست...'
                      : isEn
                        ? 'Test Connection'
                        : 'تست اتصال'}
                  </span>
                </button>
              </div>

              {aiTestResult && (
                <div
                  role={aiTestResult.ok ? 'status' : 'alert'}
                  className={`mb-4 rounded-2xl border px-4 py-3 text-xs leading-6 ${
                    aiTestResult.ok
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-[var(--status-success-ink)]'
                      : 'border-red-500/35 bg-red-500/10 text-[var(--status-error-ink)]'
                  }`}
                >
                  {aiTestResult.text}
                </div>
              )}

              <form onSubmit={handleSaveAiConfig} noValidate className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ai-provider" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'AI Provider' : 'نوع ارائه‌دهنده (Provider)'}
                    </label>
                    <select
                      id="ai-provider"
                      value={aiProvider}
                      onChange={(e) => {
                        const next = e.target.value as AiProviderType;
                        setAiProvider(next);
                        if (next === 'gemini' && !aiModel.includes('gemini')) {
                          setAiModel('gemini-4-hydrogen');
                        } else if (next === 'openai_compatible' && aiModel.includes('gemini')) {
                          setAiModel('gpt-4.1-mini');
                        }
                      }}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    >
                      <option value="gemini">
                        {isEn ? 'Google Gemini' : 'Google Gemini (جمینای)'}
                      </option>
                      <option value="openai_compatible">
                        OpenAI-Compatible (OpenAI, OpenRouter, DeepSeek, Claude...)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ai-model" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Model ID' : 'نام مدل (Model ID)'}
                    </label>
                    <input
                      id="ai-model"
                      type="text"
                      dir="ltr"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      placeholder={aiProvider === 'gemini' ? 'gemini-4-hydrogen' : 'gpt-4.1-mini'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {MODEL_PRESETS[aiProvider].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAiModel(preset)}
                          className="cursor-pointer rounded-lg border border-[var(--hair)] bg-[var(--ground-deep)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-muted)] hover:border-[var(--flame)] hover:text-[var(--ink)]"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ai-base-url" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Provider Base URL ' : 'لینک ارائه‌دهنده / Base URL '}
                      {aiProvider === 'gemini'
                        ? isEn
                          ? '(optional proxy)'
                          : '(اختیاری - برای پروکسی)'
                        : '(e.g. https://api.openai.com/v1)'}
                    </label>
                    <input
                      id="ai-base-url"
                      type="text"
                      dir="ltr"
                      value={aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                      placeholder={
                        aiProvider === 'gemini'
                          ? isEn
                            ? 'Leave empty for direct connection'
                            : 'خالی بگذارید برای اتصال مستقیم'
                          : 'https://openrouter.ai/api/v1'
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="ai-api-key" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Private API Key' : 'کلید API اختصاصی'}
                    </label>
                    <input
                      id="ai-api-key"
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      value={aiApiKeyInput}
                      onChange={(e) => setAiApiKeyInput(e.target.value)}
                      placeholder={
                        aiConfig?.hasCustomApiKey
                          ? isEn
                            ? `Saved key (${aiConfig.keyHint})`
                            : `کلید ذخیره شده (${aiConfig.keyHint})`
                          : 'AIza... or sk-...'
                      }
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                    {aiConfig?.hasCustomApiKey && (
                      <>
                        <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[var(--status-success-ink)]">
                          {isEn
                            ? `Custom key saved (${aiConfig.keyHint})`
                            : `کلید اختصاصی ذخیره شده (${aiConfig.keyHint})`}
                        </span>
                        <button
                          type="button"
                          onClick={handleClearCustomAiKey}
                          className="cursor-pointer rounded-lg border border-red-500/30 px-2.5 py-1 text-[var(--status-error-ink)] hover:bg-red-500/15"
                        >
                          {isEn ? 'Remove Key' : 'حذف کلید'}
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={busyAction}
                    className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-6 py-2.5 text-sm disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isEn ? 'Save AI Settings' : 'ذخیره تنظیمات هوش مصنوعی'}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* ==================== SECURITY SECTION ==================== */}
            <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)]">
                      {isEn ? 'Admin Security & Active Sessions' : 'امنیت پنل مدیریت'}
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                      {isEn
                        ? 'Update username/password (min 8 chars, letters + digits) or sign out all active devices.'
                        : 'تغییر نام کاربری و رمز عبور (حداقل ۸ کاراکتر شامل حروف انگلیسی و عدد) و مدیریت نشست‌های فعال'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRevokeAllSessions}
                  disabled={busyAction}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-[var(--status-error-ink)] hover:bg-red-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{isEn ? 'Sign Out All Devices' : 'خروج از همه دستگاه‌ها'}</span>
                </button>
              </div>

              <form onSubmit={handleChangeCredentials} noValidate className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="sec-username" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Admin Username' : 'نام کاربری مدیریت'}
                    </label>
                    <input
                      id="sec-username"
                      type="text"
                      dir="ltr"
                      value={secNewUsername}
                      onChange={(e) => setSecNewUsername(e.target.value)}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="sec-current-pw" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Current Password (required)' : 'رمز عبور فعلی (الزامی برای تغییر)'}
                    </label>
                    <input
                      id="sec-current-pw"
                      type="password"
                      dir="ltr"
                      autoComplete="current-password"
                      value={secCurrentPassword}
                      onChange={(e) => setSecCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="sec-new-pw" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn
                        ? 'New Password (min 8 chars, letters + digits)'
                        : 'رمز عبور جدید (حداقل ۸ کاراکتر، حروف + عدد)'}
                    </label>
                    <input
                      id="sec-new-pw"
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      value={secNewPassword}
                      onChange={(e) => setSecNewPassword(e.target.value)}
                      placeholder={isEn ? 'Strong new password' : 'رمز عبور قوی جدید'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="sec-confirm-pw" className="mb-1.5 block text-xs text-[var(--ink-muted)]">
                      {isEn ? 'Confirm New Password' : 'تکرار رمز عبور جدید'}
                    </label>
                    <input
                      id="sec-confirm-pw"
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      value={secConfirmPassword}
                      onChange={(e) => setSecConfirmPassword(e.target.value)}
                      placeholder={isEn ? 'Confirm new password' : 'تکرار رمز عبور جدید'}
                      className="w-full rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-5 py-2.5 text-xs font-bold text-[var(--ink)] hover:opacity-90 disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4 text-[var(--flame)]" />
                    <span>{isEn ? 'Update Credentials' : 'تغییر اطلاعات ورود'}</span>
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* ==================== TAB: APPEARANCE, MEDIA & NAV ==================== */}
        {tab === 'appearance' && settings && (
          <AdminAppearancePanel
            settings={settings}
            adminLang={adminLang}
            onChange={(updater) => setSettings((prev) => (prev ? updater(prev) : prev))}
            onSave={persistCurrentSettings}
            saving={busyAction}
            onUploadFile={uploadLocalFile}
            onTranslateSiteCopy={handleTranslateSiteCopy}
            translatingSiteCopy={translatingKey === 'settings'}
          />
        )}

        {/* ==================== TAB 6: INBOX ==================== */}
        {tab === 'inbox' && (
          <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
            <h2 className="mb-4 text-base font-bold text-[var(--ink)]">
              {isEn ? `Inbox Messages (${messages.length})` : `پیام‌های دریافتی (${messages.length})`}
            </h2>
            {messages.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-8 text-center text-xs text-[var(--ink-faint)]">
                {isEn ? 'No messages received yet.' : 'هنوز پیامی ثبت نشده است.'}
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-2xl border p-4 ${
                      msg.read
                        ? 'border-[var(--hair)] bg-[var(--ground-deep)]'
                        : 'border-[var(--flame-border)] bg-[var(--flame-tint)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-[var(--ink)]">{msg.name}</span>
                        <span className="mx-2 text-[var(--ink-faint)]">·</span>
                        <span className="text-xs text-[var(--flame)]" dir="ltr">
                          {msg.contact}
                        </span>
                      </div>
                      <span className="text-[11px] text-[var(--ink-faint)] tabular-nums">
                        {formatDateByLang(msg.createdAt, adminLang)}
                      </span>
                    </div>
                    <p className="mt-2.5 whitespace-pre-line text-xs leading-7 text-[var(--ink-soft)]">
                      {msg.message}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleRead(msg)}
                        className="cursor-pointer rounded-lg border border-[var(--hair-strong)] px-3 py-1 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
                      >
                        {msg.read
                          ? isEn
                            ? 'Mark Unread'
                            : 'علامت‌گذاری خوانده‌نشده'
                          : isEn
                            ? 'Mark Read'
                            : 'خوانده شد'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1 text-xs text-[var(--status-error-ink)] hover:bg-red-500/15"
                      >
                        {adminDict.deleteLabel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ==================== TAB 7: MEDIA ==================== */}
        {tab === 'media' && (
          <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {isEn ? 'Media Library (Cloudinary)' : 'فایل‌ها و رسانه (Cloudinary)'}
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  {isEn
                    ? 'Images (PNG/JPG/WebP/GIF), Video (MP4/WebM/MOV), Audio (MP3/WAV/OGG/M4A) & PDF — hosted directly on Cloudinary'
                    : 'تصویر (PNG/JPG/WebP/GIF)، ویدیو (MP4/WebM/MOV)، صوت (MP3/WAV/OGG/M4A) و PDF — میزبانی ابری روی Cloudinary'}
                </p>
              </div>
              <label className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-xs">
                <Upload className="h-4 w-4" />
                <span>{isEn ? 'Upload New File' : 'آپلود فایل جدید'}</span>
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime,audio/*,.pdf,.vcf"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (f) await uploadLocalFile(f);
                  }}
                />
              </label>
            </div>

            {media.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-8 text-center text-xs text-[var(--ink-faint)]">
                {isEn ? 'No files uploaded yet.' : 'هنوز فایلی آپلود نشده است.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {media.map((item) => (
                  <div
                    key={item.filename}
                    className="flex flex-col justify-between rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3.5"
                  >
                    <div>
                      {item.kind === 'image' && (
                        <img
                          src={item.url}
                          alt={item.filename}
                          className="h-36 w-full rounded-xl object-cover"
                        />
                      )}
                      {item.kind === 'video' && (
                        <video
                          src={item.url}
                          controls
                          preload="metadata"
                          className="h-36 w-full rounded-xl bg-black"
                        />
                      )}
                      {item.kind === 'audio' && (
                        <div className="flex h-36 flex-col items-center justify-center gap-3 rounded-xl bg-[var(--ground)] p-3">
                          <Headphones className="h-6 w-6 text-[var(--flame)]" />
                          <audio src={item.url} controls preload="metadata" className="w-full" />
                        </div>
                      )}
                      {item.kind === 'file' && (
                        <div className="flex h-36 items-center justify-center rounded-xl bg-[var(--ground)] text-xs text-[var(--ink-muted)]">
                          {item.filename}
                        </div>
                      )}
                      <p className="mt-2.5 truncate text-xs text-[var(--ink-soft)]" dir="ltr">
                        {item.filename}
                      </p>
                      <p className="text-[11px] text-[var(--ink-faint)] tabular-nums">
                        {formatBytes(item.sizeBytes)}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyMediaUrl(item.url)}
                        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-[var(--hair-strong)] py-1.5 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
                      >
                        {copiedUrl === item.url ? (
                          <Check className="h-3.5 w-3.5 text-[var(--status-success-ink)]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {copiedUrl === item.url
                            ? isEn
                              ? 'Copied'
                              : 'کپی شد'
                            : isEn
                              ? 'Copy URL'
                              : 'کپی لینک'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMedia(item.filename)}
                        aria-label={`${adminDict.deleteLabel} ${item.filename}`}
                        className="cursor-pointer rounded-xl border border-red-500/30 p-1.5 text-[var(--status-error-ink)] hover:bg-red-500/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
