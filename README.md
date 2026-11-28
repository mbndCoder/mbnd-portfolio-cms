<div align="center">

<img src="./public/logo.webp" alt="Personal Portfolio & CMS Logo" width="84" />

# Bilingual Portfolio, Blog & Custom CMS (Cloudflare Workers Native)

**وب‌سایت شخصی، پورتفولیو و سیستم مدیریت محتوای اختصاصی دوزبانه (فارسی/انگلیسی) — بهینه‌شده برای Cloudflare Workers + Turso + Cloudinary**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](#tech-stack)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](#tech-stack)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](#tech-stack)
[![Hono](https://img.shields.io/badge/Hono-Cloudflare_Workers-E36002?style=flat-square&logo=cloudflareworkers&logoColor=white)](#tech-stack)
[![Turso libSQL](https://img.shields.io/badge/Turso-libSQL_Edge-4FF8D2?style=flat-square&logo=turso&logoColor=black)](#tech-stack)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-D22128?style=flat-square)](./LICENSE)

[معرفی فارسی](#-معرفی-پروژه-فارسی) · [English Overview](#-overview-english) · [اجرای محلی](#-local-setup--اجرای-محلی) · [استقرار روی Cloudflare](#-cloudflare-workers-deployment) · [تنظیمات محیطی](#️-environment-variables-envexample) · [مجوز](#-license)

</div>

---

## 📸 Screenshots / تصاویر محیط سایت

| صفحه اصلی | صفحه نوشته و اشتراک‌گذاری |
| :---: | :---: |
| ![Home Page](./docs/screenshots/home-dark.png) | ![Blog Post & Share Bar](./docs/screenshots/blog-post.png) |

| صفحه درباره من و فرم ارتباط |
| :---: |
| ![About & Contact Page](./docs/screenshots/about-contact.png) |

---

## 🇮🇷 معرفی پروژه (فارسی)

یک اپلیکیشن فول‌استک، سریع و متن‌باز برای ساخت **پورتفولیو، وبلاگ و وب‌سایت شخصی دوزبانه (فارسی و انگلیسی)** که به‌صورت ۱۰۰٪ بومی برای اجرا روی **Cloudflare Workers** (بدون نیاز به سرور اختصاصی یا کارت اعتباری) و همچنین اجرای محلی روی Node.js طراحی شده است.

### ویژگی‌های کلیدی
- **اجرای بومی روی Cloudflare Workers (بدون وابستگی به `fs`):** بک‌اند سبک با **Hono**، دیتابیس ابری **Turso (`@libsql/client/web`)** با تراکنش‌های یکپارچه (`client.batch`) برای ماندن بسیار پایین‌تر از محدودیت subrequest کلودفلر، و آپلود مستقیم فایل‌ها به **Cloudinary REST API** با Web Crypto.
- **پنل مدیریت اختصاصی (Custom CMS):** مدیریت زنده لوگو، فاوآیکون، ویدیو و پوستر صفحه اصلی، تب‌های منو (Drag & Drop)، رنگ‌بندی تم تیره/روشن، لینک شبکه‌های اجتماعی، و کارت مخاطب استاندارد **vCard 3.0** با امکان افزودن/ویرایش/حذف شماره‌ها و فیلدهای دلخواه.
- **ویرایشگر بلوکی وبلاگ + دستیار شناور AI:** ۱۲ نوع بلوک محتوایی (متن، تیتر، کد، تصویر، ویدیو، صوت، نقل‌قول، کارت، دکمه، امبد و...)، فرمت‌بندی سریع متن (بولد، کج، هایلایت، لینک)، دستیار چت هوش مصنوعی شناور و ترجمه هوشمند دوزبانه. *(به‌صورت پیش‌فرض هیچ مدل یا کلید API ست نشده است؛ مدیر سایت مدل و کلید دلخواه خود را با رمزنگاری AES-256-GCM ذخیره می‌کند.)*
- **سیستم بک‌آپ کامل (Import / Export):** خروجی یکپارچه از تمام تنظیمات، نوشته‌ها، دسته‌بندی‌ها، پروژه‌ها، پیام‌ها و لیست فایل‌های رسانه در یک فایل `.json` (بدون ذخیره رمزها و کلیدهای محرمانه) و بازیابی کامل یا ادغام در هر زمان.
- **بخش لاگ‌ها و گزارش خطاهای سایت:** ثبت خودکار خطاهای سرور، خطاهای API، خطاهای مرورگر (`ErrorBoundary`) و عملیات مهم پنل مدیریت همراه با فیلتر سطح/بخش، جستجو، سانسور خودکار اطلاعات حساس و خروجی JSON.
- **سئو عمیق و آمادگی برای موتورهای جستجو و AI:** تزریق سمت سرور متا تگ‌ها و OpenGraph، ساختار پویا `Schema.org JSON-LD`، `hreflang`، `/sitemap.xml`، `/rss.xml`، `/robots.txt`، `/llms.txt` و `/llms-full.txt`.
- **امنیت آماده انتشار عمومی:** بدون هیچ رمز یا مسیر پیش‌فرض در کد؛ فعال‌سازی پنل مدیریت فقط با `ADMIN_ROUTE`، فرم ساخت حساب مدیر یک‌بارمصرف، هش رمز `scrypt`، کوکی `HttpOnly` و حفاظت CSRF.

---

## 🌍 Overview (English)

An open-source, production-ready **bilingual (FA/EN) portfolio, block-based blog, and custom CMS** engineered natively for **Cloudflare Workers** (with zero Node `fs` dependencies) while also running seamlessly on Node.js locally.

### Highlights
- **100% Cloudflare Workers Native:** Powered by **Hono**, **Turso (`@libsql/client/web`)** + **Drizzle ORM** with single-transaction `client.batch()` writes, and direct **Cloudinary REST API** uploads signed via Web Crypto (`crypto.subtle`).
- **Full Visual CMS & vCard 3.0 Builder:** Live editing for branding, hero video/posters, Dark/Light/Auto palettes, drag-and-drop navigation, social channels, and downloadable `vCard 3.0` contact cards (primary phone, custom labeled fields, embedded JPEG avatar).
- **12-Block Rich Editor & Floating AI Assistant:** Structured content blocks with clean inline formatting, reading-time estimation, and an opt-in floating AI chat/translation assistant. *(No default model or API key is pre-configured; admins supply their own Gemini or OpenAI-compatible provider, encrypted at rest with AES-256-GCM.)*
- **Full Backup Import / Export:** One-click JSON export and validated Replace/Merge restore covering settings, posts, categories, projects, messages, and media records (strictly excluding passwords, session secrets, and encrypted API keys).
- **Site-Wide System & Error Logs:** Built-in Admin Logs viewer capturing 5xx errors, 4xx warnings, admin mutations, and browser `ErrorBoundary` crashes with automatic secret redaction, filtering, and JSON export.
- **SEO & AI Search Discoverability:** Server-rendered dynamic meta tags, `JSON-LD` (`WebSite`, `Person`, `BlogPosting`, `BreadcrumbList`), canonical apex URL normalization, `/sitemap.xml`, `/rss.xml`, `/robots.txt`, `/llms.txt`, and `/llms-full.txt`.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7 |
| **Backend / Edge** | Hono (Cloudflare Workers native + local Node.js adapter via `@hono/node-server`) |
| **Database** | Turso / libSQL (`@libsql/client/web` + Drizzle ORM); automatic local SQLite fallback in dev |
| **Media Storage** | Cloudinary REST API (signed via Web Crypto SHA-1 — no `multer` or `fs`) |
| **Optional AI** | Google Gemini (`@google/genai`) or any OpenAI-compatible endpoint (opt-in) |

---

## 🚀 Local Setup / اجرای محلی

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd <your-repo-folder>

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and set at least ADMIN_ROUTE (e.g. my-secret-admin)

# 4. Run development server (http://localhost:3000)
npm run dev

# 5. Typecheck, test, and build for production
npm run lint
npm test
npm run build
```

After setting `ADMIN_ROUTE` in `.env`, visit `/<ADMIN_ROUTE>` once to create your administrator account. Once created, the initial setup screen locks permanently.

---

## ☁️ Cloudflare Workers Deployment

This repository includes a production-ready [`wrangler.toml`](./wrangler.toml) with `keep_vars = true` so environment variables and secrets set in the Cloudflare Dashboard are **never overwritten or wiped** when you redeploy.

### Step-by-Step Deployment
1. **Create a free Turso database** at [turso.tech](https://turso.tech) and copy its `LIBSQL_URL` (`libsql://...`) and `LIBSQL_AUTH_TOKEN`.
2. *(Optional for uploads)* Create a free [Cloudinary](https://cloudinary.com) account and copy `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
3. **Connect the Git repository** in **Cloudflare Dashboard → Workers & Pages → Create Worker** (or deploy via `npx wrangler deploy`):
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
4. **Set Variables & Secrets in Cloudflare Dashboard** (Settings → Variables and Secrets):
   - Plain text: `NODE_ENV=production`, `APP_URL=https://yourdomain.com`, `CLOUDINARY_FOLDER=site-uploads`
   - Encrypted Secrets: `ADMIN_ROUTE`, `SESSION_SECRET`, `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
5. Open `https://yourdomain.com/<ADMIN_ROUTE>` to create your admin account and customize your site!

> **Note:** Because `wrangler.toml` enables `keep_vars = true` and does not hardcode `[vars]` overrides, future Git pushes and redeploys preserve all Cloudflare Dashboard variables safely.

---

## ⚙️ Environment Variables (`.env.example`)

All sensitive configuration stays exclusively in `.env` (local) or Cloudflare Dashboard Secrets (production). Never commit `.env` to Git.

| Variable | Required? | Description |
| :--- | :---: | :--- |
| `NODE_ENV` | Recommended | Runtime environment (`development` locally, `production` on Cloudflare/Docker) |
| `APP_URL` | Production | Canonical site URL (e.g. `https://yourdomain.com`) used for SEO, Sitemap, RSS & vCard |
| `APP_PORT` | Local only | Local dev/Node server port (default: `3000`) |
| `ADMIN_ROUTE` | **Yes** | Secret admin URL slug without leading slash (panel stays disabled if empty) |
| `SESSION_SECRET` | Recommended | 32+ char random secret for signing `HttpOnly` session cookies & encrypting saved AI keys |
| `ADMIN_USERNAME` | Optional | Optional initial admin username (leave empty to use the one-time setup form) |
| `ADMIN_PASSWORD` | Optional | Optional initial admin password (min 8 chars, letters + numbers) |
| `LIBSQL_URL` | **Cloudflare** | Turso libSQL URL (`libsql://...`). Leave empty locally to use `./data/site.db` |
| `LIBSQL_AUTH_TOKEN` | **Cloudflare** | Turso authentication token paired with `LIBSQL_URL` |
| `CLOUDINARY_CLOUD_NAME` | For uploads | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | For uploads | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | For uploads | Cloudinary API secret |
| `CLOUDINARY_FOLDER` | Optional | Target folder in Cloudinary (default: `uploads`) |

---

## 🧪 Running Tests

```bash
# Unit & end-to-end Cloudflare Worker tests
npx tsx --test src/lib/cms.test.ts src/lib/inlineFormat.test.ts server/auth.test.ts server/cloudflare.test.ts
```

---

## 📄 License

Licensed under the **Apache License, Version 2.0** — see [`LICENSE`](./LICENSE) for details.