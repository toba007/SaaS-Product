import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "juku_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30日

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET が設定されていません。.env に十分な長さの値を入れてください。",
    );
  }
  return s;
}

// ---------- パスワード ----------

/**
 * scrypt でハッシュ化する。"salt:hash" の形で保存する。
 * 平文は保存しない。ソルトを1件ごとに変えるので、同じパスワードでも別のハッシュになる。
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** 平文とハッシュを突き合わせる。比較は時間差が出ないようにする。 */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ---------- セッション ----------
// Cookie の中身は "teacherId.expiry.署名"。署名があるので中身を書き換えると通らない。

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Cookie の値を検証して講師IDを返す。壊れていたり期限切れなら null。 */
export function parseSessionValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;

  const [id, exp, sig] = parts;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  if (!/^\d+$/.test(id) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) < Date.now()) return null;

  return Number(id);
}

export async function createSession(teacherId: number) {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const payload = `${teacherId}.${exp}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, // JS から読めないようにする
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Cookie から講師IDを取り出す。存在の確認だけで、講師が今も有効かは見ていない。 */
export async function readSessionTeacherId(): Promise<number | null> {
  const store = await cookies();
  return parseSessionValue(store.get(SESSION_COOKIE)?.value);
}
