import {
  Globe,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Navigation,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { reorderArray } from '../../lib/blocks.ts';
import { DEFAULT_NAV_ITEMS, parseNavItems } from '../../lib/i18n.ts';
import { DEFAULT_THEME_COLORS } from '../../lib/theme.ts';
import type { NavItem, SiteLanguage, SiteSettings, ThemeMode } from '../../types/cms.ts';

interface AdminAppearancePanelProps {
  settings: SiteSettings;
  adminLang: SiteLanguage;
  onChange: (updater: (prev: SiteSettings) => SiteSettings) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  onUploadFile: (file: File) => Promise<string | null>;
  onTranslateSiteCopy?: () => Promise<void>;
  translatingSiteCopy?: boolean;
}

interface MediaFieldRowProps {
  label: string;
  hint?: string;
  value: string;
  accept: string;
  defaultValue: string;
  allowHide?: boolean;
  isEn: boolean;
  onChange: (val: string) => void;
  onUploadFile: (file: File) => Promise<string | null>;
}

function MediaFieldRow({
  label,
  hint,
  value,
  accept,
  defaultValue,
  allowHide = false,
  isEn,
  onChange,
  onUploadFile,
}: MediaFieldRowProps) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUploadFile(file);
      if (url) onChange(url);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="block text-xs font-semibold text-[var(--ink)]">{label}</span>
          {hint && <span className="text-[11px] text-[var(--ink-faint)]">{hint}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--ink)] hover:opacity-90">
            <Upload className="h-3 w-3 text-[var(--flame)]" />
            <span>
              {uploading
                ? isEn
                  ? 'Uploading...'
                  : 'در حال آپلود...'
                : isEn
                  ? 'Upload File'
                  : 'آپلود فایل'}
            </span>
            <input
              type="file"
              accept={accept}
              onChange={(e) => void handleFile(e)}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            title={isEn ? 'Reset to default file' : 'بازگشت به فایل پیش‌فرض'}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] px-2.5 py-1.5 text-[11px] text-[var(--ink-muted)] hover:border-[var(--flame)] hover:text-[var(--ink)]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{isEn ? 'Default' : 'پیش‌فرض'}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange(allowHide ? '__hidden__' : '')}
            title={allowHide ? (isEn ? 'Hide' : 'مخفی کردن') : isEn ? 'Remove' : 'حذف'}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-red-500/30 px-2.5 py-1.5 text-[11px] text-[var(--status-error-ink)] hover:bg-red-500/15"
          >
            <Trash2 className="h-3 w-3" />
            <span>{allowHide ? (isEn ? 'Hide' : 'مخفی') : isEn ? 'Remove' : 'حذف'}</span>
          </button>
        </div>
      </div>

      <input
        type="text"
        dir="ltr"
        value={value === '__hidden__' ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          value === '__hidden__'
            ? isEn
              ? 'Hidden (click Default or Upload to restore)'
              : 'مخفی شده (برای بازگشت، پیش‌فرض یا آپلود را بزن)'
            : defaultValue
        }
        className="mt-2.5 w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
      />
    </div>
  );
}

function ToggleCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] px-3.5 py-2.5 text-xs text-[var(--ink-soft)] transition-colors hover:border-[var(--flame-border)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--flame)]"
      />
      <span>{label}</span>
    </label>
  );
}

export function AdminAppearancePanel({
  settings,
  adminLang,
  onChange,
  onSave,
  saving,
  onUploadFile,
  onTranslateSiteCopy,
  translatingSiteCopy = false,
}: AdminAppearancePanelProps) {
  const isEn = adminLang === 'en';
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const navItems: NavItem[] = parseNavItems(settings.navItemsJson);

  const setNavItems = (next: NavItem[]) => {
    onChange((prev) => ({ ...prev, navItemsJson: JSON.stringify(next) }));
  };

  const addNavItem = () => {
    const id = `nav_${Date.now()}`;
    setNavItems([
      ...navItems,
      { id, labelFa: 'لینک جدید', labelEn: 'New Link', to: '/blog', enabled: true, external: false },
    ]);
  };

  const updateNavItem = (idx: number, patch: Partial<NavItem>) => {
    const next = navItems.map((item, i) => {
      if (i !== idx) return item;
      const merged = { ...item, ...patch };
      if (typeof patch.to === 'string') {
        const trimmed = patch.to.trim();
        merged.external = trimmed.startsWith('http://') || trimmed.startsWith('https://');
      }
      return merged;
    });
    setNavItems(next);
  };

  const removeNavItem = (idx: number) => {
    setNavItems(navItems.filter((_, i) => i !== idx));
  };

  const resetThemeColors = () => {
    onChange((prev) => ({
      ...prev,
      ...DEFAULT_THEME_COLORS,
    }));
  };

  return (
    <div className="space-y-6">
      {/* 1. Branding & Landing Page Media */}
      <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
              <ImageIcon className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">
                {isEn
                  ? 'Core Site Media (Logo, Favicon, Hero Video & Posters)'
                  : 'رسانه‌های اصلی سایت (لوگو، فاوآیکون، ویدیو و پوستر لندینگ‌پیج)'}
              </h2>
              <p className="text-xs text-[var(--ink-faint)]">
                {isEn
                  ? 'Upload from device, paste a URL, hide, or restore defaults anytime.'
                  : 'می‌توانی فایل جدید از دستگاه آپلود کنی، لینک بدهی، حذف کنی یا به حالت پیش‌فرض برگردانی.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-xs disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            <span>
              {saving
                ? isEn
                  ? 'Saving...'
                  : 'در حال ذخیره...'
                : isEn
                  ? 'Save Changes'
                  : 'ذخیره تغییرات'}
            </span>
          </button>
        </div>

        <div className="mb-4">
          <ToggleCheckbox
            label={
              isEn
                ? 'Enable animated hero background video (when off, only the lightweight poster image loads)'
                : 'پخش ویدیوی متحرک پس‌زمینه در لندینگ‌پیج (با خاموش کردن، فقط تصویر سبک نمایش داده می‌شود)'
            }
            checked={settings.heroVideoEnabled !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, heroVideoEnabled: next ? 'true' : 'false' }))
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <MediaFieldRow
            label={isEn ? 'Header & Footer Logo' : 'لوگو هدر و پاورقی'}
            hint="WebP / PNG / SVG"
            value={settings.logoImage || ''}
            accept="image/*"
            defaultValue="/logo.webp"
            allowHide
            isEn={isEn}
            onChange={(val) => onChange((prev) => ({ ...prev, logoImage: val }))}
            onUploadFile={onUploadFile}
          />
          <MediaFieldRow
            label={isEn ? 'Browser Favicon' : 'فاوآیکون (آیکون تب مرورگر)'}
            hint={isEn ? 'Square PNG or ICO' : 'PNG یا ICO مربعی'}
            value={settings.faviconImage || ''}
            accept="image/*"
            defaultValue="/favicon.png"
            isEn={isEn}
            onChange={(val) => onChange((prev) => ({ ...prev, faviconImage: val }))}
            onUploadFile={onUploadFile}
          />
          <MediaFieldRow
            label={isEn ? 'Hero Background Video (Desktop)' : 'ویدیوی پس‌زمینه لندینگ (دسکتاپ)'}
            hint={isEn ? 'Landscape MP4 or WebM' : 'MP4 یا WebM سبک افقی'}
            value={settings.heroVideoDesktop || ''}
            accept="video/mp4,video/webm"
            defaultValue="/hero-loop.mp4"
            isEn={isEn}
            onChange={(val) => onChange((prev) => ({ ...prev, heroVideoDesktop: val }))}
            onUploadFile={onUploadFile}
          />
          <MediaFieldRow
            label={isEn ? 'Hero Background Video (Mobile)' : 'ویدیوی پس‌زمینه لندینگ (موبایل)'}
            hint={isEn ? 'Portrait MP4 or WebM' : 'MP4 یا WebM عمودی'}
            value={settings.heroVideoMobile || ''}
            accept="video/mp4,video/webm"
            defaultValue="/hero-loop-mobile.mp4"
            isEn={isEn}
            onChange={(val) => onChange((prev) => ({ ...prev, heroVideoMobile: val }))}
            onUploadFile={onUploadFile}
          />
          <MediaFieldRow
            label={isEn ? 'Hero Poster Image (Desktop)' : 'تصویر / پوستر پس‌زمینه (دسکتاپ)'}
            hint={isEn ? 'Fast initial paint on slow connections' : 'تصویر سبک برای لود فوری در اینترنت ضعیف'}
            value={settings.heroPosterDesktop || ''}
            accept="image/*"
            defaultValue="/poster.webp"
            isEn={isEn}
            onChange={(val) => onChange((prev) => ({ ...prev, heroPosterDesktop: val }))}
            onUploadFile={onUploadFile}
          />
          <MediaFieldRow
            label={isEn ? 'Hero Poster Image (Mobile)' : 'تصویر / پوستر پس‌زمینه (موبایل)'}
            hint={isEn ? 'Portrait mobile poster' : 'نسخه عمودی برای گوشی'}
            value={settings.heroPosterMobile || ''}
            accept="image/*"
            defaultValue="/poster-mobile.webp"
            isEn={isEn}
            onChange={(val) => onChange((prev) => ({ ...prev, heroPosterMobile: val }))}
            onUploadFile={onUploadFile}
          />
        </div>
      </section>

      {/* 2. Theme (Dark / Light / Auto) & Brand Palette — Live Synced with Admin Portal! */}
      <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
              <Palette className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">
                {isEn
                  ? 'Theme (Dark / Light / Auto) & Live Color Palette'
                  : 'تم (تیره / روشن / خودکار) و رنگ‌های اصلی'}
              </h2>
              <p className="text-xs text-[var(--ink-faint)]">
                {isEn
                  ? 'Changes apply live to both the public site and this Admin Portal.'
                  : 'هر تغییری در تم و رنگ‌ها به‌صورت زنده هم روی سایت اصلی و هم همین پنل مدیریت اعمال می‌شود.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetThemeColors}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[var(--flame)]" />
            <span>{isEn ? 'Reset Default Palette' : 'بازگشت به رنگ‌بندی اصلی لوگو'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-[var(--ink-muted)]">
              {isEn ? 'Default Site Theme' : 'حالت تم پیش‌فرض سایت'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'dark', label: isEn ? 'Dark' : 'تیره (Dark)' },
                  { id: 'light', label: isEn ? 'Light' : 'روشن (Light)' },
                  { id: 'auto', label: isEn ? 'Auto (OS)' : 'خودکار (سیستم)' },
                ] as Array<{ id: ThemeMode; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, themeMode: opt.id }))}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    settings.themeMode === opt.id
                      ? 'border-[var(--flame)] bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                      : 'border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink-soft)] hover:border-[var(--flame-border)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <ToggleCheckbox
              label={
                isEn
                  ? 'Show Theme Switcher button (Dark / Light / Auto) in the public navbar (default OFF)'
                  : 'نمایش دکمه تغییر تم (تیره / روشن / خودکار) در نوار بالای سایت (پیش‌فرض خاموش)'
              }
              checked={settings.allowThemeToggle === 'true'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, allowThemeToggle: next ? 'true' : 'false' }))
              }
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(
            [
              { key: 'accentColor', label: isEn ? 'Accent Color' : 'رنگ اصلی (تاکید)' },
              { key: 'darkBgColor', label: isEn ? 'Dark Ground' : 'پس‌زمینه تیره' },
              { key: 'darkSurfaceColor', label: isEn ? 'Dark Card' : 'کارت تیره' },
              { key: 'darkInkColor', label: isEn ? 'Dark Text' : 'متن تیره' },
              { key: 'lightBgColor', label: isEn ? 'Light Ground' : 'پس‌زمینه روشن' },
              { key: 'lightSurfaceColor', label: isEn ? 'Light Card' : 'کارت روشن' },
              { key: 'lightInkColor', label: isEn ? 'Light Text' : 'متن روشن' },
            ] as Array<{ key: keyof typeof DEFAULT_THEME_COLORS; label: string }>
          ).map((item) => (
            <label
              key={item.key}
              className="flex flex-col gap-1.5 rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] p-2.5 text-[11px] text-[var(--ink-muted)]"
            >
              <span>{item.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings[item.key] || DEFAULT_THEME_COLORS[item.key]}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, [item.key]: e.target.value.toUpperCase() }))
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-[var(--hair-strong)] bg-transparent"
                />
                <span className="font-mono text-[10px] text-[var(--ink-muted)]" dir="ltr">
                  {settings[item.key] || DEFAULT_THEME_COLORS[item.key]}
                </span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* 3. Bilingual Mode (Persian + English) — Default OFF, Opt-in */}
      <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
              <Globe className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">
                {isEn
                  ? 'Bilingual Mode (Persian & English)'
                  : 'حالت دوزبانه سایت (فارسی و انگلیسی)'}
              </h2>
              <p className="text-xs text-[var(--ink-faint)]">
                {isEn
                  ? 'Off by default (Persian only). Enable when ready so visitors can switch seamlessly between FA (RTL) and EN (LTR).'
                  : 'به‌صورت پیش‌فرض خاموش و فقط فارسی است. هر زمان خواستی فعالش کن تا همه نوشته‌ها، دسته‌بندی‌ها، پروژه‌ها و دکمه‌ها بدون باگ دوزبانه شوند.'}
              </p>
            </div>
          </div>

          {onTranslateSiteCopy && (
            <button
              type="button"
              disabled={translatingSiteCopy}
              onClick={() => void onTranslateSiteCopy()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] hover:opacity-90 disabled:opacity-60"
            >
              {translatingSiteCopy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--flame)]" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-[var(--flame)]" />
              )}
              <span>
                {translatingSiteCopy
                  ? isEn
                    ? 'Translating site texts...'
                    : 'در حال ترجمه هوشمند متون...'
                  : isEn
                    ? 'AI-Translate All Site Copy to EN'
                    : 'ترجمه هوشمند تمام متون سایت به انگلیسی'}
              </span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-[var(--ink-muted)]">
              {isEn ? 'Default Site Language' : 'زبان پیش‌فرض سایت'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'fa', label: isEn ? 'Persian (RTL)' : 'فارسی (راست‌به‌چپ)' },
                  { id: 'en', label: isEn ? 'English (LTR)' : 'انگلیسی (چپ‌به‌راست)' },
                ] as Array<{ id: SiteLanguage; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, defaultLanguage: opt.id }))}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    (settings.defaultLanguage || 'fa') === opt.id
                      ? 'border-[var(--flame)] bg-[var(--flame)] font-bold text-[var(--flame-ink)]'
                      : 'border-[var(--hair-strong)] bg-[var(--ground-deep)] text-[var(--ink-soft)] hover:border-[var(--flame-border)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <ToggleCheckbox
              label={
                isEn
                  ? 'Show Language Switcher (FA / EN) in the public navbar (default OFF)'
                  : 'نمایش دکمه تغییر زبان (FA / EN) در نوار بالای سایت (پیش‌فرض خاموش)'
              }
              checked={settings.allowLanguageToggle === 'true'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, allowLanguageToggle: next ? 'true' : 'false' }))
              }
            />
          </div>
        </div>
      </section>

      {/* 4. Navigation Tabs Manager (Add / Edit FA+EN / Drag-and-Drop / Toggle / Delete) */}
      <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
              <Navigation className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">
                {isEn ? 'Navigation & Footer Tabs' : 'مدیریت تب‌های منو و پاورقی'}
              </h2>
              <p className="text-xs text-[var(--ink-faint)]">
                {isEn
                  ? 'Drag and drop to reorder tabs. Edit both Persian and English titles or hide/delete any tab.'
                  : 'تب‌ها را بکش و رها کن تا ترتیبشان عوض شود؛ عنوان فارسی و انگلیسی هر تب قابل ویرایش است.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNavItems(DEFAULT_NAV_ITEMS)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:border-[var(--flame)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isEn ? 'Default Tabs' : 'تب‌های پیش‌فرض'}</span>
            </button>
            <button
              type="button"
              onClick={addNavItem}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5 text-[var(--flame)]" />
              <span>{isEn ? 'Add Tab' : 'افزودن تب جدید'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {navItems.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx === null || dragIdx === idx) return;
                setNavItems(reorderArray(navItems, dragIdx, idx));
                setDragIdx(null);
              }}
              onDragEnd={() => setDragIdx(null)}
              className="grid grid-cols-1 items-center gap-2.5 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3 md:grid-cols-12"
            >
              <div className="flex items-center gap-2 md:col-span-1">
                <GripVertical className="h-4 w-4 cursor-grab text-[var(--ink-faint)]" />
                <input
                  type="checkbox"
                  checked={item.enabled !== false}
                  onChange={(e) => updateNavItem(idx, { enabled: e.target.checked })}
                  title={isEn ? 'Show or hide tab' : 'نمایش یا مخفی کردن تب'}
                  className="h-4 w-4 accent-[var(--flame)]"
                />
              </div>
              <input
                type="text"
                value={item.labelFa}
                onChange={(e) => updateNavItem(idx, { labelFa: e.target.value })}
                placeholder={isEn ? 'Persian Label (e.g. وبلاگ)' : 'عنوان فارسی (مثلاً وبلاگ)'}
                className="rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none md:col-span-3"
              />
              <input
                type="text"
                dir="ltr"
                value={item.labelEn}
                onChange={(e) => updateNavItem(idx, { labelEn: e.target.value })}
                placeholder="English Label (e.g. Blog)"
                className="rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none md:col-span-3"
              />
              <input
                type="text"
                dir="ltr"
                value={item.to}
                onChange={(e) => updateNavItem(idx, { to: e.target.value })}
                placeholder="/blog or https://..."
                className="rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 font-mono text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none md:col-span-4"
              />
              <div className="flex justify-end md:col-span-1">
                <button
                  type="button"
                  onClick={() => removeNavItem(idx)}
                  aria-label={isEn ? `Delete tab ${item.labelEn}` : `حذف تب ${item.labelFa}`}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-red-500/30 text-[var(--status-error-ink)] hover:bg-red-500/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Sections, Reading Time, Contact Form & Share Buttons Controls */}
      <section className="rounded-3xl border border-[var(--hair)] bg-[var(--ground)] p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">
              {isEn
                ? 'Section Visibility & Article Share Bar'
                : 'کنترل نمایش بخش‌ها و دکمه‌های اشتراک‌گذاری'}
            </h2>
            <p className="text-xs text-[var(--ink-faint)]">
              {isEn
                ? 'Toggle any section or share button with one click.'
                : 'هر بخش یا دکمه‌ای را که فعلاً نیاز نداری می‌توانی با یک کلیک مخفی کنی.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <ToggleCheckbox
            label={isEn ? 'Show Hero Section on Homepage' : 'نمایش بخش هیرو (بالای صفحه اصلی)'}
            checked={settings.showHeroSection !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, showHeroSection: next ? 'true' : 'false' }))
            }
          />
          <ToggleCheckbox
            label={isEn ? 'Show Blog Card on Homepage' : 'نمایش کارت وبلاگ در صفحه اصلی'}
            checked={settings.showBlogCard !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, showBlogCard: next ? 'true' : 'false' }))
            }
          />
          <ToggleCheckbox
            label={isEn ? 'Show Projects Card on Homepage' : 'نمایش کارت پروژه‌ها در صفحه اصلی'}
            checked={settings.showProjectsCard !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, showProjectsCard: next ? 'true' : 'false' }))
            }
          />
          <ToggleCheckbox
            label={
              isEn
                ? 'Show About & Contact Card on Homepage'
                : 'نمایش کارت درباره من و ارتباط در صفحه اصلی'
            }
            checked={settings.showAboutCard !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, showAboutCard: next ? 'true' : 'false' }))
            }
          />
          <ToggleCheckbox
            label={isEn ? 'Enable Direct Contact Form' : 'فعال بودن فرم تماس مستقیم'}
            checked={settings.contactFormEnabled !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, contactFormEnabled: next ? 'true' : 'false' }))
            }
          />
          <ToggleCheckbox
            label={
              isEn
                ? 'Show Reading Time on Articles'
                : 'نمایش زمان مطالعه (Reading Time) روی مقالات'
            }
            checked={settings.showReadingTime !== 'false'}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, showReadingTime: next ? 'true' : 'false' }))
            }
          />
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[var(--flame)]">
            <Share2 className="h-3.5 w-3.5" />
            <span>
              {isEn ? 'Article Footer Share Bar' : 'نوار اشتراک‌گذاری انتهای مقالات'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleCheckbox
              label={isEn ? 'Show Share Box' : 'نمایش کل باکس اشتراک‌گذاری'}
              checked={settings.shareEnabled !== 'false'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, shareEnabled: next ? 'true' : 'false' }))
              }
            />
            <ToggleCheckbox
              label={isEn ? 'Copy Link Button' : 'دکمه کپی لینک'}
              checked={settings.shareCopyEnabled !== 'false'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, shareCopyEnabled: next ? 'true' : 'false' }))
              }
            />
            <ToggleCheckbox
              label={isEn ? 'Share on Telegram' : 'دکمه اشتراک در تلگرام'}
              checked={settings.shareTelegramEnabled !== 'false'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, shareTelegramEnabled: next ? 'true' : 'false' }))
              }
            />
            <ToggleCheckbox
              label={isEn ? 'Share on WhatsApp' : 'دکمه اشتراک در واتساپ'}
              checked={settings.shareWhatsappEnabled !== 'false'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, shareWhatsappEnabled: next ? 'true' : 'false' }))
              }
            />
            <ToggleCheckbox
              label={isEn ? 'Share on X' : 'دکمه اشتراک در ایکس (X)'}
              checked={settings.shareXEnabled !== 'false'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, shareXEnabled: next ? 'true' : 'false' }))
              }
            />
            <ToggleCheckbox
              label={isEn ? 'Native Mobile Share (Web Share)' : 'دکمه ارسال مستقیم موبایل (Web Share)'}
              checked={settings.shareNativeEnabled !== 'false'}
              onChange={(next) =>
                onChange((prev) => ({ ...prev, shareNativeEnabled: next ? 'true' : 'false' }))
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Share Heading (FA)' : 'تیتر باکس اشتراک‌گذاری (فارسی)'}
              </label>
              <input
                type="text"
                value={settings.shareHeading || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, shareHeading: e.target.value }))}
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Share Heading (EN)' : 'تیتر باکس اشتراک‌گذاری (انگلیسی)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={settings.shareHeadingEn || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, shareHeadingEn: e.target.value }))}
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Share Subtitle (FA)' : 'زیرتیتر باکس اشتراک‌گذاری (فارسی)'}
              </label>
              <input
                type="text"
                value={settings.shareSubtitle || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, shareSubtitle: e.target.value }))}
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Share Subtitle (EN)' : 'زیرتیتر باکس اشتراک‌گذاری (انگلیسی)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={settings.shareSubtitleEn || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, shareSubtitleEn: e.target.value }))}
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Save Contact Button Label (FA)' : 'متن دکمه «افزودن به مخاطبین» (فارسی)'}
              </label>
              <input
                type="text"
                value={settings.vcardButtonLabel || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, vcardButtonLabel: e.target.value }))}
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Save Contact Button Label (EN)' : 'متن دکمه «افزودن به مخاطبین» (انگلیسی)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={settings.vcardButtonLabelEn || ''}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, vcardButtonLabelEn: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Contact Success Message (FA)' : 'پیام موفقیت پس از ارسال فرم تماس (فارسی)'}
              </label>
              <input
                type="text"
                value={settings.contactSuccessMessage || ''}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, contactSuccessMessage: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-muted)]">
                {isEn ? 'Contact Success Message (EN)' : 'پیام موفقیت پس از ارسال فرم تماس (انگلیسی)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={settings.contactSuccessMessageEn || ''}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, contactSuccessMessageEn: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--hair)] bg-[var(--ground)] px-3 py-2 text-xs text-[var(--ink)] focus:border-[var(--flame)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-[var(--hair)] pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-5 py-2.5 text-xs disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>
              {saving
                ? isEn
                  ? 'Saving...'
                  : 'در حال ذخیره...'
                : isEn
                  ? 'Save All Appearance, Theme, Bilingual & Menu Settings'
                  : 'ذخیره تمام تنظیمات ظاهر، تم، زبان و منوها'}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
