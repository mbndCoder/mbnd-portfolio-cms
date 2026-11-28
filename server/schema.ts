import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  nameEn: text('name_en').notNull().default(''),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  descriptionEn: text('description_en').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  titleEn: text('title_en').notNull().default(''),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt').notNull(),
  excerptEn: text('excerpt_en').notNull().default(''),
  category: text('category').notNull(),
  coverImage: text('cover_image').notNull(),
  blocks: text('blocks').notNull(),
  blocksEn: text('blocks_en').notNull().default('[]'),
  published: integer('published').notNull().default(1),
  readingMinutes: integer('reading_minutes').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectsTable = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  titleEn: text('title_en').notNull().default(''),
  role: text('role').notNull(),
  roleEn: text('role_en').notNull().default(''),
  period: text('period').notNull(),
  periodEn: text('period_en').notNull().default(''),
  summary: text('summary').notNull(),
  summaryEn: text('summary_en').notNull().default(''),
  stack: text('stack').notNull(),
  url: text('url').notNull(),
  featured: integer('featured').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  read: integer('read').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  tokenVersion: integer('token_version').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const mediaAssets = sqliteTable('media_assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicId: text('public_id').notNull().unique(),
  filename: text('filename').notNull(),
  url: text('url').notNull(),
  kind: text('kind').notNull().default('image'),
  resourceType: text('resource_type').notNull().default('image'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const systemLogs = sqliteTable('system_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level').notNull().default('info'),
  source: text('source').notNull().default('server'),
  method: text('method').notNull().default(''),
  path: text('path').notNull().default(''),
  status: integer('status').notNull().default(0),
  message: text('message').notNull(),
  details: text('details').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

