import { GoogleGenAI } from '@google/genai';
import { getAiConfigResolved, type ResolvedAiConfig } from './db.ts';
import { normalizeBlocks } from '../src/lib/blocks.ts';
import type {
  AiAssistResponse,
  AiPostPatch,
  AiProviderType,
  ContentBlock,
} from '../src/types/cms.ts';

export type AiAssistAction =
  | 'chat'
  | 'write_full'
  | 'polish'
  | 'proofread'
  | 'suggest'
  | 'fill_meta'
  | 'add_summary';

export interface AiAssistInput {
  prompt: string;
  action?: AiAssistAction;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  currentPost: {
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    coverImage?: string;
    blocks: ContentBlock[];
  };
  categories: string[];
}

export interface AiConnectionOverride {
  provider?: AiProviderType;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

const SYSTEM_INSTRUCTION = `تو دستیار نویسندگی و ویراستاری اختصاصی پنل مدیریت وبلاگ فارسی «محمدباقر نوری» (mbnd.ir) هستی.
تو به تمام فیلدهای فعلی فرم مقاله (عنوان، نشانی/اسلاگ، خلاصه، دسته‌بندی، تصویر کاور و تمام بلوک‌های محتوا با ترتیب دقیق) دسترسی کامل داری و دقیقاً می‌بینی مدیر چه چیزهایی نوشته است.

قوانین نگارشی و دقت روی فیلدها:
- زبان پاسخ همیشه فارسی روان، حرفه‌ای، صمیمی و بدون جملات کلیشه‌ای است. نیم‌فاصله‌ها را درست رعایت کن (می‌شود، پروژه‌ها، سیستم‌ها).
- همیشه اول فیلدهای پرشده‌ی فعلی مقاله را با دقت بخوان و بر اساس دقیقاً همان متن عمل کن.
- **قانون طلایی ویرایش دقیق (Surgical Edit)**:
  - اگر مدیر خواست فقط بخش مشخصی تغییر کند (مثلاً «فقط غلط‌های املایی را اصلاح کن»، «فقط عنوان و خلاصه را عوض کن»، «فقط پاراگراف دوم را کوتاه‌تر کن» یا «فقط نیم‌فاصله‌ها را درست کن»):
    - به هیچ وجه ساختار، لحن، تیترها یا سایر بلوک‌های دست‌نخورده را بازنویسی نکن.
    - در حالت اصلاح فقط عنوان/اسلاگ/خلاصه/دسته‌بندی، حتماً mode را "meta_only" بگذار تا بلوک‌ها دست نخورند.
    - در حالت اصلاح املایی/نگارشی بلوک‌ها، تمام بلوک‌های فعلی را دقیقاً با همان نوع و ترتیب حفظ کن و فقط کلمات غلط یا نگارشی را اصلاح کن؛ و اگر عنوان یا خلاصه هم غلط املایی داشت همان را هم دقیقاً اصلاح کن.
- هنگام ویرایش مقاله موجود، بلوک‌های رسانه (image, video, audio) و لینک‌های واقعی کاربر را عیناً حفظ کن و حذف نکن.
- از قابلیت‌های غنی بلوکی و قالب‌بندی درون‌خطی ویرایشگر هنگام نگارش یا زیباسازی استفاده کن:
  - قالب‌بندی درون‌خطی داخل پاراگراف، کارت، نقل‌قول و موارد فهرست:
    - **متن بولد** برای کلمات کلیدی
    - *ایتالیک* برای تأکید لطیف
    - ==هایلایت== برای نکات بسیار مهم
    - \`کد درون‌خطی\` برای دستورات، نام ابزارها و کد
    - [عنوان لینک](https://...) برای لینک دادن
  - انواع بلوک‌های مجاز در آرایه blocks:
    1. {"type":"h2","text":"..."}
    2. {"type":"h3","text":"..."}
    3. {"type":"paragraph","text":"..."}
    4. {"type":"card","title":"...","body":"...","accent":"flame"|"neutral"}
    5. {"type":"button","label":"...","url":"https://...","variant":"primary"|"secondary"}
    6. {"type":"embed","title":"...","url":"https://...","description":"..."}
    7. {"type":"quote","text":"...","author":"..."}
    8. {"type":"code","language":"bash|typescript|python|...","code":"..."}
    9. {"type":"list","ordered":false|true,"items":["...","..."]}
    10. {"type":"image","url":"...","alt":"...","caption":"..."} (فقط اگر URL واقعی در متن فعلی وجود داشت؛ آدرس جعلی نساز)
    11. {"type":"video","url":"...","caption":"..."} (فقط اگر URL واقعی وجود داشت)
    12. {"type":"audio","url":"...","title":"...","caption":"..."} (فقط اگر URL واقعی وجود داشت)

فرمت خروجی الزامی (فقط یک آبجکت JSON معتبر برگردان، بدون توضیح اضافه خارج از JSON):
{
  "reply": "توضیح کوتاه و دقیق فارسی درباره کار انجام‌شده (مثلاً فهرست غلط‌های املایی اصلاح‌شده یا پیشنهادها)",
  "patch": null یا {
    "mode": "replace" | "append" | "meta_only",
    "title": "عنوان پیشنهادی یا اصلاح‌شده (اختیاری)",
    "slug": "اسلاگ فارسی کوتاه با خط تیره (اختیاری)",
    "excerpt": "خلاصه ۲ خطی سئوشده یا اصلاح‌شده (اختیاری)",
    "category": "یکی از دسته‌بندی‌های موجود (اختیاری)",
    "blocks": [ ... آرایه بلوک‌ها (در حالت replace یا append) ]
  }
}

نکته:
- اگر کاربر فقط «پیشنهاد ویرایش / نقد / بررسی» خواست و نخواست فیلدها عوض شوند، patch را null بگذار و پیشنهادهای دقیق را در reply بنویس.
- در هر درخواستی که تغییر، اصلاح، تصحیح، زیباسازی یا تولید متن بخواهد، حتماً patch را آماده و قابل اعمال برگردان.`;

function detectIpVersion(host: string): 0 | 4 | 6 {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const octets = host.split('.').map(Number);
    if (octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return 4;
    }
  }
  if (host.includes(':') && /^[0-9a-f:.]+$/i.test(host)) {
    return 6;
  }
  return 0;
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1'
  ) {
    return true;
  }

  const ipVersion = detectIpVersion(host);
  if (ipVersion === 4) {
    const octets = host.split('.').map(Number);
    if (octets.length !== 4) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (ipVersion === 6) {
    if (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb') ||
      host.startsWith('::ffff:127.') ||
      host.startsWith('::ffff:10.') ||
      host.startsWith('::ffff:192.168.') ||
      host.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
  }

  return false;
}

export function validateBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('آدرس لینک ارائه‌دهنده (Base URL) نامعتبر است.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('آدرس ارائه‌دهنده باید با http:// یا https:// شروع شود.');
  }
  if (isPrivateOrBlockedHost(parsed.hostname)) {
    throw new Error('آدرس‌های شبکه داخلی یا لوکال (localhost/IP خصوصی) مجاز نیستند.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidates.unshift(fenceMatch[1].trim());
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizeAiPatch(raw: unknown): AiPostPatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const mode =
    obj.mode === 'append' || obj.mode === 'meta_only' || obj.mode === 'replace'
      ? obj.mode
      : Array.isArray(obj.blocks)
        ? 'replace'
        : 'meta_only';

  const patch: AiPostPatch = { mode };
  if (typeof obj.title === 'string' && obj.title.trim()) patch.title = obj.title.trim();
  if (typeof obj.slug === 'string' && obj.slug.trim()) patch.slug = obj.slug.trim();
  if (typeof obj.excerpt === 'string' && obj.excerpt.trim()) patch.excerpt = obj.excerpt.trim();
  if (typeof obj.category === 'string' && obj.category.trim()) patch.category = obj.category.trim();
  if (Array.isArray(obj.blocks)) {
    const normalized = normalizeBlocks(obj.blocks);
    if (normalized.length > 0) {
      patch.blocks = normalized;
    }
  }

  if (
    !patch.title &&
    !patch.slug &&
    !patch.excerpt &&
    !patch.category &&
    (!patch.blocks || patch.blocks.length === 0)
  ) {
    return null;
  }
  return patch;
}

function describeBlockReadable(block: ContentBlock, index: number): string {
  const num = index + 1;
  switch (block.type) {
    case 'h2':
      return `[بلوک ${num} | تیتر H2]: ${block.text}`;
    case 'h3':
      return `[بلوک ${num} | تیتر H3]: ${block.text}`;
    case 'paragraph':
      return `[بلوک ${num} | پاراگراف]: ${block.text}`;
    case 'card':
      return `[بلوک ${num} | کارت (${block.accent || 'flame'})]: عنوان="${block.title}" | متن="${block.body}"`;
    case 'button':
      return `[بلوک ${num} | دکمه]: برچسب="${block.label}" | لینک="${block.url}"`;
    case 'embed':
      return `[بلوک ${num} | کارت لینک]: عنوان="${block.title}" | لینک="${block.url}" | توضیح="${block.description || ''}"`;
    case 'quote':
      return `[بلوک ${num} | نقل‌قول]: "${block.text}" (گوینده: ${block.author || 'ندارد'})`;
    case 'code':
      return `[بلوک ${num} | کد (${block.language})]: ${block.code}`;
    case 'list':
      return `[بلوک ${num} | فهرست ${block.ordered ? 'شماره‌دار' : 'نقطه‌ای'}]: ${block.items.join(' | ')}`;
    case 'image':
      return `[بلوک ${num} | تصویر]: url="${block.url}" | alt="${block.alt || ''}" | زیرنویس="${block.caption || ''}"`;
    case 'video':
      return `[بلوک ${num} | ویدیو]: url="${block.url}" | زیرنویس="${block.caption || ''}"`;
    case 'audio':
      return `[بلوک ${num} | صوت]: url="${block.url}" | عنوان="${block.title || ''}" | زیرنویس="${block.caption || ''}"`;
  }
}

function buildUserPrompt(input: AiAssistInput): string {
  const actionHints: Record<AiAssistAction, string> = {
    chat: 'درخواست مستقیم مدیر (دقیقاً طبق همین درخواست عمل کن و اگر فقط اصلاح بخشی را خواست بقیه را تغییر نده):',
    write_full:
      'یک مقاله کامل، ساختاریافته و خواندنی درباره موضوع زیر بنویس (شامل عنوان، اسلاگ، خلاصه، دسته‌بندی مناسب، تیترهای H2/H3، پاراگراف با بولد و هایلایت، حداقل یک کارت نکته، فهرست و نقل‌قول یا کد در صورت مرتبط بودن):',
    proofread:
      'فقط غلط‌های املایی، نیم‌فاصله‌ها، علائم نگارشی و اشکالات واضح تایپی موجود در فیلدهای فعلی (عنوان، خلاصه و بلوک‌ها) را اصلاح کن. ساختار، لحن و محتوای نویسنده را بازنویسی نکن. تمام بلوک‌ها را با همان ترتیب و نوع حفظ کن، لیست اصلاحات را در reply بنویس و نسخه تصحیح‌شده را در patch (با mode="replace") برگردان:',
    polish:
      'متن و بلوک‌های فعلی را از نظر نگارشی، نیم‌فاصله، روانی، ساختار تیترها، بولد/هایلایت کلیدی و افزودن کارت نکته (در صورت نیاز) زیباسازی و ویراستاری کن و patch با mode="replace" بده:',
    suggest:
      'مقاله و فیلدهای فعلی را بررسی کن و فقط پیشنهادهای دقیق و کاربردی برای بهبود تیتر، خلاصه، ساختار، خوانایی و سئو ارائه بده (patch را null بگذار):',
    fill_meta:
      'بر اساس بلوک‌های فعلی نوشته، عنوان جذاب، اسلاگ فارسی تمیز، خلاصه ۲ خطی سئوشده و بهترین دسته‌بندی موجود را پیشنهاد بده (patch با mode="meta_only"):',
    add_summary:
      'یک کارت جمع‌بندی و یک بخش نکات کلیدی (list یا card) متناسب با نوشته فعلی بساز تا به انتهای مقاله اضافه شود (patch با mode="append"):',
  };

  const action = input.action || 'chat';
  const readableFields = [
    `عنوان فعلی: ${input.currentPost.title.trim() || '(خالی)'}`,
    `دسته‌بندی انتخاب‌شده: ${input.currentPost.category.trim() || '(خالی)'}`,
    `اسلاگ فعلی: ${input.currentPost.slug.trim() || '(خالی)'}`,
    `خلاصه فعلی: ${input.currentPost.excerpt.trim() || '(خالی)'}`,
    `تصویر کاور: ${input.currentPost.coverImage?.trim() || '(ندارد)'}`,
    `دسته‌بندی‌های مجاز سایت: ${input.categories.join('، ') || 'یادگیری'}`,
    `تعداد بلوک‌ها: ${input.currentPost.blocks.length}`,
    input.currentPost.blocks.length > 0
      ? input.currentPost.blocks.map((b, i) => describeBlockReadable(b, i)).join('\n')
      : '(هنوز هیچ بلوکی نوشته نشده است)',
  ].join('\n');

  const contextPayload = {
    availableCategories: input.categories,
    currentPost: {
      title: input.currentPost.title,
      slug: input.currentPost.slug,
      excerpt: input.currentPost.excerpt,
      category: input.currentPost.category,
      coverImage: input.currentPost.coverImage || '',
      blocks: input.currentPost.blocks,
    },
  };

  const recentHistory = (input.history || [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'مدیر' : 'دستیار'}: ${m.text}`)
    .join('\n');

  return [
    `خلاصه خوانای فیلدهای فعلی ویرایشگر:\n${readableFields}`,
    `داده کامل ساختاریافته ویرایشگر (JSON):\n${JSON.stringify(contextPayload, null, 2)}`,
    recentHistory ? `خلاصه گفت‌وگوی قبلی:\n${recentHistory}` : '',
    `${actionHints[action]}\n${input.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function mergeConfigWithOverride(
  saved: ResolvedAiConfig,
  override?: AiConnectionOverride,
): ResolvedAiConfig {
  if (!override) return saved;
  const provider: AiProviderType =
    override.provider === 'openai_compatible' || override.provider === 'gemini'
      ? override.provider
      : saved.provider;
  const defaultModel = provider === 'gemini' ? 'gemini-4-hydrogen' : 'gpt-4.1-mini';
  const model =
    typeof override.model === 'string' && override.model.trim()
      ? override.model.trim()
      : provider === saved.provider
        ? saved.model
        : defaultModel;
  const baseUrl =
    typeof override.baseUrl === 'string' ? override.baseUrl.trim() : saved.baseUrl;
  const customApiKey =
    typeof override.apiKey === 'string' && override.apiKey.trim()
      ? override.apiKey.trim()
      : saved.customApiKey;

  return {
    ...saved,
    provider,
    model,
    baseUrl,
    customApiKey,
  };
}

async function callGeminiProvider(
  cfg: ResolvedAiConfig,
  userPrompt: string,
  systemInstruction: string,
  jsonMode: boolean,
): Promise<{ text: string; model: string }> {
  const apiKey = cfg.customApiKey.trim();
  if (!apiKey) {
    throw new Error(
      'کلید API تنظیم نشده است. برای امنیت بیشتر، کلید پیش‌فرض غیرفعال است؛ هر زمان خواستی کلید API جمنای (یا ارائه‌دهنده دیگر) را در بخش «تنظیمات هوش مصنوعی» وارد و ذخیره کن.',
    );
  }

  const baseUrl = cfg.baseUrl ? validateBaseUrl(cfg.baseUrl) : '';
  const requestedModel = cfg.model || 'gemini-4-hydrogen';

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'mbnd-cms/1.0' },
      ...(baseUrl ? { baseUrl } : {}),
    },
  });

  const invoke = async (targetModel: string) => {
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: userPrompt,
      config: {
        systemInstruction,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    });
    const text = (response.text ?? '').trim();
    if (!text) {
      throw new Error('پاسخی از مدل Gemini دریافت نشد.');
    }
    return { text, model: targetModel };
  };

  try {
    return await invoke(requestedModel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTransientOverload =
      msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');

    if (isTransientOverload) {
      const fallbackModel =
        requestedModel !== 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
      try {
        await new Promise((r) => setTimeout(r, 500));
        return await invoke(fallbackModel);
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (
          retryMsg.includes('503') ||
          retryMsg.includes('UNAVAILABLE') ||
          retryMsg.includes('high demand')
        ) {
          throw new Error(
            'سرور مدل جمنای موقتاً شلوغ است (503). لحظاتی بعد دوباره امتحان کن یا مدل gemini-3.1-flash-lite را انتخاب کن.',
          );
        }
        throw new Error(`خطا در ارتباط با Gemini: ${retryMsg.slice(0, 220)}`);
      }
    }

    if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      throw new Error(
        `مدل «${requestedModel}» در Gemini پیدا نشد. از مدل‌های جدید مانند gemini-4-hydrogen یا gemini-4-neon استفاده کن.`,
      );
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
      throw new Error('کلید API جمنای نامعتبر است یا دسترسی به این مدل را ندارد.');
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('سقف درخواست (Quota) مدل پر شده است. چند لحظه بعد امتحان کن.');
    }
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      throw new Error(
        'اتصال شبکه به سرور Gemini برقرار نشد. در صورت استفاده از پروکسی، Base URL را بررسی کن.',
      );
    }
    throw new Error(`خطا در ارتباط با Gemini: ${msg.slice(0, 220)}`);
  }
}

async function callOpenAiCompatibleProvider(
  cfg: ResolvedAiConfig,
  userPrompt: string,
  systemInstruction: string,
  jsonMode: boolean,
): Promise<{ text: string; model: string }> {
  const apiKey = cfg.customApiKey.trim();
  if (!apiKey) {
    throw new Error(
      'کلید API تنظیم نشده است. برای امنیت بیشتر، کلید پیش‌فرض غیرفعال است؛ کلید API ارائه‌دهنده خودت را در «تنظیمات هوش مصنوعی» وارد و ذخیره کن.',
    );
  }

  const baseUrl = validateBaseUrl(cfg.baseUrl || 'https://api.openai.com/v1');
  const model = cfg.model || 'gpt-4.1-mini';

  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const executeRequest = async (useJsonFormat: boolean) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt },
          ],
          ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const rawBody = await res.text();
      return { res, rawBody };
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let { res, rawBody } = await executeRequest(jsonMode);

    // Some OpenAI-compatible gateways reject response_format: json_object with HTTP 400 -> auto-retry without it
    if (!res.ok && res.status === 400 && jsonMode) {
      const retry = await executeRequest(false);
      res = retry.res;
      rawBody = retry.rawBody;
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const errObj = parsed?.error as { message?: string } | string | undefined;
      const detail =
        typeof errObj === 'string'
          ? errObj
          : typeof errObj?.message === 'string'
            ? errObj.message
            : rawBody.slice(0, 200);
      if (res.status === 401 || res.status === 403) {
        throw new Error('کلید API ارائه‌دهنده نامعتبر است یا دسترسی ندارد.');
      }
      throw new Error(`خطای ارائه‌دهنده (${res.status}): ${detail || 'پاسخ ناموفق'}`);
    }

    const choices = parsed?.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content?.trim() || '';
    if (!content) {
      throw new Error('پاسخ خالی از ارائه‌دهنده OpenAI-Compatible دریافت شد.');
    }
    return { text: content, model };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('پاسخ‌دهی ارائه‌دهنده هوش مصنوعی بیش از حد طول کشید (Timeout).');
    }
    if (err instanceof Error && (err.message.includes('fetch failed') || err.message.includes('ENOTFOUND'))) {
      throw new Error('امکان اتصال به آدرس Base URL واردشده وجود ندارد. نشانی را بررسی کن.');
    }
    throw err;
  }
}

export async function runAdminAiAssist(input: AiAssistInput): Promise<AiAssistResponse> {
  const cfg = await getAiConfigResolved();
  const userPrompt = buildUserPrompt(input);

  const rawResult =
    cfg.provider === 'openai_compatible'
      ? await callOpenAiCompatibleProvider(cfg, userPrompt, SYSTEM_INSTRUCTION, true)
      : await callGeminiProvider(cfg, userPrompt, SYSTEM_INSTRUCTION, true);

  const parsed = extractJsonObject(rawResult.text);
  if (!parsed) {
    return {
      reply: rawResult.text,
      patch: null,
      providerUsed: cfg.provider,
      modelUsed: rawResult.model,
    };
  }

  const reply =
    typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : 'تغییرات پیشنهادی آماده شد. می‌توانی با دکمه زیر روی ویرایشگر اعمال کنی.';
  const patch = normalizeAiPatch(parsed.patch);

  return {
    reply,
    patch,
    providerUsed: cfg.provider,
    modelUsed: rawResult.model,
  };
}

export async function testAdminAiConnection(override?: AiConnectionOverride): Promise<{
  ok: true;
  provider: string;
  model: string;
  reply: string;
}> {
  const cfg = mergeConfigWithOverride(await getAiConfigResolved(), override);
  const testPrompt = 'فقط بنویس: اتصال برقرار است.';
  const testSystem = 'پاسخ بسیار کوتاه فارسی بده.';

  const res =
    cfg.provider === 'openai_compatible'
      ? await callOpenAiCompatibleProvider(cfg, testPrompt, testSystem, false)
      : await callGeminiProvider(cfg, testPrompt, testSystem, false);

  return {
    ok: true,
    provider: cfg.provider,
    model: res.model,
    reply: res.text.slice(0, 120),
  };
}

export type TranslateTargetKind = 'post' | 'category' | 'project' | 'settings';

const TRANSLATE_SYSTEM_INSTRUCTION = `You are a professional Persian-to-English technical translator and editor for a software engineer's personal portfolio and blog (Mohammad Bagher / mbnd.ir).
Rules:
1. Produce crisp, natural, idiomatic English that reads as if written natively by a developer — never stiff word-for-word machine translation.
2. Preserve EVERY JSON key, structure, block id, block type, URL, and inline markdown formatting (**bold**, *italic*, ==highlight==, \`code\`, [label](url)).
3. For code blocks ("type":"code"), NEVER translate or alter the code or language fields — copy them verbatim (only translate natural-language comments if appropriate, or leave code completely untouched).
4. For media blocks ("image", "video", "audio"), preserve the exact "url" untouched and translate only "alt", "title", and "caption".
5. Return ONLY a single valid JSON object matching the exact schema requested, with no markdown fences or extra prose.`;

export async function translateAdminContentToEnglish(input: {
  kind: TranslateTargetKind;
  payload: Record<string, unknown>;
}): Promise<{ data: Record<string, unknown>; providerUsed: AiProviderType; modelUsed: string }> {
  const cfg = await getAiConfigResolved();
  const prompt = [
    `Target type: ${input.kind}`,
    'Translate all Persian values in the JSON object below into natural, idiomatic English while preserving exact structure, IDs, URLs, and code blocks.',
    `Input JSON:\n${JSON.stringify(input.payload, null, 2)}`,
    'Return ONLY valid JSON with the exact same keys (and for post blocks, return the full translated "blocks" array).',
  ].join('\n\n');

  const rawResult =
    cfg.provider === 'openai_compatible'
      ? await callOpenAiCompatibleProvider(cfg, prompt, TRANSLATE_SYSTEM_INSTRUCTION, true)
      : await callGeminiProvider(cfg, prompt, TRANSLATE_SYSTEM_INSTRUCTION, true);

  const parsed = extractJsonObject(rawResult.text);
  if (!parsed) {
    throw new Error('پاسخ ترجمه از هوش مصنوعی قالب JSON معتبر نداشت. لطفاً دوباره امتحان کن.');
  }

  if (input.kind === 'post' && Array.isArray(parsed.blocks)) {
    parsed.blocks = normalizeBlocks(parsed.blocks);
  }

  return {
    data: parsed,
    providerUsed: cfg.provider,
    modelUsed: rawResult.model,
  };
}
