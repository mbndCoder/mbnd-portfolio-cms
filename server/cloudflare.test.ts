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
  assert.equal(siteJson.settings.brandName, 'Mohammad Bagher');
  assert.ok(siteJson.posts.length >= 1);

  // 3. SEO & AI endpoints
  const robotsRes = await app.fetch(new Request('https://mbnd.ir/robots.txt'), env);
  assert.equal(robotsRes.status, 200);
  assert.match(await robotsRes.text(), /Sitemap: https:\/\/mbnd\.ir\/sitemap\.xml/);

  const sitemapRes = await app.fetch(new Request('https://mbnd.ir/sitemap.xml'), env);
  assert.equal(sitemapRes.status, 200);
  assert.match(sitemapRes.headers.get('content-type') || '', /application\/xml/);
  assert.match(await sitemapRes.text(), /<urlset/);

  const llmsRes = await app.fetch(new Request('https://mbnd.ir/llms.txt'), env);
  assert.equal(llmsRes.status, 200);
  assert.match(await llmsRes.text(), /Mohammad Bagher/);

  // 4. vCard with static avatar fetched from ASSETS binding (no fs)
  const vcardRes = await app.fetch(new Request('https://mbnd.ir/api/save-contact?download=1'), env);
  assert.equal(vcardRes.status, 200);
  assert.match(vcardRes.headers.get('content-type') || '', /text\/vcard/);
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
