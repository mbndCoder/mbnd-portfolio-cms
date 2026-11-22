import type { SiteLanguage } from '../types/cms.ts';

export interface AdminUiDict {
  loadingPanel: string;
  portalTitle: string;
  portalSubtitle: string;
  firstRunTitle: string;
  firstRunSubtitle: string;
  loginSubtitle: string;
  usernameLabel: string;
  passwordLabel: string;
  passwordHint: string;
  createAdminBtn: string;
  creatingBtn: string;
  signInBtn: string;
  signingInBtn: string;
  backToSite: string;
  switchLangLabel: string;
  viewSite: string;
  signOut: string;
  tabPosts: string;
  tabCategories: string;
  tabProjects: string;
  tabMessages: string;
  tabMedia: string;
  tabAppearance: string;
  tabSettings: string;
  tabAi: string;
  tabSecurity: string;
  saveChanges: string;
  saving: string;
  cancel: string;
  deleteLabel: string;
  editLabel: string;
  addNew: string;
  aiTranslateBtn: string;
  aiTranslating: string;
  aiTranslatedOk: string;
  persianContentTab: string;
  englishContentTab: string;
  englishOptionalHint: string;
  previewThemeDark: string;
  previewThemeLight: string;
  previewThemeAuto: string;
  uploadFromDevice: string;
  uploading: string;
  resetDefault: string;
  hideLabel: string;
  dragHint: string;
}

const ADMIN_FA: AdminUiDict = {
  loadingPanel: 'در حال بررسی نشست مدیریت...',
  portalTitle: 'پنل مدیریت سایت',
  portalSubtitle: 'مدیریت کامل محتوا، رسانه‌ها، تم، زبان و امنیت',
  firstRunTitle: 'راه‌اندازی اولیه حساب مدیر',
  firstRunSubtitle: 'یک نام کاربری و رمز عبور قوی برای مدیریت وب‌سایت انتخاب کن.',
  loginSubtitle: 'ورود ایمن به پنل مدیریت وب‌سایت',
  usernameLabel: 'نام کاربری مدیر',
  passwordLabel: 'رمز عبور',
  passwordHint: 'حداقل ۸ کاراکتر شامل حروف انگلیسی و عدد',
  createAdminBtn: 'ساخت حساب مدیر و ورود',
  creatingBtn: 'در حال ایجاد حساب...',
  signInBtn: 'ورود به پنل',
  signingInBtn: 'در حال ورود...',
  backToSite: 'بازگشت به سایت',
  switchLangLabel: 'EN',
  viewSite: 'مشاهده سایت',
  signOut: 'خروج',
  tabPosts: 'نوشته‌ها',
  tabCategories: 'دسته‌بندی‌ها',
  tabProjects: 'پروژه‌ها',
  tabMessages: 'پیام‌ها',
  tabMedia: 'رسانه‌ها',
  tabAppearance: 'ظاهر، تم و زبان',
  tabSettings: 'تنظیمات و متون',
  tabAi: 'هوش مصنوعی',
  tabSecurity: 'امنیت',
  saveChanges: 'ذخیره تغییرات',
  saving: 'در حال ذخیره...',
  cancel: 'انصراف',
  deleteLabel: 'حذف',
  editLabel: 'ویرایش',
  addNew: 'افزودن مورد جدید',
  aiTranslateBtn: 'ترجمه هوشمند به انگلیسی',
  aiTranslating: 'در حال ترجمه...',
  aiTranslatedOk: 'نسخه انگلیسی با هوش مصنوعی پر شد. مرور کن و ذخیره بزن.',
  persianContentTab: 'محتوای فارسی (اصلی)',
  englishContentTab: 'نسخه انگلیسی (EN)',
  englishOptionalHint: 'برای نمایش کامل در حالت انگلیسی، متن انگلیسی را وارد کن یا دکمه ترجمه هوشمند را بزن.',
  previewThemeDark: 'تم تیره',
  previewThemeLight: 'تم روشن',
  previewThemeAuto: 'تم خودکار',
  uploadFromDevice: 'آپلود از دستگاه',
  uploading: 'در حال آپلود...',
  resetDefault: 'پیش‌فرض',
  hideLabel: 'مخفی',
  dragHint: 'بکشید و رها کنید تا ترتیب تغییر کند',
};

const ADMIN_EN: AdminUiDict = {
  loadingPanel: 'Checking admin session...',
  portalTitle: 'Admin Portal',
  portalSubtitle: 'Manage content, media, theme, bilingual copy, and security',
  firstRunTitle: 'Initial Admin Setup',
  firstRunSubtitle: 'Choose a strong username and password to initialize your site.',
  loginSubtitle: 'Secure sign-in to the site management portal',
  usernameLabel: 'Admin Username',
  passwordLabel: 'Password',
  passwordHint: 'At least 8 characters with English letters and digits',
  createAdminBtn: 'Create Admin Account & Sign In',
  creatingBtn: 'Creating account...',
  signInBtn: 'Sign In',
  signingInBtn: 'Signing in...',
  backToSite: 'Back to Site',
  switchLangLabel: 'فا',
  viewSite: 'View Site',
  signOut: 'Sign Out',
  tabPosts: 'Posts',
  tabCategories: 'Categories',
  tabProjects: 'Projects',
  tabMessages: 'Messages',
  tabMedia: 'Media',
  tabAppearance: 'Appearance & Bilingual',
  tabSettings: 'Site Copy & Links',
  tabAi: 'AI Assistant',
  tabSecurity: 'Security',
  saveChanges: 'Save Changes',
  saving: 'Saving...',
  cancel: 'Cancel',
  deleteLabel: 'Delete',
  editLabel: 'Edit',
  addNew: 'Add New',
  aiTranslateBtn: 'AI Translate to English',
  aiTranslating: 'Translating...',
  aiTranslatedOk: 'English version generated with AI. Review and save.',
  persianContentTab: 'Persian Content (Primary)',
  englishContentTab: 'English Version (EN)',
  englishOptionalHint: 'Enter English copy manually or use one-click AI translation for seamless bilingual switching.',
  previewThemeDark: 'Dark Theme',
  previewThemeLight: 'Light Theme',
  previewThemeAuto: 'Auto Theme',
  uploadFromDevice: 'Upload File',
  uploading: 'Uploading...',
  resetDefault: 'Default',
  hideLabel: 'Hide',
  dragHint: 'Drag and drop to reorder',
};

export function getAdminDict(lang: SiteLanguage): AdminUiDict {
  return lang === 'en' ? ADMIN_EN : ADMIN_FA;
}
