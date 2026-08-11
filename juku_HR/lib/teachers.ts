/**
 * 講師の追加・退職・削除の判断。
 *
 * ---- なぜここを分けているか ----
 * ここで守っているのは「**管理画面に入れる人がいなくなる**」事故と、
 * 「**締めた月の給与が計算し直せなくなる**」事故の2つ。
 * どちらも起きてから気づくと復旧が重いので、境界を検証スクリプトで固定しておく。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

import { EMPLOYMENT, ROLE } from "./constants";

/** ログインID。口頭で伝えることがあるので、記号と大文字は使わせない。 */
export const LOGIN_ID_PATTERN = /^[a-z0-9_]{3,20}$/;

export type NewTeacherInput = {
  name: string;
  kana: string;
  loginId: string;
  role: string;
  employment: string;
};

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * 追加時の入力を検査して、保存できる形に整える。
 * ログインIDは小文字に寄せる。大文字で登録すると、本人が小文字で打って入れなくなる。
 */
export function validateNewTeacher(
  input: Partial<NewTeacherInput>,
): Validated<NewTeacherInput> {
  const name = (input.name ?? "").trim();
  const kana = (input.kana ?? "").trim();
  const loginId = (input.loginId ?? "").trim().toLowerCase();
  const role = input.role ?? ROLE.TEACHER;
  const employment = input.employment ?? EMPLOYMENT.PART_TIME;

  if (!name) return { ok: false, error: "名前を入れてください" };
  if (name.length > 40) return { ok: false, error: "名前が長すぎます（40文字まで）" };
  if (kana.length > 40) return { ok: false, error: "ふりがなが長すぎます（40文字まで）" };
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return {
      ok: false,
      error: "ログインIDは英小文字・数字・_ の3〜20文字にしてください",
    };
  }
  if (role !== ROLE.ADMIN && role !== ROLE.TEACHER) {
    return { ok: false, error: "役割が正しくありません" };
  }
  if (!Object.values(EMPLOYMENT).includes(employment as never)) {
    return { ok: false, error: "雇用区分が正しくありません" };
  }

  return { ok: true, value: { name, kana, loginId, role, employment } };
}

/** 既に使われているログインIDへの断り文句。退職者のIDも使い回させない。 */
export function loginIdTakenError(loginId: string, ownerActive: boolean): string {
  return ownerActive
    ? `ログインID「${loginId}」は既に使われています`
    : `ログインID「${loginId}」は退職した講師が使っていました。別のIDにしてください`;
}

export type TeacherLite = {
  id: number;
  name: string;
  role: string;
  active: boolean;
};

export type Check = { ok: true } | { ok: false; error: string };

/**
 * 退職にしてよいか。
 *
 * 止めるのは2つだけ。
 * - **自分自身** — 外した瞬間に管理画面へ入れなくなる
 * - **最後の管理者** — 誰もログインして直せなくなる。DBを直接触るしか戻す手が無い
 */
export function checkRetire(
  target: TeacherLite,
  ctx: { actorId: number | null; activeAdminCount: number },
): Check {
  if (!target.active) return { ok: false, error: "すでに退職になっています" };
  if (ctx.actorId === target.id) {
    return { ok: false, error: "自分を退職にすることはできません" };
  }
  if (target.role === ROLE.ADMIN && ctx.activeAdminCount <= 1) {
    return {
      ok: false,
      error: "管理者が1人だけです。先に別の管理者を追加してください",
    };
  }
  return { ok: true };
}

/**
 * 完全に消してよいか。
 *
 * **記録が1件でもあれば消させない。** その講師が入っていたシフトや、
 * 締めた月の給与が辻褄の合わない状態になる。消したいときは退職にする。
 * 消せるのは「登録したが一度も使っていない」講師だけ、という位置づけ。
 */
export function checkDelete(
  target: TeacherLite,
  ctx: { actorId: number | null; records: number },
): Check {
  if (ctx.actorId === target.id) {
    return { ok: false, error: "自分を削除することはできません" };
  }
  if (ctx.records > 0) {
    return {
      ok: false,
      error: `${target.name} さんには記録が${ctx.records}件あります。削除ではなく退職にしてください`,
    };
  }
  return { ok: true };
}

/** 画面に出すボタンの種類。記録が無いときだけ完全削除を見せる。 */
export function removalMode(records: number): "DELETE" | "RETIRE" {
  return records === 0 ? "DELETE" : "RETIRE";
}
