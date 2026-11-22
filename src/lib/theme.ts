import type { SiteSettings, ThemeMode } from '../types/cms.ts';

export const DEFAULT_THEME_COLORS = {
  accentColor: '#FF502B',
  darkBgColor: '#0E0E0E',
  darkSurfaceColor: '#121212',
  darkInkColor: '#FBEFDD',
  lightBgColor: '#FAF7F2',
  lightSurfaceColor: '#FFFFFF',
  lightInkColor: '#181615',
} as const;

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function sanitizeHexColor(value: string | undefined, fallback: string): string {
  const cleaned = (value || '').trim();
  return HEX_RE.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function lightenHex(hex: string, amount = 0.14): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function shiftSurfaceHex(hex: string, isDark: boolean): string {
  const [r, g, b] = hexToRgb(hex);
  const delta = isDark ? 10 : -8;
  const clamp = (c: number) => Math.max(0, Math.min(255, c + delta));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function resolveEffectiveTheme(
  mode: ThemeMode | string | undefined,
  prefersLight: boolean,
): 'dark' | 'light' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return prefersLight ? 'light' : 'dark';
}

export function computeThemeVariables(
  settings: Partial<SiteSettings>,
  effectiveTheme: 'dark' | 'light',
): Record<string, string> {
  const isLight = effectiveTheme === 'light';
  const flame = sanitizeHexColor(settings.accentColor, DEFAULT_THEME_COLORS.accentColor);
  const flameLit = lightenHex(flame, 0.14);
  const [fr, fg, fb] = hexToRgb(flame);

  const groundDeep = isLight
    ? sanitizeHexColor(settings.lightBgColor, DEFAULT_THEME_COLORS.lightBgColor)
    : sanitizeHexColor(settings.darkBgColor, DEFAULT_THEME_COLORS.darkBgColor);
  const ground = isLight
    ? sanitizeHexColor(settings.lightSurfaceColor, DEFAULT_THEME_COLORS.lightSurfaceColor)
    : sanitizeHexColor(settings.darkSurfaceColor, DEFAULT_THEME_COLORS.darkSurfaceColor);
  const surface = shiftSurfaceHex(ground, !isLight);
  const ink = isLight
    ? sanitizeHexColor(settings.lightInkColor, DEFAULT_THEME_COLORS.lightInkColor)
    : sanitizeHexColor(settings.darkInkColor, DEFAULT_THEME_COLORS.darkInkColor);

  const [gr, gg, gb] = hexToRgb(ground);
  const [dr, dg, db] = hexToRgb(groundDeep);
  const [ir, ig, ib] = hexToRgb(ink);

  // Choose accessible text color on top of flame button
  const flameLuminance = (0.299 * fr + 0.587 * fg + 0.114 * fb) / 255;
  const flameInk = flameLuminance > 0.56 ? '#0E0E0E' : '#FFFDF9';

  return {
    '--ground-deep': groundDeep,
    '--ground-deep-85': `rgba(${dr}, ${dg}, ${db}, 0.86)`,
    '--ground': ground,
    '--ground-soft': `rgba(${gr}, ${gg}, ${gb}, ${isLight ? '0.88' : '0.78'})`,
    '--surface': surface,
    '--ink': ink,
    '--ink-soft': `rgba(${ir}, ${ig}, ${ib}, ${isLight ? '0.82' : '0.82'})`,
    '--ink-muted': `rgba(${ir}, ${ig}, ${ib}, ${isLight ? '0.68' : '0.66'})`,
    '--ink-faint': `rgba(${ir}, ${ig}, ${ib}, ${isLight ? '0.54' : '0.52'})`,
    '--flame': flame,
    '--flame-lit': flameLit,
    '--flame-ink': flameInk,
    '--flame-tint': `rgba(${fr}, ${fg}, ${fb}, ${isLight ? '0.11' : '0.14'})`,
    '--flame-border': `rgba(${fr}, ${fg}, ${fb}, ${isLight ? '0.32' : '0.36'})`,
    '--flame-shadow': `rgba(${fr}, ${fg}, ${fb}, ${isLight ? '0.22' : '0.3'})`,
    '--glass': isLight ? `rgba(${gr}, ${gg}, ${gb}, 0.88)` : `rgba(${gr}, ${gg}, ${gb}, 0.78)`,
    '--glass-hover': isLight ? `rgba(${gr}, ${gg}, ${gb}, 0.96)` : `rgba(${gr}, ${gg}, ${gb}, 0.9)`,
    '--hair': isLight ? `rgba(${ir}, ${ig}, ${ib}, 0.12)` : `rgba(${ir}, ${ig}, ${ib}, 0.12)`,
    '--hair-strong': isLight ? `rgba(${ir}, ${ig}, ${ib}, 0.18)` : `rgba(${ir}, ${ig}, ${ib}, 0.18)`,
    '--hair-flame': `rgba(${fr}, ${fg}, ${fb}, 0.38)`,
    '--card-shadow': isLight
      ? '0 10px 30px rgba(24, 22, 21, 0.06)'
      : '0 14px 36px rgba(0, 0, 0, 0.45)',
    '--card-shadow-hover': isLight
      ? '0 16px 38px rgba(24, 22, 21, 0.1)'
      : '0 20px 44px rgba(0, 0, 0, 0.55)',
    '--status-error-ink': isLight ? '#B91C1C' : '#FCA5A5',
    '--status-success-ink': isLight ? '#047857' : '#6EE7B7',
  };
}

export function applyThemeToDocument(
  settings: Partial<SiteSettings>,
  effectiveTheme: 'dark' | 'light',
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', effectiveTheme);
  root.style.colorScheme = effectiveTheme;
  const vars = computeThemeVariables(settings, effectiveTheme);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', vars['--ground-deep']);
  }
}
