import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken,
  decryptSecret,
  encryptSecret,
  extractClientIp,
  hashPasswordScrypt,
  validateStrongPassword,
  verifyPasswordScrypt,
  verifySessionToken,
} from './auth.ts';

test('extractClientIp prefers Cloudflare header, then x-forwarded-for, then fallback', () => {
  assert.equal(
    extractClientIp(
      { 'cf-connecting-ip': '203.0.113.10', 'x-forwarded-for': '198.51.100.4, 10.0.0.1' },
      '127.0.0.1',
    ),
    '203.0.113.10',
  );
  assert.equal(
    extractClientIp({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }, '127.0.0.1'),
    '198.51.100.4',
  );
  assert.equal(extractClientIp({}, '127.0.0.1'), '127.0.0.1');
});

test('AI config leaves default model/key empty and rejects connection test with concise bilingual messages', async () => {
  const { createClient } = await import('@libsql/client');
  const { getAiConfigPublic, setCustomLibsqlClient } = await import('./db.ts');
  const { testAdminAiConnection } = await import('./ai.ts');
  setCustomLibsqlClient(createClient({ url: ':memory:' }), 'auth-test-mem');
  const pub = await getAiConfigPublic();
  assert.equal(pub.envGeminiAvailable, false);
  assert.equal(pub.envOpenAiAvailable, false);
  assert.equal(pub.model, '');
  assert.equal(pub.hasCustomApiKey, false);

  await assert.rejects(
    () =>
      testAdminAiConnection({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        apiKey: '',
        adminLang: 'fa',
      }),
    /^Error: کلید API تنظیم نشده است\.$/,
  );

  await assert.rejects(
    () =>
      testAdminAiConnection({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        apiKey: '',
        adminLang: 'en',
      }),
    /^Error: API key is not configured\.$/,
  );

  await assert.rejects(
    () =>
      testAdminAiConnection({
        provider: 'gemini',
        model: '',
        apiKey: 'AIzaFakeKey1234567890',
        adminLang: 'en',
      }),
    /^Error: AI model is not configured\.$/,
  );
});

test('hashPasswordScrypt and verifyPasswordScrypt validate matching password and reject mismatch', () => {
  const hash = hashPasswordScrypt('StrongPass!2026');
  assert.equal(verifyPasswordScrypt('StrongPass!2026', hash), true);
  assert.equal(verifyPasswordScrypt('wrong-password', hash), false);
});

test('createSessionToken and verifySessionToken preserve tokenVersion and reject tampered tokens', () => {
  const secret = 'test-session-secret-0123456789abcdef';
  const token = createSessionToken({ username: 'admin', role: 'admin', tokenVersion: 3 }, secret);
  const payload = verifySessionToken(token, secret);
  assert.ok(payload);
  assert.equal(payload.username, 'admin');
  assert.equal(payload.ver, 3);

  assert.equal(verifySessionToken(`${token}x`, secret), null);
  const expired = createSessionToken({ username: 'admin', role: 'admin' }, secret, -10);
  assert.equal(verifySessionToken(expired, secret), null);
});

test('encryptSecret and decryptSecret round-trip cleanly and reject tampering', () => {
  const master = 'master-secret-key-xyz';
  const cipher = encryptSecret('sk-test-123456789', master);
  assert.ok(cipher.startsWith('v1:'));
  assert.notEqual(cipher, 'sk-test-123456789');
  assert.equal(decryptSecret(cipher, master), 'sk-test-123456789');
  assert.equal(decryptSecret(cipher, 'wrong-master'), '');
  assert.equal(decryptSecret(`${cipher}tampered`, master), '');
});

test('validateStrongPassword enforces 8+ char length and alphanumeric mix', () => {
  assert.notEqual(validateStrongPassword('Pass123'), null);
  assert.notEqual(validateStrongPassword('onlyletterslong'), null);
  assert.notEqual(validateStrongPassword('123456789012'), null);
  assert.equal(validateStrongPassword('Pass1234'), null);
  assert.equal(validateStrongPassword('SecurePass2026'), null);
});

test('validateBaseUrl allows public HTTPS providers and blocks localhost/private IPs', async () => {
  const { validateBaseUrl } = await import('./ai.ts');
  assert.equal(validateBaseUrl('https://openrouter.ai/api/v1/'), 'https://openrouter.ai/api/v1');
  assert.equal(validateBaseUrl(''), '');
  assert.throws(() => validateBaseUrl('http://localhost:8080/v1'));
  assert.throws(() => validateBaseUrl('http://127.0.0.1:11434/v1'));
  assert.throws(() => validateBaseUrl('http://169.254.169.254/latest/meta-data'));
  assert.throws(() => validateBaseUrl('http://192.168.1.10/v1'));
  assert.throws(() => validateBaseUrl('http://10.0.0.5/v1'));
  assert.throws(() => validateBaseUrl('file:///etc/passwd'));
});

test('isPlaceholderEnv and parseVCardExtraFields handle placeholders and vCard extra fields cleanly', async () => {
  const { isPlaceholderEnv, parseVCardExtraFields } = await import('./db.ts');
  assert.equal(isPlaceholderEnv(''), true);
  assert.equal(isPlaceholderEnv('CHANGE_ME_STRONG_PASSWORD'), true);
  assert.equal(isPlaceholderEnv('MY_GEMINI_API_KEY'), true);
  assert.equal(isPlaceholderEnv('MY_APP_URL'), true);
  assert.equal(isPlaceholderEnv('https://mbnd.ir'), false);

  const parsed = parseVCardExtraFields(
    JSON.stringify([
      { id: '1', type: 'tel', label: 'دفتر', value: '+989120000000' },
      { id: '2', type: 'invalid', label: 'bad', value: 'x' },
      { id: '3', type: 'url', label: 'سایت', value: 'https://mbnd.ir' },
      { id: '4', type: 'note', label: 'شهر', value: '   ' },
    ]),
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].value, '+989120000000');
  assert.equal(parsed[1].value, 'https://mbnd.ir');
});
