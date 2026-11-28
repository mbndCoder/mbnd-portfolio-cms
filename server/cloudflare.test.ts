import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@libsql/client';
import app from './app.ts';
import { setCustomLibsqlClient } from './db.ts';
import {
  classifyExtension,
  deleteUploadedMedia,
  getFileExtension,
  resolveCloudinaryCredentials,
  signCloudinaryParams,
  uploadMediaToCloudinary,
  UploadValidationError,
} from './uploads.ts';
import { normalizeAiPatch } from './ai.ts';
import {
  BACKUP_FORMAT_ID,
  BackupValidationError,
  validateAndNormalizeBackupPayload,
} from './backup.ts';
import { inferLogSourceFromPath, sanitizeLogText } from './logs.ts';
import type { AssetsBinding, RuntimeEnv } from './env.ts';

function createMockAssets(): AssetsBinding {
  const indexHtml = `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="index, follow" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>Default Title</title>
    <meta name="description" content="Default desc" />
    <meta property="og:title" content="Default Title" />
    <meta property="og:description" content="Default desc" />
    <meta property="og:type" content="website" />
  </head>
  <body><div id="root"></div></body>
</html>`;

  // Minimal valid JPEG bytes for avatar embedding test
  const tinyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const tinyPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const pathname = new URL(urlStr, 'https://mbnd.ir').pathname;
      if (pathname === '/index.html') {
        return new Response(indexHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (pathname === '/vcard-avatar.jpg') {
        return new Response(tinyJpeg, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      if (pathname === '/favicon.png') {
        return new Response(tinyPng, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return new Response('Not Found', { status: 404 });
    },
  };
}

function createTestEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return {
    ASSETS: createMockAssets(),
    APP_URL: 'https://mbnd.ir',
    ADMIN_ROUTE: 'secret-cf-panel',
    SESSION_SECRET: 'cloudflare-workers-test-session-secret-123456',
    CLOUDINARY_CLOUD_NAME: 'demo-cloud',
    CLOUDINARY_API_KEY: '1234567890',
    CLOUDINARY_API_SECRET: 'super-secret-key',
    CLOUDINARY_FOLDER: 'mbnd-uploads',
    ...overrides,
  };
}

test('signCloudinaryParams matches official SHA-1 sorted query signature', async () => {
  const params = {
    timestamp: '1700000000',
    public_id: 'sample_id',
    folder: 'mbnd-uploads',
    overwrite: 'false',
    ignored: undefined,
  };
  const actual = await signCloudinaryParams(params, 'my_api_secret');
  const expectedInput = 'folder=mbnd-uploads&overwrite=false&public_id=sample_id&timestamp=1700000000my_api_secret';
  const expected = crypto.createHash('sha1').update(expectedInput).digest('hex');
  assert.equal(actual, expected);
});

test('Cloudinary helpers parse credentials, classify extensions, and validate files', async () => {
  assert.equal(getFileExtension('photo.WEBP'), '.webp');
  assert.equal(getFileExtension('dir/sub.folder/noext'), '');
  assert.deepEqual(classifyExtension('.png'), { kind: 'image', resourceType: 'image' });
  assert.deepEqual(classifyExtension('.mp3'), { kind: 'audio', resourceType: 'video' });
  assert.deepEqual(classifyExtension('.mp4'), { kind: 'video', resourceType: 'video' });
  assert.deepEqual(classifyExtension('.pdf'), { kind: 'file', resourceType: 'raw' });

  const fromUrl = resolveCloudinaryCredentials({
    CLOUDINARY_URL: 'cloudinary://key123:sec456@mycloud',
    CLOUDINARY_FOLDER: '/custom-dir/',
  });
  assert.deepEqual(fromUrl, {
    cloudName: 'mycloud',
    apiKey: 'key123',
    apiSecret: 'sec456',
    folder: 'custom-dir',
  });

  const badFile = new File(['hello'], 'malware.exe', { type: 'application/octet-stream' });
  await assert.rejects(
    () => uploadMediaToCloudinary(badFile, createTestEnv()),
    (err: unknown) => err instanceof UploadValidationError && err.status === 400,
  );

  const emptyFile = new File([], 'empty.png', { type: 'image/png' });
  await assert.rejects(
    () => uploadMediaToCloudinary(emptyFile, createTestEnv()),
    (err: unknown) => err instanceof UploadValidationError && err.status === 400,
  );
});

test('uploadMediaToCloudinary and deleteUploadedMedia use standard Web fetch without fs or multer', async () => {
  setCustomLibsqlClient(createClient({ url: ':memory:' }), 'cf-upload-test');
  const env = createTestEnv();

  const captured: {
    uploadedEndpoint: string;
    uploadedFormData?: FormData;
    destroyEndpoint: string;
    destroyFormData?: FormData;
  } = {
    uploadedEndpoint: '',
    destroyEndpoint: '',
  };

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/image/upload')) {
      captured.uploadedEndpoint = url;
      if (init?.body instanceof FormData) {
        captured.uploadedFormData = init.body;
      }
      return new Response(
        JSON.stringify({
          public_id: 'mbnd-uploads/20261123-abcdef123456',
          secure_url: 'https://res.cloudinary.com/demo-cloud/image/upload/v1/mbnd-uploads/20261123-abcdef123456.webp',
          bytes: 4096,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.endsWith('/image/destroy')) {
      captured.destroyEndpoint = url;
      if (init?.body instanceof FormData) {
        captured.destroyFormData = init.body;
      }
      return new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Unexpected URL', { status: 500 });
  };

  const file = new File([new Uint8Array([1, 2, 3, 4])], 'hero-cover.png', { type: 'image/png' });
  const result = await uploadMediaToCloudinary(file, env, mockFetch);

  assert.equal(captured.uploadedEndpoint, 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
  assert.ok(captured.uploadedFormData);
  assert.equal(captured.uploadedFormData.get('api_key'), '1234567890');
  assert.equal(captured.uploadedFormData.get('folder'), 'mbnd-uploads');
  assert.ok(typeof captured.uploadedFormData.get('signature') === 'string');
  assert.equal(result.kind, 'image');
  assert.equal(result.optimized, true);
  assert.equal(result.filename, 'mbnd-uploads/20261123-abcdef123456');

  const deleted = await deleteUploadedMedia(encodeURIComponent(result.filename), env, mockFetch);
  assert.equal(deleted, true);
  assert.equal(captured.destroyEndpoint, 'https://api.cloudinary.com/v1_1/demo-cloud/image/destroy');
  assert.ok(captured.destroyFormData);
  assert.equal(captured.destroyFormData.get('public_id'), 'mbnd-uploads/20261123-abcdef123456');
});

test('Hono Worker app.fetch handles public API, SEO, vCard, SSR HTML, and Admin setup/auth cleanly', async () => {
  setCustomLibsqlClient(createClient({ url: ':memory:' }), 'cf-hono-e2e');
  const env = createTestEnv();

  // 1. Health check
  const healthRes = await app.fetch(new Request('https://mbnd.ir/api/health'), env);
  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as { ok: boolean; status: string };
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.status, 'healthy');

  // 2. Public site data + security headers
  const siteRes = await app.fetch(new Request('https://mbnd.ir/api/public/site'), env);
  assert.equal(siteRes.status, 200);
  assert.equal(siteRes.headers.get('x-content-type-options'), 'nosniff');
  assert.match(siteRes.headers.get('cache-control') || '', /no-store/);
  const siteJson = (await siteRes.json()) as {
    settings: { brandName: string };
    posts: Array<{ slug: string }>;
    categories: unknown[];
    projects: unknown[];
  };
  assert.equal(siteJson.settings.brandName, 'My Portfolio');
  assert.ok(siteJson.posts.length >= 1);

  // 3. SEO & AI endpoints (dynamically driven from site settings + origin)
  const robotsRes = await app.fetch(new Request('https://mbnd.ir/robots.txt'), env);
  assert.equal(robotsRes.status, 200);
  const robotsText = await robotsRes.text();
  assert.match(robotsText, /Sitemap: https:\/\/mbnd\.ir\/sitemap\.xml/);
  assert.match(robotsText, /User-agent: Bingbot/);
  assert.match(robotsText, /User-agent: GPTBot/);
  assert.match(robotsText, /User-agent: Google-Extended/);

  const sitemapRes = await app.fetch(new Request('https://mbnd.ir/sitemap.xml'), env);
  assert.equal(sitemapRes.status, 200);
  assert.match(sitemapRes.headers.get('content-type') || '', /application\/xml/);
  assert.match(await sitemapRes.text(), /<urlset/);

  const rssRes = await app.fetch(new Request('https://mbnd.ir/rss.xml'), env);
  assert.equal(rssRes.status, 200);
  assert.match(rssRes.headers.get('content-type') || '', /application\/rss\+xml/);
  const rssText = await rssRes.text();
  assert.match(rssText, /<rss version="2\.0"/);
  assert.match(rssText, /<item>/);

  const llmsRes = await app.fetch(new Request('https://mbnd.ir/llms.txt'), env);
  assert.equal(llmsRes.status, 200);
  const llmsText = await llmsRes.text();
  assert.match(llmsText, /My Portfolio/);
  assert.match(llmsText, /mbnd\.ir/);
  assert.match(llmsText, /## Published Articles/);

  // 4. vCard with static avatar fetched from ASSETS binding (no fs)
  const vcardRes = await app.fetch(new Request('https://mbnd.ir/api/save-contact?download=1'), env);
  assert.equal(vcardRes.status, 200);
  assert.match(vcardRes.headers.get('content-type') || '', /text\/vcard/);
  assert.match(vcardRes.headers.get('content-disposition') || '', /filename="my-portfolio\.vcf"/);
  const vcardText = await vcardRes.text();
  assert.match(vcardText, /BEGIN:VCARD/);
  assert.match(vcardText, /PHOTO;ENCODING=b;TYPE=JPEG:/);

  // 5. Contact form validation + creation
  const badContact = await app.fetch(
    new Request('https://mbnd.ir/api/public/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
      body: JSON.stringify({ name: 'A', contact: 'not-an-email', message: 'hi' }),
    }),
    env,
  );
  assert.equal(badContact.status, 400);

  const goodContact = await app.fetch(
    new Request('https://mbnd.ir/api/public/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
      body: JSON.stringify({
        name: 'علی رضایی',
        contact: 'ali@example.com',
        subject: 'تست کلودفلر',
        message: 'سلام! تست ارسال پیام روی Cloudflare Workers.',
      }),
    }),
    env,
  );
  assert.equal(goodContact.status, 201);

  // 6. SSR HTML + SEO JSON-LD & __INITIAL_SITE_DATA__ injection
  const homeRes = await app.fetch(new Request('https://mbnd.ir/'), env);
  assert.equal(homeRes.status, 200);
  const homeHtml = await homeRes.text();
  assert.match(homeHtml, /id="__INITIAL_SITE_DATA__"/);
  assert.match(homeHtml, /application\/ld\+json/);
  assert.match(homeHtml, /SearchAction/);
  assert.match(homeHtml, /My Portfolio/);
  assert.match(homeHtml, /hreflang="fa-IR"/);
  assert.match(homeHtml, /name="keywords"/);

  // www.mbnd.ir canonicalizes cleanly to https://mbnd.ir (both via APP_URL and via Host header)
  const wwwAppUrlEnv = createTestEnv({ APP_URL: 'https://www.mbnd.ir' });
  const wwwAppUrlRes = await app.fetch(new Request('https://www.mbnd.ir/'), wwwAppUrlEnv);
  assert.equal(wwwAppUrlRes.status, 200);
  assert.match(await wwwAppUrlRes.text(), /<link rel="canonical" href="https:\/\/mbnd\.ir\/" \/>/);

  const prevAppUrl = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const wwwHostEnv = createTestEnv({ APP_URL: '' });
    const wwwHostRes = await app.fetch(
      new Request('https://www.mbnd.ir/blog', { headers: { Host: 'www.mbnd.ir' } }),
      wwwHostEnv,
    );
    assert.equal(wwwHostRes.status, 200);
    assert.match(await wwwHostRes.text(), /<link rel="canonical" href="https:\/\/mbnd\.ir\/blog" \/>/);
  } finally {
    if (prevAppUrl !== undefined) {
      process.env.APP_URL = prevAppUrl;
    }
  }

  const adminHtmlRes = await app.fetch(new Request('https://mbnd.ir/secret-cf-panel'), env);
  assert.equal(adminHtmlRes.status, 200);
  assert.equal(adminHtmlRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await adminHtmlRes.text(), /window\.__ADMIN_PORTAL_ACTIVE__ = true/);

  const notFoundRes = await app.fetch(new Request('https://mbnd.ir/does-not-exist-xyz'), env);
  assert.equal(notFoundRes.status, 404);

  // 7. Admin session -> setup (enforces CSRF + sets Secure Partitioned cookie) -> bootstrap -> upload validation
  const sessRes = await app.fetch(new Request('https://mbnd.ir/api/admin/session'), env);
  assert.deepEqual(await sessRes.json(), { authenticated: false, needsSetup: true });

  const csrfFail = await app.fetch(
    new Request('https://mbnd.ir/api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ username: 'admin', password: 'StrongPassword123' }),
    }),
    env,
  );
  assert.equal(csrfFail.status, 403);

  const setupRes = await app.fetch(
    new Request('https://mbnd.ir/api/admin/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'mbnd.ir',
        Origin: 'https://mbnd.ir',
      },
      body: JSON.stringify({ username: 'admin', password: 'StrongPassword123' }),
    }),
    env,
  );
  assert.equal(setupRes.status, 201);
  const setCookieHeader = setupRes.headers.get('set-cookie') || '';
  assert.match(setCookieHeader, /HttpOnly/);
  assert.match(setCookieHeader, /Secure/);
  assert.match(setCookieHeader, /SameSite=None/);
  assert.match(setCookieHeader, /Partitioned/);
  const setupJson = (await setupRes.json()) as { ok: boolean; token: string };
  assert.equal(setupJson.ok, true);
  assert.ok(setupJson.token.length > 20);

  const bootstrapRes = await app.fetch(
    new Request('https://mbnd.ir/api/admin/bootstrap', {
      headers: { Authorization: `Bearer ${setupJson.token}` },
    }),
    env,
  );
  assert.equal(bootstrapRes.status, 200);
  const bootJson = (await bootstrapRes.json()) as { username: string; messages: unknown[] };
  assert.equal(bootJson.username, 'admin');
  assert.equal(bootJson.messages.length, 1);

  // Upload endpoint using Hono c.req.parseBody() rejects missing/invalid file cleanly with 400
  const emptyForm = new FormData();
  const uploadMissingRes = await app.fetch(
    new Request('https://mbnd.ir/api/admin/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${setupJson.token}` },
      body: emptyForm,
    }),
    env,
  );
  assert.equal(uploadMissingRes.status, 400);
});

test('normalizeAiPatch supports surgical patch_blocks, blockUpdates, removeBlockIndices, and targetLang', () => {
  const patch = normalizeAiPatch(
    {
      mode: 'patch_blocks',
      targetLang: 'en',
      title: 'Refined Title',
      blockUpdates: [
        { index: 1, block: { type: 'paragraph', text: 'Updated second paragraph.' } },
        { index: -1, block: { type: 'paragraph', text: 'invalid index' } },
      ],
      removeBlockIndices: [3, 3, -2],
    },
    'fa',
  );
  assert.ok(patch);
  assert.equal(patch.mode, 'patch_blocks');
  assert.equal(patch.targetLang, 'en');
  assert.equal(patch.title, 'Refined Title');
  assert.equal(patch.blockUpdates?.length, 1);
  assert.equal(patch.blockUpdates?.[0].index, 1);
  assert.equal(patch.blockUpdates?.[0].block.type, 'paragraph');
  assert.deepEqual(patch.removeBlockIndices, [3]);

  const fallbackMeta = normalizeAiPatch({ excerpt: 'Just a summary' }, 'fa');
  assert.ok(fallbackMeta);
  assert.equal(fallbackMeta.mode, 'meta_only');
  assert.equal(fallbackMeta.targetLang, 'fa');
  assert.equal(fallbackMeta.excerpt, 'Just a summary');
});

test('vCard settings batch update, Persian digit normalization, bilingual AI test, Backup Import/Export, and System Logs work end-to-end', async () => {
  setCustomLibsqlClient(createClient({ url: ':memory:' }), 'cf-v3-features');
  const env = createTestEnv();

  // Setup admin
  const setupRes = await app.fetch(
    new Request('https://example.com/api/admin/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'example.com',
        Origin: 'https://example.com',
      },
      body: JSON.stringify({ username: 'owner', password: 'StrongPassword2026' }),
    }),
    env,
  );
  assert.equal(setupRes.status, 201);
  const { token } = (await setupRes.json()) as { token: string };
  const authHeader = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. Save full settings payload with vCard phone (Persian digits) + extra labeled fields
  const bootRes = await app.fetch(
    new Request('https://example.com/api/admin/bootstrap', { headers: authHeader }),
    env,
  );
  const boot = (await bootRes.json()) as {
    settings: Record<string, string>;
    aiConfig: { model: string; hasCustomApiKey: boolean };
  };
  assert.equal(boot.aiConfig.model, '');
  assert.equal(boot.aiConfig.hasCustomApiKey, false);

  const saveRes = await app.fetch(
    new Request('https://example.com/api/admin/settings', {
      method: 'PUT',
      headers: authHeader,
      body: JSON.stringify({
        ...boot.settings,
        brandName: 'Acme Studio',
        vcardFullName: 'سارا احمدی',
        vcardPhone: '+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹',
        vcardExtraFieldsJson: JSON.stringify([
          { id: 'f1', type: 'tel', label: 'دفتر', value: '۰۲۱-۸۸۷۷۶۶۵۵' },
          { id: 'f2', type: 'email', label: 'Work', value: 'sara@acme.example' },
        ]),
      }),
    }),
    env,
  );
  assert.equal(saveRes.status, 200);

  const vcardRes = await app.fetch(
    new Request('https://example.com/api/save-contact?download=1'),
    env,
  );
  assert.equal(vcardRes.status, 200);
  assert.match(vcardRes.headers.get('content-disposition') || '', /filename="acme-studio\.vcf"/);
  const vcardBody = await vcardRes.text();
  assert.match(vcardBody, /FN;CHARSET=UTF-8:سارا احمدی/);
  assert.match(vcardBody, /TEL;TYPE=CELL,VOICE:\+98 912 345 6789/);
  assert.match(vcardBody, /item1\.TEL;TYPE=CELL,VOICE:021-88776655/);
  assert.match(vcardBody, /item1\.X-ABLabel;CHARSET=UTF-8:دفتر/);
  assert.match(vcardBody, /item2\.EMAIL;TYPE=INTERNET:sara@acme\.example/);

  // 2. Bilingual AI test connection returns concise public wording without personal text
  const aiTestFa = await app.fetch(
    new Request('https://example.com/api/admin/ai/test', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash', adminLang: 'fa' }),
    }),
    env,
  );
  assert.equal(aiTestFa.status, 400);
  assert.deepEqual(await aiTestFa.json(), { error: 'کلید API تنظیم نشده است.' });

  const aiTestEn = await app.fetch(
    new Request('https://example.com/api/admin/ai/test', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash', adminLang: 'en' }),
    }),
    env,
  );
  assert.equal(aiTestEn.status, 400);
  assert.deepEqual(await aiTestEn.json(), { error: 'API key is not configured.' });

  // 3. Export full backup -> mutate site -> Import backup and verify full restore
  const exportRes = await app.fetch(
    new Request('https://example.com/api/admin/backup/export', { headers: authHeader }),
    env,
  );
  assert.equal(exportRes.status, 200);
  assert.match(
    exportRes.headers.get('content-disposition') || '',
    /attachment; filename="site-backup-\d{4}-\d{2}-\d{2}\.json"/,
  );
  const exportedBackup = (await exportRes.json()) as {
    format: string;
    settings: Record<string, string>;
    posts: unknown[];
  };
  assert.equal(exportedBackup.format, BACKUP_FORMAT_ID);
  assert.equal(exportedBackup.settings.brandName, 'Acme Studio');
  assert.equal(exportedBackup.settings.vcardPhone, '+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹');

  // Mutate brandName before restoring
  await app.fetch(
    new Request('https://example.com/api/admin/settings', {
      method: 'PUT',
      headers: authHeader,
      body: JSON.stringify({ brandName: 'Temporary Changed Name' }),
    }),
    env,
  );

  // Restore via backup import
  const importRes = await app.fetch(
    new Request('https://example.com/api/admin/backup/import', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ mode: 'replace', backup: exportedBackup }),
    }),
    env,
  );
  assert.equal(importRes.status, 200);
  const importJson = (await importRes.json()) as { ok: boolean; restored: { settings: number } };
  assert.equal(importJson.ok, true);
  assert.ok(importJson.restored.settings > 10);

  const afterRestoreSite = (await (
    await app.fetch(new Request('https://example.com/api/public/site'), env)
  ).json()) as { settings: { brandName: string; vcardPhone: string } };
  assert.equal(afterRestoreSite.settings.brandName, 'Acme Studio');
  assert.equal(afterRestoreSite.settings.vcardPhone, '+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹');

  // Reject invalid backup format cleanly with 400
  const badImport = await app.fetch(
    new Request('https://example.com/api/admin/backup/import', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ mode: 'replace', backup: { format: 'wrong' } }),
    }),
    env,
  );
  assert.equal(badImport.status, 400);

  // 4. Client error reporting + Admin System Logs query & clear
  const clientErrRes = await app.fetch(
    new Request('https://example.com/api/public/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.99' },
      body: JSON.stringify({
        message: 'Render crash with Bearer secretToken1234567890',
        path: '/blog',
        stack: 'Error: crash at BlogPage',
      }),
    }),
    env,
  );
  assert.equal(clientErrRes.status, 201);

  const logsRes = await app.fetch(
    new Request('https://example.com/api/admin/logs?limit=50', { headers: authHeader }),
    env,
  );
  assert.equal(logsRes.status, 200);
  const logsJson = (await logsRes.json()) as {
    logs: Array<{ level: string; source: string; message: string }>;
    counts: { total: number; error: number; warn: number; info: number };
  };
  assert.ok(logsJson.counts.total >= 3);
  assert.ok(logsJson.counts.error >= 1);
  assert.ok(logsJson.counts.warn >= 1);
  const clientLog = logsJson.logs.find((l) => l.source === 'client');
  assert.ok(clientLog);
  assert.ok(!clientLog.message.includes('secretToken1234567890'));
  assert.match(clientLog.message, /Bearer \[REDACTED\]/);

  const clearRes = await app.fetch(
    new Request('https://example.com/api/admin/logs', { method: 'DELETE', headers: authHeader }),
    env,
  );
  assert.equal(clearRes.status, 200);
  const afterClear = (await (
    await app.fetch(new Request('https://example.com/api/admin/logs', { headers: authHeader }), env)
  ).json()) as { counts: { total: number } };
  assert.equal(afterClear.counts.total, 0);
});

test('pure helpers: sanitizeLogText redacts secrets and validateAndNormalizeBackupPayload blocks internal keys', () => {
  assert.equal(
    sanitizeLogText('Authorization: Bearer supersecret1234567890 key=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123'),
    'Authorization: Bearer [REDACTED] key=[REDACTED_KEY]',
  );
  assert.equal(inferLogSourceFromPath('/api/save-contact'), 'vcard');
  assert.equal(inferLogSourceFromPath('/api/admin/backup/export'), 'backup');
  assert.equal(inferLogSourceFromPath('/api/admin/ai/test'), 'ai');

  const normalized = validateAndNormalizeBackupPayload(
    {
      format: BACKUP_FORMAT_ID,
      version: 1,
      settings: {
        brandName: 'Clean Site',
        _session_secret: 'hacked',
        _ai_api_key_enc: 'hacked',
        unknownKey: 'ignored',
      },
      categories: [],
      posts: [],
      projects: [],
      messages: [],
      mediaAssets: [],
    },
    new Set(['brandName']),
  );
  assert.deepEqual(normalized.settings, { brandName: 'Clean Site' });

  assert.throws(
    () => validateAndNormalizeBackupPayload({ format: 'bad' }, new Set(['brandName'])),
    BackupValidationError,
  );
});
