export interface AssetsBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface RuntimeEnv {
  ASSETS?: AssetsBinding;
  APP_URL?: string;
  APP_PORT?: string;
  PORT?: string;
  NODE_ENV?: string;
  ADMIN_ROUTE?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  LIBSQL_URL?: string;
  LIBSQL_AUTH_TOKEN?: string;
  CLOUDINARY_URL?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_FOLDER?: string;
  DB_PATH?: string;
  /** Internal local-dev hook for Vite transformIndexHtml (unused on Cloudflare Workers) */
  __TRANSFORM_HTML__?: (url: string, html: string) => Promise<string>;
  /** Internal local-dev flag when HMR is disabled */
  __HMR_DISABLED__?: boolean;
}

type StringEnvKey = Exclude<
  keyof RuntimeEnv,
  'ASSETS' | '__TRANSFORM_HTML__' | '__HMR_DISABLED__'
>;

let activeRuntimeEnv: RuntimeEnv | undefined;

export function setActiveRuntimeEnv(env?: RuntimeEnv): void {
  if (env) {
    activeRuntimeEnv = env;
  }
}

export function getActiveRuntimeEnv(): RuntimeEnv | undefined {
  return activeRuntimeEnv;
}

export function getEnvVar(key: StringEnvKey, env?: RuntimeEnv): string {
  const fromArg = env?.[key];
  if (typeof fromArg === 'string' && fromArg.length > 0) {
    return fromArg;
  }
  const fromActive = activeRuntimeEnv?.[key];
  if (typeof fromActive === 'string' && fromActive.length > 0) {
    return fromActive;
  }
  if (typeof process !== 'undefined' && process.env) {
    const fromProcess = process.env[key];
    if (typeof fromProcess === 'string' && fromProcess.length > 0) {
      return fromProcess;
    }
  }
  return '';
}
