export type BlockType =
  | 'h2'
  | 'h3'
  | 'paragraph'
  | 'card'
  | 'button'
  | 'embed'
  | 'quote'
  | 'code'
  | 'list'
  | 'image'
  | 'video'
  | 'audio';

export interface HeadingBlock {
  id: string;
  type: 'h2' | 'h3';
  text: string;
}

export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  text: string;
}

export interface CardBlock {
  id: string;
  type: 'card';
  title: string;
  body: string;
  accent?: 'flame' | 'neutral';
}

export interface ButtonBlock {
  id: string;
  type: 'button';
  label: string;
  url: string;
  variant?: 'primary' | 'secondary';
}

export interface EmbedBlock {
  id: string;
  type: 'embed';
  title: string;
  url: string;
  description?: string;
}

export interface QuoteBlock {
  id: string;
  type: 'quote';
  text: string;
  author?: string;
}

export interface CodeBlock {
  id: string;
  type: 'code';
  language: string;
  code: string;
}

export interface ListBlock {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface ImageBlock {
  id: string;
  type: 'image';
  url: string;
  alt?: string;
  caption?: string;
}

export interface VideoBlock {
  id: string;
  type: 'video';
  url: string;
  caption?: string;
}

export interface AudioBlock {
  id: string;
  type: 'audio';
  url: string;
  title?: string;
  caption?: string;
}

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | CardBlock
  | ButtonBlock
  | EmbedBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | ImageBlock
  | VideoBlock
  | AudioBlock;

export type SocialIconKey =
  | 'telegram'
  | 'bale'
  | 'email'
  | 'github'
  | 'instagram'
  | 'youtube'
  | 'aparat'
  | 'x'
  | 'linkedin'
  | 'whatsapp'
  | 'eitaa'
  | 'rubika'
  | 'discord'
  | 'virgool'
  | 'spotify'
  | 'phone'
  | 'globe';

export interface SocialPlatformLink {
  id: string;
  label: string;
  labelEn?: string;
  handle: string;
  url: string;
  iconKey: SocialIconKey;
  enabled: boolean;
}

export interface NavItem {
  id: string;
  labelFa: string;
  labelEn: string;
  to: string;
  enabled: boolean;
  external?: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'auto';
export type SiteLanguage = 'fa' | 'en';

export type VCardExtraFieldType = 'tel' | 'email' | 'url' | 'address' | 'note';

export interface VCardExtraField {
  id: string;
  type: VCardExtraFieldType;
  label: string;
  value: string;
}

export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  brandName: string;
  logoImage: string;
  faviconImage: string;

  // Hero media & visibility
  heroVideoEnabled: string;
  heroVideoDesktop: string;
  heroVideoMobile: string;
  heroPosterDesktop: string;
  heroPosterMobile: string;

  // Editable Persian copy
  heroTitle: string;
  heroSubtitle: string;
  blogSectionTitle: string;
  blogPageTitle: string;
  blogPageSubtitle: string;
  projectsSectionTitle: string;
  projectsPageSubtitle: string;
  aboutTitle: string;
  aboutBio: string;
  aboutFocusHeading: string;
  aboutFocusText: string;
  aboutConnectHeading: string;
  contactFormHeading: string;
  contactSuccessMessage: string;
  vcardButtonLabel: string;
  footerText: string;

  // Natural English translations (editable from Admin)
  heroTitleEn: string;
  heroSubtitleEn: string;
  blogSectionTitleEn: string;
  blogPageTitleEn: string;
  blogPageSubtitleEn: string;
  projectsSectionTitleEn: string;
  projectsPageSubtitleEn: string;
  aboutTitleEn: string;
  aboutBioEn: string;
  aboutFocusHeadingEn: string;
  aboutFocusTextEn: string;
  aboutConnectHeadingEn: string;
  contactFormHeadingEn: string;
  contactSuccessMessageEn: string;
  vcardButtonLabelEn: string;
  footerTextEn: string;

  // Navigation & Section controls
  navItemsJson: string;
  showHeroSection: string;
  showBlogCard: string;
  showProjectsCard: string;
  showAboutCard: string;
  contactFormEnabled: string;
  showReadingTime: string;

  // Article Share bar controls
  shareEnabled: string;
  shareHeading: string;
  shareHeadingEn: string;
  shareSubtitle: string;
  shareSubtitleEn: string;
  shareCopyEnabled: string;
  shareTelegramEnabled: string;
  shareWhatsappEnabled: string;
  shareXEnabled: string;
  shareNativeEnabled: string;

  // Theme & Colors + Language
  themeMode: ThemeMode;
  allowThemeToggle: string;
  accentColor: string;
  darkBgColor: string;
  darkSurfaceColor: string;
  darkInkColor: string;
  lightBgColor: string;
  lightSurfaceColor: string;
  lightInkColor: string;
  defaultLanguage: SiteLanguage;
  allowLanguageToggle: string;

  // Contact & vCard
  email: string;
  telegramHandle: string;
  telegramUrl: string;
  vcardEnabled: string;
  vcardFullName: string;
  vcardOrg: string;
  vcardTitle: string;
  vcardNote: string;
  vcardPhone: string;
  vcardWebsite: string;
  vcardAvatar: string;
  vcardExtraFieldsJson: string;
  socialLinksJson: string;
}

export interface CategoryItem {
  id: number;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  descriptionEn: string;
  sortOrder: number;
}

export interface BlogPost {
  id: number;
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  excerptEn: string;
  category: string;
  coverImage: string;
  blocks: ContentBlock[];
  blocksEn: ContentBlock[];
  published: boolean;
  readingMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectItem {
  id: number;
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
}

export interface ContactMessage {
  id: number;
  name: string;
  contact: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface UploadedMediaItem {
  filename: string;
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  sizeBytes: number;
}

export type AiProviderType = 'gemini' | 'openai_compatible';

export interface AiConfigPublic {
  provider: AiProviderType;
  model: string;
  baseUrl: string;
  hasCustomApiKey: boolean;
  keyHint: string;
  envGeminiAvailable: boolean;
  envOpenAiAvailable: boolean;
}

export interface AiBlockUpdate {
  index: number;
  block: ContentBlock;
}

export interface AiPostPatch {
  mode: 'replace' | 'append' | 'meta_only' | 'patch_blocks';
  targetLang?: SiteLanguage;
  title?: string;
  slug?: string;
  excerpt?: string;
  category?: string;
  blocks?: ContentBlock[];
  blockUpdates?: AiBlockUpdate[];
  removeBlockIndices?: number[];
}

export interface AiAssistResponse {
  reply: string;
  patch?: AiPostPatch | null;
  providerUsed: AiProviderType;
  modelUsed: string;
}

export interface PublicSiteData {
  settings: SiteSettings;
  categories: CategoryItem[];
  posts: BlogPost[];
  projects: ProjectItem[];
}

export type SystemLogLevel = 'info' | 'warn' | 'error';

export type SystemLogSource =
  | 'server'
  | 'auth'
  | 'db'
  | 'settings'
  | 'vcard'
  | 'posts'
  | 'categories'
  | 'projects'
  | 'media'
  | 'ai'
  | 'backup'
  | 'contact'
  | 'client';

export interface SystemLogEntry {
  id: number;
  level: SystemLogLevel;
  source: SystemLogSource;
  method: string;
  path: string;
  status: number;
  message: string;
  details: string;
  createdAt: string;
}

export interface SystemLogsResponse {
  logs: SystemLogEntry[];
  counts: {
    total: number;
    error: number;
    warn: number;
    info: number;
  };
}

export interface BackupMediaRecord {
  publicId: string;
  filename: string;
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  resourceType: 'image' | 'video' | 'raw';
  sizeBytes: number;
  createdAt: string;
}

export interface SiteBackupPayload {
  format: 'cms-full-backup';
  version: 1;
  exportedAt: string;
  settings: Partial<SiteSettings>;
  aiConfig?: {
    provider: AiProviderType;
    model: string;
    baseUrl: string;
  };
  categories: Array<Omit<CategoryItem, 'id'> & { id?: number }>;
  posts: Array<Omit<BlogPost, 'id'> & { id?: number }>;
  projects: Array<Omit<ProjectItem, 'id'> & { id?: number }>;
  messages: Array<Omit<ContactMessage, 'id'> & { id?: number }>;
  mediaAssets: BackupMediaRecord[];
}

