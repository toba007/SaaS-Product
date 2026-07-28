'use strict';
/**
 * 認証まわり。パスワードは scrypt でハッシュ化して保存し、平文は保持しない。
 * セッションはサーバーのメモリで管理し、Cookie(sid) で識別する。
 */
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- セッション ----
const sessions = new Map(); // token -> { userId, createdAt, lastSeen }

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessions.set(token, { userId, createdAt: now, lastSeen: now });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  s.lastSeen = Date.now();
  return s;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

// ---- Cookie ----
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  destroySession,
  parseCookies,
};
