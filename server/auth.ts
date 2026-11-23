import crypto from 'node:crypto';

export interface SessionPayload {
  username: string;
  role: string;
  ver: number;
  exp: number;
}

const SCRYPT_KEY_LEN = 64;

export function hashPasswordScrypt(password: string, existingSalt?: string): string {
  const salt = existingSalt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `${salt}:${derived.toString('hex')}`;
}

export function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;

  try {
    const expected = Buffer.from(hexHash, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function validateStrongPassword(password: string): string | null {
  if (password.length < 8) {
    return 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.';
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return 'رمز عبور باید ترکیبی از حروف انگلیسی و عدد باشد.';
  }
  return null;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function createSessionToken(
  user: { username: string; role: string; tokenVersion?: number },
  secret: string,
  ttlSeconds = 60 * 60 * 24, // 24 hours
): string {
  const payload: SessionPayload = {
    username: user.username,
    role: user.role,
    ver: typeof user.tokenVersion === 'number' ? user.tokenVersion : 1,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (
      typeof parsed.username !== 'string' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      ...parsed,
      ver: typeof parsed.ver === 'number' ? parsed.ver : 1,
    };
  } catch {
    return null;
  }
}

function deriveAesKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(`mbnd-aes256:${secret}`).digest();
}

export function encryptSecret(plaintext: string, masterSecret: string): string {
  if (!plaintext) return '';
  const key = deriveAesKey(masterSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(ciphertext: string, masterSecret: string): string {
  if (!ciphertext || !ciphertext.startsWith('v1:')) return '';
  const parts = ciphertext.split(':');
  if (parts.length !== 4) return '';
  try {
    const key = deriveAesKey(masterSecret);
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const encrypted = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function extractClientIp(
  headers: Headers | Record<string, string | string[] | undefined>,
  fallbackIp = 'unknown',
): string {
  const readHeader = (name: string): string => {
    if (headers instanceof Headers) {
      return headers.get(name)?.trim() || '';
    }
    const val = headers[name];
    if (typeof val === 'string') return val.trim();
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0].trim();
    return '';
  };

  const cfIp = readHeader('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  const rawForwarded = readHeader('x-forwarded-for');
  if (rawForwarded) {
    const first = rawForwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return fallbackIp || 'unknown';
}
