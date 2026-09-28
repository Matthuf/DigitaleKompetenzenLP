// Datenbankzugriff: Postgres (Produktion, DATABASE_URL) oder PGlite im Speicher (lokale Entwicklung).
import { randomUUID } from 'node:crypto';

let impl = null;

async function init() {
  if (impl) return impl;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: url, max: 3, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
    impl = { query: async (text, params = []) => (await pool.query(text, params)).rows };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite(process.env.PGLITE_DIR || undefined);
    impl = { query: async (text, params = []) => (await db.query(text, params)).rows };
    console.warn('[db] Keine DATABASE_URL gesetzt: lokale PGlite-Datenbank wird verwendet.');
  }
  await migrate(impl);
  return impl;
}

const SCHEMA = [
  `create table if not exists schools (
     id text primary key,
     name text not null,
     created_at timestamptz not null default now())`,
  `create table if not exists users (
     id text primary key,
     school_id text references schools(id) on delete cascade,
     role text not null check (role in ('admin','leitung')),
     username text not null unique,
     display_name text,
     password_hash text not null,
     must_change_password boolean not null default true,
     created_at timestamptz not null default now(),
     last_login timestamptz)`,
  `create table if not exists campaigns (
     id text primary key,
     school_id text not null references schools(id) on delete cascade,
     title text not null,
     token text not null unique,
     status text not null default 'open' check (status in ('open','closed')),
     created_at timestamptz not null default now(),
     closed_at timestamptz)`,
  `create table if not exists participants (
     id text primary key,
     school_id text not null references schools(id) on delete cascade,
     code_hash text not null unique,
     created_at timestamptz not null default now())`,
  `create table if not exists responses (
     id text primary key,
     participant_id text not null references participants(id) on delete cascade,
     campaign_id text not null references campaigns(id) on delete cascade,
     instrument_version text not null,
     context jsonb not null default '{}'::jsonb,
     answers jsonb not null default '{}'::jsonb,
     status text not null default 'draft' check (status in ('draft','submitted')),
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     submitted_at timestamptz,
     unique (participant_id, campaign_id))`,
  `create index if not exists responses_campaign_idx on responses(campaign_id, status)`,
  // Schulblock: eigene Fragen der Schulleitung pro Erhebung
  `alter table campaigns add column if not exists custom_block jsonb`,
  `alter table responses add column if not exists custom_answers jsonb not null default '{}'::jsonb`,
];

async function migrate(db) {
  for (const stmt of SCHEMA) await db.query(stmt);
  // Erstes Admin-Konto aus Umgebungsvariablen anlegen, falls noch keines existiert
  const admins = await db.query(`select 1 from users where role = 'admin' limit 1`);
  if (!admins.length && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const { hashPassword } = await import('./auth.js');
    await db.query(
      `insert into users (id, role, username, display_name, password_hash, must_change_password) values ($1,'admin',$2,$3,$4,false)`,
      [randomUUID(), process.env.ADMIN_USERNAME.toLowerCase(), 'AVS Administration', await hashPassword(process.env.ADMIN_PASSWORD)]
    );
    console.log('[db] Admin-Konto angelegt:', process.env.ADMIN_USERNAME);
  }
}

export async function q(text, params) {
  const db = await init();
  return db.query(text, params);
}
export async function one(text, params) {
  return (await q(text, params))[0] || null;
}
export const newId = () => randomUUID();
