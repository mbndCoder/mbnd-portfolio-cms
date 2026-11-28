import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { SiteBackupPayload, SiteLanguage } from '../../types/cms.ts';

interface AdminBackupPanelProps {
  adminLang: SiteLanguage;
  counts: {
    settings: number;
    categories: number;
    posts: number;
    projects: number;
    messages: number;
    media: number;
  };
  authHeaders: (extra?: Record<string, string>) => Record<string, string>;
  onRestored: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface ParsedPreview {
  raw: Record<string, unknown>;
  filename: string;
  exportedAt: string;
  settingsCount: number;
  categoriesCount: number;
  postsCount: number;
  projectsCount: number;
  messagesCount: number;
  mediaCount: number;
}

export function AdminBackupPanel({
  adminLang,
  counts,
  authHeaders,
  onRestored,
  onNotify,
}: AdminBackupPanelProps) {
  const isEn = adminLang === 'en';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parseError, setParseError] = useState('');
  const [restoreSummary, setRestoreSummary] = useState<string>('');

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/backup/export', {
        method: 'GET',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        onNotify(
          errData.error ||
            (isEn ? 'Failed to export site backup.' : 'خطا در تهیه نسخه پشتیبان.'),
          true,
        );
        return;
      }
      const blob = await res.blob();
      const dateStamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `site-backup-${dateStamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify(
        isEn
          ? 'Full site backup exported successfully.'
          : 'فایل پشتیبان کامل سایت با موفقیت دانلود شد.',
      );
    } catch {
      onNotify(
        isEn ? 'Network error while exporting backup.' : 'خطای ارتباط هنگام دانلود فایل پشتیبان.',
        true,
      );
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (file: File | null) => {
    setParseError('');
    setRestoreSummary('');
    if (!file) {
      setPreview(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPreview(null);
      setParseError(
        isEn
          ? 'Backup file exceeds the 10MB limit.'
          : 'حجم فایل پشتیبان بیش از ۱۰ مگابایت است.',
      );
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SiteBackupPayload> & Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid JSON');
      }
      if (parsed.format !== 'cms-full-backup' || !parsed.settings) {
        setPreview(null);
        setParseError(
          isEn
            ? 'This file does not match the supported site backup format.'
            : 'فرمت این فایل با فایل پشتیبان استاندارد سایت مطابقت ندارد.',
        );
        return;
      }
      setPreview({
        raw: parsed,
        filename: file.name,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
        settingsCount:
          parsed.settings && typeof parsed.settings === 'object'
            ? Object.keys(parsed.settings).length
            : 0,
        categoriesCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
        postsCount: Array.isArray(parsed.posts) ? parsed.posts.length : 0,
        projectsCount: Array.isArray(parsed.projects) ? parsed.projects.length : 0,
        messagesCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
        mediaCount: Array.isArray(parsed.mediaAssets) ? parsed.mediaAssets.length : 0,
      });
    } catch {
      setPreview(null);
      setParseError(
        isEn
          ? 'Could not parse the selected file. Make sure it is a valid .json backup.'
          : 'فایل انتخاب‌شده قابل خواندن نیست. مطمئن شو یک فایل پشتیبان JSON معتبر است.',
      );
    }
  };

  const handleRestore = async () => {
    if (!preview) return;
    setImporting(true);
    setRestoreSummary('');
    try {
      const res = await fetch('/api/admin/backup/import', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mode,
          backup: preview.raw,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        restored?: {
          settings: number;
          categories: number;
          posts: number;
          projects: number;
          messages: number;
          mediaAssets: number;
        };
      };
      if (!res.ok || !data.ok) {
        onNotify(
          data.error ||
            (isEn ? 'Failed to restore backup.' : 'بازیابی نسخه پشتیبان با خطا مواجه شد.'),
          true,
        );
        return;
      }

      await onRestored();
      const r = data.restored;
      const summary = r
        ? isEn
          ? `Restored ${r.settings} settings, ${r.posts} posts, ${r.categories} categories, ${r.projects} projects, ${r.messages} messages, and ${r.mediaAssets} media files.`
          : `بازیابی کامل شد: ${r.settings} تنظیم، ${r.posts} نوشته، ${r.categories} دسته‌بندی، ${r.projects} پروژه، ${r.messages} پیام و ${r.mediaAssets} فایل رسانه.`
        : isEn
          ? 'Backup restored successfully.'
          : 'بازیابی با موفقیت انجام شد.';
      setRestoreSummary(summary);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onNotify(
        isEn
          ? 'Backup restored and panel synchronized.'
          : 'نسخه پشتیبان با موفقیت بازیابی و پنل همگام‌سازی شد.',
      );
    } catch {
      onNotify(
        isEn ? 'Network error while restoring backup.' : 'خطای ارتباط هنگام بازیابی نسخه پشتیبان.',
        true,
      );
    } finally {
      setImporting(false);
    }
  };

  const inventoryCards = [
    { label: isEn ? 'Settings' : 'تنظیمات', value: counts.settings },
    { label: isEn ? 'Posts' : 'نوشته‌ها', value: counts.posts },
    { label: isEn ? 'Categories' : 'دسته‌بندی‌ها', value: counts.categories },
    { label: isEn ? 'Projects' : 'پروژه‌ها', value: counts.projects },
    { label: isEn ? 'Messages' : 'پیام‌ها', value: counts.messages },
    { label: isEn ? 'Media Files' : 'فایل‌های رسانه', value: counts.media },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Current Data Inventory */}
      <section className="rounded-3xl border border-[#FBEFDD]/10 bg-[#121212] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#FBEFDD]">
              <DatabaseBackup className="h-5 w-5 text-[#FF502B]" />
              <span>{isEn ? 'Full Backup & Restore' : 'پشتیبان‌گیری و بازیابی کامل سایت'}</span>
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-6 text-[#FBEFDD]/65">
              {isEn
                ? 'Export all site settings, vCard fields, appearance, posts, categories, projects, contact messages, and Cloudinary media records into a single portable JSON file — and restore them anytime.'
                : 'از تمام تنظیمات سایت، کارت ویزیت، ظاهر و رنگ‌بندی، نوشته‌ها، دسته‌بندی‌ها، پروژه‌ها، پیام‌ها و لیست فایل‌های رسانه به‌صورت یک فایل JSON یکپارچه خروجی بگیر و هر زمان خواستی همه را بازیابی کن.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            data-testid="backup-export-btn"
            className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-2xl px-5 py-2.5 text-xs disabled:opacity-50"
          >
            {exporting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>
              {exporting
                ? isEn
                  ? 'Preparing backup...'
                  : 'در حال آماده‌سازی...'
                : isEn
                  ? 'Export Full Backup (.json)'
                  : 'دانلود فایل پشتیبان کامل (.json)'}
            </span>
          </button>
        </div>

        {/* Inventory Summary Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {inventoryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-[#FBEFDD]/8 bg-[#0E0E0E] px-3.5 py-3 text-center"
            >
              <div className="text-lg font-extrabold text-[#FBEFDD]">{card.value}</div>
              <div className="mt-0.5 text-[11px] text-[#FBEFDD]/55">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-200/90">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="leading-6">
            {isEn
              ? 'Security note: Admin password hashes, session secrets, and encrypted AI API keys are automatically excluded from backup files so your exported JSON stays safe to store.'
              : 'نکته امنیتی: رمز عبور ادمین، کلید نشست و کلیدهای API هوش مصنوعی برای امنیت بیشتر هرگز در فایل پشتیبان ذخیره نمی‌شوند و هنگام بازیابی نیز دست‌نخورده باقی می‌مانند.'}
          </p>
        </div>
      </section>

      {/* Import / Restore Section */}
      <section className="rounded-3xl border border-[#FBEFDD]/10 bg-[#121212] p-6">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-[#FF502B]" />
          <h3 className="text-sm font-extrabold text-[#FBEFDD]">
            {isEn ? 'Import & Restore from Backup File' : 'ایمپورت و بازیابی از فایل پشتیبان'}
          </h3>
        </div>
        <p className="mt-1 text-xs leading-6 text-[#FBEFDD]/60">
          {isEn
            ? 'Select a previously exported site-backup-*.json file to inspect its contents before restoring.'
            : 'فایل site-backup-*.json قبلی را انتخاب کن تا ابتدا محتوای آن بررسی شود و سپس بازیابی انجام گیرد.'}
        </p>

        {/* Restore Mode Selector */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('replace')}
            className={`cursor-pointer rounded-2xl border p-3.5 text-start transition-colors ${
              mode === 'replace'
                ? 'border-[#FF502B] bg-[#FF502B]/10 text-[#FBEFDD]'
                : 'border-[#FBEFDD]/12 bg-[#0E0E0E] text-[#FBEFDD]/70 hover:border-[#FBEFDD]/30'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              <HardDrive className="h-4 w-4 text-[#FF502B]" />
              <span>{isEn ? 'Full Replace (Recommended)' : 'جایگزینی کامل (پیشنهادی)'}</span>
            </div>
            <p className="mt-1 text-[11px] leading-5 opacity-75">
              {isEn
                ? 'Restores the exact state of the backup by replacing current posts, projects, categories, messages, media records, and settings.'
                : 'سایت را دقیقاً به وضعیت زمان بک‌آپ برمی‌گرداند (تنظیمات، نوشته‌ها، پروژه‌ها، پیام‌ها و فایل‌ها جایگزین می‌شوند).'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode('merge')}
            className={`cursor-pointer rounded-2xl border p-3.5 text-start transition-colors ${
              mode === 'merge'
                ? 'border-[#FF502B] bg-[#FF502B]/10 text-[#FBEFDD]'
                : 'border-[#FBEFDD]/12 bg-[#0E0E0E] text-[#FBEFDD]/70 hover:border-[#FBEFDD]/30'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              <FileJson className="h-4 w-4 text-[#FF502B]" />
              <span>{isEn ? 'Merge with Existing Data' : 'ادغام با داده‌های فعلی'}</span>
            </div>
            <p className="mt-1 text-[11px] leading-5 opacity-75">
              {isEn
                ? 'Keeps existing records and updates matching slugs/settings while adding missing items from the backup.'
                : 'داده‌های فعلی را حفظ می‌کند و تنظیمات، نوشته‌ها و فایل‌های موجود در بک‌آپ را به آن‌ها اضافه یا به‌روزرسانی می‌کند.'}
            </p>
          </button>
        </div>

        {/* File Picker */}
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            data-testid="backup-file-input"
            onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-2xl border border-dashed border-[#FBEFDD]/25 bg-[#0E0E0E] px-4 py-4 text-xs text-[#FBEFDD]/80 file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-[#FF502B] file:px-3.5 file:py-1.5 file:text-xs file:font-bold file:text-[#0E0E0E] hover:border-[#FF502B]/60"
          />
        </div>

        {parseError && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{parseError}</span>
          </div>
        )}

        {preview && (
          <div
            data-testid="backup-preview-box"
            className="mt-4 rounded-2xl border border-[#FF502B]/35 bg-[#0E0E0E] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#FBEFDD]">
                <FileJson className="h-4 w-4 text-[#FF502B]" />
                <span dir="ltr">{preview.filename}</span>
              </div>
              {preview.exportedAt && (
                <span className="text-[11px] text-[#FBEFDD]/55" dir="ltr">
                  {new Date(preview.exportedAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl bg-[#121212] px-3 py-2 text-center">
                <div className="font-bold text-[#FBEFDD]">{preview.settingsCount}</div>
                <div className="text-[10px] text-[#FBEFDD]/55">
                  {isEn ? 'Settings' : 'تنظیمات'}
                </div>
              </div>
              <div className="rounded-xl bg-[#121212] px-3 py-2 text-center">
                <div className="font-bold text-[#FBEFDD]">{preview.postsCount}</div>
                <div className="text-[10px] text-[#FBEFDD]/55">{isEn ? 'Posts' : 'نوشته‌ها'}</div>
              </div>
              <div className="rounded-xl bg-[#121212] px-3 py-2 text-center">
                <div className="font-bold text-[#FBEFDD]">{preview.categoriesCount}</div>
                <div className="text-[10px] text-[#FBEFDD]/55">
                  {isEn ? 'Categories' : 'دسته‌بندی‌ها'}
                </div>
              </div>
              <div className="rounded-xl bg-[#121212] px-3 py-2 text-center">
                <div className="font-bold text-[#FBEFDD]">{preview.projectsCount}</div>
                <div className="text-[10px] text-[#FBEFDD]/55">
                  {isEn ? 'Projects' : 'پروژه‌ها'}
                </div>
              </div>
              <div className="rounded-xl bg-[#121212] px-3 py-2 text-center">
                <div className="font-bold text-[#FBEFDD]">{preview.messagesCount}</div>
                <div className="text-[10px] text-[#FBEFDD]/55">{isEn ? 'Messages' : 'پیام‌ها'}</div>
              </div>
              <div className="rounded-xl bg-[#121212] px-3 py-2 text-center">
                <div className="font-bold text-[#FBEFDD]">{preview.mediaCount}</div>
                <div className="text-[10px] text-[#FBEFDD]/55">{isEn ? 'Media' : 'رسانه‌ها'}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="cursor-pointer rounded-xl border border-[#FBEFDD]/15 bg-[#121212] px-4 py-2 text-xs text-[#FBEFDD]/75 hover:border-[#FBEFDD]/40"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={importing}
                data-testid="backup-restore-confirm-btn"
                className="ember-btn-flame inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2 text-xs disabled:opacity-50"
              >
                {importing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <span>
                  {importing
                    ? isEn
                      ? 'Restoring...'
                      : 'در حال بازیابی...'
                    : mode === 'replace'
                      ? isEn
                        ? 'Confirm Full Restore'
                        : 'تایید و بازیابی کامل'
                      : isEn
                        ? 'Confirm Merge Restore'
                        : 'تایید و ادغام فایل پشتیبان'}
                </span>
              </button>
            </div>
          </div>
        )}

        {restoreSummary && (
          <div
            data-testid="backup-restore-success"
            className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span className="leading-6">{restoreSummary}</span>
          </div>
        )}
      </section>
    </div>
  );
}
