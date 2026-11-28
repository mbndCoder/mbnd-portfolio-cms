import type { SystemLogLevel, SystemLogSource } from '../src/types/cms.ts';

const VALID_LEVELS = new Set<SystemLogLevel>(['info', 'warn', 'error']);
const VALID_SOURCES = new Set<SystemLogSource>([
  'server',
  'auth',
  'db',
  'settings',
  'vcard',
  'posts',
  'categories',
  'projects',
  'media',
  'ai',
  'backup',
  'contact',
  'client',
]);

/**
 * Redacts sensitive tokens, API keys, passwords, and cookies before persisting logs.
 */
export function sanitizeLogText(input: unknown, maxLen = 2000): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof Error
        ? `${input.name}: ${input.message}${input.stack ? `\n${input.stack}` : ''}`
        : input == null
          ? ''
          : (() => {
              try {
                return JSON.stringify(input);
              } catch {
                return String(input);
              }
            })();

  if (!raw) return '';

  const redacted = raw
    // Redact Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
    // Redact Google / Gemini API keys
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_KEY]')
    // Redact OpenAI / Anthropic / GitHub style keys
    .replace(/\b(?:sk|ghp|gho|glpat)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
    // Redact Cloudinary URLs with embedded secrets
    .replace(/cloudinary:\/\/[^@\s]+@/gi, 'cloudinary://[REDACTED]@')
    // Redact JSON/query secret fields
    .replace(
      /("(?:password|newPassword|currentPassword|apiKey|token|secret|authToken|cookie|authorization|passwordHash)"\s*:\s*)"[^"]*"/gi,
      '$1"[REDACTED]"',
    )
    .replace(
      /((?:password|api_key|apiKey|token|secret|auth_token)=)[^&\s;]+/gi,
      '$1[REDACTED]',
    );

  return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}…` : redacted;
}

export function normalizeLogLevel(value: unknown): SystemLogLevel {
  return typeof value === 'string' && VALID_LEVELS.has(value as SystemLogLevel)
    ? (value as SystemLogLevel)
    : 'info';
}

export function normalizeLogSource(value: unknown): SystemLogSource {
  return typeof value === 'string' && VALID_SOURCES.has(value as SystemLogSource)
    ? (value as SystemLogSource)
    : 'server';
}

export function inferLogSourceFromPath(pathname: string): SystemLogSource {
  if (pathname.startsWith('/api/admin/settings')) return 'settings';
  if (pathname.startsWith('/api/save-contact')) return 'vcard';
  if (pathname.startsWith('/api/admin/posts') || pathname.startsWith('/api/public/posts')) return 'posts';
  if (pathname.startsWith('/api/admin/categories')) return 'categories';
  if (pathname.startsWith('/api/admin/projects')) return 'projects';
  if (pathname.startsWith('/api/admin/upload') || pathname.startsWith('/api/admin/media')) return 'media';
  if (pathname.startsWith('/api/admin/ai')) return 'ai';
  if (pathname.startsWith('/api/admin/backup')) return 'backup';
  if (
    pathname.startsWith('/api/admin/login') ||
    pathname.startsWith('/api/admin/setup') ||
    pathname.startsWith('/api/admin/logout') ||
    pathname.startsWith('/api/admin/session') ||
    pathname.startsWith('/api/admin/security')
  ) {
    return 'auth';
  }
  if (pathname.startsWith('/api/public/contact')) return 'contact';
  if (pathname.startsWith('/api/public/client-error')) return 'client';
  if (pathname.startsWith('/api/health')) return 'db';
  return 'server';
}
