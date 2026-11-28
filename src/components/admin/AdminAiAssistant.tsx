import {
  Check,
  FilePlus2,
  ListChecks,
  Loader2,
  MessageCircle,
  Send,
  Settings,
  Sparkles,
  SpellCheck,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AiAssistResponse,
  AiConfigPublic,
  AiPostPatch,
  ContentBlock,
  SiteLanguage,
} from '../../types/cms.ts';

type AiAction =
  | 'chat'
  | 'write_full'
  | 'polish'
  | 'proofread'
  | 'suggest'
  | 'fill_meta'
  | 'add_summary';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  patch?: AiPostPatch | null;
  applied?: boolean;
  modelUsed?: string;
}

interface AdminAiAssistantProps {
  open: boolean;
  onToggleOpen: () => void;
  aiConfig: AiConfigPublic | null;
  adminLang?: SiteLanguage;
  contentLang?: SiteLanguage;
  categories: string[];
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

function summarizePatchChanges(patch: AiPostPatch, isEn: boolean): string[] {
  const tags: string[] = [];
  if (patch.targetLang) {
    tags.push(patch.targetLang === 'en' ? 'EN' : 'FA');
  }
  if (patch.title) tags.push(isEn ? 'Title' : 'عنوان');
  if (patch.slug) tags.push(isEn ? 'Slug' : 'اسلاگ');
  if (patch.excerpt) tags.push(isEn ? 'Excerpt' : 'خلاصه');
  if (patch.category) tags.push(isEn ? 'Category' : 'دسته‌بندی');
  if (patch.blockUpdates && patch.blockUpdates.length > 0) {
    const nums = patch.blockUpdates.map((u) => `#${u.index + 1}`).join(', ');
    tags.push(isEn ? `Edit block ${nums}` : `ویرایش بلوک ${nums}`);
  }
  if (patch.removeBlockIndices && patch.removeBlockIndices.length > 0) {
    const nums = patch.removeBlockIndices.map((i) => `#${i + 1}`).join(', ');
    tags.push(isEn ? `Remove ${nums}` : `حذف بلوک ${nums}`);
  }
  if (patch.blocks && patch.blocks.length > 0) {
    if (patch.mode === 'append') {
      tags.push(isEn ? `+${patch.blocks.length} block(s)` : `+${patch.blocks.length} بلوک جدید`);
    } else if (patch.mode === 'replace') {
      tags.push(isEn ? `${patch.blocks.length} block(s)` : `${patch.blocks.length} بلوک`);
    }
  }
  return tags;
}

export function AdminAiAssistant({
  open,
  onToggleOpen,
  aiConfig,
  adminLang = 'fa',
  contentLang = 'fa',
  categories,
  currentPost,
  canUndo,
  onUndo,
  onApplyPatch,
  onOpenAiSettings,
  adminFetch,
}: AdminAiAssistantProps) {
  const isEn = adminLang === 'en';
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isKeyConfigured = Boolean(aiConfig?.hasCustomApiKey && aiConfig?.model?.trim());

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const sendToAi = async (
    action: AiAction,
    userVisibleLabel: string,
    effectivePrompt: string,
  ) => {
    if (loading) return;
    setError('');
    setLoading(true);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: userVisibleLabel,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (action === 'chat') {
      setPrompt('');
    }

    try {
      const historyPayload = [...messages, userMsg]
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await adminFetch('/api/admin/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          prompt: effectivePrompt,
          contentLang,
          adminLang,
          history: historyPayload,
          currentPost,
          categories,
        }),
      });

      const rawText = await res.text();
      let data: (Partial<AiAssistResponse> & { error?: string }) | null = null;
      try {
        data = JSON.parse(rawText) as Partial<AiAssistResponse> & { error?: string };
      } catch {
        data = null;
      }

      if (!res.ok || !data?.reply) {
        setError(
          data?.error ||
            (isEn
              ? 'Failed to get a response from AI. Check API settings.'
              : 'پاسخی از هوش مصنوعی دریافت نشد. تنظیمات کلید API را بررسی کن.'),
        );
        return;
      }

      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: data.reply,
        patch: data.patch ?? null,
        modelUsed: data.modelUsed,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setError(
        isEn
          ? 'Connection error while contacting AI assistant.'
          : 'خطا در اتصال به سرور هنگام ارتباط با دستیار هوش مصنوعی.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    void sendToAi('chat', trimmed, trimmed);
  };

  const handleQuickAction = (action: AiAction) => {
    const hasBlocksText = currentPost.blocks.some(
      (b) => ('text' in b && b.text.trim()) || ('body' in b && b.body.trim()),
    );

    if (action === 'write_full') {
      const topic = prompt.trim() || currentPost.title.trim();
      if (!topic) {
        setError(
          isEn
            ? 'Enter a post title or write your topic in the chat box first.'
            : 'ابتدا عنوان مقاله یا موضوع دلخواهت را در کادر چت بنویس تا مقاله کامل بسازم.',
        );
        return;
      }
      void sendToAi(
        'write_full',
        isEn ? `Write full post: ${topic}` : `نگارش کامل مقاله: ${topic}`,
        isEn
          ? `Write a complete, structured article about "${topic}".`
          : `یک مقاله کامل و ساختاریافته درباره «${topic}» بنویس.`,
      );
      return;
    }

    if (!currentPost.title.trim() && !hasBlocksText) {
      setError(
        isEn
          ? 'Write at least a title or one block first so I can edit it.'
          : 'ابتدا کمی متن یا عنوان بنویس تا بتوانم بررسی یا ویرایشش کنم.',
      );
      return;
    }

    if (action === 'proofread') {
      void sendToAi(
        'proofread',
        isEn ? 'Proofread spelling & grammar only' : 'فقط غلط‌های املایی و نگارشی را اصلاح کن',
        isEn
          ? 'Fix ONLY spelling, typos, and punctuation errors in the current title, excerpt, and blocks. Do not rewrite phrasing or structure.'
          : 'فقط غلط‌های املایی، نیم‌فاصله‌ها و ایرادات تایپی عنوان، خلاصه و بلوک‌های فعلی را دقیقاً اصلاح کن و بقیه متن را دست نزن.',
      );
    } else if (action === 'polish') {
      void sendToAi(
        'polish',
        isEn ? 'Polish & enhance formatting' : 'زیباسازی و ویراستاری بلوک‌ها',
        isEn
          ? 'Polish clarity, flow, and inline bold/highlight formatting without dropping any real content.'
          : 'متن و بلوک‌های فعلی را بدون حذف محتوا، روان‌تر، خوش‌خوان‌تر و با قالب‌بندی دقیق‌تر ویراستاری کن.',
      );
    } else if (action === 'fill_meta') {
      void sendToAi(
        'fill_meta',
        isEn ? 'Generate SEO title, slug & excerpt' : 'پیشنهاد عنوان، اسلاگ و خلاصه سئو',
        isEn
          ? 'Suggest an SEO-friendly title, slug, excerpt, and category based on the current content.'
          : 'بر اساس متن فعلی، عنوان، اسلاگ، خلاصه ۲ خطی سئوشده و دسته‌بندی مناسب پیشنهاد بده.',
      );
    } else if (action === 'add_summary') {
      void sendToAi(
        'add_summary',
        isEn ? 'Add summary card & takeaways' : 'افزودن کارت جمع‌بندی به انتها',
        isEn
          ? 'Create a concise summary card and key takeaways list to append to the end of the article.'
          : 'یک کارت جمع‌بندی و فهرست نکات کلیدی برای اضافه شدن به انتهای مقاله بساز.',
      );
    } else if (action === 'suggest') {
      void sendToAi(
        'suggest',
        isEn ? 'Critique & SEO tips' : 'نقد و پیشنهاد بهبود سئو',
        isEn
          ? 'Review this post and give actionable editorial and SEO suggestions without modifying fields.'
          : 'نوشته فعلی را بررسی کن و فقط پیشنهادهای دقیق بهبود خوانایی و سئو بده (بدون تغییر فیلدها).',
      );
    }
  };

  const handleApply = (msgId: string, patch: AiPostPatch) => {
    onApplyPatch(patch);
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, applied: true } : m)),
    );
  };

  const quickButtons: Array<{ action: AiAction; label: string; icon: typeof Sparkles }> = [
    { action: 'proofread', label: isEn ? 'Proofread' : 'غلط‌گیری املایی', icon: SpellCheck },
    { action: 'polish', label: isEn ? 'Polish' : 'زیباسازی', icon: Wand2 },
    { action: 'fill_meta', label: isEn ? 'SEO Meta' : 'متا و سئو', icon: ListChecks },
    { action: 'add_summary', label: isEn ? 'Summary' : 'کارت جمع‌بندی', icon: FilePlus2 },
    { action: 'write_full', label: isEn ? 'Write Full' : 'نگارش کامل', icon: Sparkles },
  ];

  const nonEmptyBlocksCount = currentPost.blocks.filter(
    (b) => ('text' in b && b.text.trim()) || ('body' in b && b.body.trim()) || ('url' in b && b.url.trim()),
  ).length;

  return (
    <>
      {/* Floating Chat Drawer */}
      {open && (
        <section
          aria-label={isEn ? 'AI Writing Assistant Chat' : 'چت دستیار هوش مصنوعی'}
          className="fixed bottom-22 end-4 z-40 flex h-[min(580px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[var(--hair-strong)] bg-[var(--ground)] shadow-2xl sm:end-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--hair)] bg-[var(--ground-deep)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--flame)] text-[var(--flame-ink)]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-xs font-bold text-[var(--ink)]">
                    {isEn ? 'AI Writing Assistant' : 'دستیار هوشمند مقاله'}
                  </h3>
                  <span className="rounded-md border border-[var(--flame-border)] bg-[var(--flame-tint)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--flame)]">
                    {contentLang.toUpperCase()}
                  </span>
                </div>
                <p className="truncate text-[10px] text-[var(--ink-faint)] tabular-nums">
                  {isEn
                    ? `Reading ${nonEmptyBlocksCount} block(s) · ${aiConfig?.model?.trim() || 'Model not set'}`
                    : `خواندن ${nonEmptyBlocksCount} بلوک فعال · ${aiConfig?.model?.trim() || 'مدل تنظیم نشده'}`}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {canUndo && (
                <button
                  type="button"
                  onClick={onUndo}
                  title={isEn ? 'Undo last AI change' : 'بازگردانی آخرین تغییر هوش مصنوعی'}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--hair-strong)] bg-[var(--ground)] px-2 py-1 text-[11px] text-[var(--ink-soft)] hover:border-[var(--flame)] hover:text-[var(--ink)]"
                >
                  <Undo2 className="h-3 w-3 text-[var(--flame)]" />
                  <span className="hidden sm:inline">{isEn ? 'Undo' : 'بازگردانی'}</span>
                </button>
              )}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError('');
                  }}
                  title={isEn ? 'Clear chat' : 'پاک کردن گفتگو'}
                  aria-label={isEn ? 'Clear chat' : 'پاک کردن گفتگو'}
                  className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onToggleOpen();
                  onOpenAiSettings();
                }}
                title={isEn ? 'AI API Settings' : 'تنظیمات API هوش مصنوعی'}
                aria-label={isEn ? 'AI API Settings' : 'تنظیمات API هوش مصنوعی'}
                className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleOpen}
                aria-label={isEn ? 'Close AI chat' : 'بستن چت دستیار'}
                className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* API Key / Model notice if not configured */}
          {!isKeyConfigured && (
            <div className="flex items-center justify-between gap-2 border-b border-[var(--flame-border)] bg-[var(--flame-tint)] px-3.5 py-2 text-[11px] text-[var(--ink)]">
              <span className="truncate">
                {isEn
                  ? 'Set your AI model and API key in AI Settings to activate.'
                  : 'مدل و کلید API را در تنظیمات هوش مصنوعی وارد کن تا فعال شود.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  onToggleOpen();
                  onOpenAiSettings();
                }}
                className="shrink-0 cursor-pointer rounded-lg bg-[var(--flame)] px-2.5 py-1 text-[10px] font-bold text-[var(--flame-ink)]"
              >
                {isEn ? 'Configure' : 'تنظیمات AI'}
              </button>
            </div>
          )}

          {/* Quick Actions Strip */}
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--hair)] bg-[var(--ground)] px-3 py-2">
            {quickButtons.map(({ action, label, icon: Icon }) => (
              <button
                key={action}
                type="button"
                disabled={loading}
                onClick={() => handleQuickAction(action)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--hair-strong)] bg-[var(--ground-deep)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--flame)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                <Icon className="h-3 w-3 text-[var(--flame)]" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Conversation Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--hair-strong)] bg-[var(--ground-deep)] p-4 text-xs leading-6 text-[var(--ink-muted)]">
                <p className="font-semibold text-[var(--ink)]">
                  {isEn
                    ? 'Exact edits, right while you write.'
                    : 'دقیقاً همون تغییری که می‌خوای، بدون اسکرول.'}
                </p>
                <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                  {isEn
                    ? 'Examples: "Fix typos in block #2 only", "Make the title punchier", "Bold key terms in paragraph 1", or "Add a conclusion card".'
                    : 'مثلاً بنویس: «فقط بلوک ۲ را کوتاه‌تر کن»، «فقط غلط‌های املایی را اصلاح کن»، «عنوان را جذاب‌تر کن» یا «یک کارت جمع‌بندی اضافه کن».'}
                </p>
              </div>
            )}

            {messages.map((msg) => {
              const changeTags = msg.patch ? summarizePatchChanges(msg.patch, isEn) : [];
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-6 ${
                      msg.role === 'user'
                        ? 'bg-[var(--flame)] text-[var(--flame-ink)]'
                        : 'border border-[var(--hair)] bg-[var(--ground-deep)] text-[var(--ink-soft)]'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>

                    {msg.patch && (
                      <div className="mt-2.5 rounded-xl border border-[var(--flame-border)] bg-[var(--ground)] p-2.5">
                        {changeTags.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {changeTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md bg-[var(--flame-tint)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--flame)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[var(--ink-faint)]">
                            {msg.applied
                              ? isEn
                                ? 'Applied to editor'
                                : 'روی ویرایشگر اعمال شد'
                              : isEn
                                ? 'Ready to apply'
                                : 'آماده اعمال دقیق'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApply(msg.id, msg.patch!)}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              msg.applied
                                ? 'border border-emerald-500/40 bg-emerald-500/15 text-[var(--status-success-ink)]'
                                : 'ember-btn-flame'
                            }`}
                          >
                            {msg.applied ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>{isEn ? 'Applied' : 'اعمال شد'}</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3 w-3" />
                                <span>{isEn ? 'Apply' : 'اعمال تغییر'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--ground-deep)] px-3.5 py-2 text-xs text-[var(--ink-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--flame)]" />
                <span>{isEn ? 'Thinking...' : 'در حال پردازش دقیق...'}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-[var(--status-error-ink)]"
              >
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[var(--hair)] bg-[var(--ground-deep)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                  }
                }}
                placeholder={
                  isEn
                    ? 'Ask for an exact edit (Enter to send)...'
                    : 'دقیق بنویس چه تغییری می‌خوای (Enter برای ارسال)...'
                }
                className="max-h-28 min-w-0 flex-1 resize-none rounded-xl border border-[var(--hair-strong)] bg-[var(--ground)] px-3 py-2 text-xs leading-5 text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--flame)] focus:outline-none"
              />
              <button
                type="button"
                disabled={loading || !prompt.trim()}
                onClick={handleChatSubmit}
                aria-label={isEn ? 'Send message' : 'ارسال پیام'}
                className="ember-btn-flame grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Floating Circular Corner Chat Button */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label={
          open
            ? isEn
              ? 'Close AI Assistant'
              : 'بستن دستیار هوش مصنوعی'
            : isEn
              ? 'Open AI Assistant Chat'
              : 'باز کردن چت دستیار هوش مصنوعی'
        }
        title={isEn ? 'AI Writing Assistant' : 'دستیار هوش مصنوعی مقاله'}
        className="fixed bottom-5 end-5 z-40 grid h-14 w-14 cursor-pointer place-items-center rounded-full bg-[var(--flame)] text-[var(--flame-ink)] shadow-xl ring-2 ring-[var(--ground)] transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
