import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateReadingMinutes,
  formatPersianNumber,
  normalizeDigitsToAscii,
  slugifyPersian,
} from './slug.ts';
import {
  moveBlock,
  normalizeBlocks,
  parseInlineRichText,
  parseVideoEmbed,
  reorderArray,
  sanitizeMediaUrl,
} from './blocks.ts';

test('normalizeDigitsToAscii converts Persian and Arabic digits', () => {
  assert.equal(normalizeDigitsToAscii('سال ۱۴۰۵ و ١٤٠٤'), 'سال 1405 و 1404');
});

test('slugifyPersian produces clean Persian SEO slugs', () => {
  assert.equal(
    slugifyPersian('معماری لوکال‌فرست برای وب ایران ۱۴۰۵!'),
    'معماری-لوکال-فرست-برای-وب-ایران-1405',
  );
  assert.equal(slugifyPersian('Next.js & SQLite Guide'), 'nextjs-sqlite-guide');
});

test('sanitizeMediaUrl normalizes bare domains and blocks dangerous URIs', () => {
  assert.equal(sanitizeMediaUrl('/uploads/20261116-cover.webp'), '/uploads/20261116-cover.webp');
  assert.equal(sanitizeMediaUrl('https://example.ir/img.png'), 'https://example.ir/img.png');
  assert.equal(sanitizeMediaUrl('github.com/mbndCoder'), 'https://github.com/mbndCoder');
  assert.equal(sanitizeMediaUrl('mailto:mbnd1224@gmail.com'), 'mailto:mbnd1224@gmail.com');
  assert.equal(sanitizeMediaUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeMediaUrl('data:text/html,<script>alert(1)</script>'), '');
});

test('parseVideoEmbed detects YouTube, Aparat, and direct videos safely', () => {
  const ytWatch = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(ytWatch.kind, 'youtube');
  if (ytWatch.kind === 'youtube') {
    assert.equal(ytWatch.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  }

  const ytShort = parseVideoEmbed('youtu.be/dQw4w9WgXcQ');
  assert.equal(ytShort.kind, 'youtube');

  const aparat = parseVideoEmbed('https://www.aparat.com/v/abc123XY');
  assert.equal(aparat.kind, 'aparat');
  if (aparat.kind === 'aparat') {
    assert.equal(
      aparat.embedUrl,
      'https://www.aparat.com/video/video/embed/videohash/abc123XY/vt/frame',
    );
  }

  const localMp4 = parseVideoEmbed('/uploads/demo.mp4');
  assert.equal(localMp4.kind, 'direct');

  const bad = parseVideoEmbed('javascript:alert(1)');
  assert.equal(bad.kind, 'invalid');
});

test('normalizeBlocks handles all 12 block types and strips unsafe URLs', () => {
  const blocks = normalizeBlocks([
    { type: 'h2', text: 'تیتر اول' },
    { type: 'card', title: 'نکته', body: 'متن کارت', accent: 'flame' },
    { type: 'button', label: 'گیت‌هاب', url: 'github.com/mbndCoder', variant: 'primary' },
    { type: 'embed', title: 'لینک', url: 'https://ble.ir/mbnd1224', description: 'کانال بله' },
    { type: 'audio', url: '/uploads/demo.mp3', title: 'پادکست' },
    { type: 'image', url: 'javascript:evil()' },
    { type: 'unknown', text: 'skip me' },
  ]);
  assert.equal(blocks.length, 6);
  if (blocks[2].type === 'button') {
    assert.equal(blocks[2].url, 'https://github.com/mbndCoder');
  }
  if (blocks[5].type === 'image') {
    assert.equal(blocks[5].url, '');
  }
});

test('parseInlineRichText parses bold, italic, highlight, code, and safe links', () => {
  const tokens = parseInlineRichText(
    'متن **بولد** و *کج* و ==هایلایت== و `npm run build` و [گیت‌هاب](github.com/mbndCoder) و [بد](javascript:alert(1))',
  );
  assert.ok(tokens.some((t) => t.type === 'bold' && t.value === 'بولد'));
  assert.ok(tokens.some((t) => t.type === 'italic' && t.value === 'کج'));
  assert.ok(tokens.some((t) => t.type === 'highlight' && t.value === 'هایلایت'));
  assert.ok(tokens.some((t) => t.type === 'code' && t.value === 'npm run build'));
  assert.ok(
    tokens.some(
      (t) => t.type === 'link' && t.label === 'گیت‌هاب' && t.url === 'https://github.com/mbndCoder',
    ),
  );
  assert.ok(!tokens.some((t) => t.type === 'link' && t.label === 'بد'));
});

test('reorderArray and moveBlock reorder items safely', () => {
  assert.deepEqual(reorderArray(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  const blocks = normalizeBlocks([
    { id: '1', type: 'h2', text: 'A' },
    { id: '2', type: 'paragraph', text: 'B' },
    { id: '3', type: 'quote', text: 'C' },
  ]);
  const moved = moveBlock(blocks, 0, 1);
  assert.deepEqual(
    moved.map((b) => b.id),
    ['2', '1', '3'],
  );
});

test('formatPersianNumber converts ASCII digits to Persian digits', () => {
  assert.equal(formatPersianNumber(1405), '۱۴۰۵');
  assert.equal(formatPersianNumber('5 دقیقه'), '۵ دقیقه');
});

test('estimateReadingMinutes returns at least 1 minute and scales with content and captions', () => {
  const shortBlocks = normalizeBlocks([{ type: 'paragraph', text: 'سلام دنیا' }]);
  assert.equal(estimateReadingMinutes(shortBlocks), 1);

  const longText = Array.from({ length: 400 }, () => '**کلمه**').join(' ');
  const longBlocks = normalizeBlocks([
    { type: 'paragraph', text: longText },
    { type: 'card', title: 'خلاصه', body: 'توضیح کوتاه' },
    { type: 'audio', url: '/sample-audio.mp3', title: 'پادکست نمونه', caption: 'توضیح صوتی کوتاه' },
  ]);
  assert.equal(estimateReadingMinutes(longBlocks), 3);
});

test('i18n helpers parse nav items, format reading time, localize entities, and pick localized fallbacks safely', async () => {
  const {
    DEFAULT_NAV_ITEMS,
    formatReadingTime,
    localizeCategory,
    localizeCategoryName,
    localizePost,
    localizeProject,
    localizeSocialLabel,
    parseNavItems,
    pickLocalizedText,
  } = await import('./i18n.ts');

  assert.equal(parseNavItems('invalid-json').length, DEFAULT_NAV_ITEMS.length);
  const custom = parseNavItems(
    JSON.stringify([
      { id: 'home', labelFa: 'خانه', labelEn: 'Home', to: '/', enabled: true },
      { id: 'gh', labelFa: 'گیت‌هاب', labelEn: 'GitHub', to: 'https://github.com/mbndCoder', enabled: true },
      { id: 'bad', labelFa: 'بدون لینک', to: '' },
    ]),
  );
  assert.equal(custom.length, 2);
  assert.equal(custom[1].external, true);

  assert.equal(formatReadingTime(4, 'fa'), '۴ دقیقه مطالعه');
  assert.equal(formatReadingTime(4, 'en'), '4 min read');
  assert.equal(pickLocalizedText('en', 'سلام', 'Hello'), 'Hello');
  assert.equal(pickLocalizedText('en', 'سلام', ''), 'سلام');
  assert.equal(pickLocalizedText('fa', 'سلام', 'Hello'), 'سلام');
  assert.equal(localizeSocialLabel('تلگرام', 'telegram', 'en'), 'Telegram');
  assert.equal(localizeSocialLabel('تلگرام', 'telegram', 'en', 'My Telegram'), 'My Telegram');
  assert.equal(localizeSocialLabel('تلگرام', 'telegram', 'fa', 'My Telegram'), 'تلگرام');
  assert.equal(localizeSocialLabel('My Channel', 'telegram', 'en'), 'My Channel');

  const categories = [
    {
      id: 1,
      name: 'مهندسی نرم‌افزار',
      nameEn: 'Software Engineering',
      slug: 'software-engineering',
      description: 'یادداشت‌های فنی',
      descriptionEn: 'Technical notes',
      sortOrder: 0,
      postCount: 2,
    },
    {
      id: 2,
      name: 'طراحی محصول',
      nameEn: '',
      slug: 'product-design',
      description: 'تجربه کاربری',
      descriptionEn: '',
      sortOrder: 1,
      postCount: 0,
    },
  ];

  assert.deepEqual(localizeCategory(categories[0], 'en'), {
    name: 'Software Engineering',
    description: 'Technical notes',
  });
  assert.deepEqual(localizeCategory(categories[0], 'fa'), {
    name: 'مهندسی نرم‌افزار',
    description: 'یادداشت‌های فنی',
  });
  assert.equal(localizeCategoryName('مهندسی نرم‌افزار', categories, 'en'), 'Software Engineering');
  assert.equal(localizeCategoryName('طراحی محصول', categories, 'en'), 'طراحی محصول');
  assert.equal(localizeCategoryName('مهندسی نرم‌افزار', categories, 'fa'), 'مهندسی نرم‌افزار');

  const post = {
    id: 1,
    title: 'عنوان فارسی',
    titleEn: 'English Title',
    slug: 'sample-post',
    excerpt: 'خلاصه فارسی',
    excerptEn: 'English summary',
    coverImage: '',
    category: 'مهندسی نرم‌افزار',
    published: true,
    featured: true,
    blocks: normalizeBlocks([{ id: 'b1', type: 'paragraph', text: 'متن فارسی' }]),
    blocksEn: normalizeBlocks([{ id: 'b1', type: 'paragraph', text: 'English paragraph' }]),
    sortOrder: 0,
    readingMinutes: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const enPost = localizePost(post, 'en');
  assert.equal(enPost.title, 'English Title');
  assert.equal(enPost.excerpt, 'English summary');
  assert.equal(enPost.hasEnglishTranslation, true);
  assert.equal(enPost.blocks[0].type === 'paragraph' ? enPost.blocks[0].text : '', 'English paragraph');

  const untranslatedPost = localizePost({ ...post, titleEn: '', excerptEn: '', blocksEn: [] }, 'en');
  assert.equal(untranslatedPost.title, 'عنوان فارسی');
  assert.equal(untranslatedPost.hasEnglishTranslation, false);

  const project = {
    id: 1,
    title: 'پلتفرم وب',
    titleEn: 'Web Platform',
    role: 'معمار نرم‌افزار',
    roleEn: 'Software Architect',
    period: '۱۴۰۴ تاکنون',
    periodEn: '2025 – Present',
    summary: 'توضیح فارسی',
    summaryEn: 'English summary',
    url: 'https://mbnd.ir',
    imageUrl: '',
    stack: ['TypeScript'],
    featured: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  assert.deepEqual(localizeProject(project, 'en'), {
    title: 'Web Platform',
    role: 'Software Architect',
    period: '2025 – Present',
    summary: 'English summary',
  });
  assert.deepEqual(localizeProject(project, 'fa'), {
    title: 'پلتفرم وب',
    role: 'معمار نرم‌افزار',
    period: '۱۴۰۴ تاکنون',
    summary: 'توضیح فارسی',
  });
});

test('theme helpers sanitize hex colors, resolve effective theme, and compute light/dark CSS tokens', async () => {
  const {
    DEFAULT_THEME_COLORS,
    computeThemeVariables,
    resolveEffectiveTheme,
    sanitizeHexColor,
  } = await import('./theme.ts');

  assert.equal(sanitizeHexColor('#ff502b', '#000000'), '#FF502B');
  assert.equal(sanitizeHexColor('not-a-color', '#121212'), '#121212');

  assert.equal(resolveEffectiveTheme('dark', true), 'dark');
  assert.equal(resolveEffectiveTheme('light', false), 'light');
  assert.equal(resolveEffectiveTheme('auto', true), 'light');
  assert.equal(resolveEffectiveTheme('auto', false), 'dark');

  const darkVars = computeThemeVariables({}, 'dark');
  assert.equal(darkVars['--ground-deep'], DEFAULT_THEME_COLORS.darkBgColor);
  assert.equal(darkVars['--flame'], DEFAULT_THEME_COLORS.accentColor);

  const lightVars = computeThemeVariables({ accentColor: '#2563EB' }, 'light');
  assert.equal(lightVars['--ground-deep'], DEFAULT_THEME_COLORS.lightBgColor);
  assert.equal(lightVars['--flame'], '#2563EB');
  assert.equal(lightVars['--status-success-ink'], '#047857');
});

