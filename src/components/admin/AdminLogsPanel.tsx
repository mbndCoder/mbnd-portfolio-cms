import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  SiteLanguage,
  SystemLogEntry,
  SystemLogLevel,
  SystemLogSource,
  SystemLogsResponse,
} from '../../types/cms.ts';

interface AdminLogsPanelProps {
  adminLang: SiteLanguage;
  authHeaders: (extra?: Record<string, string>) => Record<string, string>;
  onErrorCountChange?: (errorCount: number) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

const LOG_SOURCES: Array<{ id: 'all' | SystemLogSource; fa: string; en: string }> = [
  { id: 'all', fa: 'همه بخش‌ها', en: 'All Sections' },
  { id: 'server', fa: 'سرور', en: 'Server' },
  { id: 'settings', fa: 'تنظیمات', en: 'Settings' },
  { id: 'vcard', fa: 'کارت ویزیت', en: 'vCard' },
  { id: 'ai', fa: 'هوش مصنوعی', en: 'AI' },
  { id: 'media', fa: 'رسانه / آپلود', en: 'Media / Upload' },
  { id: 'posts', fa: 'نوشته‌ها', en: 'Posts' },
  { id: 'categories', fa: 'دسته‌بندی‌ها', en: 'Categories' },
  { id: 'projects', fa: 'پروژه‌ها', en: 'Projects' },
  { id: 'auth', fa: 'امنیت و ورود', en: 'Auth & Security' },
  { id: 'backup', fa: 'بک‌آپ', en: 'Backup' },
  { id: 'contact', fa: 'فرم تماس', en: 'Contact' },
  { id: 'db', fa: 'دیتابیس', en: 'Database' },
  { id: 'client', fa: 'مرورگر / فرانت', en: 'Browser / Client' },
];

export function AdminLogsPanel({
  adminLang,
  authHeaders,
  onErrorCountChange,
  onNotify,
}: AdminLogsPanelProps) {
  const isEn = adminLang === 'en';
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [counts, setCounts] = useState({ total: 0, error: 0, warn: 0, info: 0 });
  const [levelFilter, setLevelFilter] = useState<'all' | SystemLogLevel>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | SystemLogSource>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (levelFilter !== 'all') params.set('level', levelFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('limit', '200');

      const res = await fetch(`/api/admin/logs?${params.toString()}`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) {
        onNotify(
          isEn ? 'Could not load system logs.' : 'بارگذاری لاگ‌های سیستم با خطا مواجه شد.',
          true,
        );
        return;
      }
      const data = (await res.json()) as SystemLogsResponse;
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      if (data.counts) {
        setCounts(data.counts);
        onErrorCountChange?.(data.counts.error);
      }
    } catch {
      onNotify(
        isEn ? 'Network error while fetching logs.' : 'خطای ارتباط هنگام دریافت لاگ‌ها.',
        true,
      );
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isEn, levelFilter, onErrorCountChange, onNotify, search, sourceFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const handleClearLogs = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/admin/logs', {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) {
        onNotify(
          isEn ? 'Failed to clear logs.' : 'پاک کردن لاگ‌ها با خطا مواجه شد.',
          true,
        );
        return;
      }
      setLogs([]);
      setCounts({ total: 0, error: 0, warn: 0, info: 0 });
      onErrorCountChange?.(0);
      onNotify(isEn ? 'All system logs cleared.' : 'تمام لاگ‌های سیستم پاک شدند.');
    } catch {
      onNotify(isEn ? 'Network error.' : 'خطای ارتباط با سرور.', true);
    } finally {
      setClearing(false);
    }
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), counts, logs }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sourceLabel = (src: SystemLogSource) => {
    const item = LOG_SOURCES.find((s) => s.id === src);
    return item ? (isEn ? item.en : item.fa) : src;
  };

  const levelBadge = (level: SystemLogLevel) => {
    if (level === 'error') {
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
          <AlertCircle className="h-3 w-3" />
          <span>{isEn ? 'ERROR' : 'خطا'}</span>
        </span>
      );
    }
    if (level === 'warn') {
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          <span>{isEn ? 'WARN' : 'هشدار'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
        <Info className="h-3 w-3" />
        <span>{isEn ? 'INFO' : 'رویداد'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Summary */}
      <section className="rounded-3xl border border-[#FBEFDD]/10 bg-[#121212] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#FBEFDD]">
              <ScrollText className="h-5 w-5 text-[#FF502B]" />
              <span>{isEn ? 'System & Error Logs' : 'لاگ‌ها و گزارش خطاهای سایت'}</span>
            </h2>
            <p className="mt-1 text-xs leading-6 text-[#FBEFDD]/65">
              {isEn
                ? 'Tracks server errors, failed API requests, client crashes, and key admin actions across all modules (secrets are automatically redacted; latest 500 events kept).'
                : 'خطاهای سرور، خطاهای API، خطاهای مرورگر و عملیات مهم تمام بخش‌های سایت در اینجا ثبت می‌شوند (اطلاعات حساس خودکار سانسور می‌شوند و ۵۰۰ لاگ اخیر نگهداری می‌شود).'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchLogs()}
              disabled={loading}
              data-testid="logs-refresh-btn"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#FBEFDD]/15 bg-[#0E0E0E] px-3.5 py-2 text-xs text-[#FBEFDD]/85 hover:border-[#FF502B] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadLogs}
              disabled={logs.length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#FBEFDD]/15 bg-[#0E0E0E] px-3.5 py-2 text-xs text-[#FBEFDD]/85 hover:border-[#FF502B] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isEn ? 'Export JSON' : 'خروجی JSON'}</span>
            </button>
            <button
              type="button"
              onClick={handleClearLogs}
              disabled={clearing || counts.total === 0}
              data-testid="logs-clear-btn"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isEn ? 'Clear All' : 'پاک کردن همه'}</span>
            </button>
          </div>
        </div>

        {/* Counters */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setLevelFilter('all')}
            className={`cursor-pointer rounded-2xl border p-3.5 text-start transition-colors ${
              levelFilter === 'all'
                ? 'border-[#FF502B] bg-[#FF502B]/10'
                : 'border-[#FBEFDD]/10 bg-[#0E0E0E] hover:border-[#FBEFDD]/25'
            }`}
          >
            <div className="text-xl font-extrabold text-[#FBEFDD]">{counts.total}</div>
            <div className="mt-0.5 text-[11px] text-[#FBEFDD]/60">
              {isEn ? 'Total Events' : 'کل رویدادها'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setLevelFilter('error')}
            className={`cursor-pointer rounded-2xl border p-3.5 text-start transition-colors ${
              levelFilter === 'error'
                ? 'border-red-500 bg-red-500/15'
                : 'border-red-500/20 bg-[#0E0E0E] hover:border-red-500/45'
            }`}
          >
            <div className="text-xl font-extrabold text-red-300">{counts.error}</div>
            <div className="mt-0.5 text-[11px] text-red-200/70">
              {isEn ? 'Errors (5xx / Crashes)' : 'خطاها (5xx / بحرانی)'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setLevelFilter('warn')}
            className={`cursor-pointer rounded-2xl border p-3.5 text-start transition-colors ${
              levelFilter === 'warn'
                ? 'border-amber-500 bg-amber-500/15'
                : 'border-amber-500/20 bg-[#0E0E0E] hover:border-amber-500/45'
            }`}
          >
            <div className="text-xl font-extrabold text-amber-300">{counts.warn}</div>
            <div className="mt-0.5 text-[11px] text-amber-200/70">
              {isEn ? 'Warnings (4xx)' : 'هشدارها (4xx)'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setLevelFilter('info')}
            className={`cursor-pointer rounded-2xl border p-3.5 text-start transition-colors ${
              levelFilter === 'info'
                ? 'border-sky-500 bg-sky-500/15'
                : 'border-sky-500/20 bg-[#0E0E0E] hover:border-sky-500/45'
            }`}
          >
            <div className="text-xl font-extrabold text-sky-300">{counts.info}</div>
            <div className="mt-0.5 text-[11px] text-sky-200/70">
              {isEn ? 'Activity Info' : 'گزارش عملیات'}
            </div>
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#FBEFDD]/45" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isEn ? 'Search message, route, or status...' : 'جستجو در پیام، مسیر یا کد وضعیت...'
              }
              data-testid="logs-search-input"
              className="w-full rounded-xl border border-[#FBEFDD]/15 bg-[#0E0E0E] py-2 pe-3 ps-9 text-xs text-[#FBEFDD] placeholder:text-[#FBEFDD]/40 focus:border-[#FF502B] focus:outline-none"
            />
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | SystemLogSource)}
            data-testid="logs-source-select"
            className="rounded-xl border border-[#FBEFDD]/15 bg-[#0E0E0E] px-3 py-2 text-xs text-[#FBEFDD] focus:border-[#FF502B] focus:outline-none"
          >
            {LOG_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {isEn ? s.en : s.fa}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Logs List */}
      <section className="overflow-hidden rounded-3xl border border-[#FBEFDD]/10 bg-[#121212]">
        {logs.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-[#FBEFDD]/50">
            {loading
              ? isEn
                ? 'Loading logs...'
                : 'در حال دریافت لاگ‌ها...'
              : isEn
                ? 'No matching log entries found.'
                : 'هیچ لاگی با این فیلتر ثبت نشده است.'}
          </div>
        ) : (
          <div className="divide-y divide-[#FBEFDD]/8">
            {logs.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div key={entry.id} className="px-4 py-3 transition-colors hover:bg-[#FBEFDD]/[0.02]">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 text-start"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      {levelBadge(entry.level)}
                      <span className="rounded-lg bg-[#FBEFDD]/8 px-2 py-0.5 text-[10px] font-medium text-[#FBEFDD]/80">
                        {sourceLabel(entry.source)}
                      </span>
                      {entry.status > 0 && (
                        <span
                          dir="ltr"
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            entry.status >= 500
                              ? 'bg-red-500/20 text-red-200'
                              : entry.status >= 400
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'bg-emerald-500/15 text-emerald-200'
                          }`}
                        >
                          {entry.status}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#FBEFDD]">
                        {entry.message}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#FBEFDD]/45">
                      {entry.path && (
                        <span dir="ltr" className="hidden max-w-[200px] truncate font-mono sm:inline">
                          {entry.method ? `${entry.method} ` : ''}
                          {entry.path}
                        </span>
                      )}
                      <span dir="ltr">
                        {new Date(entry.createdAt).toLocaleString(isEn ? 'en-US' : 'fa-IR', {
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 rounded-2xl border border-[#FBEFDD]/8 bg-[#0E0E0E] p-3.5 text-[11px] text-[#FBEFDD]/80">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[#FBEFDD]/65" dir="ltr">
                        <span>ID: #{entry.id}</span>
                        {entry.method && <span>Method: {entry.method}</span>}
                        {entry.path && <span>Path: {entry.path}</span>}
                        {entry.status > 0 && <span>HTTP: {entry.status}</span>}
                        <span>Time: {entry.createdAt}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#FBEFDD]">
                        {entry.message}
                      </p>
                      {entry.details && (
                        <pre
                          dir="ltr"
                          className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[#FBEFDD]/10 bg-[#080808] p-3 font-mono text-[11px] leading-5 text-[#FBEFDD]/75"
                        >
                          {entry.details}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
