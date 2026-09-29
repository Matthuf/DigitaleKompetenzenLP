// Passwörter (scrypt), signierte Sitzungs-Cookies (HMAC) und persönliche Codes.
import { scrypt, randomBytes, timingSafeEqual, createHmac, randomInt, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Kein bekannter Ersatzschlüssel: Ohne SESSION_SECRET (mind. 32 Zeichen) startet der Server nicht.
// Nur der lokale Entwicklungsserver erlaubt ausdrücklich einen Entwicklungsschlüssel (ALLOW_DEV_SECRET=1).
function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.ALLOW_DEV_SECRET === '1' && !process.env.VERCEL) return 'dev-secret-nur-fuer-lokale-entwicklung-0123456789';
  throw new Error('SESSION_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen).');
}
export const checkSecrets = () => { secret(); };
// Separates Geheimnis für Codes: darf nach dem Start nie mehr geändert werden, sonst sind alle Codes ungültig.
// Ohne CODE_PEPPER wird SESSION_SECRET verwendet (so bleiben bestehende Codes gültig).
const codePepper = () => process.env.CODE_PEPPER || secret();

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return 'scrypt$' + salt.toString('base64') + '$' + key.toString('base64');
}
// Passwortlänge begrenzen, damit extreme Eingaben den Server nicht belasten
export const MAX_PASSWORD = 256;
export async function verifyPassword(pw, stored) {
  if (String(pw).length > MAX_PASSWORD) return false;
  const [alg, s, k] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scryptAsync(pw, Buffer.from(s, 'base64'), 64);
  const ref = Buffer.from(k, 'base64');
  return ref.length === key.length && timingSafeEqual(ref, key);
}

// Gleiche Rechenzeit auch bei unbekanntem Benutzernamen (kein Rückschluss auf existierende Konten)
let dummyHash = null;
export async function dummyVerify(pw) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-passwort-ohne-konto');
  await verifyPassword(pw, dummyHash);
  return false;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + mac;
}
function unsign(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== expect.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

export const COOKIE_STAFF = 'dk_staff';
export const COOKIE_PART = 'dk_teil';

export function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
export function setSession(res, name, payload, hours, persistent = false) {
  const token = sign({ ...payload, exp: Date.now() + hours * 3600e3 });
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  // Ohne «angemeldet bleiben»: Sitzungscookie, endet mit dem Schliessen des Browsers
  const maxAge = persistent ? `; Max-Age=${Math.round(hours * 3600)}` : '';
  appendCookie(res, `${name}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}${maxAge}`);
}
export function clearSession(res, name) {
  appendCookie(res, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function appendCookie(res, c) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}
export function getSession(req, name) {
  return unsign(parseCookies(req)[name]);
}

// Persönlicher Code: 12 Zeichen aus 32 gut unterscheidbaren Zeichen (ca. 60 Bit), Anzeige in 3er-Gruppen zu 4.
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function newCode() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHA[randomInt(ALPHA.length)];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}
export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}
export function hashCode(c) {
  return createHmac('sha256', codePepper()).update('code:' + normalizeCode(c)).digest('hex');
}
// Erhebungslinks: 22 Zeichen aus 31 (rund 109 Bit), praktisch nicht zu erraten
export function newToken(len = 22) {
  let s = '';
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < len; i++) s += a[randomInt(a.length)];
  return s;
}
export function newPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 14; i++) s += a[randomInt(a.length)];
  return s;
}

// Code verschlüsselt ablegen (AES-256-GCM), damit angemeldete Lehrpersonen ihn wieder anzeigen können.
const codeKey = () => createHash('sha256').update('code-enc:' + codePepper()).digest();
export function encryptCode(code) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', codeKey(), iv);
  const enc = Buffer.concat([c.update(String(code), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
export function decryptCode(stored) {
  try {
    const [iv, tag, enc] = String(stored).split('.').map((s) => Buffer.from(s, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', codeKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}
export function formatCode(c) {
  const n = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return n.length === 12 ? n.slice(0, 4) + '-' + n.slice(4, 8) + '-' + n.slice(8) : n;
}

// Einladungs- und Reset-Links: langer Zufallswert, in der Datenbank nur als Hash
export function newInviteToken() {
  return randomBytes(24).toString('base64url');
}
export function hashInviteToken(t) {
  return createHash('sha256').update('invite:' + String(t || '')).digest('hex');
}
