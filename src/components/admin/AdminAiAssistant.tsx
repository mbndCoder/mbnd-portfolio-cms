import {
  Check,
  Eye,
  Loader2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  AiAssistResponse,
  AiConfigPublic,
  AiPostPatch,
  ContentBlock,
  SiteLanguage,
} from '../../types/cms.ts';

type QuickActionId =
  | 'write_full'
  | 'proofread'
  | 'polish'
  | 'suggest'
  | 'fill_meta'
  | 'add_summary';

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  patch?: AiPostPatch | null;
  applied?: boolean;
}

interface AdminAiAssistantProps {
  aiConfig: AiConfigPublic | null;
  categories: string[];
  adminLang?: SiteLanguage;
  currentPost: {
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    coverImage: string;
    blocks: ContentBlock[];
  };
  canUndo: boolean;
  onUndo: () => void;
  onApplyPatch: (patch: AiPostPatch) => void;
  onOpenAiSettings: () => void;
  adminFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const QUICK_ACTIONS_FA: Array<{ id: QuickActionId; label: string; hint: string }> = [
  { id: 'proofread', label: 'اصلاح املا و نگارش', hint: 'فقط اصلاح غلط‌های املایی و نیم‌فاصله بدون تغییر ساختار' },
  { id: 'polish', label: 'زیباسازی و ویراستاری', hint: 'بهبود روانی متن و افزودن بولد، هایلایت و کارت نکته' },
  { id: 'write_full', label: 'نگارش مقاله کامل', hint: 'تولید ساختار کامل با تیتر، کارت و هایلایت' },
  { id: 'suggest', label: 'پیشنهاد ویرایش', hint: 'تحلیل فیلدهای فعلی و ارائه پیشنهادهای دقیق' },
  { id: 'fill_meta', label: 'تکمیل عنوان و خلاصه', hint: 'پر کردن خودکار عنوان، اسلاگ و خلاصه سئو' },
  { id: 'add_summary', label: 'افزودن کارت جمع‌بندی', hint: 'اضافه کردن کارت نکته جمع‌بندی به انتهای مقاله' },
];

const QUICK_ACTIONS_EN: Array<{ id: QuickActionId; label: string; hint: string }> = [
  { id: 'proofread', label: 'Proofread', hint: 'Fix spelling and punctuation without changing structure' },
  { id: 'polish', label: 'Polish & Format', hint: 'Improve flow and add bold, highlights, and callout cards' },
  { id: 'write_full', label: 'Draft Full Article', hint: 'Generate a structured article with headings, cards, and highlights' },
  { id: 'suggest', label: 'Editorial Review', hint: 'Analyze current fields and suggest improvements' },
  { id: 'fill_meta', label: 'Fill Title & Excerpt', hint: 'Auto-generate title, slug, and SEO summary' },
  { id: 'add_summary', label: 'Add Summary Card', hint: 'Append a closing takeaway card at the end of the post' },
];

function summarizePatch(patch: AiPostPatch, isEn: boolean): string {
  const parts: string[] = [];
  if (patch.title) parts.push(isEn ? 'Title' : 'عنوان');
  if (patch.excerpt) parts.push(isEn ? 'Excerpt' : 'خلاصه');
  if (patch.slug) parts.push(isEn ? 'Slug' : 'اسلاگ');
  if (patch.category) parts.push(isEn ? 'Category' : 'دسته‌بندی');
  if (patch.blocks && patch.blocks.length > 0) {
    parts.push(
      patch.mode === 'append'
        ? isEn
          ? `Append ${patch.blocks.length} blocks`
          : `افزودن ${patch.blocks.length} بلوک جدید`
        : isEn
          ? `${patch.blocks.length} content blocks`
          : `${patch.blocks.length} بلوک محتوا`,
    );
  }
  return parts.length > 0
    ? parts.join(' + ')
    : isEn
      ? 'Update article fields'
      : 'به‌روزرسانی فیلدهای مقاله';
}

function countFilledBlocks(blocks: ContentBlock[]): number {
  return blocks.filter((b) => {
    if ('text' in b && b.text.trim()) return true;
    if ('title' in b && b.title && b.title.trim()) return true;
    if ('body' in b && b.body.trim()) return true;
    if ('code' in b && b.code.trim()) return true;
    if ('url' in b && b.url.trim()) return true;
    if ('items' in b && b.items.some((item) => item.trim())) return true;
    return false;
  }).length;
}

export function AdminAiAssistant({
  aiConfig,
  categories,
  adminLang = 'fa',
  currentPost,
  canUndo,
  onUndo,
  onApplyPatch,
  onOpenAiSettings,
  adminFetch,
}: AdminAiAssistantProps) {
  const isEn = adminLang === 'en';
  const quickActions = isEn ? QUICK_ACTIONS_EN : QUICK_ACTIONS_FA;

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([]);

  const visibleFields = useMemo(() => {
    const items: string[] = [];
    if (currentPost.title.trim()) items.push(isEn ? 'Title' : 'عنوان');
    if (currentPost.category.trim())
      items.push(isEn ? `Category: ${currentPost.category.trim()}` : `دسته: ${currentPost.category.trim()}`);
    if (currentPost.slug.trim()) items.push(isEn ? 'Slug' : 'اسلاگ');
    if (currentPost.excerpt.trim()) items.push(isEn ? 'Excerpt' : 'خلاصه');
    if (currentPost.coverImage.trim()) items.push(isEn ? 'Cover' : 'کاور');
    const filledBlocks = countFilledBlocks(currentPost.blocks);
    if (filledBlocks > 0)
      items.push(isEn ? `${filledBlocks} blocks` : `${filledBlocks} بلوک محتوا`);
    return items;
  }, [currentPost, isEn]);

  const runAssist = async (action: QuickActionId | 'chat', customPrompt?: string) => {
    const text = (customPrompt ?? prompt).trim();
    if (action === 'chat' && !text) return;

    const userLabel =
      action === 'chat'
        ? text
        : quickActions.find((a) => a.id === action)?.label + (text ? `: ${text}` : '');

    const historyPayload = messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setError('');
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: 'user', text: userLabel },
    ]);
    if (action === 'chat') setPrompt('');

    try {
      const res = await adminFetch('/api/admin/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          prompt: text,
          history: historyPayload,
          currentPost,
          availableCategories: categories,
        }),
      });
      const rawText = await res.text();
      let data: Partial<AiAssistResponse> & { error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { error: isEn ? 'Invalid response received from server.' : 'پاسخ نامعتبر از سرور دریافت شد.' };
      }

      if (!res.ok) {
        setError(data.error || (isEn ? 'Failed to connect to AI assistant.' : 'خطا در ارتباط با دستیار هوش مصنوعی.'));
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: data.reply || (isEn ? 'Changes are ready.' : 'تغییرات آماده است.'),
          patch: data.patch ?? null,
          applied: false,
        },
      ]);
    } catch {
      setError(
        isEn
          ? 'Could not reach the server. Please try again.'
          : 'اتصال به سرور برقرار نشد. لطفاً دوباره تلاش کن.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (msgId: string, patch: AiPostPatch) => {
    onApplyPatch(patch);
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, applied: true } : m)),
    );
  };

  return (
    <div className="rounded-3xl border border-[var(--flame-border)] bg-[var(--ground)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hair)] pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--flame-tint)] text-[var(--flame)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[var(--ink)]">
              {isEn ? 'AI Editorial Assistant (Admin Only)' : 'دستیار هوش مصنوعی (اختصاصی مدیر)'}
            </h3>
            <p className="font-mono text-[11px] text-[var(--ink-faint)]" dir="ltr">
              {aiConfig
                ? `${aiConfig.provider === 'gemini' ? 'Gemini' : 'OpenAI-Compatible'} · ${aiConfig.model}`
                : isEn
                  ? 'Checking AI settings...'
                  : 'در حال بررسی تنظیمات...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-2.5 py-1.5 text-[11px] text-[var(--ink-soft)] hover:border-[var(--flame)]"
            >
              <RotateCcw className="h-3 w-3 text-[var(--flame)]" />
              <span>{isEn ? 'Undo' : 'بازگردانی'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAiSettings}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-2.5 py-1.5 text-[11px] text-[var(--ink-soft)] hover:border-[var(--flame)]"
          >
            <Settings className="h-3 w-3" />
            <span>{isEn ? 'API Settings' : 'تنظیمات API'}</span>
          </button>
        </div>
      </div>

      {/* Live awareness bar: shows exactly which filled fields the AI reads */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] px-3 py-2 text-[11px] text-[var(--ink-muted)]">
        <Eye className="h-3.5 w-3.5 shrink-0 text-[var(--flame)]" />
        <span>{isEn ? 'Visible editor fields:' : 'فیلدهای قابل مشاهده برای هوش مصنوعی:'}</span>
        {visibleFields.length > 0 ? (
          <span className="font-medium text-[var(--ink)]">{visibleFields.join(' · ')}</span>
        ) : (
          <span className="text-[var(--ink-faint)]">
            {isEn ? 'Editor is currently empty' : 'فرم هنوز خالی است'}
          </span>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {quickActions.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={loading}
            title={item.hint}
            onClick={() => void runAssist(item.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--hair)] bg-[var(--ground-deep)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            <Wand2 className="h-3 w-3 text-[var(--flame)]" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      {messages.length > 0 && (
        <div className="mt-3 max-h-72 space-y-2.5 overflow-y-auto rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] p-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl p-3 text-xs leading-6 ${
                msg.role === 'user'
                  ? 'border border-[var(--hair)] bg-[var(--surface)] text-[var(--ink)]'
                  : 'border border-[var(--flame-border)] bg-[var(--ground)] text-[var(--ink-soft)]'
              }`}
            >
              <p className="whitespace-pre-line">{msg.text}</p>
              {msg.patch && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--flame-border)] bg-[var(--flame-tint)] px-3 py-2">
                  <span className="text-[11px] font-medium text-[var(--ink)]">
                    {isEn ? 'Ready changes: ' : 'تغییرات آماده: '}
                    {summarizePatch(msg.patch, isEn)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApply(msg.id, msg.patch!)}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-bold transition-colors ${
                      msg.applied
                        ? 'border border-emerald-500/35 bg-emerald-500/15 text-[var(--status-success-ink)]'
                        : 'bg-[var(--flame)] text-[var(--flame-ink)] hover:bg-[var(--flame-lit)]'
                    }`}
                  >
                    <Check className="h-3 w-3" />
                    <span>
                      {msg.applied
                        ? isEn
                          ? 'Applied'
                          : 'اعمال شد'
                        : isEn
                          ? 'Apply to Editor'
                          : 'اعمال روی ویرایشگر'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-[var(--status-error-ink)]"
        >
          {error}
        </div>
      )}

      {/* Prompt Input */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void runAssist('chat');
            }
          }}
          placeholder={
            isEn
              ? 'Give a specific instruction (e.g., fix spelling only, or rewrite the summary more crisply)...'
              : 'دستور دقیق بنویس (مثلاً: فقط غلط‌های املایی متن را اصلاح کن، یا خلاصه را حرفه‌ای‌تر بنویس)...'
          }
          aria-label={isEn ? 'Prompt for AI assistant' : 'دستور به دستیار هوش مصنوعی'}
          className="min-w-0 flex-1 rounded-xl border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-3 py-2 text-xs leading-6 text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
        />
        <button
          type="button"
          disabled={loading || !prompt.trim()}
          onClick={() => void runAssist('chat')}
          aria-label={isEn ? 'Send to AI assistant' : 'ارسال به دستیار هوش مصنوعی'}
          className="ember-btn-flame inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 text-xs disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span>{isEn ? 'Send' : 'ارسال'}</span>
        </button>
      </div>
    </div>
  );
}
