import { GoogleGenAI } from '@google/genai';
import { getAiConfigResolved, type ResolvedAiConfig } from './db.ts';
import { normalizeBlocks } from '../src/lib/blocks.ts';
import type {
  AiAssistResponse,
  AiBlockUpdate,
  AiPostPatch,
  AiProviderType,
  ContentBlock,
  SiteLanguage,
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
  contentLang?: SiteLanguage;
  adminLang?: SiteLanguage;
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

const SYSTEM_INSTRUCTION = `You are the dedicated, precision writing & editing assistant inside the Admin Portal of Mohammad Bagher Nouri's personal blog and portfolio (mbnd.ir).
You receive the exact live state of the post editor (title, slug, excerpt, category, cover image, target editing language FA/EN, and every content block with its 0-based index).

STRICT PRECISION & SURGICAL EDITING RULES:
1. **Do EXACTLY what the user asks — no more, no less.**
   - Never add extra paragraphs, extra headings, unsolicited intros/outros, or rewrite untouched sections unless the user explicitly asks for them.
   - Omit (do NOT include) any field in "patch" that the user did not ask to change!
2. **Choose the most surgical patch mode:**
   - \`"meta_only"\`: When the user only asks to change title, slug, excerpt, or category. Include ONLY the changed meta field(s) and NEVER include \`blocks\`.
   - \`"patch_blocks"\`: When the user asks to edit, fix, shorten, expand, or format ONE or a FEW specific blocks (e.g. "fix paragraph 2", "bold keywords in block 1", "delete block 3"). Use \`blockUpdates: [{"index": 0, "block": {...}}]\` (0-based index matching the editor blocks) and/or \`removeBlockIndices: [2]\`. Untouched blocks stay 100% intact!
   - \`"append"\`: When the user asks to add a new block/section (summary card, CTA button, list, etc.) to the end of the post. Put ONLY the newly added block(s) in \`blocks\`.
   - \`"replace"\`: Only when writing a full new post, restructuring the entire post, or proofreading/polishing the entire document. Always keep all existing real media blocks (image, video, audio) and user URLs intact.
3. **Language discipline:**
   - Write/edit post content strictly in the active \`targetContentLanguage\` (\`fa\` = natural Persian with proper half-spaces like «می‌شود»، «پروژه‌ها», or \`en\` = natural, idiomatic English).
   - Write your conversational \`reply\` in the language matching the user's message (or \`adminUiLanguage\` if triggered via a quick action button).
4. **Rich inline formatting & allowed block schemas:**
   - Inline formatting inside paragraph, card body, quote text, and list items:
     - \`**bold**\` for key terms
     - \`*italic*\` for light emphasis
     - \`==highlight==\` for critical takeaways
     - \`\\\`code\\\`\` for commands/identifiers
     - \`[label](https://...)\` for inline links
   - Allowed block objects:
     1. {"type":"h2","text":"..."}
     2. {"type":"h3","text":"..."}
     3. {"type":"paragraph","text":"..."}
     4. {"type":"card","title":"...","body":"...","accent":"flame"|"neutral"}
     5. {"type":"button","label":"...","url":"https://...","variant":"primary"|"secondary"}
     6. {"type":"embed","title":"...","url":"https://...","description":"..."}
     7. {"type":"quote","text":"...","author":"..."}
     8. {"type":"code","language":"bash|typescript|python|...","code":"..."}
     9. {"type":"list","ordered":false|true,"items":["...","..."]}
     10. {"type":"image","url":"...","alt":"...","caption":"..."} (only real URLs already present; never invent URLs)
     11. {"type":"video","url":"...","caption":"..."} (only real URLs already present)
     12. {"type":"audio","url":"...","title":"...","caption":"..."} (only real URLs already present)

MANDATORY OUTPUT FORMAT (return ONLY a single valid JSON object, no prose outside JSON):
{
  "reply": "Short, clear summary of the exact change or answer.",
  "patch": null OR {
    "mode": "patch_blocks" | "meta_only" | "append" | "replace",
    "targetLang": "fa" | "en",
    "title": "(optional - only if changed)",
    "slug": "(optional - only if changed)",
    "excerpt": "(optional - only if changed)",
    "category": "(optional - must match an existing category name)",
    "blockUpdates": [{"index": 0, "block": { ... }}],
    "removeBlockIndices": [2],
    "blocks": [ ... ]
  }
}

Notes:
- If the user only asks a question, critique, or brainstorm without asking to change the editor, set "patch": null.
- Whenever the user requests any edit, correction, addition, deletion, or rewrite, always include a clean, directly applicable "patch".`;

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

export function normalizeAiPatch(
  raw: unknown,
  fallbackTargetLang?: SiteLanguage,
): AiPostPatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const hasBlockUpdates = Array.isArray(obj.blockUpdates) && obj.blockUpdates.length > 0;
  const hasRemoveIndices =
    Array.isArray(obj.removeBlockIndices) && obj.removeBlockIndices.length > 0;

  const mode =
    obj.mode === 'append' ||
    obj.mode === 'meta_only' ||
    obj.mode === 'replace' ||
    obj.mode === 'patch_blocks'
      ? obj.mode
      : hasBlockUpdates || hasRemoveIndices
        ? 'patch_blocks'
        : Array.isArray(obj.blocks)
          ? 'replace'
          : 'meta_only';

  const targetLang: SiteLanguage | undefined =
    obj.targetLang === 'en' || obj.targetLang === 'fa' ? obj.targetLang : fallbackTargetLang;

  const patch: AiPostPatch = { mode, ...(targetLang ? { targetLang } : {}) };
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

  if (Array.isArray(obj.blockUpdates)) {
    const updates: AiBlockUpdate[] = [];
    for (const item of obj.blockUpdates) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const index = typeof rec.index === 'number' ? Math.trunc(rec.index) : -1;
      if (index < 0) continue;
      const normalized = normalizeBlocks([rec.block]);
      if (normalized.length === 1) {
        updates.push({ index, block: normalized[0] });
      }
    }
    if (updates.length > 0) {
      patch.blockUpdates = updates;
    }
  }

  if (Array.isArray(obj.removeBlockIndices)) {
    const indices = Array.from(
      new Set(
        obj.removeBlockIndices
          .map((n) => (typeof n === 'number' ? Math.trunc(n) : -1))
          .filter((n) => n >= 0),
      ),
    );
    if (indices.length > 0) {
      patch.removeBlockIndices = indices;
    }
  }

  if (
    !patch.title &&
    !patch.slug &&
    !patch.excerpt &&
    !patch.category &&
    (!patch.blocks || patch.blocks.length === 0) &&
    (!patch.blockUpdates || patch.blockUpdates.length === 0) &&
    (!patch.removeBlockIndices || patch.removeBlockIndices.length === 0)
  ) {
    return null;
  }
  return patch;
}

function describeBlockReadable(block: ContentBlock, index: number): string {
  const num = index + 1;
  switch (block.type) {
    case 'h2':
      return `[Block #${num} (index ${index}) | H2]: ${block.text}`;
    case 'h3':
      return `[Block #${num} (index ${index}) | H3]: ${block.text}`;
    case 'paragraph':
      return `[Block #${num} (index ${index}) | Paragraph]: ${block.text}`;
    case 'card':
      return `[Block #${num} (index ${index}) | Card (${block.accent || 'flame'})]: title="${block.title}" | body="${block.body}"`;
    case 'button':
      return `[Block #${num} (index ${index}) | Button]: label="${block.label}" | url="${block.url}"`;
    case 'embed':
      return `[Block #${num} (index ${index}) | Embed]: title="${block.title}" | url="${block.url}" | desc="${block.description || ''}"`;
    case 'quote':
      return `[Block #${num} (index ${index}) | Quote]: "${block.text}" (author: ${block.author || 'none'})`;
    case 'code':
      return `[Block #${num} (index ${index}) | Code (${block.language})]: ${block.code}`;
    case 'list':
      return `[Block #${num} (index ${index}) | List (${block.ordered ? 'ordered' : 'bullet'})]: ${block.items.join(' | ')}`;
    case 'image':
      return `[Block #${num} (index ${index}) | Image]: url="${block.url}" | alt="${block.alt || ''}" | caption="${block.caption || ''}"`;
    case 'video':
      return `[Block #${num} (index ${index}) | Video]: url="${block.url}" | caption="${block.caption || ''}"`;
    case 'audio':
      return `[Block #${num} (index ${index}) | Audio]: url="${block.url}" | title="${block.title || ''}" | caption="${block.caption || ''}"`;
  }
}

function buildUserPrompt(input: AiAssistInput): string {
  const contentLang: SiteLanguage = input.contentLang === 'en' ? 'en' : 'fa';
  const adminLang: SiteLanguage = input.adminLang === 'en' ? 'en' : 'fa';

  const actionHints: Record<AiAssistAction, string> = {
    chat: 'Direct admin instruction (execute EXACTLY what is requested — no more, no less; use mode="patch_blocks" or "meta_only" when editing specific blocks/fields):',
    write_full: `Write a complete, well-structured, engaging article in ${contentLang === 'en' ? 'English' : 'Persian'} on the requested topic (title, slug, excerpt, matching category, H2/H3 headings, paragraphs with bold/highlight, at least one insight card, list, and quote/code if relevant):`,
    proofread: `Proofread ONLY spelling, typos, punctuation, and half-spaces (in Persian) across the current fields and blocks. Do NOT rewrite tone, structure, or add/remove content. Preserve every block type/order and list the fixes in reply:`,
    polish: `Improve flow, clarity, heading hierarchy, inline bold/highlight formatting, and readability of the current ${contentLang === 'en' ? 'English' : 'Persian'} post without losing any real information or media blocks:`,
    suggest: `Review the current post and provide concrete, concise editorial & SEO suggestions ONLY (set patch to null):`,
    fill_meta: `Based on the current blocks, suggest an engaging title, clean URL slug, 2-line SEO excerpt, and best matching category (use mode="meta_only"):`,
    add_summary: `Create a concise summary card and key takeaways list matching the current post to append at the end (use mode="append"):`,
  };

  const action = input.action || 'chat';
  const readableFields = [
    `targetContentLanguage: ${contentLang} (${contentLang === 'en' ? 'English' : 'Persian'})`,
    `adminUiLanguage: ${adminLang} (${adminLang === 'en' ? 'English' : 'Persian'})`,
    `Current Title: ${input.currentPost.title.trim() || '(empty)'}`,
    `Current Category: ${input.currentPost.category.trim() || '(empty)'}`,
    `Current Slug: ${input.currentPost.slug.trim() || '(empty)'}`,
    `Current Excerpt: ${input.currentPost.excerpt.trim() || '(empty)'}`,
    `Cover Image: ${input.currentPost.coverImage?.trim() || '(none)'}`,
    `Available Site Categories: ${input.categories.join(', ') || 'یادگیری'}`,
    `Block Count: ${input.currentPost.blocks.length}`,
    input.currentPost.blocks.length > 0
      ? input.currentPost.blocks.map((b, i) => describeBlockReadable(b, i)).join('\n')
      : '(no blocks written yet)',
  ].join('\n');

  const contextPayload = {
    targetContentLanguage: contentLang,
    adminUiLanguage: adminLang,
    availableCategories: input.categories,
    currentPost: {
      title: input.currentPost.title,
      slug: input.currentPost.slug,
      excerpt: input.currentPost.excerpt,
      category: input.currentPost.category,
      coverImage: input.currentPost.coverImage || '',
      blocks: input.currentPost.blocks.map((block, index) => ({ index, ...block })),
    },
  };

  const recentHistory = (input.history || [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Admin' : 'Assistant'}: ${m.text}`)
    .join('\n');

  return [
    `Live Editor Snapshot:\n${readableFields}`,
    `Structured Editor JSON:\n${JSON.stringify(contextPayload, null, 2)}`,
    recentHistory ? `Recent Conversation:\n${recentHistory}` : '',
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
      headers: { 'User-Agent': 'aistudio-build' },
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
  const contentLang: SiteLanguage = input.contentLang === 'en' ? 'en' : 'fa';

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
      : input.adminLang === 'en'
        ? 'Suggested changes are ready. Click Apply below to update the editor.'
        : 'تغییرات پیشنهادی آماده شد. می‌توانی با دکمه زیر روی ویرایشگر اعمال کنی.';
  const patch = normalizeAiPatch(parsed.patch, contentLang);

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
