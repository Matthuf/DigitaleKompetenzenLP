// Datenbankzugriff: Postgres (Produktion, DATABASE_URL) oder PGlite im Speicher (lokale Entwicklung).
import { randomUUID } from 'node:crypto';

let impl = null;

async function init() {
  if (impl) return impl;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const pg = (await import('pg')).default;
    // Zertifikat der Datenbank wird geprüft (kein rejectUnauthorized: false)
    const pool = new pg.Pool({ connectionString: url, max: 3, ssl: url.includes('localhost') ? false : { rejectUnauthorized: true } });
    impl = { query: async (text, params = []) => (await pool.query(text, params)).rows };
  } else {
    // Ohne Datenbank nur lokal weiterarbeiten, nie still in einem öffentlichen Deployment
    if (process.env.ALLOW_PGLITE !== '1' || process.env.VERCEL) throw new Error('DATABASE_URL fehlt.');
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
  // Persönlicher Code verschlüsselt, damit er angemeldet wieder angezeigt werden kann
  `alter table participants add column if not exists code_enc text`,
  // Erwartete Anzahl Lehrpersonen für die Rücklaufquote (freiwillig)
  `alter table campaigns add column if not exists expected integer`,

  /* Schulträger (Gemeinde = Primarstufe, Bezirk = Sekundarstufe) mit Schulen bzw. Schulhäusern */
  `create table if not exists traeger (
     id text primary key,
     name text not null,
     kind text not null default 'primar' check (kind in ('primar','sek')),
     created_at timestamptz not null default now())`,
  `alter table schools add column if not exists traeger_id text references traeger(id) on delete cascade`,
  // Rollen: admin (AVS), traeger (Rektorat/Hauptschulleitung), leitung (Schulleitung eines Schulhauses)
  `do $$ begin
     alter table users drop constraint if exists users_role_check;
     alter table users add constraint users_role_check check (role in ('admin','traeger','leitung'));
   exception when duplicate_object then null; end $$`,
  `alter table users add column if not exists traeger_id text references traeger(id) on delete cascade`,
  /* Runden: vom AVS vorgegeben (z. B. erste kantonale Runde) */
  `create table if not exists rounds (
     id text primary key,
     title text not null,
     active boolean not null default true,
     created_at timestamptz not null default now())`,
  /* Erhebung gehört dem Träger; jede beteiligte Schule hat einen eigenen Link */
  `alter table campaigns alter column school_id drop not null`,
  `alter table campaigns add column if not exists traeger_id text references traeger(id) on delete cascade`,
  `alter table campaigns add column if not exists owner_school_id text references schools(id) on delete cascade`,
  `alter table campaigns add column if not exists round_id text references rounds(id) on delete set null`,
  /* Freiwilliges Zieldatum («bitte bis … ausfüllen»), schliesst die Erhebung nicht automatisch */
  `alter table campaigns add column if not exists due_date date`,
  `create table if not exists campaign_links (
     id text primary key,
     campaign_id text not null references campaigns(id) on delete cascade,
     school_id text not null references schools(id) on delete cascade,
     token text not null unique,
     expected integer,
     created_at timestamptz not null default now(),
     unique (campaign_id, school_id))`,
  `alter table responses add column if not exists school_id text references schools(id) on delete cascade`,
  `alter table responses add column if not exists link_id text references campaign_links(id) on delete set null`,
  `alter table participants add column if not exists traeger_id text references traeger(id) on delete cascade`,
  `create index if not exists responses_school_idx on responses(school_id, status)`,
  /* Einladungen und Links zum Zurücksetzen des Passworts (einmalig gültig, mit Ablaufdatum).
   * Gespeichert wird nur der Hash des Tokens. */
  `alter table users add column if not exists email text`,
  /* Sitzungen widerrufbar: Version im Cookie muss zur Datenbank passen */
  `alter table users add column if not exists session_version integer not null default 0`,
  /* Missbrauchsschutz: Zähler pro Schlüssel und Zeitfenster */
  `create table if not exists rate_limits (
     key text primary key,
     window_start timestamptz not null default now(),
     count integer not null default 0)`,
  /* Protokoll administrativer Aktionen (ohne Passwörter, Codes, Tokens oder Antworten) */
  `create table if not exists audit_log (
     id bigserial primary key,
     at timestamptz not null default now(),
     actor_id text,
     actor_role text,
     action text not null,
     target text,
     detail jsonb)`,
  `create index if not exists audit_log_at_idx on audit_log(at desc)`,
  /* Zyklen pro Schulhaus (leer = Standard nach Stufe des Trägers). Träger mit Primar- und Sekundarstufe: kind 'gesamt'. */
  `alter table schools add column if not exists zyklen jsonb`,
  `do $$ begin
     alter table traeger drop constraint if exists traeger_kind_check;
     alter table traeger add constraint traeger_kind_check check (kind in ('primar','sek','gesamt'));
   exception when duplicate_object then null; end $$`,
  `create table if not exists invitations (
     id text primary key,
     token_hash text not null unique,
     kind text not null check (kind in ('invite','reset')),
     role text check (role in ('traeger','leitung')),
     traeger_id text references traeger(id) on delete cascade,
     school_id text references schools(id) on delete cascade,
     user_id text references users(id) on delete cascade,
     name text,
     email text,
     created_by text,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null,
     used_at timestamptz)`,
];

/* Übernahme bestehender Daten ins Trägermodell (mehrfach ausführbar) */
const DATA_MIGRATIONS = [
  // Jede bisherige Schule ohne Träger erhält einen eigenen Träger (Primarstufe) mit gleichem Namen
  `insert into traeger (id, name, kind) select 'tr-' || s.id, s.name, 'primar' from schools s where s.traeger_id is null on conflict (id) do nothing`,
  `update schools set traeger_id = 'tr-' || id where traeger_id is null`,
  `update campaigns c set traeger_id = s.traeger_id, owner_school_id = c.school_id from schools s where s.id = c.school_id and c.traeger_id is null`,
  // Bisheriger Erhebungslink bleibt gültig: er wird zum Link der Schule
  `insert into campaign_links (id, campaign_id, school_id, token, expected)
     select 'ln-' || c.id, c.id, c.school_id, c.token, c.expected from campaigns c
      where c.school_id is not null and not exists (select 1 from campaign_links l where l.campaign_id = c.id)`,
  `update responses r set school_id = l.school_id, link_id = l.id from campaign_links l where l.campaign_id = r.campaign_id and r.school_id is null`,
  `update participants p set traeger_id = s.traeger_id from schools s where s.id = p.school_id and p.traeger_id is null`,
  // Schulstufen werden zu Zyklen
  `update responses set context = (context - 'stufe') || jsonb_build_object('zyklus', case context->>'stufe'
       when 'Kindergarten' then 'Zyklus 1' when 'Primarstufe 1.–2. Klasse' then 'Zyklus 1'
       when 'Primarstufe 3.–6. Klasse' then 'Zyklus 2' when 'Sekundarstufe I' then 'Zyklus 3'
       else 'Zyklusübergreifend' end)
     where context ? 'stufe' and coalesce(context->>'stufe', '') <> ''`,
  `update responses set context = context - 'stufe' where context ? 'stufe'`,
];

async function migrate(db) {
  for (const stmt of SCHEMA) await db.query(stmt);
  for (const stmt of DATA_MIGRATIONS) await db.query(stmt);
  // Erstes Admin-Konto aus Umgebungsvariablen anlegen, falls noch keines existiert
  const admins = await db.query(`select 1 from users where role = 'admin' limit 1`);
  if (!admins.length && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const { hashPassword } = await import('./auth.js');
    await db.query(
      `insert into users (id, role, username, display_name, password_hash, must_change_password) values ($1,'admin',$2,$3,$4,true)`,
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
