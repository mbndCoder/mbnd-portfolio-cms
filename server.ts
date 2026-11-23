import 'dotenv/config';
import { getRequestListener } from '@hono/node-server';
import { createClient as createLocalLibsqlClient } from '@libsql/client';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from './server/app.ts';
import { ensureDbInitialized, isPlaceholderEnv, setCustomLibsqlClient } from './server/db.ts';
import type { AssetsBinding, RuntimeEnv } from './server/env.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  const appPort = Number(process.env.APP_PORT || process.env.PORT);
  if (Number.isInteger(appPort) && appPort > 0) return appPort;
  return 3000;
}

const PORT = resolvePort();
const IS_PROD = process.env.NODE_ENV === 'production';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.vcf': 'text/vcard; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function createLocalAssetsBinding(isProd: boolean): AssetsBinding {
  const roots = isProd
    ? [path.resolve(__dirname, 'dist'), path.resolve(__dirname, 'public')]
    : [path.resolve(__dirname, 'public'), path.resolve(__dirname), path.resolve(__dirname, 'dist')];

  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      let pathname = '/';
      try {
        pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const rel = pathname.replace(/^\/+/, '');
      if (!rel || rel.includes('..')) {
        return new Response('Not Found', { status: 404 });
      }

      // Only allow root index.html from project root in dev; all other files must come from public/ or dist/
      for (const root of roots) {
        if (root === __dirname && rel !== 'index.html') continue;
        const candidate = path.resolve(root, rel);
        if (!candidate.startsWith(root + path.sep)) continue;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const isImmutable = rel.startsWith('assets/') || rel.startsWith('fonts/');
          const data = fs.readFileSync(candidate);
          return new Response(data, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': isImmutable
                ? 'public, max-age=31536000, immutable'
                : rel === 'index.html'
                  ? 'no-cache'
                  : 'public, max-age=604800',
            },
          });
        }
      }

      return new Response('Not Found', { status: 404 });
    },
  };
}

function buildNodeRuntimeEnv(
  assets: AssetsBinding,
  transformHtml?: (url: string, html: string) => Promise<string>,
  hmrDisabled = false,
): RuntimeEnv {
  return {
    ASSETS: assets,
    APP_URL: process.env.APP_URL,
    APP_PORT: process.env.APP_PORT,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_ROUTE: process.env.ADMIN_ROUTE,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
    LIBSQL_URL: process.env.LIBSQL_URL,
    LIBSQL_AUTH_TOKEN: process.env.LIBSQL_AUTH_TOKEN,
    CLOUDINARY_URL: process.env.CLOUDINARY_URL,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER,
    DB_PATH: process.env.DB_PATH,
    __TRANSFORM_HTML__: transformHtml,
    __HMR_DISABLED__: hmrDisabled,
  };
}

function initLocalDbFallbackIfNeeded(): void {
  const rawUrl = process.env.LIBSQL_URL?.trim();
  if (rawUrl && !isPlaceholderEnv(rawUrl)) {
    return;
  }
  const localDbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/site.db');
  fs.mkdirSync(path.dirname(localDbPath), { recursive: true });
  const localClient = createLocalLibsqlClient({ url: `file:${localDbPath}` });
  setCustomLibsqlClient(localClient, `file:${localDbPath}`);
}

const NO_WS_VITE_CLIENT_SHIM = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`.trim();

async function startLocalServer(): Promise<void> {
  initLocalDbFallbackIfNeeded();
  await ensureDbInitialized();

  const hmrDisabled =
    process.env.DISABLE_HMR === 'true' ||
    Boolean(process.env.APP_URL?.includes('.run.app')) ||
    Boolean(process.env.K_SERVICE);

  const assets = createLocalAssetsBinding(IS_PROD);

  let vite: Awaited<ReturnType<typeof import('vite')['createServer']>> | null = null;
  let httpServer: http.Server;

  const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const reqUrl = req.url || '/';

    if (!IS_PROD && hmrDisabled && reqUrl.split('?')[0] === '/@vite/client') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(NO_WS_VITE_CLIENT_SHIM);
      return;
    }

    const runHono = () => {
      const nodeEnv = buildNodeRuntimeEnv(
        assets,
        vite ? (url, html) => vite!.transformIndexHtml(url, html) : undefined,
        hmrDisabled,
      );
      const listener = getRequestListener((request) => app.fetch(request, nodeEnv));
      void listener(req, res);
    };

    if (!IS_PROD && vite) {
      vite.middlewares(req, res, runHono);
    } else {
      runHono();
    }
  };

  httpServer = http.createServer(requestHandler);

  if (!IS_PROD) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: hmrDisabled ? false : undefined,
      },
      appType: 'custom',
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Hono server listening on http://0.0.0.0:${PORT}`);
  });
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startLocalServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { app };
export default app;
