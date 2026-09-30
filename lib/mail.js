// E-Mail-Versand (Einladungen) über SMTP. Funktioniert mit jedem Dienst, der SMTP anbietet
// (z. B. SMTP-Relay des AFI, Brevo, Mailjet, Postmark, Amazon SES).
// Ohne Konfiguration verschickt der Server nichts: Die Oberfläche zeigt dann wie bisher Link und E-Mail-Vorlage.
//
// Umgebungsvariablen:
//   SMTP_HOST, SMTP_PORT (587 oder 465), SMTP_USER, SMTP_PASS
//   MAIL_FROM  Absender, z. B. «Digitale Kompetenzen SZ <noreply@example.ch>»
//   APP_URL    Adresse der Anwendung für Links in E-Mails, z. B. https://digitale-kompetenzen-lp.vercel.app
// Nur für lokale Tests: MAIL_OUTBOX=<Datei> schreibt E-Mails als JSON-Zeilen in eine Datei statt sie zu verschicken.
import { appendFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

const outbox = () => (process.env.MAIL_OUTBOX && !process.env.VERCEL ? process.env.MAIL_OUTBOX : '');
export const mailConfigured = () => !!(outbox() || (process.env.SMTP_HOST && process.env.MAIL_FROM));

let transport = null;
function getTransport() {
  if (transport) return transport;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });
  return transport;
}

// Gibt { ok: true } oder { ok: false, error } zurück, wirft nie
export async function sendMail({ to, subject, text, replyTo }) {
  if (!mailConfigured()) return { ok: false, error: 'Kein E-Mail-Versand eingerichtet.' };
  const msg = { from: process.env.MAIL_FROM || 'Digitale Kompetenzen SZ <test@localhost>', to, subject, text, replyTo: replyTo || undefined };
  try {
    if (outbox()) { appendFileSync(outbox(), JSON.stringify({ ...msg, at: new Date().toISOString() }) + '\n'); return { ok: true }; }
    await getTransport().sendMail(msg);
    return { ok: true };
  } catch (e) {
    console.error('E-Mail-Versand:', e.code || '', e.message);
    return { ok: false, error: friendly(e) };
  }
}
function friendly(e) {
  if (e.code === 'EAUTH') return 'Anmeldung beim E-Mail-Dienst fehlgeschlagen.';
  if (e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' || e.code === 'ECONNREFUSED') return 'E-Mail-Dienst nicht erreichbar.';
  if (e.responseCode >= 500 && e.responseCode < 600) return 'Der E-Mail-Dienst hat die Nachricht abgelehnt.';
  return 'Die E-Mail konnte nicht verschickt werden.';
}

// Adresse für Links in E-Mails: nie aus Anfrage-Headern ableiten (sonst liessen sich Links umlenken)
export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!process.env.VERCEL && req && req.headers && req.headers.host) return 'http://' + req.headers.host; // lokal
  return '';
}
